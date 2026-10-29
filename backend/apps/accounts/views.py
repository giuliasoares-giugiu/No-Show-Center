

def me_payload(user):
    scope = AccessScope(user)
    return {
        "email": user.email,
        "is_admin": scope.is_admin,
        "stations": sorted(scope.stations),
        "regionals": sorted(scope.regionals),
    }


class GoogleLoginView(APIView):
    """Recebe o ID token do Google Identity Services e abre sessão Django."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("credential")
        if not token:
            return Response({"detail": "credential é obrigatório."}, status=400)
        try:
            info = id_token.verify_oauth2_token(token, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
        except ValueError:
            return Response({"detail": "Token inválido."}, status=401)

        email = (info.get("email") or "").lower()
        domain = email.split("@")[-1]
        if not info.get("email_verified") or domain not in settings.ALLOWED_EMAIL_DOMAINS:
            return Response({"detail": "Domínio não autorizado."}, status=403)

        user, _ = get_user_model().objects.get_or_create(username=email, defaults={"email": email})
        login(request, user)
        return Response(me_payload(user))


class MeView(APIView):
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response(me_payload(request.user))


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=204)