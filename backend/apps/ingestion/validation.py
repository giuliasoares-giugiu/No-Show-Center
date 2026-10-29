"""Validação da fonte de dados SEM gravar nada (usada por `manage.py check_source`).

Serve para o dia em que a API do Data Suite existir: mostra, antes da primeira carga, o que falta, o que está
fora de formato e quais valores o sistema não conhece. Os relatórios nunca incluem valores das linhas
(só contagens e ids), porque as linhas têm dados pessoais (telefone, nome do motorista)."""
import re
from collections import Counter

from django.utils import timezone

from .normalize import ALIASES, KNOWN_UNUSED, normalize_row
from .services import _clean, _to_code

# Contrato de ocorrências (ver README, seção 10).
EXPECTED_KEYS = [
    "pickup_task_id", "occurrence_date", "occurred_at", "seller_performance", "driver_justification", "fault_type",
    "shop_id", "seller_name", "pickup_point_id", "station_code", "regional", "driver_id", "driver_name",
    "driver_phone", "route_name", "trip_id", "pickup_quantity", "onhold_order_count", "raio",
    "radius_diff", "horario_funcionamento", "open_hour", "close_hour",
]
# Campos novos combinados com o time do DS, ainda não ingeridos pelo código (README, seção 10).
OPTIONAL_KEYS = ["allocated_by", "seller_group", "dispatcher_email", "supervisor_email", "regional_manager", "packages_recovered"]

# Valores que o código compara com texto exato (README, seção 7).
KNOWN_VALUES = {
    "seller_performance": {"No Show Seller", "No Show 3PL", "Partial Pickup", "Full Pickup", "Disabled", "NB Disabled",
                           "System Disabled", "Reassigned", "evaluate"},
    "fault_type": {"NSS SPX Fault", "NSS Seller Fault", ""},
    "raio": {"Fora do raio", "Dentro do raio", "NA", ""},
    "horario_funcionamento": {"Fora do horário de funcionamento", "Dentro do horário de funcionamento", ""},
}
COVERAGE_FIELDS = ["occurred_at", "open_hour", "close_hour", "seller_name", "pickup_point_id", "seller_group",
                   "allocated_by", "dispatcher_email", "supervisor_email", "regional_manager", "driver_phone", "driver_id",
                   "trip_id"]
LOW_COVERAGE_FIELDS = {"occurred_at", "close_hour", "pickup_point_id", "driver_id"}  # sem eles uma tela perde sentido
LOW_COVERAGE_THRESHOLD = 0.95


def pup_format(value: str) -> str:
    if not value:
        return "vazio"
    if re.fullmatch(r"\d+", value):
        return "so_numeros"
    if re.fullmatch(r"\d+_\d+", value):
        return "numero_sufixo"
    if re.fullmatch(r"[A-Za-z]+\d+(_\d+)?", value):
        return "codigo_com_prefixo"  # DOP/Locker: "DOP7919", "DOP7919_001"
    return "outro"


def _reason(exc: Exception) -> str:
    """Categoria genérica do erro: a mensagem original pode conter o valor da linha."""
    if isinstance(exc, KeyError):
        return f"campo ausente: {exc.args[0]}"
    text = str(exc)
    if "pickup_task_id ausente" in text:
        return "pickup_task_id ausente"
    if "shop_id ausente" in text:
        return "shop_id ausente"
    if "data/hora inválida" in text:
        return "data/hora inválida"
    if "data inválida" in text:
        return "data inválida"
    if "could not convert" in text or "invalid literal" in text:
        return "número inválido"
    return "formato inválido"


