"""Adapter da API do DataSuite com OAuth e renovação automática.

Dois modos de operação:

- Modo clássico (padrão): uma chamada devolve as linhas diretamente,
  com paginação por cursor.
- Modo "dataservice" (DS_API_MODE=dataservice): fluxo assíncrono do
  Data Service da Shopee.

      POST /dataservice/{api}/{versão}  corpo {"olapPayload": {...}} -> jobId
      GET  /dataservice/result/{jobId}    -> status, maxShard
      GET  /dataservice/result/{jobId}/{n} -> rows (n de 0 a maxShard)
"""

import json
import logging
import os
import threading
import time
from typing import Iterator, Optional
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from ..normalize import flatten_row, normalize_row
from .base import MemberSource, OccurrenceSource


logger = logging.getLogger(__name__)

ROW_LIST_KEYS = ("items", "rows", "data", "results", "records", "values")
CURSOR_KEYS = ("next_cursor", "nextCursor", "next_page_token", "nextPageToken")

# Cache do token durante a vida deste processo Django.
_token_cache = {"access_token": None, "expires_at": 0.0}
_token_lock = threading.Lock()


def _setting(name, default=""):
    if hasattr(settings, name):
        return getattr(settings, name)
    return os.environ.get(name, default)


def extract_rows(payload) -> list:
    """Extrai as linhas de uma lista ou objeto JSON."""
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        for key in ROW_LIST_KEYS:
            if isinstance(payload.get(key), list):
                return payload[key]

        for value in payload.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value

    keys = sorted(payload) if isinstance(payload, dict) else type(payload).__name__
    raise ValueError(
        "Resposta da API sem lista de linhas reconhecível "
        f"(chaves de nível superior: {keys})."
    )


def next_cursor(payload) -> Optional[str]:
    if isinstance(payload, dict):
        for key in CURSOR_KEYS:
            if payload.get(key):
                return str(payload[key])
    return None


def _json_setting(name: str) -> dict:
    raw = _setting(name, "")

    if not raw:
        return {}

    if isinstance(raw, dict):
        return raw

    try:
        value = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise ImproperlyConfigured(
            f"{name} deve conter um objeto JSON válido."
        ) from exc

    if not isinstance(value, dict):
        raise ImproperlyConfigured(
            f"{name} deve ser um objeto JSON."
        )

    return value


def _invalidate_token() -> None:
    with _token_lock:
        _token_cache["access_token"] = None
        _token_cache["expires_at"] = 0.0


