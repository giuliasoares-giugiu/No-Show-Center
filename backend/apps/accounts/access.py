from .models import RegionalAccess, StationMember


class AccessScope:
    """Escopo do usuário logado. Instanciar 1x por request (evita N+1 na listagem)."""

    def __init__(self, user):
        self.user = user
        email = (getattr(user, "email", "") or "").lower()
        self.is_admin = bool(user.is_superuser or user.is_staff)
        self.stations = (
            set(StationMember.objects.filter(email=email, is_active=True).values_list("station_code", flat=True))
            if email else set()
        )
        self.regionals = (
            set(RegionalAccess.objects.filter(email=email).values_list("regional", flat=True))
            if email else set()
        )

    def can_treat(self, station_code: str, regional: str) -> bool:
        return self.is_admin or station_code in self.stations or regional in self.regionals

    # Telefone do driver segue a mesma regra de quem pode tratar (LGPD).
    can_see_phone = can_treat
