from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.ingestion.services import sync_members, sync_occurrences
from apps.ingestion.sources import get_member_source, get_occurrence_source
from apps.ingestion.sources.file import FileOccurrenceSource


class Command(BaseCommand):
    help = "Sincroniza membros de station e ocorrências do Data Suite (Cloud Run Job)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7, help="Janela de ocorrências (dias para trás).")
        parser.add_argument("--updated-since", default=None, help="ISO datetime para sync incremental.")
        parser.add_argument("--only", choices=["members", "occurrences"], default=None)
        parser.add_argument("--file", help="Carrega as ocorrências de um JSON salvo da API (lista ou envelope) em vez da fonte configurada.")
        parser.add_argument("--all-types", action="store_true", help="Com --file, grava também os tipos fora de INGEST_PERFORMANCES.")

    def handle(self, *args, **opts):
        today = timezone.localdate()
        if opts["only"] != "occurrences":
            self.stdout.write(f"members: {sync_members(get_member_source(), opts['updated_since'])}")
        if opts["only"] != "members":
            # O mock traz tipos extras de propósito (para testar o roteamento de filas); a API real devolve tudo do dia.
            if opts["file"]:
                source = FileOccurrenceSource(opts["file"])
                allowed = None if opts["all_types"] else settings.INGEST_PERFORMANCES
            else:
                source = get_occurrence_source()
                allowed = settings.INGEST_PERFORMANCES if settings.INGESTION_SOURCE == "datasuite" else None
            stats = sync_occurrences(source, today - timedelta(days=opts["days"]), today, opts["updated_since"], allowed=allowed)
            self.stdout.write(f"occurrences: {stats}")
