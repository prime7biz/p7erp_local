"""UTC values for ORM columns mapped as TIMESTAMP WITHOUT TIME ZONE.

asyncpg rejects timezone-aware ``datetime`` for these columns (DataError mixing
naive/aware). Store UTC as naive datetimes to match the rest of the schema.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_naive_plus(**kwargs: float | int) -> datetime:
    return utc_now_naive() + timedelta(**kwargs)
