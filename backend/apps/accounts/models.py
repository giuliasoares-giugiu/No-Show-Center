import re

from django.db import models


def normalize_phone(raw: str) -> str:
    """Remove máscara e garante DDI 55 quando o número parece nacional."""
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    if digits.startswith("55") and len(digits) in (12, 13):
        return digits
    if len(digits) in (10, 11):
        return "55" + digits
    return digits


def is_valid_phone(phone: str) -> bool:
    return bool(re.fullmatch(r"55\d{10,11}", phone or ""))


class StationMember(models.Model):
    """Quem pode tratar ocorrências de uma station. Fonte principal: Data Suite."""

    class Source(models.TextChoices):
        DATASUITE = "datasuite", "Data Suite"
        MANUAL = "manual", "Manual"

    email = models.EmailField()
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    station_code = models.CharField(max_length=50, db_index=True)
    role = models.CharField(max_length=50, blank=True, default="dispatcher")
    is_active = models.BooleanField(default=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["email", "station_code"], name="uniq_member_email_station")]
        ordering = ["station_code", "name"]
        verbose_name = "membro de station"
        verbose_name_plural = "membros de station"

    def save(self, *args, **kwargs):
        self.email = (self.email or "").lower()
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)

    @property
    def phone_ok(self) -> bool:
        return is_valid_phone(self.phone)

    def __str__(self):
        return f"{self.name} ({self.station_code})"


class RegionalAccess(models.Model):
    """Coordenadores: acesso de tratativa a todas as stations de uma regional."""

    email = models.EmailField()
    regional = models.CharField(max_length=50)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["email", "regional"], name="uniq_regional_access")]
        verbose_name = "acesso regional"
        verbose_name_plural = "acessos regionais"

    def save(self, *args, **kwargs):
        self.email = (self.email or "").lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} → {self.regional}"
