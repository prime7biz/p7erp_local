"""QR verification id lifecycle for quotations (Phase 4B).

Rule: a quotation is publicly verifiable only while it is the CURRENT revision and its status is
SENT or CONVERTED. The id is issued the first time that is true and removed on reject / cancel /
supersede, so an old printout stops verifying.
"""

from __future__ import annotations

from app.common.document_signature import new_verification_id
from app.models import Quotation

VERIFIABLE_STATUSES = frozenset({"SENT", "CONVERTED"})


def is_verifiable(quotation: Quotation) -> bool:
    return quotation.superseded_at is None and (quotation.status or "").upper() in VERIFIABLE_STATUSES


def sync_verification_id(quotation: Quotation) -> None:
    """Call after a status or supersede change. Issues, keeps, or clears ``verification_id``."""
    if is_verifiable(quotation):
        if not quotation.verification_id:
            quotation.verification_id = new_verification_id()
    else:
        quotation.verification_id = None
