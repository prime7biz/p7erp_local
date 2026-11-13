"""Supplier lateness percentiles (Phase 4, read-only). Plan 15 sections 5.3-5.4, D7-D10, 17.10, 17.12, 17.16.

Per PO line: lateness L = receipt date - promise date in whole days (negative = early).
- promise = `purchase_orders.expected_date` (label promise_basis CURRENT_EXPECTED_DATE); missing -> excluded
- PO statuses APPROVED, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED (DRAFT, SUBMITTED, CANCELLED never)
- receipt date "in full" = received_date of the RECEIVED goods receipt that brings the cumulative QC-accepted quantity
  to >= 95 % of the line quantity (GRN rows with a NULL received_date are ignored)
- not in full on a closed PO (FULLY_RECEIVED / CLOSED): last receipt date if any, else excluded (CLOSED_NO_RECEIPT)
- not in full on an open PO: past the promise -> lower bound L = today - promise (OPEN_LATE_LOWER_BOUND), unless more
  than 180 days past the promise (excluded STALE); not yet due -> excluded (NOT_DUE)
Window: promises in the last 365 days (and fully received lines promised up to 365 days ahead); at most 20,000 lines.
Stats per group: n, nearest-rank P50 / P80 / P90 (and every grid q), on-time rate (share L <= 0).
Hierarchy (minimum 5 lines): vendor x item category -> vendor -> item category -> whole tenant -> UNKNOWN (no
adjustment). Every group is inside this tenant; another company's history is never used.

Predicted receipt of an open PO line (17.10), ETAs loaded with receipt_buffer_days = 0:
    PO_EXPECTED_DATE / ORDER_DATE_PLUS_LEAD_TIME: R_q = max(today, eta_raw + max(buffer, L_q))
    supplier-dated ETA (SHIP_DATE / CONFIRMED):   R_q = max(today, eta_raw + buffer)
    ETA unknown -> R_q unknown
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.costing import Item
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, PurchaseOrder, PurchaseOrderItem
from app.modules.inventory.open_po_supply_service import (
    ETA_ORDER_DATE_LEAD_TIME,
    ETA_PO_EXPECTED_DATE,
    to_decimal,
    usable_received_qty,
)
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.decimals import ZERO, dec_str

HISTORY_PO_STATUSES: tuple[str, ...] = ("APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED")
CLOSED_PO_STATUSES: tuple[str, ...] = ("FULLY_RECEIVED", "CLOSED")
WINDOW_DAYS = 365
STALE_DAYS = 180
MIN_SAMPLE = 5
MAX_HISTORY_LINES = 20000
IN_FULL_SHARE = Decimal("0.95")
PROMISE_BASIS = "CURRENT_EXPECTED_DATE"

SRC_VENDOR_CATEGORY = "VENDOR_CATEGORY"
SRC_VENDOR = "VENDOR"
SRC_CATEGORY = "CATEGORY"
SRC_TENANT = "TENANT"
SRC_UNKNOWN = "UNKNOWN"
SOURCE_RANK = {SRC_VENDOR_CATEGORY: 0, SRC_VENDOR: 1, SRC_CATEGORY: 2, SRC_TENANT: 3, SRC_UNKNOWN: 4}

ADJUSTABLE_ETA_SOURCES = (ETA_PO_EXPECTED_DATE, ETA_ORDER_DATE_LEAD_TIME)

ASSUMPTIONS = [
    "Promise date = the purchase order expected date as it is stored today (CURRENT_EXPECTED_DATE).",
    "Received in full = QC-accepted quantity on received goods receipts reaches 95 % of the line quantity.",
    "Open lines past their promise count with today - promise days late (a lower bound); lines more than 180 days "
    "past the promise are excluded as stale.",
    "Percentiles are nearest-rank over the last 365 days; a group needs at least 5 lines, otherwise the next wider "
    "group of this company is used.",
]


@dataclass
class LatenessGroup:
    values: list[int] = field(default_factory=list)  # whole days
    open_lower_bound: int = 0

    @property
    def n(self) -> int:
        return len(self.values)

    def quantile(self, q: Decimal) -> int | None:
        v = st.nearest_rank([Decimal(x) for x in self.values], q)
        return int(v) if v is not None else None

    @property
    def on_time_rate(self) -> Decimal | None:
        if not self.values:
            return None
        return Decimal(sum(1 for x in self.values if x <= 0)) / Decimal(len(self.values))


@dataclass
class LatenessModel:
    as_of: date
    by_vendor_category: dict[tuple[int | None, int | None], LatenessGroup]
    by_vendor: dict[int | None, LatenessGroup]
    by_category: dict[int | None, LatenessGroup]
    tenant: LatenessGroup
    excluded: dict[str, int]
    truncated: bool

    def group_for(self, vendor_id: int | None, category_id: int | None) -> tuple[str, LatenessGroup | None]:
        """Narrowest group with >= MIN_SAMPLE lines (vendor x category, vendor, category, tenant) or UNKNOWN."""
        candidates: list[tuple[str, LatenessGroup | None]] = []
        if vendor_id is not None:
            candidates.append((SRC_VENDOR_CATEGORY, self.by_vendor_category.get((vendor_id, category_id))))
            candidates.append((SRC_VENDOR, self.by_vendor.get(vendor_id)))
        if category_id is not None:
            candidates.append((SRC_CATEGORY, self.by_category.get(category_id)))
        candidates.append((SRC_TENANT, self.tenant))
        for source, group in candidates:
            if group is not None and group.n >= MIN_SAMPLE:
                return source, group
        return SRC_UNKNOWN, None

    def lateness_days(self, vendor_id: int | None, category_id: int | None, q: Decimal) -> tuple[int, str]:
        """L_q clamped at >= 0 (never earlier than the promise) and its source; UNKNOWN -> 0."""
        source, group = self.group_for(vendor_id, category_id)
        if group is None:
            return 0, source
        value = group.quantile(q)
        return max(0, value or 0), source


def predicted_receipt(
    eta_raw: date | None, eta_source: str, *, today: date, buffer_days: int, lateness_days: int
) -> date | None:
    """R_q for one open PO line (17.10). The planning buffer and the lateness never add up."""
    if eta_raw is None:
        return None
    buffer = max(0, int(buffer_days or 0))
    if eta_source in ADJUSTABLE_ETA_SOURCES:
        shifted = eta_raw + timedelta(days=max(buffer, max(0, int(lateness_days))))
    else:
        shifted = eta_raw + timedelta(days=buffer)
    return max(today, shifted)


async def load_lateness_model(db: AsyncSession, tenant_id: int, *, today: date) -> LatenessModel:
    """Two bounded queries: PO lines (with vendor and item category) and their receipts."""
    start = today - timedelta(days=WINDOW_DAYS)
    po, poi = PurchaseOrder, PurchaseOrderItem
    base_filter = (
        poi.tenant_id == tenant_id,
        po.tenant_id == tenant_id,
        po.status.in_(HISTORY_PO_STATUSES),
        po.expected_date.isnot(None),
        po.expected_date >= start,
        po.expected_date <= today + timedelta(days=WINDOW_DAYS),
    )
    lines = list(
        (
            await db.execute(
                select(poi.id, poi.quantity, po.status, po.expected_date, po.vendor_id, Item.category_id)
                .join(po, po.id == poi.purchase_order_id)
                .outerjoin(Item, (Item.id == poi.item_id) & (Item.tenant_id == tenant_id))
                .where(*base_filter)
                .order_by(po.expected_date.desc(), poi.id.desc())
                .limit(MAX_HISTORY_LINES + 1)
            )
        ).all()
    )
    truncated = len(lines) > MAX_HISTORY_LINES
    lines = lines[:MAX_HISTORY_LINES]
    receipts: dict[int, list[tuple[date, Decimal]]] = defaultdict(list)
    if lines:
        gri, gr = GoodsReceivingItem, GoodsReceiving
        wanted = {int(r[0]) for r in lines}
        oldest = min(r[3] for r in lines)
        for line_id, received_date, accepted, received in (
            await db.execute(
                select(gri.purchase_order_line_id, gr.received_date, gri.accepted_qty, gri.received_qty)
                .join(gr, gr.id == gri.goods_receiving_id)
                .join(poi, poi.id == gri.purchase_order_line_id)
                .join(po, po.id == poi.purchase_order_id)
                .where(
                    gri.tenant_id == tenant_id,
                    gr.tenant_id == tenant_id,
                    gr.status == "RECEIVED",
                    gr.received_date.isnot(None),
                    *base_filter,
                    po.expected_date >= oldest,
                )
            )
        ).all():
            if line_id is None or int(line_id) not in wanted:
                continue
            receipts[int(line_id)].append((received_date, usable_received_qty(accepted, received)))

    excluded: dict[str, int] = defaultdict(int)
    model = LatenessModel(today, defaultdict(LatenessGroup), defaultdict(LatenessGroup), defaultdict(LatenessGroup),
                          LatenessGroup(), excluded, truncated)
    for line_id, qty, status, promise, vendor_id, category_id in lines:
        ordered = max(ZERO, to_decimal(qty))
        if ordered <= ZERO:
            excluded["NO_QUANTITY"] += 1
            continue
        got = sorted(receipts.get(int(line_id), []), key=lambda x: x[0])
        full_date: date | None = None
        cumulative = ZERO
        for d, accepted in got:
            cumulative += accepted
            if cumulative >= ordered * IN_FULL_SHARE:
                full_date = d
                break
        lower_bound = False
        if full_date is not None:
            lateness = (full_date - promise).days
        elif (status or "").upper() in CLOSED_PO_STATUSES:
            received_dates = [d for d, accepted in got if accepted > ZERO]
            if not received_dates:
                excluded["CLOSED_NO_RECEIPT"] += 1
                continue
            lateness = (max(received_dates) - promise).days
        else:
            if today <= promise:
                excluded["NOT_DUE"] += 1
                continue
            if (today - promise).days > STALE_DAYS:
                excluded["STALE"] += 1
                continue
            lateness = (today - promise).days
            lower_bound = True
        vid = int(vendor_id) if vendor_id is not None else None
        cid = int(category_id) if category_id is not None else None
        for group in (
            model.by_vendor_category[(vid, cid)] if vid is not None else None,
            model.by_vendor[vid] if vid is not None else None,
            model.by_category[cid] if cid is not None else None,
            model.tenant,
        ):
            if group is None:
                continue
            group.values.append(lateness)
            if lower_bound:
                group.open_lower_bound += 1
    return model


def group_out(group: LatenessGroup | None) -> dict[str, Any]:
    if group is None or not group.values:
        return {"n": 0, "p50_days": None, "p80_days": None, "p90_days": None, "on_time_rate": None,
                "open_late_lower_bound": 0, "sufficient": False}
    return {
        "n": group.n,
        "p50_days": group.quantile(st.Q50),
        "p80_days": group.quantile(st.Q80),
        "p90_days": group.quantile(st.Q90),
        "on_time_rate": dec_str(group.on_time_rate, 4),
        "open_late_lower_bound": group.open_lower_bound,
        "sufficient": group.n >= MIN_SAMPLE,
    }


MAX_GROUP_ROWS = 100


async def supplier_lateness_payload(
    db: AsyncSession,
    tenant_id: int,
    *,
    today: date,
    vendor_id: int | None = None,
    category_id: int | None = None,
) -> dict[str, Any]:
    """Tenant-wide lateness with vendor / category tables (bounded to 100 rows each, most lines first)."""
    from app.models.costing import ItemCategory
    from app.models.inventory import Vendor

    model = await load_lateness_model(db, tenant_id, today=today)
    vendor_keys = [k for k in model.by_vendor if k is not None and (vendor_id is None or k == vendor_id)]
    vendor_keys = sorted(vendor_keys, key=lambda k: (-model.by_vendor[k].n, k))[:MAX_GROUP_ROWS]
    cat_keys = [k for k in model.by_category if k is not None and (category_id is None or k == category_id)]
    cat_keys = sorted(cat_keys, key=lambda k: (-model.by_category[k].n, k))[:MAX_GROUP_ROWS]
    vc_keys = [
        k
        for k in model.by_vendor_category
        if (vendor_id is None or k[0] == vendor_id) and (category_id is None or k[1] == category_id)
    ]
    vc_keys = sorted(vc_keys, key=lambda k: (-model.by_vendor_category[k].n, k[0] or 0, k[1] or 0))[:MAX_GROUP_ROWS]

    vendor_names: dict[int, str] = {}
    want_vendors = sorted(set(vendor_keys) | {k[0] for k in vc_keys if k[0] is not None})
    if want_vendors:
        vendor_names = {
            int(i): n
            for i, n in (
                await db.execute(select(Vendor.id, Vendor.name).where(Vendor.tenant_id == tenant_id, Vendor.id.in_(want_vendors)))
            ).all()
        }
    cat_names: dict[int, str] = {}
    want_cats = sorted(set(cat_keys) | {k[1] for k in vc_keys if k[1] is not None})
    if want_cats:
        cat_names = {
            int(i): n
            for i, n in (
                await db.execute(
                    select(ItemCategory.id, ItemCategory.name).where(
                        ItemCategory.tenant_id == tenant_id, ItemCategory.id.in_(want_cats)
                    )
                )
            ).all()
        }
    notices: list[str] = []
    if model.truncated:
        notices.append(f"HISTORY_TRUNCATED: only the latest {MAX_HISTORY_LINES} purchase order lines were used")
    return {
        "as_of": today,
        "window_days": WINDOW_DAYS,
        "promise_basis": PROMISE_BASIS,
        "min_sample": MIN_SAMPLE,
        "tenant": group_out(model.tenant),
        "vendors": [
            {"vendor_id": k, "vendor_name": vendor_names.get(k), **group_out(model.by_vendor[k])} for k in vendor_keys
        ],
        "categories": [
            {"category_id": k, "category_name": cat_names.get(k), **group_out(model.by_category[k])} for k in cat_keys
        ],
        "vendor_categories": [
            {
                "vendor_id": k[0],
                "vendor_name": vendor_names.get(k[0]) if k[0] is not None else None,
                "category_id": k[1],
                "category_name": cat_names.get(k[1]) if k[1] is not None else None,
                **group_out(model.by_vendor_category[k]),
            }
            for k in vc_keys
        ],
        "excluded": dict(sorted(model.excluded.items())),
        "truncated": model.truncated,
        "notices": notices,
        "assumptions": list(ASSUMPTIONS),
    }
