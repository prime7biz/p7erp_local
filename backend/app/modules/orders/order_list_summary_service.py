"""Batch summaries for orders list: financial/traceability and sewing-line allocation."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.master_contract_workflow import is_lc_received_status
from app.models import (
    BtbLc,
    BtbLcAccounting,
    Facility,
    MasterContract,
    Order,
    ProformaInvoice,
    ProformaInvoiceOrder,
    SewingLine,
    SewingLineStyleConfig,
)
from app.modules.orders.schemas import (
    OrderFinancialStatusOut,
    OrderSewingLineAllocationOut,
    OrderSewingLineSummaryOut,
)

PI_ISSUED_STATUSES = (
    "APPROVED",
    "SENT",
    "ISSUED",
    "CONVERTED",
    "POSTED",
    "PAID",
    "FINALIZED",
)

_SL_EXCLUDE_RESERVATION = ("CANCELLED",)


def _utilization_pct(used: float | None, total: float | None) -> float | None:
    if total is None or float(total) <= 0:
        return None
    return round((float(used or 0) / float(total)) * 100, 2)


def _iso_date(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _iso_dt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _end_date_for_allocation(row: SewingLineStyleConfig) -> date | None:
    rs = (row.reservation_status or "").upper()
    if rs == "COMPLETED" and row.actual_end_date is not None:
        return row.actual_end_date
    return row.planned_end_date


def _visible_slsc_rows(rows: list[SewingLineStyleConfig]) -> list[SewingLineStyleConfig]:
    non_draft = [r for r in rows if (r.reservation_status or "").upper() != "DRAFT"]
    return non_draft if non_draft else rows


def _delivery_on_track(
    *,
    delivery: date | None,
    rows: list[SewingLineStyleConfig],
) -> Literal["yes", "no", "unknown"]:
    rows = [r for r in rows if (r.reservation_status or "").upper() != "CANCELLED"]
    if delivery is None:
        return "unknown"
    visible = _visible_slsc_rows(rows)
    if not visible:
        return "unknown"
    ends: list[date] = []
    for r in visible:
        ed = _end_date_for_allocation(r)
        if ed is not None:
            ends.append(ed)
    if not ends:
        return "unknown"
    last_end = max(ends)
    return "yes" if last_end <= delivery else "no"


async def build_financial_status_by_order_id(
    db: AsyncSession,
    *,
    tenant_id: int,
    orders: list[Order],
) -> dict[int, OrderFinancialStatusOut]:
    if not orders:
        return {}
    oid_list = [o.id for o in orders]

    pi_set: set[int] = set()
    r_pi = await db.execute(
        select(ProformaInvoiceOrder.order_id)
        .select_from(ProformaInvoiceOrder)
        .join(ProformaInvoice, ProformaInvoice.id == ProformaInvoiceOrder.proforma_invoice_id)
        .where(
            ProformaInvoice.tenant_id == tenant_id,
            ProformaInvoiceOrder.order_id.in_(oid_list),
            ProformaInvoice.status.in_(PI_ISSUED_STATUSES),
        )
        .distinct()
    )
    for (oid,) in r_pi.all():
        if oid is not None:
            pi_set.add(int(oid))

    mc_ids = {int(o.master_contract_id) for o in orders if o.master_contract_id}
    mc_by_id: dict[int, MasterContract] = {}
    if mc_ids:
        r_mc = await db.execute(select(MasterContract).where(MasterContract.id.in_(mc_ids)))
        for mc in r_mc.scalars().all():
            if mc.tenant_id == tenant_id:
                mc_by_id[int(mc.id)] = mc

    facility_mc: set[int] = set()
    if mc_ids:
        r_f = await db.execute(
            select(Facility.linked_master_contract_id).where(
                Facility.tenant_id == tenant_id,
                Facility.linked_master_contract_id.in_(mc_ids),
                Facility.status.in_(("draft", "active")),
            )
        )
        for (lid,) in r_f.all():
            if lid is not None:
                facility_mc.add(int(lid))

    btb_sum: dict[int, float] = {}
    btb_count: dict[int, int] = {}
    btb_opened: dict[int, int] = {}
    if mc_ids:
        r_sum = await db.execute(
            select(BtbLc.master_contract_id, func.count(BtbLc.id), func.coalesce(func.sum(BtbLc.amount), 0))
            .where(BtbLc.tenant_id == tenant_id, BtbLc.master_contract_id.in_(mc_ids))
            .group_by(BtbLc.master_contract_id)
        )
        for mc_id, cnt, s in r_sum.all():
            if mc_id is not None:
                mid = int(mc_id)
                btb_count[mid] = int(cnt or 0)
                btb_sum[mid] = float(s or 0)

        r_open = await db.execute(
            select(BtbLc.master_contract_id, func.count(BtbLc.id))
            .select_from(BtbLc)
            .join(BtbLcAccounting, BtbLcAccounting.btb_lc_id == BtbLc.id)
            .where(
                BtbLc.tenant_id == tenant_id,
                BtbLc.master_contract_id.in_(mc_ids),
                BtbLcAccounting.lc_open_voucher_id.isnot(None),
            )
            .group_by(BtbLc.master_contract_id)
        )
        for mc_id, cnt in r_open.all():
            if mc_id is not None:
                btb_opened[int(mc_id)] = int(cnt or 0)

    out: dict[int, OrderFinancialStatusOut] = {}
    for o in orders:
        oid = o.id
        pi_issued = oid in pi_set
        mc_id = int(o.master_contract_id) if o.master_contract_id else None
        mc = mc_by_id.get(mc_id) if mc_id else None
        buyer_doc = bool(
            mc_id and mc and is_lc_received_status(mc.status)
        )
        ctype = (mc.contract_type if mc else None) or None
        bank_link = bool(mc_id and mc_id in facility_mc)
        util_pct: float | None = None
        btc = 0
        bto = 0
        if mc_id and mc:
            util_pct = _utilization_pct(btb_sum.get(mc_id), float(mc.amount) if mc.amount is not None else None)
            btc = btb_count.get(mc_id, 0)
            bto = btb_opened.get(mc_id, 0)
        in_prod = o.production_started_at is not None
        shipped = o.shipped_at is not None
        out[oid] = OrderFinancialStatusOut(
            pi_issued=pi_issued,
            buyer_document_received=buyer_doc,
            master_contract_type=ctype,
            bank_facility_linked=bank_link,
            btb_utilization_pct=util_pct,
            btb_lc_count=btc,
            btb_lc_opened_count=bto,
            in_production=in_prod,
            shipped=shipped,
        )
    return out


async def build_sewing_line_summary_by_order_id(
    db: AsyncSession,
    *,
    tenant_id: int,
    orders: list[Order],
) -> dict[int, OrderSewingLineSummaryOut]:
    if not orders:
        return {}
    oid_list = [o.id for o in orders]
    by_order: dict[int, list[tuple[SewingLineStyleConfig, str]]] = {oid: [] for oid in oid_list}

    r_sl2 = await db.execute(
        select(SewingLineStyleConfig, SewingLine.line_code)
        .join(SewingLine, SewingLine.id == SewingLineStyleConfig.line_id)
        .where(
            SewingLineStyleConfig.tenant_id == tenant_id,
            SewingLineStyleConfig.order_id.in_(oid_list),
            SewingLine.tenant_id == tenant_id,
            or_(
                SewingLineStyleConfig.reservation_status.is_(None),
                SewingLineStyleConfig.reservation_status != "CANCELLED",
            ),
        )
        .order_by(SewingLineStyleConfig.order_id, SewingLineStyleConfig.start_date.desc())
    )
    for cfg, lc in r_sl2.all():
        oid = cfg.order_id
        if oid is None:
            continue
        oid_int = int(oid)
        by_order.setdefault(oid_int, []).append((cfg, str(lc)))

    out: dict[int, OrderSewingLineSummaryOut] = {}
    for o in orders:
        oid = o.id
        pairs = by_order.get(oid, [])
        rows_only = [p[0] for p in pairs]
        visible = _visible_slsc_rows(rows_only)
        alloc_out: list[OrderSewingLineAllocationOut] = []
        for cfg, line_code in pairs:
            if (cfg.reservation_status or "").upper() == "CANCELLED":
                continue
            if (
                (cfg.reservation_status or "").upper() == "DRAFT"
                and any((r.reservation_status or "").upper() != "DRAFT" for r in rows_only)
            ):
                continue
            booked_at = cfg.firm_booked_at or cfg.soft_booked_at
            alloc_out.append(
                OrderSewingLineAllocationOut(
                    line_id=int(cfg.line_id),
                    line_code=line_code,
                    reservation_status=(cfg.reservation_status or "").upper() or "UNKNOWN",
                    start_date=_iso_date(cfg.start_date),
                    planned_end_date=_iso_date(cfg.planned_end_date),
                    actual_end_date=_iso_date(cfg.actual_end_date),
                    booked_at=_iso_dt(booked_at),
                )
            )

        primary_line: str | None = None
        primary_end: str | None = None
        primary_booked: str | None = None
        if visible:
            primary = max(visible, key=lambda r: r.start_date)
            plc = next((lc for c, lc in pairs if c.id == primary.id), None)
            primary_line = plc or None
            ped = _end_date_for_allocation(primary)
            primary_end = _iso_date(ped)
            pb = primary.firm_booked_at or primary.soft_booked_at
            primary_booked = _iso_dt(pb)

        track = _delivery_on_track(delivery=o.delivery_date, rows=rows_only)
        extra = max(0, len(alloc_out) - 1)

        out[oid] = OrderSewingLineSummaryOut(
            allocations=alloc_out,
            primary_line_code=primary_line,
            primary_planned_end_date=primary_end,
            primary_booked_at=primary_booked,
            delivery_on_track=track,
            extra_allocation_count=extra,
        )

    return out


async def build_order_list_summaries(
    db: AsyncSession,
    *,
    tenant_id: int,
    orders: list[Order],
) -> tuple[dict[int, OrderFinancialStatusOut], dict[int, OrderSewingLineSummaryOut]]:
    fin = await build_financial_status_by_order_id(db, tenant_id=tenant_id, orders=orders)
    sew = await build_sewing_line_summary_by_order_id(db, tenant_id=tenant_id, orders=orders)
    return fin, sew
