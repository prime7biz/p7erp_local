"""Quotation wiring context (Phase 3): read-only hints that pre-fill a quotation from other modules.

Routes (mounted on the quotations router BEFORE ``/{quotation_id}``, so merch.access applies):
- GET /quotations/prefill-context?style_id=&customer_id=&currency=
- GET /quotations/{quotation_id}/wiring-context
- GET /quotations/item-price-hints?item_ids=1,2,3   (max 100 ids)

Rules
- Every query filters ``tenant_id``; every client-supplied id goes through ``ensure_owned`` (404 style).
- A block the caller may not see (permission, tenant flag) is OMITTED from the answer, never an error.
  ``omitted`` lists the block names and why, so the screen can explain the gap.
- Money is Decimal and always returned as a decimal string. Nothing here writes.
- Each optional block runs in a SAVEPOINT; one failing block is logged and omitted without poisoning
  the request transaction.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.ownership import ensure_owned
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_manufacturing_intelligence_v1_enabled,
    is_mfg_cost_intelligence_v1_enabled,
    is_mfg_integrated_planning_v1_enabled,
)
from app.database import get_db
from app.models import Customer, Tenant, User
from app.models.costing import CurrencyExchangeRate, Item, ItemUnit, QuotationMaterial
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.models.merch import (
    Bom,
    BomItem,
    FollowupActionTemplate,
    GarmentStyle,
    Quotation,
    StyleSizeScale,
)
from app.models.mfg_planning import MfgTentativeLineBooking
from app.modules.ai_tool.screen_context import can_access_module

logger = logging.getLogger(__name__)

router = APIRouter(tags=["quotations-wiring"])

MAX_PRICE_HINT_ITEMS = 100
MAX_BOM_LINES = 200
MAX_ROUTE_STAGES = 60
MAX_RATES = 20
MAX_BOOKINGS = 50
# PO statuses that never count as a real price (not yet agreed, or dropped).
_PO_EXCLUDED_STATUSES = ("DRAFT", "CANCELLED", "REJECTED")
_BOM_STATUS_RANK = ("APPROVED", "FROZEN", "SUBMITTED", "DRAFT")


# ---------------------------------------------------------------- small helpers


def _dec_text(value: Any, places: int = 4) -> str | None:
    if value is None:
        return None
    return format(Decimal(str(value)).quantize(Decimal(1).scaleb(-places)), "f")


def _norm_ccy(value: str | None) -> str | None:
    v = (value or "").strip().upper()
    return v[:10] or None


def _omit(omitted: dict[str, str], block: str, reason: str) -> None:
    omitted[block] = reason


class _Ctx:
    """Caller facts resolved once per request (plain values, so a later rollback cannot expire them)."""

    def __init__(self, db: AsyncSession, tenant: Tenant, user: User) -> None:
        self.db = db
        self.tenant = tenant
        self.user = user
        self.tenant_id: int = tenant.id
        self.flags: dict[str, Any] = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
        self.omitted: dict[str, str] = {}

    async def may(self, key: str) -> bool:
        return await can_access_module(self.db, self.tenant, self.user, key)

    async def run(self, block: str, fn):
        """Run ``fn()`` (an async callable) in a SAVEPOINT; return None and record the reason on failure."""
        try:
            async with self.db.begin_nested():
                return await fn()
        except HTTPException:
            raise
        except Exception:
            logger.exception("quotation_wiring_block_failed block=%s tenant_id=%s", block, self.tenant_id)
            self.omitted[block] = "UNAVAILABLE"
            return None


# ---------------------------------------------------------------- blocks


async def _style_block(ctx: _Ctx, style_id: int) -> dict[str, Any]:
    style = await ensure_owned(ctx.db, GarmentStyle, style_id, ctx.tenant_id, "Style", status_code=404)
    assert style is not None
    return {
        "id": style.id,
        "style_code": style.style_code,
        "name": style.name,
        "buyer_customer_id": style.buyer_customer_id,
        "season": style.season,
        "department": style.department,
        "product_type": style.product_type,
    }


async def _bom_block(ctx: _Ctx, style_id: int) -> dict[str, Any] | None:
    boms = list(
        (
            await ctx.db.execute(
                select(Bom)
                .where(Bom.tenant_id == ctx.tenant_id, Bom.style_id == style_id, Bom.is_legacy.is_(False))
                .order_by(Bom.id.desc())
                .limit(20)
            )
        ).scalars()
    )
    if not boms:
        return None

    def rank(b: Bom) -> int:
        s = (b.status or "").upper()
        return _BOM_STATUS_RANK.index(s) if s in _BOM_STATUS_RANK else len(_BOM_STATUS_RANK)

    bom = sorted(boms, key=lambda b: (rank(b), -b.id))[0]
    lines = list(
        (
            await ctx.db.execute(
                select(BomItem)
                .where(BomItem.tenant_id == ctx.tenant_id, BomItem.bom_id == bom.id)
                .order_by(BomItem.sort_order, BomItem.id)
                .limit(MAX_BOM_LINES)
            )
        ).scalars()
    )
    return {
        "bom_id": bom.id,
        "bom_code": bom.bom_code,
        "status": bom.status,
        "version_no": bom.version_no,
        "lines": [
            {
                "item_id": ln.item_id,
                "category": ln.category,
                "item_code": ln.item_code or ln.item_code_snapshot,
                "description": ln.description or ln.description_snapshot,
                "uom": ln.uom,
                "base_consumption": _dec_text(ln.base_consumption, 6),
                "wastage_pct": _dec_text(ln.wastage_pct),
            }
            for ln in lines
        ],
    }


async def _size_scales_block(ctx: _Ctx, style_id: int) -> list[dict[str, Any]]:
    rows = list(
        (
            await ctx.db.execute(
                select(StyleSizeScale)
                .where(StyleSizeScale.tenant_id == ctx.tenant_id, StyleSizeScale.style_id == style_id)
                .order_by(StyleSizeScale.id)
                .limit(50)
            )
        ).scalars()
    )
    return [
        {
            "id": r.id,
            "scale_name": r.scale_name,
            "sizes": [s.strip()[:16] for s in (r.sizes_csv or "").split(",") if s.strip()],
        }
        for r in rows
    ]


async def _planning_block(ctx: _Ctx, style_id: int) -> dict[str, Any]:
    style = await ensure_owned(ctx.db, GarmentStyle, style_id, ctx.tenant_id, "Style", status_code=404)
    assert style is not None
    stages = list(
        (
            await ctx.db.execute(
                select(FollowupActionTemplate)
                .where(
                    FollowupActionTemplate.tenant_id == ctx.tenant_id,
                    FollowupActionTemplate.is_active.is_(True),
                    FollowupActionTemplate.route_code.is_not(None),
                    (FollowupActionTemplate.product_type.is_(None))
                    | (FollowupActionTemplate.product_type == style.product_type),
                )
                .order_by(FollowupActionTemplate.sequence_no, FollowupActionTemplate.id)
                .limit(MAX_ROUTE_STAGES)
            )
        ).scalars()
    )
    return {
        "standard_smv": _dec_text(style.standard_smv),
        "standard_smv_source": style.standard_smv_source,
        "standard_smv_confidence": style.standard_smv_confidence,
        "route_stages": [
            {
                "route_code": s.route_code,
                "name": s.name,
                "stage_kind": s.stage_kind,
                "lead_time_days": s.lead_time_days,
                "sequence_no": s.sequence_no,
            }
            for s in stages
        ],
    }


async def _cpm_block(ctx: _Ctx) -> dict[str, Any]:
    from app.modules.mfg_intelligence.cost_at_completion_service import cpm_block
    from app.modules.mfg_intelligence.cpm_service import compute_cpm
    from app.modules.production.planning_settings_service import parse_cpm_override, read_planning_settings

    settings = await read_planning_settings(ctx.db, ctx.tenant_id)
    try:
        override = parse_cpm_override(settings.get("cpm_override"))
    except Exception:  # noqa: BLE001 - stored junk is ignored, same as cost-at-completion
        override = None
    result = await compute_cpm(
        ctx.db,
        ctx.tenant_id,
        today=today_local(ctx.tenant),
        override=override,
        use_style_standard=bool(ctx.flags.get("mfg_integrated_planning_v1") is True),
    )
    block = cpm_block(result)
    return {
        "value": block["value"],
        "source": block["source"],
        "period_start": block["period_start"],
        "period_end": block["period_end"],
        "reason_codes": block["reason_codes"],
    }


async def _rates_block(ctx: _Ctx, currency: str | None) -> list[dict[str, Any]]:
    stmt = select(CurrencyExchangeRate).where(
        CurrencyExchangeRate.tenant_id == ctx.tenant_id, CurrencyExchangeRate.is_active.is_(True)
    )
    if currency:
        stmt = stmt.where(
            (CurrencyExchangeRate.from_currency == currency) | (CurrencyExchangeRate.to_currency == currency)
        )
    rows = list(
        (
            await ctx.db.execute(
                stmt.order_by(CurrencyExchangeRate.effective_date.desc(), CurrencyExchangeRate.id.desc()).limit(
                    MAX_RATES * 5
                )
            )
        ).scalars()
    )
    latest: dict[tuple[str, str], CurrencyExchangeRate] = {}
    for r in rows:
        latest.setdefault((r.from_currency, r.to_currency), r)
    return [
        {
            "from_currency": r.from_currency,
            "to_currency": r.to_currency,
            "exchange_rate": _dec_text(r.exchange_rate, 6),
            "effective_date": r.effective_date.isoformat(),
            "source": r.source,
        }
        for r in list(latest.values())[:MAX_RATES]
    ]


async def _bookings_block(ctx: _Ctx, quotation_id: int) -> list[dict[str, Any]]:
    rows = list(
        (
            await ctx.db.execute(
                select(MfgTentativeLineBooking)
                .where(
                    MfgTentativeLineBooking.tenant_id == ctx.tenant_id,
                    MfgTentativeLineBooking.quotation_id == quotation_id,
                )
                .order_by(MfgTentativeLineBooking.start_date, MfgTentativeLineBooking.id)
                .limit(MAX_BOOKINGS)
            )
        ).scalars()
    )
    return [
        {
            "id": b.id,
            "line_id": b.line_id,
            "status": b.status,
            "start_date": b.start_date.isoformat(),
            "planned_end_date": b.planned_end_date.isoformat() if b.planned_end_date else None,
            "planned_qty": _dec_text(b.planned_qty, 3),
            "confidence_pct": _dec_text(b.confidence_pct, 2),
            "expires_at": b.expires_at.isoformat(),
        }
        for b in rows
    ]


async def build_item_price_hints(
    ctx: _Ctx, item_ids: list[int], *, currency: str | None = None, uom: str | None = None
) -> list[dict[str, Any]]:
    """Last PO price + item default / average cost per item. Comparable only if currency AND UOM match."""
    ids = sorted({i for i in item_ids if i > 0})[:MAX_PRICE_HINT_ITEMS]
    if not ids:
        return []
    items = {
        it.id: it
        for it in (
            await ctx.db.execute(select(Item).where(Item.tenant_id == ctx.tenant_id, Item.id.in_(ids)))
        ).scalars()
    }
    unit_ids = {it.unit_id for it in items.values()}
    units = (
        {
            u.id: u.unit_code
            for u in (
                await ctx.db.execute(
                    select(ItemUnit).where(ItemUnit.tenant_id == ctx.tenant_id, ItemUnit.id.in_(unit_ids))
                )
            ).scalars()
        }
        if unit_ids
        else {}
    )
    ranked = (
        select(
            PurchaseOrderItem.item_id.label("item_id"),
            PurchaseOrderItem.unit_price.label("unit_price"),
            PurchaseOrder.id.label("po_id"),
            PurchaseOrder.po_code.label("po_code"),
            PurchaseOrder.currency.label("currency"),
            PurchaseOrder.order_date.label("order_date"),
            func.row_number()
            .over(
                partition_by=PurchaseOrderItem.item_id,
                order_by=(PurchaseOrder.order_date.desc().nulls_last(), PurchaseOrder.id.desc()),
            )
            .label("rn"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == ctx.tenant_id,
            PurchaseOrder.tenant_id == ctx.tenant_id,
            PurchaseOrderItem.item_id.in_(list(items)),
            PurchaseOrderItem.unit_price > 0,
            func.upper(PurchaseOrder.status).not_in(_PO_EXCLUDED_STATUSES),
        )
        .subquery()
    )
    last_po = {
        r.item_id: r
        for r in (await ctx.db.execute(select(ranked).where(ranked.c.rn == 1))).all()
    }
    want_ccy = _norm_ccy(currency)
    want_uom = (uom or "").strip().upper() or None
    out: list[dict[str, Any]] = []
    for item_id in ids:
        item = items.get(item_id)
        if item is None:
            continue  # another tenant's (or unknown) id looks like "not found": simply absent
        item_uom = units.get(item.unit_id)
        po = last_po.get(item_id)
        po_ccy = _norm_ccy(po.currency) if po is not None else None
        if po is None:
            comparable, reason = False, "NO_PO_PRICE"
        elif want_ccy is None and want_uom is None:
            comparable, reason = False, "NO_REFERENCE"
        elif want_ccy is not None and po_ccy != want_ccy:
            comparable, reason = False, "CURRENCY_MISMATCH"
        elif want_uom is not None and (item_uom or "").upper() != want_uom:
            comparable, reason = False, "UOM_MISMATCH"
        else:
            comparable, reason = True, None
        out.append(
            {
                "item_id": item.id,
                "item_code": item.item_code,
                "name": item.name,
                "uom": item_uom,
                "last_po": None
                if po is None
                else {
                    "po_id": po.po_id,
                    "po_code": po.po_code,
                    "unit_price": _dec_text(po.unit_price),
                    "currency": po_ccy,
                    "order_date": po.order_date.isoformat() if po.order_date else None,
                },
                "comparable": comparable,
                "comparable_reason": reason,
                "default_cost": _dec_text(item.default_cost),
                "avg_cost": _dec_text(item.avg_cost, 6),
            }
        )
    return out


# ---------------------------------------------------------------- orchestration


async def _shared_blocks(ctx: _Ctx, *, style_id: int | None, currency: str | None) -> dict[str, Any]:
    """Blocks common to prefill and wiring context. Omits what the caller may not see."""
    out: dict[str, Any] = {}

    if style_id is not None:
        out["style_size_scales"] = await ctx.run("style_size_scales", lambda: _size_scales_block(ctx, style_id))
        out["style_bom"] = await ctx.run("style_bom", lambda: _bom_block(ctx, style_id))
        if ctx.flags.get("mfg_integrated_planning_v1") is not True:
            _omit(ctx.omitted, "style_planning", "FLAG_OFF:mfg_integrated_planning_v1")
        elif not await ctx.may("production.access"):
            _omit(ctx.omitted, "style_planning", "NO_PERMISSION:production.access")
        else:
            out["style_planning"] = await ctx.run("style_planning", lambda: _planning_block(ctx, style_id))

    # Factory CPM = a money figure: flags + the same finance gate the Manufacturing Intelligence money APIs use.
    if not (
        is_manufacturing_intelligence_v1_enabled(ctx.flags) and is_mfg_cost_intelligence_v1_enabled(ctx.flags)
    ):
        _omit(ctx.omitted, "factory_cpm", "FLAG_OFF:mfg_cost_intelligence_v1")
    else:
        from app.modules.mfg_intelligence.finance_gate import may_view_mfg_finance

        if not await may_view_mfg_finance(ctx.db, ctx.user, ctx.tenant):
            _omit(ctx.omitted, "factory_cpm", "NO_PERMISSION:finance")
        else:
            out["factory_cpm"] = await ctx.run("factory_cpm", lambda: _cpm_block(ctx))

    out["exchange_rates"] = await ctx.run("exchange_rates", lambda: _rates_block(ctx, currency))
    return {k: v for k, v in out.items() if v is not None}


async def build_prefill_context(
    ctx: _Ctx, *, style_id: int | None, customer_id: int | None, currency: str | None
) -> dict[str, Any]:
    ccy = _norm_ccy(currency)
    result: dict[str, Any] = {"currency": ccy}
    if customer_id is not None:
        customer = await ensure_owned(ctx.db, Customer, customer_id, ctx.tenant_id, "Customer", status_code=404)
        assert customer is not None
        result["customer"] = {
            "id": customer.id,
            "name": customer.name,
            "preferred_currency": customer.preferred_currency,
        }
    if style_id is not None:
        result["style"] = await _style_block(ctx, style_id)
    result.update(await _shared_blocks(ctx, style_id=style_id, currency=ccy))
    result["omitted"] = dict(ctx.omitted)
    return result


async def build_wiring_context(ctx: _Ctx, quotation_id: int) -> dict[str, Any]:
    quotation = await ensure_owned(ctx.db, Quotation, quotation_id, ctx.tenant_id, "Quotation", status_code=404)
    assert quotation is not None
    ccy = _norm_ccy(quotation.currency)
    result: dict[str, Any] = {
        "quotation": {
            "id": quotation.id,
            "quotation_code": quotation.quotation_code,
            "version_no": quotation.version_no,
            "status": quotation.status,
            "style_id": quotation.style_id,
            "customer_id": quotation.customer_id,
            "currency": ccy,
        }
    }
    if quotation.style_id is not None:
        result["style"] = await _style_block(ctx, quotation.style_id)
    result.update(await _shared_blocks(ctx, style_id=quotation.style_id, currency=ccy))

    # Tentative line bookings + material price hints are operations / stock data.
    if ctx.flags.get("mfg_integrated_planning_v1") is not True:
        _omit(ctx.omitted, "tentative_bookings", "FLAG_OFF:mfg_integrated_planning_v1")
    elif not await ctx.may("production.access"):
        _omit(ctx.omitted, "tentative_bookings", "NO_PERMISSION:production.access")
    else:
        bookings = await ctx.run("tentative_bookings", lambda: _bookings_block(ctx, quotation_id))
        if bookings is not None:
            result["tentative_bookings"] = bookings

    if not await ctx.may("inventory.access"):
        _omit(ctx.omitted, "material_price_hints", "NO_PERMISSION:inventory.access")
    else:
        item_ids = list(
            (
                await ctx.db.execute(
                    select(QuotationMaterial.item_id)
                    .where(
                        QuotationMaterial.tenant_id == ctx.tenant_id,
                        QuotationMaterial.quotation_id == quotation_id,
                        QuotationMaterial.item_id.is_not(None),
                    )
                    .limit(MAX_PRICE_HINT_ITEMS)
                )
            ).scalars()
        )
        hints = await ctx.run(
            "material_price_hints", lambda: build_item_price_hints(ctx, [i for i in item_ids if i], currency=ccy)
        )
        if hints is not None:
            result["material_price_hints"] = hints
    result["omitted"] = dict(ctx.omitted)
    return result


# ---------------------------------------------------------------- routes


def _check_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/prefill-context")
async def get_prefill_context(
    style_id: int | None = Query(default=None, ge=1),
    customer_id: int | None = Query(default=None, ge=1),
    currency: str | None = Query(default=None, max_length=10),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_tenant(user, tenant)
    return await build_prefill_context(
        _Ctx(db, tenant, user), style_id=style_id, customer_id=customer_id, currency=currency
    )


@router.get("/item-price-hints")
async def get_item_price_hints(
    item_ids: str = Query(..., description="Comma-separated item ids, at most 100"),
    currency: str | None = Query(default=None, max_length=10),
    uom: str | None = Query(default=None, max_length=32),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_tenant(user, tenant)
    try:
        ids = [int(p) for p in item_ids.split(",") if p.strip()]
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="item_ids must be integers") from None
    if not ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="item_ids is required")
    if len(ids) > MAX_PRICE_HINT_ITEMS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"At most {MAX_PRICE_HINT_ITEMS} item ids per request",
        )
    ctx = _Ctx(db, tenant, user)
    if not await ctx.may("inventory.access"):
        # Graceful omit: the screen just shows no hints.
        return {"items": [], "omitted": {"item_price_hints": "NO_PERMISSION:inventory.access"}}
    items = await ctx.run("item_price_hints", lambda: build_item_price_hints(ctx, ids, currency=currency, uom=uom))
    return {"items": items or [], "omitted": dict(ctx.omitted)}


@router.get("/{quotation_id}/wiring-context")
async def get_wiring_context(
    quotation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_tenant(user, tenant)
    return await build_wiring_context(_Ctx(db, tenant, user), quotation_id)