def analyze_rows(rows, allowed=None) -> dict:
    """`allowed`: tipos de `seller_performance` que o sync grava (os demais são só contados, como no sync)."""
    rows = [normalize_row(r) if isinstance(r, dict) else r for r in rows]
    received: set = set()
    for row in rows:
        if isinstance(row, dict):
            received |= set(row)

    cleaned, invalid, examples, task_ids, performances, ignored = [], Counter(), [], Counter(), Counter(), 0
    for row in rows:
        ref = row.get("pickup_task_id") if isinstance(row, dict) else None
        perf = _to_code(row.get("seller_performance")) if isinstance(row, dict) else ""
        performances[perf] += 1
        if allowed and perf not in allowed:
            ignored += 1
            continue
        try:
            task_id = _to_code(row["pickup_task_id"])
            if not task_id:
                raise ValueError("pickup_task_id ausente")
            data = _clean(row)
        except (KeyError, TypeError, ValueError) as exc:
            reason = _reason(exc)
            invalid[reason] += 1
            if len(examples) < 5:
                examples.append({"pickup_task_id": ref, "motivo": reason})
            continue
        cleaned.append(data)
        task_ids[task_id] += 1

    values = {field: Counter(d[field] for d in cleaned) for field in KNOWN_VALUES}
    values["seller_performance"] = performances  # distribuição de TODAS as linhas, inclusive as ignoradas
    unexpected = {field: sorted(v for v in counter if v not in KNOWN_VALUES[field]) for field, counter in values.items()}
    unexpected = {field: vals for field, vals in unexpected.items() if vals}
    coverage = {
        field: round(sum(1 for d in cleaned if d.get(field) not in (None, "")) / len(cleaned), 3) if cleaned else 0.0
        for field in COVERAGE_FIELDS
    }
    dates = [d["occurrence_date"] for d in cleaned]
    now = timezone.now()
    duplicates = sum(1 for n in task_ids.values() if n > 1)
    missing = [k for k in EXPECTED_KEYS if rows and k not in received]
    unknown = sorted(received - set(EXPECTED_KEYS) - set(OPTIONAL_KEYS) - KNOWN_UNUSED - set(ALIASES))
    evaluate = values["seller_performance"].get("evaluate", 0)
    future = sum(1 for d in cleaned if d.get("occurred_at") and d["occurred_at"] > now)

    blocking, warnings = [], []
    if not rows:
        blocking.append("A fonte não devolveu nenhuma linha.")
    if rows and not cleaned and not invalid:
        blocking.append("Nenhuma linha dos tipos que o sistema usa (No Show Seller, No Show 3PL): não há o que validar. "
                        "Peça uma amostra com no-shows, ou use --all-types para inspecionar os demais tipos.")
    if rows and "pickup_task_id" not in received:
        blocking.append("A fonte não envia `pickup_task_id` (chave única da ocorrência).")
    if invalid:
        blocking.append(f"{sum(invalid.values())} linha(s) seriam descartadas por formato inválido.")
    if [k for k in missing if k != "pickup_task_id"]:
        warnings.append("Campos esperados ausentes: " + ", ".join(k for k in missing if k != "pickup_task_id") + ".")
    if unknown:
        warnings.append("Campos recebidos que o sistema não conhece (precisam de mapeamento?): " + ", ".join(unknown) + ".")
    for field, vals in unexpected.items():
        warnings.append(f"Valores inesperados em `{field}`: {', '.join(vals)}.")
    if evaluate:
        warnings.append(f"{evaluate} linha(s) com occurrence='evaluate' (no-show que nenhuma regra classificou).")
    if duplicates:
        warnings.append(f"{duplicates} pickup_task_id repetido(s): a ingestão faz upsert, mas a API deveria devolver uma linha por ocorrência.")
    if future:
        warnings.append(f"{future} linha(s) com horário do evento no futuro (confira o fuso e o formato de `occurred_at`).")
    for field in sorted(LOW_COVERAGE_FIELDS):
        if cleaned and coverage[field] < LOW_COVERAGE_THRESHOLD:
            warnings.append(f"`{field}` vem preenchido em só {coverage[field]:.0%} das linhas válidas.")

    return {
        "total": len(rows), "valid": len(cleaned), "ignored": ignored, "invalid": dict(invalid), "invalid_examples": examples,
        "duplicates": duplicates, "received_keys": sorted(received), "missing_expected": missing,
        "unknown_keys": unknown, "values": {f: dict(c.most_common()) for f, c in values.items()},
        "unexpected_values": unexpected, "coverage": coverage,
        "pup_formats": dict(Counter(pup_format(d["pickup_point_id"]) for d in cleaned)),
        "date_range": [min(dates).isoformat(), max(dates).isoformat()] if dates else None,
        "blocking": blocking, "warnings": warnings,
    }
