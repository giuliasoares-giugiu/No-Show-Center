from abc import ABC, abstractmethod
from datetime import date
from typing import Iterator, Optional


class OccurrenceSource(ABC):
    """Contrato: GET /occurrences?date_from&date_to&updated_since&cursor (ver README)."""

    @abstractmethod
    def fetch(self, date_from: date, date_to: date, updated_since: Optional[str] = None) -> Iterator[dict]:
        ...


class MemberSource(ABC):
    """Contrato: GET /station-members?updated_since&cursor."""

    @abstractmethod
    def fetch(self, updated_since: Optional[str] = None) -> Iterator[dict]:
        ...
