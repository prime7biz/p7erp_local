"""Tenant numéraire / book currency for governed commercial reporting (merch quotations & orders).

The costing numéraire for a quotation is always `quotations.currency` (document currency) for rollups.
Optional tenant override `feature_flags.commercial_book_currency` names the ISO code used for
cross-document comparison and management reporting when it must differ from a specific document.
"""

from __future__ import annotations

from typing import Any

# Set via tenant settings: PATCH ... feature_flags merge including this key (e.g. "BDT").
COMMERCIAL_BOOK_CURRENCY_FLAG_KEY = "commercial_book_currency"


def _tenant_flags(tenant: Any) -> dict[str, Any]:
  raw = getattr(tenant, "feature_flags", None)
  return raw if isinstance(raw, dict) else {}


def resolve_commercial_book_currency(tenant: Any | None, document_currency: str | None) -> str | None:
  """Resolved book currency: tenant override if set, else document (quotation) currency."""
  override = _tenant_flags(tenant).get(COMMERCIAL_BOOK_CURRENCY_FLAG_KEY)
  if override is not None and str(override).strip():
    return str(override).strip().upper()[:10]
  if document_currency and str(document_currency).strip():
    return str(document_currency).strip().upper()[:10]
  return None
