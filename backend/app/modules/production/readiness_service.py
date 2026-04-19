"""Order material readiness (BOM vs stock) and full planning chain (TNA, OB, line)."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Bom,
    BomItem,
    GarmentStyle,
    Item,
    OperationBulletin,
    Order,
    OrderFollowupAction,
    SewingLine,
    SewingLineStyleConfig,
)
from app.models.merch import MerchSampleRequest
from app.modules.inventory.stock_availability_service import compute_items_availability


def _parse_qty(s: str | int | float | Decimal | None) -> float:
    if s is None:
        return 0.0
    if isinstance(s, Decimal):
        return float(s)
    if s == "":
        return 0.0
    try:
        return float(str(s).strip())
    except (TypeError, ValueError):
        return 0.0


def _worst_status(*statuses: str) -> str:
    order = {"blocked": 4, "warning": 3, "not_started": 2, "ready": 1}
    best = "ready"
    best_score = 0
    for s in statuses:
        sc = order.get(s, 0)
        if sc > best_score:
            best_score = sc
            best = s
    return best


def _action_done(a: OrderFollowupAction) -> bool:
    if a.approval_received_date is not None:
        return True
    ap = (a.approval_status or "").lower()
    if ap in ("approved", "pass", "ok", "accepted"):
        return True
    st = (a.status or "").lower()
    if st in ("completed", "done", "approved", "closed"):
        return True
    return False


async def get_order_chain_readiness(db: AsyncSession, tenant_id: int, order_id: int) -> dict[str, Any]:
    """Full chain: style, OB, TNA approvals (soft warnings), materials, line allocation."""
    orow = await db.get(Order, order_id)
    if not orow or orow.tenant_id != tenant_id:
        return {"error": "order_not_found"}

    style_id: int | None = getattr(orow, "style_id", None)
    style_code: str | None = None
    style_name: str | None = None
    gs: GarmentStyle | None = None
    if style_id is not None:
        gs = await db.get(GarmentStyle, style_id)
        if gs and gs.tenant_id == tenant_id:
            style_code = gs.style_code
            style_name = gs.name
        else:
            gs = None
            style_id = None
    if gs is None and orow.style_ref:
        r = await db.execute(
            select(GarmentStyle).where(
                GarmentStyle.tenant_id == tenant_id,
                GarmentStyle.style_code == orow.style_ref.strip(),
            )
        )
        gs = r.scalar_one_or_none()
        if gs:
            style_id = gs.id
            style_code = gs.style_code
            style_name = gs.name

    if not style_id:
        return {
            "order_id": order_id,
            "style_id": None,
            "style_code": None,
            "style_name": None,
            "bom_id": None,
            "lines": [],
            "all_ready": False,
            "message": "No style linked (match style_ref to garment_styles.style_code)",
            "chain": {
                "style_linked": {
                    "status": "blocked",
                    "detail": "Set order.style_ref to a valid style code",
                },
                "ob_ready": {"status": "not_started", "detail": "No style"},
                "customer_approval": {"status": "not_started", "total": 0, "completed": 0, "items": []},
                "material_readiness": {"status": "blocked", "total": 0, "ready_count": 0, "items": []},
                "line_allocated": {"status": "not_started", "detail": "Not allocated"},
            },
            "overall_status": "blocked",
        }

    # Operation bulletin (latest by version)
    ob_r = await db.execute(
        select(OperationBulletin)
        .where(OperationBulletin.tenant_id == tenant_id, OperationBulletin.style_id == style_id)
        .order_by(OperationBulletin.version_no.desc())
        .limit(1)
    )
    ob = ob_r.scalar_one_or_none()
    if ob:
        ob_status = "ready"
        ob_detail = f"OB {ob.ob_code} v{ob.version_no}, SMV {float(ob.total_smv or 0)}"
        if (ob.status or "").lower() in ("draft", "pending"):
            ob_status = "warning"
            ob_detail += " (not finalized)"
    else:
        ob_status = "not_started"
        ob_detail = "No operation bulletin for this style"

    # TNA actions
    tna_r = await db.execute(
        select(OrderFollowupAction)
        .where(
            OrderFollowupAction.tenant_id == tenant_id,
            OrderFollowupAction.order_id == order_id,
            OrderFollowupAction.is_active.is_(True),
        )
        .order_by(OrderFollowupAction.sequence_no)
    )
    tna_rows = list(tna_r.scalars().all())
    tna_items = []
    completed = 0
    for a in tna_rows:
        done = _action_done(a)
        if done:
            completed += 1
        tna_items.append(
            {
                "id": a.id,
                "action": a.title,
                "phase": a.phase,
                "status": a.status,
                "approval_status": a.approval_status,
                "mandatory": a.is_mandatory,
                "done": done,
            }
        )
    if not tna_rows:
        cust_status = "not_started"
        cust_detail = "No TNA / follow-up actions for this order"
    else:
        pending_mandatory = [a for a in tna_rows if a.is_mandatory and not _action_done(a)]
        cust_status = "ready" if not pending_mandatory else "warning"
        cust_detail = f"{completed}/{len(tna_rows)} actions cleared"
        if pending_mandatory:
            cust_detail += f" ({len(pending_mandatory)} mandatory pending)"

    # BOM + stock (same as legacy)
    bom_r = await db.execute(
        select(Bom).where(Bom.tenant_id == tenant_id, Bom.style_id == style_id).order_by(Bom.version_no.desc()).limit(1)
    )
    bom = bom_r.scalar_one_or_none()
    if not bom:
        mat_status = "blocked"
        mat_items: list[dict[str, Any]] = []
        all_ready = False
    else:
        bi_r = await db.execute(select(BomItem).where(BomItem.bom_id == bom.id))
        bom_items = list(bi_r.scalars().all())
        order_qty = float(orow.quantity or 0)
        all_ready = True
        ready_count = 0
        mat_items = []
        mat_item_ids = [int(bi.item_id) for bi in bom_items if bi.item_id is not None]
        availability = await compute_items_availability(
            db,
            tenant_id,
            mat_item_ids,
            warehouse_id=None,
            include_in_transit_po=True,
            exclude_reserved=True,
        )
        for bi in bom_items:
            if not bi.item_id:
                continue
            base = _parse_qty(bi.base_consumption)
            wastage = _parse_qty(bi.wastage_pct) if bi.wastage_pct else 0.0
            required = order_qty * base * (1.0 + wastage / 100.0) if order_qty else base

            slot = availability.get(bi.item_id)
            on_hand_physical = float(slot.on_hand) if slot else 0.0
            available = float(slot.available) if slot else 0.0

            item_name = ""
            it = await db.get(Item, bi.item_id)
            if it:
                item_name = it.name

            short = max(0.0, required - available)
            ok = short <= 0.001
            if ok:
                ready_count += 1
            else:
                all_ready = False
            mat_items.append(
                {
                    "item_id": bi.item_id,
                    "item_name": item_name,
                    "category": bi.category,
                    "required": round(required, 4),
                    "on_hand": round(on_hand_physical, 4),
                    "available": round(available, 4),
                    "short": round(short, 4),
                    "ready": ok,
                }
            )

        n = len(mat_items)
        if n == 0:
            mat_status = "blocked"
            all_ready = False
        elif ready_count == n:
            mat_status = "ready"
            all_ready = True
        else:
            mat_status = "warning"
            all_ready = False

    # Line allocation
    cfg_r = await db.execute(
        select(SewingLineStyleConfig, SewingLine)
        .join(SewingLine, SewingLine.id == SewingLineStyleConfig.line_id)
        .where(
            SewingLineStyleConfig.tenant_id == tenant_id,
            SewingLineStyleConfig.order_id == order_id,
        )
        .order_by(SewingLineStyleConfig.start_date.desc())
        .limit(1)
    )
    row = cfg_r.first()
    if row:
        cfg, line = row[0], row[1]
        line_status = "ready"
        line_detail = f"{line.line_code} — {cfg.start_date} to {cfg.planned_end_date or '?'}"
    else:
        line_status = "not_started"
        line_detail = "Not allocated to a sewing line"

    # Linked merch samples for this order (buyer / factory sample approvals)
    sample_status = "ready"
    sample_detail = "No linked merch samples"
    sample_pending_n = 0
    ms_rows = (
        await db.scalars(
            select(MerchSampleRequest).where(
                MerchSampleRequest.tenant_id == tenant_id,
                MerchSampleRequest.order_id == order_id,
            )
        )
    ).all()
    if ms_rows:
        pending = [r for r in ms_rows if r.status in ("requested", "in_progress", "submitted")]
        sample_pending_n = len(pending)
        if pending:
            sample_status = "warning"
            sample_detail = f"{sample_pending_n} merch sample(s) not approved"
        else:
            sample_detail = f"{len(ms_rows)} merch sample(s) linked; none pending approval"

    chain = {
        "style_linked": {"status": "ready", "detail": f"{style_code} — {style_name}"},
        "ob_ready": {"status": ob_status, "detail": ob_detail},
        "customer_approval": {
            "status": cust_status,
            "total": len(tna_rows),
            "completed": completed,
            "items": tna_items,
            "detail": cust_detail,
        },
        "material_readiness": {
            "status": mat_status,
            "total": len(mat_items),
            "ready_count": sum(1 for x in mat_items if x.get("ready")),
            "items": mat_items,
        },
        "line_allocated": {"status": line_status, "detail": line_detail},
        "merch_samples": {
            "status": sample_status,
            "detail": sample_detail,
            "pending_count": sample_pending_n,
        },
    }

    overall = _worst_status(
        chain["style_linked"]["status"],
        chain["ob_ready"]["status"],
        chain["customer_approval"]["status"],
        chain["material_readiness"]["status"],
        chain["line_allocated"]["status"],
        chain["merch_samples"]["status"],
    )

    return {
        "order_id": order_id,
        "style_id": style_id,
        "style_code": style_code,
        "style_name": style_name,
        "bom_id": bom.id if bom else None,
        "lines": mat_items,
        "all_ready": all_ready and len(mat_items) > 0,
        "chain": chain,
        "overall_status": overall,
    }


async def get_order_readiness(db: AsyncSession, tenant_id: int, order_id: int) -> dict[str, Any]:
    """Backward-compatible material readiness; includes chain when available."""
    full = await get_order_chain_readiness(db, tenant_id, order_id)
    if full.get("error"):
        return full
    out: dict[str, Any] = {
        "order_id": full["order_id"],
        "style_id": full["style_id"],
        "bom_id": full["bom_id"],
        "lines": full["lines"],
        "all_ready": full["all_ready"],
    }
    if full.get("message"):
        out["message"] = full["message"]
    out["style_code"] = full.get("style_code")
    out["style_name"] = full.get("style_name")
    out["chain"] = full.get("chain")
    out["overall_status"] = full.get("overall_status")
    return out
