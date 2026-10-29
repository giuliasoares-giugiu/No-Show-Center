from django.core.management.base import BaseCommand

from apps.occurrences.models import Queue, QueueRule
from apps.treatments.models import MessageTemplate, TreatmentOption

NSS_MESSAGE = (
    "Olá, {driver_name}!\n\n"
    "O sistema registrou uma ocorrência de SPX Fault na coleta do seller {seller_name}, indicando um registro "
    "fora do raio permitido ou comparecimento ao local fora do horário de funcionamento.\n"
    "Poderia nos informar o que aconteceu?\n\n"
    "Lembramos que o pagamento de KM e das paradas considera a realização de todos os pontos previstos na rota.\n"
    "A reincidência de ocorrências sem justificativa válida pode resultar na perda da rota.\n\n"
    "Contato: {dispatcher_name} - {dispatcher_phone}"
)

REVERSALS = ["Coletado", "Batida ajustada", "Não revertido"]
REVERSED = {"Coletado", "Batida ajustada"}
JUSTIFICATIONS = [
    ("Comportamento suspeito driver", False),
    ("Local físico (galpão, portaria, etc)", False),
    ("Sinal de GPS", False),
    ("Problema de endereço ou lat/long", False),
    ("Problema de sequenciamento da rota", False),
    ("Seller que dropa pacotes", False),
    ("Outro (especificar...)", True),
]


class Command(BaseCommand):
    help = "Cria a fila NSS SPX Fault com regra, opções de tratativa e template (idempotente)."

    def handle(self, *args, **opts):
        queue, _ = Queue.objects.get_or_create(slug="nss-spx-fault", defaults={"name": "NSS SPX Fault"})
        QueueRule.objects.get_or_create(
            queue=queue, seller_performance="No Show Seller", fault_type="NSS SPX Fault", driver_justification="")
        for i, label in enumerate(REVERSALS):
            opt, _ = TreatmentOption.objects.get_or_create(
                queue=queue, kind=TreatmentOption.Kind.REVERSAL, label=label, defaults={"sort_order": i})
            if label in REVERSED and not opt.counts_as_reversed:
                opt.counts_as_reversed = True
                opt.save(update_fields=["counts_as_reversed"])
        for i, (label, needs_text) in enumerate(JUSTIFICATIONS):
            TreatmentOption.objects.get_or_create(
                queue=queue, kind=TreatmentOption.Kind.JUSTIFICATION, label=label,
                defaults={"sort_order": i, "requires_text": needs_text})
        MessageTemplate.objects.get_or_create(queue=queue, defaults={"body": NSS_MESSAGE})
        self.stdout.write(self.style.SUCCESS("Seed OK"))