def get_access_token(force_refresh: bool = False) -> str:
    """
    Retorna um token OAuth válido.

    Se as credenciais OAuth não estiverem configuradas, utiliza
    DS_API_TOKEN como alternativa de compatibilidade.
    """
    client_id = getattr(settings, "DS_API_CLIENT_ID", "")
    client_secret = getattr(settings, "DS_API_CLIENT_SECRET", "")

    # Compatibilidade com a configuração antiga.
    if not client_id or not client_secret:
        static_token = getattr(settings, "DS_API_TOKEN", "")
        if static_token:
            return static_token

        raise ImproperlyConfigured(
            "Configure DS_API_CLIENT_ID e DS_API_CLIENT_SECRET "
            "no .env para autenticar no DataSuite."
        )

    with _token_lock:
        now = time.monotonic()

        if (
            not force_refresh
            and _token_cache["access_token"]
            and now < _token_cache["expires_at"]
        ):
            return _token_cache["access_token"]

        token_url = getattr(
            settings,
            "DS_API_TOKEN_URL",
            "https://open-api.datasuite.shopee.io/oauth/token",
        )

        token_data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "client_credentials",
        }

        # O cliente TypeScript que funciona envia scope = nome da API.
        scope = _setting("DS_API_SCOPE", "")
        if scope:
            token_data["scope"] = scope

        try:
            response = requests.post(
                token_url,
                data=token_data,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()

        except requests.RequestException as exc:
            # Não incluir corpo da resposta ou credenciais na exceção.
            status = (
                exc.response.status_code
                if exc.response is not None
                else "sem resposta HTTP"
            )
            raise RuntimeError(
                f"Falha ao obter token OAuth do DataSuite "
                f"(status: {status}). Verifique as credenciais "
                "e a configuração do OAuth."
            ) from None

        except ValueError:
            raise RuntimeError(
                "O endpoint OAuth do DataSuite não retornou JSON válido."
            ) from None

        access_token = payload.get("access_token")
        if not access_token:
            raise RuntimeError(
                "A resposta OAuth do DataSuite não contém access_token."
            )

        try:
            expires_in = max(1, int(payload.get("expires_in", 300)))
        except (TypeError, ValueError):
            expires_in = 300

        # Renova 60 segundos antes do vencimento, ou antes se o token
        # tiver validade curta.
        safety_margin = min(60, max(0, expires_in // 10))
        _token_cache["access_token"] = access_token
        _token_cache["expires_at"] = (
            time.monotonic() + max(1, expires_in - safety_margin)
        )

        return access_token


def request_headers() -> dict:
    """Monta os headers respeitando as configurações atuais do Django."""
    headers = {
        str(key): str(value)
        for key, value in _json_setting("DS_API_EXTRA_HEADERS").items()
    }

    token = get_access_token()
    scheme = str(getattr(settings, "DS_API_AUTH_SCHEME", "Bearer") or "").strip()
    auth_header = str(
        getattr(settings, "DS_API_AUTH_HEADER", "Authorization") or "Authorization"
    ).strip()

    headers[auth_header] = f"{scheme} {token}".strip() if scheme else token

    return headers


def occurrences_url() -> str:
    """Retorna a URL explícita ou monta a URL base com o caminho configurado."""
    explicit_url = str(
        getattr(settings, "DS_API_OCCURRENCES_URL", "") or ""
    ).strip()

    if explicit_url:
        return explicit_url

    base_url = str(getattr(settings, "DS_API_BASE_URL", "") or "").rstrip("/")
    path = str(
        getattr(settings, "DS_API_OCCURRENCES_PATH", "/occurrences")
        or "/occurrences"
    )

    if not path.startswith("/"):
        path = f"/{path}"

    return f"{base_url}{path}"


def members_url() -> str:
    return (
        f"{settings.DS_API_BASE_URL.rstrip('/')}"
        f"{settings.DS_API_MEMBERS_PATH}"
    )


# ---------------------------------------------------------------------------
# Modo clássico: uma chamada devolve as linhas
# ---------------------------------------------------------------------------

def _send_request(url: str, params: Optional[dict] = None):
    """Executa a consulta e renova o token uma vez se receber HTTP 401."""
    query_params = {
        **_json_setting("DS_API_EXTRA_PARAMS"),
        **(params or {}),
    }

    method = str(getattr(settings, "DS_API_METHOD", "GET")).upper()
    body = None

    if method == "POST":
        body = _json_setting("DS_API_BODY")
        if not body:
            raise ImproperlyConfigured(
                "DS_API_METHOD=POST, mas DS_API_BODY está vazio. "
                "Configure o corpo da consulta (ex.: olapPayload) ou "
                "use DS_API_MODE=dataservice."
            )

    for attempt in range(2):
        kwargs = {
            "params": query_params,
            "headers": request_headers(),
            "timeout": 60,
        }

        if method == "POST":
            logger.debug("DataSuite POST %s body_keys=%s", urlsplit(url).path, sorted(body))
            response = requests.post(url, json=body, **kwargs)
        else:
            response = requests.get(url, **kwargs)

        if response.status_code != 401 or attempt == 1:
            return response

        # Se estiver usando OAuth, invalida o cache e tenta novamente.
        if (
            getattr(settings, "DS_API_CLIENT_ID", "")
            and getattr(settings, "DS_API_CLIENT_SECRET", "")
        ):
            _invalidate_token()
        else:
            # Um token estático não pode ser renovado automaticamente.
            return response

    return response


def request_page(url: str, params: Optional[dict] = None):
    """Executa uma chamada à API."""
    return _send_request(url, params)


def _paginate(url: str, params: dict) -> Iterator:
    cursor, seen = None, set()

    while True:
        page_params = {**params}
        if cursor:
            page_params["cursor"] = cursor

        response = request_page(url, page_params)
        response.raise_for_status()

        payload = response.json()
        yield from extract_rows(payload)

        cursor = next_cursor(payload)

        if not cursor or cursor in seen:
            break

        seen.add(cursor)


# ---------------------------------------------------------------------------
# Modo dataservice: POST -> jobId -> status -> shards
# ---------------------------------------------------------------------------

def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def _call(method: str, url: str, **kwargs) -> dict:
    """Chama a API, renova o token uma vez em 401 e devolve o JSON."""
    response = None

    for attempt in range(2):
        response = requests.request(
            method, url, headers=request_headers(), timeout=60, **kwargs
        )

        if (
            response.status_code == 401
            and attempt == 0
            and getattr(settings, "DS_API_CLIENT_ID", "")
            and getattr(settings, "DS_API_CLIENT_SECRET", "")
        ):
            _invalidate_token()
            continue
        break

    if not response.ok:
        # Só status e mensagem da API; nunca headers ou token.
        raise RuntimeError(
            f"DataSuite {method} {urlsplit(url).path} falhou "
            f"(HTTP {response.status_code}): {response.text[:300]}"
        )

    try:
        return response.json()
    except ValueError:
        raise RuntimeError(
            f"DataSuite {method} {urlsplit(url).path} não retornou JSON válido."
        ) from None


def dataservice_rows(
    url: str,
    expressions: Optional[list] = None,
) -> Iterator[dict]:
    """
    Submete a consulta, aguarda o job e devolve as linhas de todos os shards.

    `expressions` é a lista de filtros da API, por exemplo
    [{"parameterName": "driver_id", "value": "123"}]. Vazia, a API
    devolve o dataset sem filtro.
    """
    origin = _origin(url)
    expressions = expressions or []
    body = {"olapPayload": {"expressions": expressions}}

    logger.info(
        "DataSuite submit: %s expressions=%d",
        urlsplit(url).path,
        len(expressions),
    )

    job = _call("POST", url, json=body)
    job_id = job.get("jobId")
    if not job_id:
        raise RuntimeError(
            f"Resposta sem jobId (chaves: {sorted(job)})."
        )

    poll_interval = float(_setting("DS_API_POLL_INTERVAL", 2))
    poll_timeout = float(_setting("DS_API_POLL_TIMEOUT", 120))
    deadline = time.monotonic() + poll_timeout

    while True:
        meta = _call("GET", f"{origin}/dataservice/result/{job_id}")

        if (
            meta.get("status") == "FAILED"
            or meta.get("contentType") == "ERROR_MESSAGE"
        ):
            raise RuntimeError(
                f"Consulta falhou no DataSuite: {meta.get('message')}"
            )

        if meta.get("status") != "RUNNING":
            break

        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"Consulta excedeu {poll_timeout:g}s (jobId={job_id})."
            )

        time.sleep(poll_interval)

    # Alguns jobs já devolvem os dados na própria metadata.
    if meta.get("contentType") == "QUERY_DATA" and meta.get("rows"):
        for row in meta["rows"]:
            yield row["values"]
        return

    max_shard = meta.get("maxShard") or 0
    logger.info("DataSuite job %s finalizado: shards=%d", job_id, max_shard + 1)

    for shard in range(max_shard + 1):
        result = _call("GET", f"{origin}/dataservice/result/{job_id}/{shard}")

        if result.get("contentType") == "ERROR_MESSAGE":
            raise RuntimeError(
                f"Erro no shard {shard}: {result.get('message')}"
            )

        for row in result.get("rows") or []:
            yield row["values"]


def _dataservice_mode() -> bool:
    return str(_setting("DS_API_MODE", "")).lower() == "dataservice"


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

class DataSuiteOccurrenceSource(OccurrenceSource):
    source_label = "datasuite"

    def fetch(self, date_from, date_to, updated_since: Optional[str] = None):
        if _dataservice_mode():
            # Sem expressions: confirme com o time de dados quais
            # parameterName de data a API publicada aceita antes de filtrar.
            rows = dataservice_rows(occurrences_url())
        else:
            params = {}

            if settings.DS_API_SEND_DATE_PARAMS:
                params = {
                    "date_from": date_from.isoformat(),
                    "date_to": date_to.isoformat(),
                }

                if updated_since:
                    params["updated_since"] = updated_since

            rows = _paginate(occurrences_url(), params)

        return (normalize_row(row) for row in rows)


class DataSuiteMemberSource(MemberSource):
    def fetch(self, updated_since: Optional[str] = None):
        params = {"updated_since": updated_since} if updated_since else {}

        return (
            flatten_row(row)
            for row in _paginate(members_url(), params)
        )