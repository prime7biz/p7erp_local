"""Phase 16: compare extracted document fields to ERP records — mismatch detection only (no writes)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Order, Quotation


def _norm(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return str(v).strip()


async def validate_extracted_against_entity(
    db: AsyncSession,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
    extracted_fields: dict[str, Any],
) -> dict[str, Any]:
    """Return structured mismatches for whitelisted keys only."""
    et = (entity_type or "").strip().lower()
    mismatches: list[dict[str, Any]] = []

    if et == "order":
        row = await db.get(Order, entity_id)
        if not row or row.tenant_id != tenant_id:
            return {"ok": False, "error": "ORDER_NOT_FOUND", "mismatches": []}
        canonical = {
            "order_code": row.order_code,
            "quantity": row.quantity,
            "delivery_date": row.delivery_date,
            "shipping_term": row.shipping_term,
        }
    elif et == "quotation":
        row = await db.get(Quotation, entity_id)
        if not row or row.tenant_id != tenant_id:
            return {"ok": False, "error": "QUOTATION_NOT_FOUND", "mismatches": []}
        canonical = {
            "currency": getattr(row, "currency", None),
            "department": getattr(row, "department", None),
            "projected_quantity": getattr(row, "projected_quantity", None),
        }
    elif et == "customer":
        row = await db.get(Customer, entity_id)
        if not row or row.tenant_id != tenant_id:
            return {"ok": False, "error": "CUSTOMER_NOT_FOUND", "mismatches": []}
        canonical = {
            "name": row.name,
            "email": getattr(row, "email", None),
            "phone": getattr(row, "phone", None),
        }
    else:
        return {"ok": False, "error": "UNSUPPORTED_ENTITY_TYPE", "mismatches": []}

    for key, raw_extracted in extracted_fields.items():
        k = (key or "").strip()
        if not k or k not in canonical:
            continue
        erp_val = canonical[k]
        ex_val = raw_extracted
        if _norm(erp_val) != _norm(ex_val):
            mismatches.append(
                {
                    "field": k,
                    "erp_value": erp_val,
                    "extracted_value": ex_val,
                    "confidence": 1.0,
                    "reason_codes": ["FIELD_NEQ"],
                }
            )

    return {
        "ok": True,
        "entity_type": et,
        "entity_id": entity_id,
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
    }
