from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.http import require_GET


@require_GET
def spa_index(request, path=""):
    """Rotas do front (ex.: /insights) devolvem o index.html, para F5 e links diretos funcionarem.

    Arquivos reais (assets, favicon) são servidos antes, pelo WhiteNoise; caminhos com extensão
    e prefixos de API/admin nunca chegam aqui (ver config/urls.py)."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.is_file():
        return HttpResponse("Frontend não compilado. Rode `npm run build` e copie dist/ para backend/frontend_dist.",
                            status=404, content_type="text/plain; charset=utf-8")
    response = HttpResponse(index.read_text(encoding="utf-8"), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-cache"
    return response
