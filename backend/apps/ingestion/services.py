import logging
from datetime import date, datetime, timezone as dt_timezone
from typing import Optional

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from apps.accounts.models import StationMember, normalize_phone
from apps.occurrences.models import Occurrence, QueueRule

from .normalize import is_null_text

STR_FIELDS = ["driver_justification", "fault_type", "seller_name", "station_code", "regional", "driver_name",
              "driver_phone", "route_name", "allocated_by", "raio", "horario_funcionamento", "open_hour",
              "close_hour", "seller_performance"]
INT_FIELDS = ["driver_id", "trip_id", "pickup_quantity", "onhold_order_count"]


def _to_int(value):
    """'55', ' 55 ' e '55.0' viram 55; vazio vira None; texto não numérico levanta ValueError."""
    if value is None or str(value).strip() == "":
        return None
    return int(float(str(value).strip()))


def _to_code(value) -> str:
    """Código em texto. 1234, 1234.0 e " 1234 " viram "1234"; "1234_001" e "DOP77" ficam como estão.

    NÃO usar int()/float() em códigos com "_": o Python lê "1234_001" como 1234001 (separador de dígitos)."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    return "" if is_null_text(text) else text


def seller_group_of(pickup_point_id: str) -> str:
    """Seller group = prefixo do PUP antes do primeiro "_": "1234", "1234_001" e "1234_002" são o mesmo grupo."""
    return pickup_point_id.split("_", 1)[0].strip()


def _to_float(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None  # vazio, "NA" etc.


def _to_date(value) -> date:
    """Aceita 'YYYY-MM-DD' e também 'YYYY-MM-DD HH:MM:SS' (usa só a data)."""
    parsed = parse_date(str(value).strip()[:10])
    if parsed is None:
        raise ValueError(f"data inválida: {value!r}")
    return parsed


def _to_datetime(value):
    """ISO (com ou sem fuso; sem fuso = America/Sao_Paulo) ou epoch em segundos/milissegundos (instante UTC)."""
    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        try:
            number = float(text)
        except ValueError:
            number = None
        if number is not None and number >= 1e9:  # epoch: segundos (~1e9) ou milissegundos (~1e12)
            return datetime.fromtimestamp(number / 1000 if number > 1e11 else number, tz=dt_timezone.utc)
        dt = parse_datetime(text)
        if dt is None:
            raise ValueError(f"data/hora inválida: {value!r}")
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt


def _clean(item: dict) -> dict:
    data = {"occurrence_date": _to_date(item["occurrence_date"]), "radius_diff": _to_float(item.get("radius_diff"))}
    for f in STR_FIELDS:
        data[f] = _to_code(item.get(f))
    for f in INT_FIELDS:
        value = _to_int(item.get(f))
        data[f] = value if value is not None else (0 if f in ("pickup_quantity", "onhold_order_count") else None)
    data["driver_phone"] = normalize_phone(data["driver_phone"])
    data["pickup_point_id"] = _to_code(item.get("pickup_point_id"))
    # Se a API já mandar o grupo, vale o dela; senão, deriva do PUP.
    data["seller_group"] = _to_code(item.get("seller_group")) or seller_group_of(data["pickup_point_id"])
    data["occurred_at"] = _to_datetime(item.get("occurred_at"))
    # IDs em texto: sellers são numéricos, mas DOP/Locker vêm como "DOP7919".
    data["shop_id"] = _to_code(item.get("shop_id"))
    if not data["shop_id"]:
        raise ValueError("shop_id ausente")
    # Hierarquia (README, seção 10): e-mails em minúsculas; o gerente da regional vem como NOME.
    data["dispatcher_email"] = _to_code(item.get("dispatcher_email")).lower()
    data["supervisor_email"] = _to_code(item.get("supervisor_email")).lower()
    data["regional_manager"] = _to_code(item.get("regional_manager"))
    return data


def resolve_queue(rules, item: dict):
    for rule in rules:
        if rule.matches(item):
            return rule.queue
    return None


def _source_label(source) -> str:
    """Origem gravada em Occurrence.source; fontes sem rótulo ficam como 'unknown'."""
    label = getattr(source, "source_label", None)
    valid = {choice.value for choice in Occurrence.Source}
    return label if label in valid else Occurrence.Source.UNKNOWN


def sync_occurrences(source, date_from: date, date_to: date, updated_since: Optional[str] = None, allowed=None) -> dict:
    """`allowed`: tipos de `seller_performance` que viram registro; os demais são ignorados (a API devolve tudo do dia)."""
    rules = list(QueueRule.objects.filter(queue__is_active=True).select_related("queue"))
    stats = {"created": 0, "updated": 0, "skipped": 0, "ignored": 0}
    for item in source.fetch(date_from, date_to, updated_since):
        if allowed and _to_code(item.get("seller_performance") if isinstance(item, dict) else None) not in allowed:
            stats["ignored"] += 1
            continue
        task_ref = item.get("pickup_task_id") if isinstance(item, dict) else None
        try:
            task_id = _to_code(item["pickup_task_id"])
            if not task_id:
                raise ValueError("pickup_task_id ausente")
            data = _clean(item)
            data["source"] = _source_label(source)
            with transaction.atomic():
                existing = Occurrence.objects.select_related("queue").filter(pickup_task_id=task_id).first()
                # Já tratada → mantém a fila, para não invalidar as opções escolhidas.
                if existing is not None and hasattr(existing, "treatment"):
                    data["queue"] = existing.queue
                else:
                    data["queue"] = resolve_queue(rules, item)
                _, created = Occurrence.objects.update_or_create(pickup_task_id=task_id, defaults=data)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            # Uma linha ruim não pode derrubar a rodada inteira. O log leva só o id e o motivo: a linha tem telefone.
            stats["skipped"] += 1
            log.warning("Linha ignorada (pickup_task_id=%s): %s", task_ref, exc)
            continue
        stats["created" if created else "updated"] += 1
    return stats


def sync_members(source, updated_since: Optional[str] = None) -> dict:
    stats = {"created": 0, "updated": 0, "deactivated": 0, "skipped": 0}
    seen = set()
    for item in source.fetch(updated_since):
        email = (item.get("member_email") or "").strip().lower()
        station = (item.get("station_code") or "").strip()
        if not email or not station:
            stats["skipped"] += 1
            continue
        existing = StationMember.objects.filter(email=email, station_code=station).first()
        if existing and existing.source == StationMember.Source.MANUAL:
            stats["skipped"] += 1  # override manual do admin nunca é sobrescrito
            continue
        seen.add((email, station))
        member = existing or StationMember(email=email, station_code=station, source=StationMember.Source.DATASUITE)
        member.name = item.get("member_name") or email
        member.phone = item.get("member_phone") or ""
        member.role = item.get("role") or "dispatcher"
        member.is_active = bool(item.get("is_active", True))
        member.save()
        stats["updated" if existing else "created"] += 1

    # Sync completo: quem sumiu da fonte é desativado (nunca apagado → preserva histórico).
    if updated_since is None:
        for m in StationMember.objects.filter(source=StationMember.Source.DATASUITE, is_active=True):
            if (m.email, m.station_code) not in seen:
                m.is_active = False
                m.save()
                stats["deactivated"] += 1
    return stats