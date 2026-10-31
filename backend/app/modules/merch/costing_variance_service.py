"""Owner cost visibility: tentative (quote/BOM) vs actual (PO/GRN) variance.

Simple, tenant-scoped MVP. Status bands:
  green  ≤ 3%
  yellow 3–10%
  red    > 10%
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback
from app.models import (
  Bom,
  BomItem,
  GoodsReceiving,
  GoodsReceivingItem,
  Order,
  PurchaseOrder,
  PurchaseOrderItem,
  QuotationMaterial,
)

logger = logging.getLogger(__name__)

GREEN_MAX_PCT = 3.0
YELLOW_MAX_PCT = 10.0


def _to_float(value: Any) -> float | None:
  if value is None or value == "":
    return None
  try:
    if isinstance(value, Decimal):
      return float(value)
    return float(value)
  except (TypeError, ValueError):
    return None


def variance_status(variance_pct: float | None) -> str:
  """Map absolute variance % to traffic-light status."""
  if variance_pct is None:
    return "unknown"
  abs_pct = abs(variance_pct)
  if abs_pct <= GREEN_MAX_PCT:
    return "green"
  if abs_pct <= YELLOW_MAX_PCT:
    return "yellow"
  return "red"


def compute_variance(tentative: float | None, actual: float | None) -> tuple[float | None, float | None, str]:
  """Return (variance_amount, variance_pct, status)."""
  if tentative is None or actual is None:
    return None, None, "unknown"
  amount = actual - tentative
  if abs(tentative) < 1e-9:
    pct = 0.0 if abs(actual) < 1e-9 else 100.0
  else:
    pct = (amount / tentative) * 100.0
  return amount, pct, variance_status(pct)


def _parse_snap_money(snap: dict[str, Any] | None, key: str) -> float | None:
  if not snap or not isinstance(snap, dict):
    return None
  return _to_float(snap.get(key))


async def _grn_actual_for_po_line(
  db: AsyncSession,
  tenant_id: int,
  *,
  purchase_order_id: int,
  purchase_order_line_id: int,
  item_id: int,
  fallback_unit_price: float,
) -> tuple[float, float]:
  """Sum (accepted qty × unit price) on RECEIVED GRNs. Returns (qty, cost)."""
  r = await db.execute(
    select(
      GoodsReceivingItem.accepted_qty,
      GoodsReceivingItem.received_qty,
      GoodsReceivingItem.quantity,
      GoodsReceivingItem.unit_price,
    )
    .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
    .where(
      GoodsReceivingItem.tenant_id == tenant_id,
      GoodsReceiving.tenant_id == tenant_id,
      GoodsReceiving.purchase_order_id == purchase_order_id,
      GoodsReceiving.status == "RECEIVED",
      or_(
        GoodsReceivingItem.purchase_order_line_id == purchase_order_line_id,
        GoodsReceivingItem.item_id == item_id,
      ),
    )
  )
  qty_total = 0.0
  cost_total = 0.0
  for acc, recv, qty, unit_price in r.all():
    q = _to_float(acc) or _to_float(recv) or _to_float(qty) or 0.0
    price = _to_float(unit_price)
    if price is None or price <= 0:
      price = fallback_unit_price
    qty_total += q
    cost_total += q * price
  return qty_total, cost_total


def _row_dict(
  *,
  line_key: str,
  description: str | None,
  item_code: str | None,
  item_id: int | None,
  tentative: float | None,
  actual: float | None,
  source_tentative: str,
  source_actual: str,
  bom_line_id: int | None = None,
  quotation_line_id: int | None = None,
) -> dict[str, Any]:
  amount, pct, status = compute_variance(tentative, actual)
  return {
    "line_key": line_key,
    "description": description,
    "item_code": item_code,
    "item_id": item_id,
    "bom_line_id": bom_line_id,
    "quotation_line_id": quotation_line_id,
    "tentative_cost": round(tentative, 4) if tentative is not None else None,
    "actual_cost": round(actual, 4) if actual is not None else None,
    "variance_amount": round(amount, 4) if amount is not None else None,
    "variance_pct": round(pct, 2) if pct is not None else None,
    "status": status,
    "source_tentative": source_tentative,
    "source_actual": source_actual,
  }


def _build_margin_impact(
  *,
  snap: dict[str, Any] | None,
  tentative_total: float,
  actual_total: float,
  overall_status: str,
) -> dict[str, Any]:
  snap_cost = _parse_snap_money(snap, "total_cost")
  snap_quoted = _parse_snap_money(snap, "quoted_price")
  snap_profit = _parse_snap_money(snap, "profit_percentage")
  var_amt, var_pct, _ = compute_variance(tentative_total, actual_total)

  estimated_margin_at_quote: float | None = None
  estimated_margin_with_actuals: float | None = None
  margin_quoted_percent: float | None = None
  margin_actual_percent: float | None = None
  if snap_quoted is not None and snap_quoted > 0:
    base_cost = snap_cost if snap_cost is not None else tentative_total
    estimated_margin_at_quote = snap_quoted - base_cost
    margin_quoted_percent = round((estimated_margin_at_quote / snap_quoted) * 100.0, 2)
    if var_amt is not None and snap_cost is not None:
      estimated_margin_with_actuals = snap_quoted - (snap_cost + var_amt)
    elif actual_total > 0:
      estimated_margin_with_actuals = snap_quoted - actual_total
    if estimated_margin_with_actuals is not None:
      margin_actual_percent = round((estimated_margin_with_actuals / snap_quoted) * 100.0, 2)
  elif snap_quoted is not None and snap_cost is not None:
    estimated_margin_at_quote = snap_quoted - snap_cost
    if var_amt is not None:
      estimated_margin_with_actuals = snap_quoted - (snap_cost + var_amt)
  elif snap_quoted is not None and actual_total > 0:
    estimated_margin_with_actuals = snap_quoted - actual_total

  return {
    "snapshot_total_cost": snap_cost,
    "snapshot_quoted_price": snap_quoted,
    "snapshot_profit_percentage": snap_profit,
    "tentative_material_total": round(tentative_total, 4),
    "actual_material_total": round(actual_total, 4),
    "variance_amount": round(var_amt, 4) if var_amt is not None else None,
    "variance_pct": round(var_pct, 2) if var_pct is not None else None,
    "overall_status": overall_status,
    "estimated_margin_at_quote": round(estimated_margin_at_quote, 4) if estimated_margin_at_quote is not None else None,
    "estimated_margin_with_actuals": (
      round(estimated_margin_with_actuals, 4) if estimated_margin_with_actuals is not None else None
    ),
    "margin_quoted_percent": margin_quoted_percent,
    "margin_actual_percent": margin_actual_percent,
  }


async def build_order_cost_variance(
  db: AsyncSession,
  *,
  tenant_id: int,
  order_id: int,
) -> dict[str, Any] | None:
  """Build cost variance payload for one order. Returns None if order missing / wrong tenant."""
  try:
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
      return None

    snap = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else None

    # --- Tentative sources: active BOM lines, else quotation materials ---
    bom = (
      await db.execute(
        select(Bom)
        .where(
          Bom.tenant_id == tenant_id,
          Bom.order_id == order_id,
          Bom.is_active.is_(True),
        )
        .order_by(Bom.id.desc())
        .limit(1)
      )
    ).scalar_one_or_none()

    bom_items: list[BomItem] = []
    if bom is not None:
      bom_items = list(
        (
          await db.execute(
            select(BomItem)
            .where(BomItem.tenant_id == tenant_id, BomItem.bom_id == bom.id)
            .order_by(BomItem.sort_order, BomItem.id)
          )
        ).scalars().all()
      )

    quote_mats: list[QuotationMaterial] = []
    if order.quotation_id is not None:
      quote_mats = list(
        (
          await db.execute(
            select(QuotationMaterial)
            .where(
              QuotationMaterial.tenant_id == tenant_id,
              QuotationMaterial.quotation_id == order.quotation_id,
            )
            .order_by(QuotationMaterial.serial_no, QuotationMaterial.id)
          )
        ).scalars().all()
      )
    quote_by_id = {m.id: m for m in quote_mats}

    # --- Actual sources: PO lines for this order ---
    po_lines = list(
      (
        await db.execute(
          select(PurchaseOrderItem, PurchaseOrder)
          .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
          .where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrder.tenant_id == tenant_id,
            or_(
              PurchaseOrderItem.source_order_id == order_id,
              PurchaseOrder.source_order_id == order_id,
            ),
          )
          .order_by(PurchaseOrderItem.id)
        )
      ).all()
    )

    # Aggregate actuals by bom_line_id / item_id / po_line
    actual_by_bom_line: dict[int, float] = {}
    actual_by_item: dict[int, float] = {}
    actual_by_quote_line: dict[int, float] = {}
    unmatched_po_actuals: list[tuple[PurchaseOrderItem, float, str]] = []

    for po_item, po in po_lines:
      po_qty = _to_float(po_item.quantity) or 0.0
      po_price = _to_float(po_item.unit_price) or 0.0
      grn_qty, grn_cost = await _grn_actual_for_po_line(
        db,
        tenant_id,
        purchase_order_id=po.id,
        purchase_order_line_id=po_item.id,
        item_id=po_item.item_id,
        fallback_unit_price=po_price,
      )
      if grn_qty > 0:
        actual_cost = grn_cost
        source = "grn"
      else:
        actual_cost = po_qty * po_price
        source = "po"

      matched = False
      if po_item.source_bom_line_id is not None:
        actual_by_bom_line[po_item.source_bom_line_id] = (
          actual_by_bom_line.get(po_item.source_bom_line_id, 0.0) + actual_cost
        )
        matched = True
      if po_item.source_quotation_line_id is not None:
        actual_by_quote_line[po_item.source_quotation_line_id] = (
          actual_by_quote_line.get(po_item.source_quotation_line_id, 0.0) + actual_cost
        )
        matched = True
      if po_item.item_id is not None:
        actual_by_item[po_item.item_id] = actual_by_item.get(po_item.item_id, 0.0) + actual_cost
        # item match alone does not count as "matched" for leftover suppression
      if not matched and po_item.source_bom_line_id is None and po_item.source_quotation_line_id is None:
        unmatched_po_actuals.append((po_item, actual_cost, source))

    rows: list[dict[str, Any]] = []
    used_quote_ids: set[int] = set()
    used_item_ids: set[int] = set()

    if bom_items:
      for bi in bom_items:
        tentative: float | None = _to_float(bi.quoted_total_cost)
        source_t = "bom_quoted_total"
        if tentative is None:
          unit = _to_float(bi.quoted_unit_price)
          qty = _to_float(bi.required_gross_qty)
          if unit is not None and qty is not None:
            tentative = unit * qty
            source_t = "bom_quoted_unit_x_qty"
        if tentative is None and bi.quotation_line_id and bi.quotation_line_id in quote_by_id:
          qm = quote_by_id[bi.quotation_line_id]
          tentative = _to_float(qm.total_amount) or _to_float(qm.base_amount)
          source_t = "quotation_material"
          used_quote_ids.add(qm.id)

        actual: float | None = None
        source_a = "none"
        if bi.id in actual_by_bom_line:
          actual = actual_by_bom_line[bi.id]
          source_a = "po_or_grn"
        elif bi.item_id is not None and bi.item_id in actual_by_item:
          actual = actual_by_item[bi.item_id]
          source_a = "po_or_grn_by_item"
          used_item_ids.add(bi.item_id)
        elif bi.quotation_line_id and bi.quotation_line_id in actual_by_quote_line:
          actual = actual_by_quote_line[bi.quotation_line_id]
          source_a = "po_or_grn_by_quote_line"

        if bi.item_id is not None:
          used_item_ids.add(bi.item_id)
        if bi.quotation_line_id:
          used_quote_ids.add(bi.quotation_line_id)

        rows.append(
          _row_dict(
            line_key=f"bom:{bi.id}",
            description=bi.description or bi.description_snapshot,
            item_code=bi.item_code or bi.item_code_snapshot,
            item_id=bi.item_id,
            tentative=tentative,
            actual=actual,
            source_tentative=source_t,
            source_actual=source_a,
            bom_line_id=bi.id,
            quotation_line_id=bi.quotation_line_id,
          )
        )
    else:
      # No BOM — use quotation materials as tentative rows
      for qm in quote_mats:
        tentative = _to_float(qm.total_amount) or _to_float(qm.base_amount)
        actual = None
        source_a = "none"
        if qm.id in actual_by_quote_line:
          actual = actual_by_quote_line[qm.id]
          source_a = "po_or_grn"
        elif qm.item_id is not None and qm.item_id in actual_by_item:
          actual = actual_by_item[qm.item_id]
          source_a = "po_or_grn_by_item"
          used_item_ids.add(qm.item_id)
        used_quote_ids.add(qm.id)
        rows.append(
          _row_dict(
            line_key=f"quote:{qm.id}",
            description=qm.description,
            item_code=None,
            item_id=qm.item_id,
            tentative=tentative,
            actual=actual,
            source_tentative="quotation_material",
            source_actual=source_a,
            quotation_line_id=qm.id,
          )
        )

    # Leftover PO lines not tied to a BOM/quote row
    for po_item, actual_cost, source in unmatched_po_actuals:
      if po_item.item_id in used_item_ids:
        continue
      rows.append(
        _row_dict(
          line_key=f"po:{po_item.id}",
          description=f"PO line #{po_item.id}",
          item_code=None,
          item_id=po_item.item_id,
          tentative=None,
          actual=actual_cost,
          source_tentative="none",
          source_actual=source,
        )
      )

    line_tentative_total = sum(r["tentative_cost"] or 0.0 for r in rows)
    actual_total = sum(r["actual_cost"] or 0.0 for r in rows)
    # Prefer frozen commercial snapshot total_cost as the order tentative total.
    snap_total = _parse_snap_money(snap, "total_cost")
    if snap_total is not None:
      tentative_total = snap_total
    else:
      tentative_total = line_tentative_total

    has_actual_data = any(r["actual_cost"] is not None for r in rows) or actual_total > 0
    has_tentative_data = tentative_total > 0 or any(r["tentative_cost"] is not None for r in rows)

    # No PO/GRN actuals yet → empty actual, status green (not an alert).
    if not has_actual_data:
      overall_pct, overall_status = None, "green"
      actual_total = 0.0
      for r in rows:
        if r["actual_cost"] is None:
          r["actual_cost"] = None
          r["variance_amount"] = None
          r["variance_pct"] = None
          r["status"] = "green"
    elif has_tentative_data or actual_total > 0:
      _, overall_pct, overall_status = compute_variance(tentative_total, actual_total)
    else:
      overall_pct, overall_status = None, "green"

    # Prefer worst line status when actuals exist (a single red line needs owner attention)
    if has_actual_data:
      line_statuses = [r["status"] for r in rows if r["status"] not in ("unknown",)]
      if "red" in line_statuses:
        overall_status = "red"
      elif "yellow" in line_statuses and overall_status in ("green", "unknown"):
        overall_status = "yellow"

    margin = _build_margin_impact(
      snap=snap,
      tentative_total=tentative_total,
      actual_total=actual_total,
      overall_status=overall_status,
    )
    # Align margin variance with green-when-no-actuals rule.
    if not has_actual_data:
      margin["variance_amount"] = None
      margin["variance_pct"] = None
      margin["overall_status"] = "green"
      margin["actual_material_total"] = 0.0

    return {
      "order_id": order.id,
      "order_code": order.order_code,
      "order_status": order.status,
      "bom_id": bom.id if bom else None,
      "quotation_id": order.quotation_id,
      "rows": rows,
      "totals": {
        "tentative_cost": round(tentative_total, 4),
        "actual_cost": round(actual_total, 4),
        "variance_amount": margin["variance_amount"],
        "variance_pct": round(overall_pct, 2) if overall_pct is not None else None,
        "status": overall_status,
      },
      "margin_impact": margin,
      "thresholds": {
        "green_max_pct": GREEN_MAX_PCT,
        "yellow_max_pct": YELLOW_MAX_PCT,
      },
    }
  except Exception:
    logger.exception("build_order_cost_variance failed order_id=%s tenant_id=%s", order_id, tenant_id)
    await safe_async_session_rollback(db)
    return None


async def list_order_profitability_summary(
  db: AsyncSession,
  *,
  tenant_id: int,
  status_filter: str | None = None,
  page: int = 1,
  page_size: int = 25,
) -> dict[str, Any]:
  """Paginated order list with cost-variance rollup status."""
  empty = {
    "items": [],
    "total": 0,
    "page": page,
    "page_size": page_size,
    "total_pages": 0,
  }
  try:
    filters = [Order.tenant_id == tenant_id]
    if status_filter and status_filter.strip():
      filters.append(Order.status == status_filter.strip().upper())

    total = int(
      (
        await db.execute(select(func.count()).select_from(Order).where(*filters))
      ).scalar_one()
      or 0
    )
    if total == 0:
      return empty

    offset = max(0, (page - 1) * page_size)
    orders = list(
      (
        await db.execute(
          select(Order)
          .where(*filters)
          .order_by(Order.updated_at.desc())
          .offset(offset)
          .limit(page_size)
        )
      ).scalars().all()
    )

    items: list[dict[str, Any]] = []
    for order in orders:
      payload = await build_order_cost_variance(db, tenant_id=tenant_id, order_id=order.id)
      if not payload:
        items.append(
          {
            "order_id": order.id,
            "order_code": order.order_code,
            "order_status": order.status,
            "status": "unknown",
            "tentative_cost": None,
            "actual_cost": None,
            "variance_pct": None,
            "margin_impact": None,
            "quoted_margin_percent": None,
            "actual_margin_percent": None,
            "sparkline_data": [],
          }
        )
        continue
      totals = payload["totals"]
      margin = payload.get("margin_impact") or {}
      quoted_pct = margin.get("margin_quoted_percent")
      if quoted_pct is None:
        quoted_pct = margin.get("snapshot_profit_percentage")
      actual_pct = margin.get("margin_actual_percent")
      spark: list[float] = []
      if isinstance(quoted_pct, (int, float)) and isinstance(actual_pct, (int, float)):
        start = float(quoted_pct)
        end = float(actual_pct)
        spark = [round(start + (end - start) * (i / 6.0), 2) for i in range(7)]
      elif isinstance(quoted_pct, (int, float)):
        spark = [round(float(quoted_pct), 2)] * 7
      items.append(
        {
          "order_id": order.id,
          "order_code": order.order_code,
          "order_status": order.status,
          "status": totals["status"],
          "tentative_cost": totals["tentative_cost"],
          "actual_cost": totals["actual_cost"],
          "variance_pct": totals["variance_pct"],
          "margin_impact": margin,
          "quoted_margin_percent": round(float(quoted_pct), 2) if isinstance(quoted_pct, (int, float)) else None,
          "actual_margin_percent": round(float(actual_pct), 2) if isinstance(actual_pct, (int, float)) else None,
          "sparkline_data": spark,
        }
      )

    total_pages = (total + page_size - 1) // page_size if page_size else 0
    return {
      "items": items,
      "total": total,
      "page": page,
      "page_size": page_size,
      "total_pages": total_pages,
    }
  except Exception:
    logger.exception("list_order_profitability_summary failed tenant_id=%s", tenant_id)
    await safe_async_session_rollback(db)
    return empty


async def list_pending_price_verifications(
  db: AsyncSession,
  *,
  tenant_id: int,
  limit: int = 50,
) -> list[dict[str, Any]]:
  """Orders whose cost variance status is red (owner should verify prices)."""
  try:
    # Prefer recent active-ish orders; scan a bounded window then filter red.
    orders = list(
      (
        await db.execute(
          select(Order)
          .where(
            Order.tenant_id == tenant_id,
            Order.status.notin_(["CANCELLED", "CLOSED", "COMPLETED"]),
          )
          .order_by(Order.updated_at.desc())
          .limit(min(max(limit * 4, 40), 200))
        )
      ).scalars().all()
    )
    out: list[dict[str, Any]] = []
    for order in orders:
      payload = await build_order_cost_variance(db, tenant_id=tenant_id, order_id=order.id)
      if not payload:
        continue
      if payload["totals"]["status"] != "red":
        continue
      out.append(
        {
          "order_id": order.id,
          "order_code": order.order_code,
          "order_status": order.status,
          "status": "red",
          "tentative_cost": payload["totals"]["tentative_cost"],
          "actual_cost": payload["totals"]["actual_cost"],
          "variance_pct": payload["totals"]["variance_pct"],
          "href": f"/app/orders/{order.id}",
        }
      )
      if len(out) >= limit:
        break
    return out
  except Exception:
    logger.exception("list_pending_price_verifications failed tenant_id=%s", tenant_id)
    await safe_async_session_rollback(db)
    return []
