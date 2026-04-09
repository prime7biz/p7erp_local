"""Reusable document verification (QR payload) — same pattern as finance vouchers."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime
from typing import Any, Protocol, runtime_checkable


def canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def compute_signature_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def new_verification_id() -> str:
    return f"VFY-{secrets.token_hex(8).upper()}"


@runtime_checkable
class _SignableDoc(Protocol):
    verification_id: str | None
    signature_hash: str | None
    signed_at: datetime | None


def apply_document_signature(doc: _SignableDoc, payload: dict[str, Any]) -> None:
    """Set verification_id (if missing), signature_hash, signed_at on ORM row."""
    doc.signature_hash = compute_signature_hash(payload)
    if not doc.verification_id:
        doc.verification_id = new_verification_id()
    doc.signed_at = datetime.utcnow()


def verify_payload_against_hash(
    stored_hash: str | None,
    payload: dict[str, Any],
) -> tuple[bool, str]:
    """Return (is_valid, recalculated_hash)."""
    recalculated = compute_signature_hash(payload)
    if not stored_hash:
        return False, recalculated
    return stored_hash == recalculated, recalculated
