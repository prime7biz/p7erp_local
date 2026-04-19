from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BtbLc, Customer, MasterContract, Order, SewingLine, SewingLineStyleConfig
from app.modules.orders.pipeline_service import build_milestone_payload
from app.modules.production.readiness_service import get_order_chain_readiness


async def count_orders_for_tower(
    db: AsyncSession,
    *,
    tenant_id: int,
    delivery_from: date,
    delivery_to: date,
) -> int:
    q = await db.execute(
        select(func.count())
        .select_from(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.delivery_date.is_not(None),
            Order.delivery_date >= delivery_from,
            Order.delivery_date <= delivery_to,
        )
    )
    return int(q.scalar() or 0)


async def fetch_control_tower_order_rows(
    db: AsyncSession,
    *,
    tenant_id: int,
    delivery_from: date,
    delivery_to: date,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    sub_latest = (
        select(
            SewingLineStyleConfig.order_id.label("oid"),
            func.max(SewingLineStyleConfig.id).label("max_id"),
        )
        .where(
            SewingLineStyleConfig.tenant_id == tenant_id,
            SewingLineStyleConfig.order_id.is_not(None),
        )
        .group_by(SewingLineStyleConfig.order_id)
        .subquery()
    )
    stmt = (
        select(Order, Customer.name, MasterContract.status, SewingLine.line_code, SewingLineStyleConfig)
        .join(Customer, Customer.id == Order.customer_id)
        .outerjoin(MasterContract, MasterContract.id == Order.master_contract_id)
        .outerjoin(sub_latest, sub_latest.c.oid == Order.id)
        .outerjoin(SewingLineStyleConfig, SewingLineStyleConfig.id == sub_latest.c.max_id)
        .outerjoin(SewingLine, SewingLine.id == SewingLineStyleConfig.line_id)
        .where(
            Order.tenant_id == tenant_id,
            Order.delivery_date.is_not(None),
            Order.delivery_date >= delivery_from,
            Order.delivery_date <= delivery_to,
        )
        .order_by(Order.delivery_date.asc(), Order.id.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).all()
    out: list[dict[str, Any]] = []
    for order, cust_name, mc_status, line_code, slsc in rows:
        rm = getattr(order, "rm_received_pct", None)
        rm_f = float(rm) if rm is not None else None
        out.append(
            {
                "order_id": order.id,
                "order_code": order.order_code,
                "customer_name": cust_name,
                "delivery_date": order.delivery_date,
                "pipeline_status": getattr(order, "pipeline_status", None),
                "style_id": getattr(order, "style_id", None),
                "master_contract_id": order.master_contract_id,
                "lc_status": mc_status,
                "material_readiness_pct": rm_f,
                "line_code": line_code,
                "reservation_status": getattr(slsc, "reservation_status", None) if slsc else None,
                "planned_end_date": slsc.planned_end_date if slsc else None,
            }
        )
    return out


async def build_order_timeline(
    db: AsyncSession, *, tenant_id: int, order_id: int
) -> dict[str, Any] | None:
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return None
    milestones = await build_milestone_payload(db, tenant_id=tenant_id, order_id=order_id)
    readiness = await get_order_chain_readiness(db, tenant_id, order_id)
    return {"order_id": order_id, "milestones": milestones, "readiness": readiness}


async def build_master_lc_snapshot(
    db: AsyncSession, *, tenant_id: int, master_contract_id: int
) -> dict[str, Any] | None:
    mc = await db.get(MasterContract, master_contract_id)
    if not mc or mc.tenant_id != tenant_id:
        return None
    oids = (
        (
            await db.execute(select(Order.id).where(Order.tenant_id == tenant_id, Order.master_contract_id == mc.id))
        )
        .scalars()
        .all()
    )
    btb_count = (
        await db.execute(
            select(func.count()).select_from(BtbLc).where(BtbLc.tenant_id == tenant_id, BtbLc.master_contract_id == mc.id)
        )
    ).scalar() or 0
    return {
        "master_contract_id": mc.id,
        "reference": mc.reference,
        "status": mc.status,
        "amount": float(mc.amount) if mc.amount is not None else None,
        "currency": mc.currency,
        "linked_order_ids": list(oids),
        "btb_lc_count": int(btb_count),
    }


async def build_capacity_heatmap(
    db: AsyncSession,
    *,
    tenant_id: int,
    date_from: date,
    date_to: date,
) -> list[dict[str, Any]]:
    """Approximate committed SMV-minutes per line, bucketed by start_date (MVP)."""
    stmt = (
        select(SewingLineStyleConfig, SewingLine.line_code)
        .join(SewingLine, SewingLine.id == SewingLineStyleConfig.line_id)
        .where(
            SewingLineStyleConfig.tenant_id == tenant_id,
            SewingLineStyleConfig.start_date <= date_to,
            or_(
                SewingLineStyleConfig.planned_end_date.is_(None),
                SewingLineStyleConfig.planned_end_date >= date_from,
            ),
        )
    )
    rows = (await db.execute(stmt)).all()
    firm: dict[tuple[int, date], float] = defaultdict(float)
    soft: dict[tuple[int, date], float] = defaultdict(float)
    draft: dict[tuple[int, date], float] = defaultdict(float)
    line_codes: dict[int, str] = {}

    for cfg, line_code in rows:
        line_codes[cfg.line_id] = line_code
        smv = float(cfg.smv_per_piece or 0) * float(cfg.planned_qty or 0)
        if smv <= 0:
            continue
        bucket = cfg.start_date
        if bucket < date_from:
            bucket = date_from
        if bucket > date_to:
            continue
        rs = (getattr(cfg, "reservation_status", None) or "FIRM_BOOKED").upper()
        if rs == "DRAFT":
            draft[(cfg.line_id, bucket)] += smv
        elif rs == "SOFT_BOOKED":
            soft[(cfg.line_id, bucket)] += smv
        elif rs in ("FIRM_BOOKED", "IN_PROGRESS", "COMPLETED"):
            firm[(cfg.line_id, bucket)] += smv

    keys = set(firm.keys()) | set(soft.keys()) | set(draft.keys())
    cells: list[dict[str, Any]] = []
    for line_id, bucket_date in sorted(keys, key=lambda x: (x[0], x[1])):
        cells.append(
            {
                "line_id": line_id,
                "line_code": line_codes.get(line_id, ""),
                "bucket_date": bucket_date,
                "firm_minutes": round(firm.get((line_id, bucket_date), 0.0), 2),
                "soft_minutes": round(soft.get((line_id, bucket_date), 0.0), 2),
                "draft_minutes": round(draft.get((line_id, bucket_date), 0.0), 2),
            }
        )
    return cells
