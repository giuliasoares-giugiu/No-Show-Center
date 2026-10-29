from django.db import models


class TreatmentOption(models.Model):
    """Opções dos selects de tratativa, por fila (reversão e justificativa)."""

    class Kind(models.TextChoices):
        REVERSAL = "reversal", "Status de reversão"
        JUSTIFICATION = "justification", "Justificativa"

    queue = models.ForeignKey("occurrences.Queue", on_delete=models.CASCADE, related_name="options")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    label = models.CharField(max_length=150)
    requires_text = models.BooleanField(default=False, help_text="Ex.: 'Outro (especificar...)'")
    counts_as_reversed = models.BooleanField(
        default=False, help_text="Só para status de reversão: conta como ocorrência revertida nos insights")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["kind", "sort_order", "id"]

    def __str__(self):
        return f"[{self.queue.slug}] {self.get_kind_display()}: {self.label}"


class Treatment(models.Model):
    """Tratativa fica separada da ocorrência: o re-sync nunca a sobrescreve."""

    occurrence = models.OneToOneField("occurrences.Occurrence", on_delete=models.CASCADE, related_name="treatment")
    reversal = models.ForeignKey(TreatmentOption, on_delete=models.PROTECT, related_name="+")
    justification = models.ForeignKey(TreatmentOption, on_delete=models.PROTECT, related_name="+")
    justification_text = models.TextField(blank=True)
    treated_by = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class MessageTemplate(models.Model):
    """Variáveis: {driver_name} {seller_name} {dispatcher_name} {dispatcher_phone}"""

    queue = models.OneToOneField("occurrences.Queue", on_delete=models.CASCADE, related_name="message_template")
    body = models.TextField()


class ContactAttempt(models.Model):
    """Auditoria: quem clicou (sent_by) e qual nome entrou na mensagem (member)."""

    occurrence = models.ForeignKey("occurrences.Occurrence", on_delete=models.CASCADE, related_name="contacts")
    sent_by = models.EmailField()
    member = models.ForeignKey("accounts.StationMember", null=True, on_delete=models.SET_NULL, related_name="+")
    member_name = models.CharField(max_length=200)
    member_phone = models.CharField(max_length=20)
    message = models.TextField()
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]
