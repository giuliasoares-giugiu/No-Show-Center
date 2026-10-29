import json
import time
from datetime import timedelta
from itertools import islice

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.ingestion.sources import get_occurrence_source
from apps.ingestion.probe import describe
from apps.ingestion.sources.datasuite import (
    extract_rows, next_cursor, occurrences_url, request_headers, request_page, token_report)
from apps.ingestion.validation import analyze_rows


class Command(BaseCommand):
    help = ("Valida a fonte de ocorrências (INGESTION_SOURCE) SEM gravar nada: chaves, formatos, valores conhecidos e "
            "cobertura. Rode antes da primeira carga com a API real do Data Suite.")

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7, help="Janela pedida à fonte (dias para trás).")
        parser.add_argument("--limit", type=int, default=20000, help="Máximo de linhas analisadas.")
        parser.add_argument("--probe", action="store_true", help="Faz UMA chamada à API e mostra só a ESTRUTURA da resposta (sem nenhum valor). Seguro para colar em chat.")
        parser.add_argument("--all-types", action="store_true", help="Analisa também os tipos fora de INGEST_PERFORMANCES.")
        parser.add_argument("--file", help="Analisa um JSON salvo (lista ou envelope da API) em vez de chamar a fonte. Não usa a rede.")

    def probe(self):
        out = self.stdout.write
        url = occurrences_url()
        out(f"{settings.DS_API_METHOD} {url}")
        out("Cabeçalhos enviados (só os nomes): " + (", ".join(request_headers()) or "(nenhum: faltam credenciais?)"))
        if settings.DS_API_TOKEN:
            t = token_report(settings.DS_API_TOKEN)
            out(f"Token (só o formato; o valor nunca é mostrado): {t['length']} caractere(s), {t['segments']} segmento(s) separados por ponto"
                f"{' (parece um JWT)' if t['looks_like_jwt'] else ''}.")
            if t["looks_like_placeholder"]:
                out(self.style.WARNING("AVISO: o valor parece o TEXTO DE EXEMPLO (tem < > ou 'cole aqui'). Cole o token de verdade, sem os sinais < >."))
            if t["cleaned"]:
                out(self.style.WARNING("AVISO: removi do token antes de enviar: " + "; ".join(t["cleaned"]) + "."))
            if settings.DS_API_AUTH_SCHEME.lower() == "bearer" and not t["valid_bearer_charset"]:
                out(self.style.WARNING("AVISO: o token tem caracteres que um token Bearer não pode ter (é o que a API chama de \"malformed\")."))
        started = time.monotonic()
        try:
            response = request_page(url)
        except Exception as exc:  # noqa: BLE001
            raise CommandError(f"Falha de rede ({type(exc).__name__}): {exc}") from exc
        out(f"HTTP {response.status_code} em {time.monotonic() - started:.1f}s | content-type: {response.headers.get('content-type', '?')}")
        challenge = response.headers.get("www-authenticate")
        if challenge:
            out(f"WWW-Authenticate (diz qual autenticação a API espera): {challenge}")
        if response.status_code >= 400:
            out(f"Corpo da resposta de erro (até 300 caracteres): {response.text[:300]}")
            if "invalid_token" in (challenge or ""):
                out("Dica: a API recusou o TOKEN. Se o aviso acima não apontar o formato, o token pode ter expirado ou ter sido emitido para outra API.")
            raise CommandError(f"A API respondeu {response.status_code}. Confira autenticação, método e parâmetros.")
        try:
            payload = response.json()
        except ValueError as exc:
            raise CommandError("O corpo da resposta não é JSON (a URL pode ser de uma página, não da API).") from exc
        out("\nEstrutura da resposta (só tipos e tamanhos, nenhum valor):")
        for line in describe(payload):
            out("  " + line)
        try:
            rows = extract_rows(payload)
            out(self.style.SUCCESS(f"\nLista de linhas reconhecida: {len(rows)} linha(s) nesta página."))
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        cursor = next_cursor(payload)
        out(f"Próxima página: {'sim (cursor informado)' if cursor else 'não identificada (uma só página, ou a paginação usa outro nome)'}")

    def handle(self, *args, **opts):
        if opts["probe"]:
            return self.probe()
        today = timezone.localdate()
        try:
            if opts["file"]:
                with open(opts["file"], encoding="utf-8") as handle:
                    rows = extract_rows(json.load(handle))[: opts["limit"]]
            else:
                rows = list(islice(get_occurrence_source().fetch(today - timedelta(days=opts["days"]), today, None), opts["limit"]))
        except Exception as exc:  # noqa: BLE001 - qualquer falha da fonte tem de virar um diagnóstico legível
            raise CommandError(f"Falha ao buscar da fonte ({type(exc).__name__}): {exc}") from exc

        use_filter = (opts["file"] or settings.INGESTION_SOURCE == "datasuite") and not opts["all_types"]
        allowed = settings.INGEST_PERFORMANCES if use_filter else None
        r = analyze_rows(rows, allowed=allowed)
        out = self.stdout.write
        out(f"Linhas lidas: {r['total']} | ignoradas por tipo (fora de INGEST_PERFORMANCES): {r['ignored']} | válidas: {r['valid']} | descartadas: {sum(r['invalid'].values())}")
        if r["date_range"]:
            out(f"Datas das ocorrências: {r['date_range'][0]} a {r['date_range'][1]}")
        for reason, n in r["invalid"].items():
            out(f"  descartadas por {reason}: {n}")
        if r["invalid_examples"]:
            out("  exemplos (só id e motivo): " + "; ".join(f"{e['pickup_task_id']}: {e['motivo']}" for e in r["invalid_examples"]))
        out("\nValores (o código compara com texto exato):")
        for field, counts in r["values"].items():
            out(f"  {field}: " + (", ".join(f"{k or '(vazio)'}={n}" for k, n in counts.items()) or "(sem linhas)"))
        out("\nFormato do PUP: " + (", ".join(f"{k}={n}" for k, n in r["pup_formats"].items()) or "(sem linhas)"))
        out("\nCobertura (linhas válidas com o campo preenchido):")
        for field, share in r["coverage"].items():
            out(f"  {field}: {share:.0%}")
        if r["missing_expected"]:
            out("\nCampos esperados que NÃO vieram: " + ", ".join(r["missing_expected"]))
        if r["unknown_keys"]:
            out("Campos recebidos que o sistema NÃO conhece: " + ", ".join(r["unknown_keys"]))
        for warning in r["warnings"]:
            out(self.style.WARNING("AVISO: " + warning))
        if r["blocking"]:
            for item in r["blocking"]:
                out(self.style.ERROR("BLOQUEIA: " + item))
            raise CommandError("A fonte NÃO está pronta para a primeira carga (ver os itens BLOQUEIA acima).")
        out(self.style.SUCCESS("\nFonte OK para a primeira carga" + (" (com avisos)." if r["warnings"] else ".")))
