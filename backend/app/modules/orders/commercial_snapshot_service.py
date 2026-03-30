"""Commercial snapshots and quotation↔order alignment (read-only comparison; no auto-mutation)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import Order, Quotation
from app.modules.orders.commercial_fields import is_quotation_commercial_locked
from app.modules.orders.commercial_numeraire import resolve_commercial_book_currency


def quotation_commercial_header_dict(q: Quotation) -> dict[str, Any]:
  return {
    "quotation_id": q.id,
    "quotation_code": q.quotation_code,
    "version_no": q.version_no,
    "status": q.status,
    "document_currency": q.currency,
    "target_price_currency": q.target_price_currency,
    "target_price": q.target_price,
    "exchange_rate": q.exchange_rate,
    "quoted_price": q.quoted_price,
    "total_amount": q.total_amount,
    "total_cost": q.total_cost,
    "profit_percentage": q.profit_percentage,
    "projected_quantity": q.projected_quantity,
    "projected_delivery_date": q.projected_delivery_date.isoformat() if q.projected_delivery_date else None,
    "quotation_date": q.quotation_date.isoformat() if q.quotation_date else None,
    "valid_until": q.valid_until.isoformat() if q.valid_until else None,
    "shipping_term": q.shipping_term,
    "commission_mode": q.commission_mode,
    "commission_type": q.commission_type,
    "commission_value": float(q.commission_value) if q.commission_value is not None else None,
  }


def build_order_commercial_snapshot_at_conversion(
  quotation: Quotation,
  *,
  tenant: Any,
) -> dict[str, Any]:
  book = resolve_commercial_book_currency(tenant, quotation.currency)
  snap = quotation_commercial_header_dict(quotation)
  snap["captured_at"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
  snap["commercial_book_currency"] = book
  snap["costing_numeraire_note"] = "Document currency (quotation.currency) is the costing numéraire for rollup lines."
  snap["margin_basis_note"] = (
    "Auto quoted_price on full PUT uses profit_percentage on factory total_cost; "
    "inquiry conversion may use target_price as base."
  )
  return snap


def _norm_val(v: Any) -> str:
  if v is None:
    return ""
  if isinstance(v, float):
    return f"{v:.6f}".rstrip("0").rstrip(".")
  return str(v).strip()


def list_commercial_discrepancies(
  *,
  order: Order,
  live_quotation: Quotation | None,
  frozen: dict[str, Any] | None,
) -> list[dict[str, str]]:
  out: list[dict[str, str]] = []
  if not frozen:
    out.append(
      {
        "code": "NO_CONVERSION_SNAPSHOT",
        "message": "This order has no frozen commercial snapshot (created before snapshot support or not from quotation).",
      }
    )
    return out

  if not live_quotation:
    return out

  field_checks: list[tuple[str, str, Any]] = [
    ("quoted_price", "Quoted price", live_quotation.quoted_price),
    ("total_amount", "Total / offer amount", live_quotation.total_amount),
    ("document_currency", "Document currency", live_quotation.currency),
    ("target_price_currency", "Buyer target currency", live_quotation.target_price_currency),
    ("exchange_rate", "Header exchange rate", live_quotation.exchange_rate),
    ("total_cost", "Factory total cost", live_quotation.total_cost),
    ("shipping_term", "Shipping term", live_quotation.shipping_term),
  ]
  for key, label, live_val in field_checks:
    a = frozen.get(key)
    b = live_val
    if _norm_val(a) and _norm_val(b) and _norm_val(a) != _norm_val(b):
      out.append(
        {
          "code": f"DRIFT_{key.upper()}",
          "message": f"{label} changed on quotation since conversion (frozen {_norm_val(a)!r} vs live {_norm_val(b)!r}).",
        }
      )

  fq = frozen.get("projected_quantity")
  if fq is not None and order.quantity is not None and int(fq) != int(order.quantity):
    out.append(
      {
        "code": "QTY_ORDER_VS_QUOTE_PROJECTION",
        "message": f"Order quantity ({order.quantity}) differs from quotation projected quantity at conversion ({fq}).",
      }
    )

  fd = frozen.get("projected_delivery_date")
  od = order.delivery_date.isoformat() if order.delivery_date else None
  if fd and od and fd != od:
    out.append(
      {
        "code": "DELIVERY_DATE_DRIFT",
        "message": f"Order delivery date ({od}) differs from quotation projected delivery at conversion ({fd}).",
      }
    )

  for label, o_attr, q_attr in (
    ("Commission mode", "commission_mode", "commission_mode"),
    ("Commission type", "commission_type", "commission_type"),
  ):
    fv = frozen.get(q_attr)
    ov = getattr(order, o_attr, None)
    if _norm_val(fv) and _norm_val(ov) and _norm_val(fv) != _norm_val(ov):
      out.append(
        {
          "code": f"DRIFT_{o_attr.upper()}",
          "message": f"{label} differs between order and quotation-at-conversion snapshot.",
        }
      )

  fcv = frozen.get("commission_value")
  lcv = float(live_quotation.commission_value) if live_quotation.commission_value is not None else None
  if fcv is not None and lcv is not None and _norm_val(fcv) != _norm_val(lcv):
    out.append(
      {
        "code": "DRIFT_QUOTATION_COMMISSION_VALUE",
        "message": "Quotation commission value changed since conversion vs frozen snapshot.",
      }
    )

  return out


def build_commercial_alignment_payload(
  *,
  tenant: Any,
  order: Order,
  live_quotation: Quotation | None,
) -> dict[str, Any]:
  frozen = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else None
  doc_ccy = frozen.get("document_currency") if frozen else None
  if not doc_ccy and live_quotation:
    doc_ccy = live_quotation.currency
  book = resolve_commercial_book_currency(tenant, doc_ccy)

  live_snap = quotation_commercial_header_dict(live_quotation) if live_quotation else None
  discrepancies = list_commercial_discrepancies(
    order=order,
    live_quotation=live_quotation,
    frozen=frozen,
  )

  q_locked = (
    is_quotation_commercial_locked(live_quotation.status) if live_quotation else False
  )

  return {
    "commercial_book_currency": book,
    "costing_numeraire_description": "Quotation document currency (currency) is the costing numéraire for line rollups.",
    "frozen_at_conversion": frozen,
    "live_quotation": live_snap,
    "order_execution": {
      "quantity": order.quantity,
      "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
      "order_date": order.order_date.isoformat() if order.order_date else None,
      "shipping_term": order.shipping_term,
      "commission_mode": order.commission_mode,
      "commission_type": order.commission_type,
      "commission_value": float(order.commission_value) if order.commission_value is not None else None,
    },
    "discrepancies": discrepancies,
    "quotation_commercially_locked": q_locked,
    "quotation_status": live_quotation.status if live_quotation else None,
  }
