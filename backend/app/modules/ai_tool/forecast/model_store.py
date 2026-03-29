"""Forecast model helpers (training payload hashing; on-disk layout uses `get_media_root()` when needed)."""

from __future__ import annotations

import hashlib
import json


def hash_training_payload(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]
