from django.conf import settings


def get_occurrence_source():
    if settings.INGESTION_SOURCE == "datasuite":
        from .datasuite import DataSuiteOccurrenceSource
        return DataSuiteOccurrenceSource()
    from .mock import MockOccurrenceSource
    return MockOccurrenceSource()


def get_member_source():
    if settings.INGESTION_SOURCE == "datasuite":
        from .datasuite import DataSuiteMemberSource
        return DataSuiteMemberSource()
    from .mock import MockMemberSource
    return MockMemberSource()
