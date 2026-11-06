from __future__ import annotations

from pydantic import BaseModel


class PublicDocumentVerification(BaseModel):
    """What anyone scanning a printed QR code may see. Never add hashes, ids or line details."""

    is_valid: bool
    document_type: str
    document_label: str
    document_number: str | None = None
    document_date: str | None = None
    status: str | None = None
    company_name: str
    # Money total (vouchers only), as a fixed 2-decimal string to avoid float rounding.
    amount: str | None = None
    currency: str | None = None
    # Stock documents carry quantities instead of a money total.
    quantity: str | None = None
    line_count: int | None = None
    signed_at: str | None = None


class PublicProformaVerification(BaseModel):
    valid: bool = True
    message: str | None = None
    company_name: str | None = None
    issued_by: str | None = None
    reference: str | None = None
    invoice_date: str | None = None
    amount: float | None = None
    currency: str | None = None
