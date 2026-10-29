import random
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import StationMember
from apps.occurrences.models import Occurrence
from apps.treatments.models import ContactAttempt, Treatment, TreatmentOption


class Command(BaseCommand):
    help = "SÓ DESENVOLVIMENTO: simula contatos e tratativas nas ocorrências para demonstrar os insights."

    def handle(self, *args, **opts):
        if not settings.DEBUG:
            raise CommandError("seed_demo só roda com DJANGO_DEBUG=1.")
        rng = random.Random(7)
        treated = contacted = 0
        for occ in Occurrence.objects.filter(queue__isnull=False, treatment__isnull=True).select_related("queue"):
            age = (timezone.localdate() - occ.occurrence_date).days
            # Não simula ação sobre um no-show que, no relógio de hoje, ainda nem aconteceu (daria tempo de resolução negativo).
            if occ.occurred_at and occ.occurred_at > timezone.now() - timedelta(minutes=30):
                continue
            members = list(StationMember.objects.filter(station_code=occ.station_code, is_active=True))
            # Ocorrências mais antigas têm mais chance de já terem sido acionadas/tratadas.
            if members and rng.random() < min(0.35 + age * 0.08, 0.9):
                m = rng.choice(members)
                # 1 a 3 acionamentos, espaçados: alimenta "tentativas até o sucesso".
                sent = (occ.occurred_at or timezone.now()) + timedelta(minutes=rng.randint(10, 240))
                for _ in range(rng.choices([1, 2, 3], weights=[62, 26, 12])[0]):
                    attempt = ContactAttempt.objects.create(
                        occurrence=occ, sent_by=m.email, member=m, member_name=m.name, member_phone=m.phone,
                        message="(demo)")
                    ContactAttempt.objects.filter(pk=attempt.pk).update(sent_at=min(sent, timezone.now()))
                    sent += timedelta(minutes=rng.randint(30, 180))
                contacted += 1
                if rng.random() < min(0.25 + age * 0.09, 0.85):
                    opts = occ.queue.options.filter(is_active=True)
                    rev = rng.choices(list(opts.filter(kind="reversal")), weights=[30, 25, 45])[0]
                    jus = rng.choices(list(opts.filter(kind="justification")), weights=[10, 18, 22, 20, 8, 12, 10])[0]
                    t = Treatment.objects.create(occurrence=occ, reversal=rev, justification=jus, treated_by=m.email,
                                                 justification_text="Detalhe (demo)" if jus.requires_text else "")
                    Treatment.objects.filter(pk=t.pk).update(
                        created_at=min(sent + timedelta(minutes=rng.randint(20, 600)), timezone.now()))
                    treated += 1
        self.stdout.write(self.style.SUCCESS(f"Demo: {contacted} contatos, {treated} tratativas."))
