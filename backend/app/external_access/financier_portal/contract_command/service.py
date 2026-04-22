"""Orchestrator for financier contract command center."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.external_access.financier_portal.contract_command import cache as cc_cache
from app.external_access.financier_portal.contract_command import maturity_engine, otd_engine, risk_scoring
from app.external_access.financier_portal.contract_command import selectors as csel
from app.external_access.financier_portal.contract_command import timeline_builder
from app.external_access.financier_portal.contract_command.cashflow_engine import build_cash_ladder
from app.modules.finance.health_score_service import build_health_score

from app.external_access.financier_portal.visibility_service import (
    build_production_tracker_rows,
    build_raw_material_rows,
)


async def list_contracts_summary(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> list[dict[str, Any]]:
    ids = await csel.master_contract_ids_for_party(db, tenant_id, party_id)
    out: list[dict[str, Any]] = []
    hs = await build_health_score(db, tenant_id=tenant_id)
    th = float(hs.get("score") or 0)
    for cid in ids:
        mc = await csel.get_master_contract_for_party(db, tenant_id=tenant_id, party_id=party_id, contract_id=cid)
        if not mc:
            continue
        orders = await csel.orders_for_master_contract(db, tenant_id, cid)
        rollup = await otd_engine.rollup_contract_otd(db, tenant_id, orders)
        btbs = await csel.btb_lcs_for_master(db, tenant_id, cid)
        mat = await maturity_engine.score_btb_maturities(db, tenant_id, btbs, orders)
        cash = await build_cash_ladder(db, tenant_id, mc, orders)
        comp = risk_scoring.composite_risk(
            otd_avg=rollup.get("avg_otd_score"),
            maturity_score=mat.get("maturity_safety_score"),
            cashability_score=cash.get("cashability_score"),
            tenant_health=th,
        )
        out.append(
            {
                "id": mc.id,
                "reference": mc.reference,
                "status": mc.status,
                "buyer_name": mc.buyer_name,
                "amount": float(mc.amount or 0) if mc.amount is not None else None,
                "currency": mc.currency,
                "expiry_date": mc.expiry_date.isoformat() if mc.expiry_date else None,
                "otd_avg_score": rollup.get("avg_otd_score"),
                "maturity_safety_score": mat.get("maturity_safety_score"),
                "cashability_score": cash.get("cashability_score"),
                "composite_score": comp["composite_score"],
                "open_orders": len([o for o in orders if not o.shipped_at]),
            }
        )
    return out


async def build_contract_detail(
    db: AsyncSession,
    *,
    tenant_id: int,
    party_id: int,
    contract_id: int,
    as_of: str | None = None,
) -> dict[str, Any] | None:
    key = (tenant_id, party_id, contract_id, as_of)
    cached = cc_cache.get_cached(key)
    if cached is not None:
        return cached

    mc = await csel.get_master_contract_for_party(db, tenant_id=tenant_id, party_id=party_id, contract_id=contract_id)
    if not mc:
        return None
    orders = await csel.orders_for_master_contract(db, tenant_id, contract_id)
    btbs = await csel.btb_lcs_for_master(db, tenant_id, contract_id)
    order_risks = []
    for o in orders:
        order_risks.append(await otd_engine.score_order_otd(db, tenant_id, o))
    rollup = await otd_engine.rollup_contract_otd(db, tenant_id, orders)
    mat = await maturity_engine.score_btb_maturities(db, tenant_id, btbs, orders)
    cash = await build_cash_ladder(db, tenant_id, mc, orders)
    hs = await build_health_score(db, tenant_id=tenant_id)
    th = float(hs.get("score") or 0)
    comp = risk_scoring.composite_risk(
        otd_avg=rollup.get("avg_otd_score"),
        maturity_score=mat.get("maturity_safety_score"),
        cashability_score=cash.get("cashability_score"),
        tenant_health=th,
    )
    timeline = timeline_builder.build_timeline(mc, orders, btbs)

    payload = {
        "master_contract": {
            "id": mc.id,
            "reference": mc.reference,
            "status": mc.status,
            "contract_type": mc.contract_type,
            "buyer_name": mc.buyer_name,
            "amount": float(mc.amount or 0) if mc.amount is not None else None,
            "currency": mc.currency,
            "expiry_date": mc.expiry_date.isoformat() if mc.expiry_date else None,
            "cost_center_id": mc.cost_center_id,
        },
        "orders_risk": order_risks,
        "rollup": rollup,
        "maturity": mat,
        "cash_ladder": cash,
        "risk": comp,
        "timeline": timeline,
        "btb_lcs": [{"id": b.id, "reference": b.reference, "status": b.status} for b in btbs],
    }
    cc_cache.set_cached(key, payload)
    return payload


async def raw_materials_for_contract(
    db: AsyncSession, *, tenant_id: int, party_id: int, contract_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    mc = await csel.get_master_contract_for_party(db, tenant_id=tenant_id, party_id=party_id, contract_id=contract_id)
    if not mc:
        return [], "Contract not found or not in your facility scope."
    btbs = await csel.btb_lcs_for_master(db, tenant_id, contract_id)
    bids = {b.id for b in btbs}
    items, note = await build_raw_material_rows(db, tenant_id=tenant_id, party_id=party_id)
    filt = [x for x in items if x.get("btb_lc_id") in bids]
    return filt, note


async def production_for_contract(
    db: AsyncSession, *, tenant_id: int, party_id: int, contract_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    mc = await csel.get_master_contract_for_party(db, tenant_id=tenant_id, party_id=party_id, contract_id=contract_id)
    if not mc:
        return [], "Contract not found or not in your facility scope."
    orders = await csel.orders_for_master_contract(db, tenant_id, contract_id)
    oids = {o.id for o in orders}
    items, note = await build_production_tracker_rows(db, tenant_id=tenant_id, party_id=party_id)
    filt = [x for x in items if x.get("order_id") in oids]
    return filt, note
