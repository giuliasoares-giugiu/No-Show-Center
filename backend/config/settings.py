
import os
import sys
from pathlib import Path

# Durante `manage.py test` o .env real não pode vazar para os testes.
RUNNING_TESTS = "test" in sys.argv


# ============================================================
# Caminhos do projeto
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent


# ============================================================
# Carregamento do arquivo .env
# ============================================================

def load_env_file(path):
    """
    Carrega variáveis básicas do .env.
    Variáveis já existentes no ambiente do sistema têm prioridade.
    """
    if not path.exists():
        return

    with path.open("r", encoding="utf-8") as file:
        for raw_line in file:
            line = raw_line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()

            # Remove aspas externas simples ou duplas.
            if (
                len(value) >= 2
                and value[0] == value[-1]
                and value[0] in ("'", '"')
            ):
                value = value[1:-1]

            if key:
                os.environ.setdefault(key, value)


if RUNNING_TESTS:
    # Os testes rodam isolados: nada de credenciais ou URLs reais,
    # venham do .env ou do ambiente do Windows.
    for _key in [k for k in os.environ if k.startswith(("DS_API_", "INGESTION_SOURCE", "INGEST_"))]:
        del os.environ[_key]
else:
    if "test" in sys.argv:
    for k in [k for k in os.environ if k.startswith("DS_API_")]:
        del os.environ[k]
else:
    load_env_file(BASE_DIR / ".env")


def env(key, default=None):
    return os.environ.get(key, default)


# ============================================================
# Configurações gerais do Django
# ============================================================

DEBUG = env("DJANGO_DEBUG", "0") == "1"

SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-insecure-key")

if (
    not DEBUG
    and SECRET_KEY == "dev-insecure-key"
    and env("DJANGO_ALLOW_INSECURE") != "1"
):
    raise RuntimeError("Defina DJANGO_SECRET_KEY em produção.")

ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS", "*").split(",")


# ============================================================
# Aplicações instaladas
# ============================================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "apps.accounts",
    "apps.occurrences",
    "apps.treatments",
    "apps.ingestion",
    "apps.indicators",
]


# ============================================================
# Middleware
# ============================================================

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]


# ============================================================
# Rotas e aplicação
# ============================================================

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"


# ============================================================
# Templates
# ============================================================

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ============================================================
# Banco de dados
# ============================================================

if env("DB_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": env("DB_HOST"),
            "PORT": env("DB_PORT", "5432"),
            "NAME": env("DB_NAME", "occurrence_hub"),
            "USER": env("DB_USER"),
            "PASSWORD": env("DB_PASSWORD"),
            "CONN_MAX_AGE": 60,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# ============================================================
# Idioma, fuso horário e arquivos estáticos
# ============================================================

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

FRONTEND_DIST = BASE_DIR / "frontend_dist"
WHITENOISE_ROOT = FRONTEND_DIST
WHITENOISE_INDEX_FILE = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ============================================================
# Autenticação Google
# ============================================================

GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", "")

ALLOWED_EMAIL_DOMAINS = [
    domain.strip().lower()
    for domain in env(
        "ALLOWED_EMAIL_DOMAINS",
        "shopee.com",
    ).split(",")
    if domain.strip()
]


# ============================================================
# Configuração de ingestão
# ============================================================

INGESTION_SOURCE = env("INGESTION_SOURCE", "mock")

# OAuth DataSuite
DS_API_TOKEN_URL = env(
    "DS_API_TOKEN_URL",
    "https://open-api.datasuite.shopee.io/oauth/token",
)
DS_API_CLIENT_ID = env("DS_API_CLIENT_ID", "")
DS_API_CLIENT_SECRET = env("DS_API_CLIENT_SECRET", "")

# Compatibilidade com token estático, caso necessário
DS_API_TOKEN = env("DS_API_TOKEN", "")
DS_API_AUTH_HEADER = env("DS_API_AUTH_HEADER", "Authorization")
DS_API_AUTH_SCHEME = env("DS_API_AUTH_SCHEME", "Bearer")

# Endpoints
DS_API_BASE_URL = env("DS_API_BASE_URL", "")
DS_API_OCCURRENCES_URL = env("DS_API_OCCURRENCES_URL", "")
DS_API_METHOD = env("DS_API_METHOD", "GET").upper()
DS_API_BODY = env("DS_API_BODY", "")
DS_API_EXTRA_PARAMS = env("DS_API_EXTRA_PARAMS", "")
DS_API_EXTRA_HEADERS = env("DS_API_EXTRA_HEADERS", "{}")

DS_API_SEND_DATE_PARAMS = (
    env("DS_API_SEND_DATE_PARAMS", "0") == "1"
)
DS_API_OCCURRENCES_PATH = env(
    "DS_API_OCCURRENCES_PATH", "/occurrences"
)
DS_API_MEMBERS_PATH = env(
    "DS_API_MEMBERS_PATH", "/station-members"
)
DS_API_MODE = env("DS_API_MODE", "")
DS_API_SCOPE = env("DS_API_SCOPE", "")
DS_API_POLL_INTERVAL = env("DS_API_POLL_INTERVAL", "2")
DS_API_POLL_TIMEOUT = env("DS_API_POLL_TIMEOUT", "120")

INGEST_PERFORMANCES = tuple(
    p.strip()
    for p in env(
        "INGEST_PERFORMANCES",
        "No Show Seller,No Show 3PL",
    ).split(",")
    if p.strip()
)


# ============================================================
# Segurança em produção
# ============================================================

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = (
        "HTTP_X_FORWARDED_PROTO",
        "https",
    )


# ============================================================
# Origens confiáveis para CSRF
# ============================================================

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in env(
        "CSRF_TRUSTED_ORIGINS",
        "",
    ).split(",")
    if origin.strip()
]

if DEBUG:
    CSRF_TRUSTED_ORIGINS += [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


# ============================================================
# Mock e indicadores
# ============================================================

MOCK_EXTRA_ROWS = int(env("MOCK_EXTRA_ROWS", "0"))

INDICATORS_RESTRICTED = (
    env("INDICATORS_RESTRICTED", "0") == "1"
)
