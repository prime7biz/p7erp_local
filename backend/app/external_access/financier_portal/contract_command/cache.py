"""Simple TTL cache for contract command payloads (per tenant + party + contract)."""

from __future__ import annotations

import time
from typing import Any


class _Entry:
    __slots__ = ("at", "value")

    def __init__(self, at: float, value: Any) -> None:
        self.at = at
        self.value = value


_CACHE: dict[tuple[int, int, int, str | None], _Entry] = {}
_TTL_SEC = 120.0


def get_cached(key: tuple[int, int, int, str | None]) -> Any | None:
    ent = _CACHE.get(key)
    if not ent:
        return None
    if time.monotonic() - ent.at > _TTL_SEC:
        _CACHE.pop(key, None)
        return None
    return ent.value


def set_cached(key: tuple[int, int, int, str | None], value: Any) -> None:
    _CACHE[key] = _Entry(time.monotonic(), value)


def clear_contract_cache(tenant_id: int, party_id: int, contract_id: int) -> None:
    to_del = [k for k in _CACHE if k[0] == tenant_id and k[1] == party_id and k[2] == contract_id]
    for k in to_del:
        _CACHE.pop(k, None)
