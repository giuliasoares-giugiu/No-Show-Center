import json

from ..normalize import normalize_row
from .base import OccurrenceSource
from .datasuite import extract_rows


class FileOccurrenceSource(OccurrenceSource):
    """Lê um JSON salvo da API (lista ou envelope `{"rows": [...]}`). Testa a ingestão sem a rede e sem a API."""

    def __init__(self, path: str):
        self.path = path

    def fetch(self, date_from, date_to, updated_since=None):
        with open(self.path, encoding="utf-8") as handle:
            rows = extract_rows(json.load(handle))
        return (normalize_row(row) for row in rows)
