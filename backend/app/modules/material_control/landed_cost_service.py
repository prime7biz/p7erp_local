"""Phase 7 lite: allocate freight/duty onto GRN FIFO cost layers (flag material_landed_cost_v1)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_material_landed_cost_v1_enabled
from app.database import safe_async_session_rollback
from app.models import User
from app.models.finance import ChartOfAccount
from app.models.inventory import GoodsReceiving, InventoryCostLayer, StockMovement
from app.models.material_control_alloc import MaterialLandedCostDoc, MaterialLandedCostLine
from app.models.tenant import Tenant

_MONEY = Decimal("0.0001")
_ALLOWED_KINDS = frozenset({"FREIGHT", "DUTY", "OTHER"})


def require_landed_cost_flag(tenant: Tenant) -> None:
    if not is_material_landed_cost_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _dec(value: Any) -> Decimal:
    return Decimal(str(value or "0"))


def _money(value: Decimal) -> str:
    return str(value.quantize(_MONEY, rounding=ROUND_HALF_UP))


async def _find_by_request(
    db: AsyncSession, *, tenant_id: int, request_id: str
) -> MaterialLandedCostDoc | None:
    return (
        await db.execute(
            select(MaterialLandedCostDoc)
            .where(
                MaterialLandedCostDoc.tenant_id == tenant_id,
                MaterialLandedCostDoc.request_id == request_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


async def create_landed_cost_doc(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    goods_receiving_id: int,
    lines: list[dict[str, Any]],
    currency: str = "BDT",
    notes: str | None = None,
    request_id: str | None = None,
) -> MaterialLandedCostDoc:
    require_landed_cost_flag(tenant)
    if not lines:
        raise HTTPException(status_code=400, detail="At least one cost line is required")

    if request_id:
        existing = await _find_by_request(db, tenant_id=tenant.id, request_id=request_id)
        if existing is not None:
            return existing

    try:
        grn = await ensure_owned(
            db, GoodsReceiving, goods_receiving_id, tenant.id, "GRN", status_code=404
        )
        assert grn is not None

        total = Decimal("0")
        parsed: list[tuple[str, Decimal, str | None]] = []
        for ln in lines:
            kind = str(ln.get("cost_kind") or "FREIGHT").strip().upper()
            if kind not in _ALLOWED_KINDS:
                raise HTTPException(status_code=400, detail=f"Invalid cost_kind: {kind}")
            amt = _dec(ln.get("amount"))
            if amt <= 0:
                raise HTTPException(status_code=400, detail="amount must be positive")
            total += amt
            parsed.append((kind, amt, ln.get("notes")))

        doc_no = await next_tenant_code(
            db, model=MaterialLandedCostDoc, tenant_id=tenant.id, prefix="LC-", width=4
        )
        doc = MaterialLandedCostDoc(
            tenant_id=tenant.id,
            doc_no=doc_no,
            goods_receiving_id=goods_receiving_id,
            status="DRAFT",
            total_amount=_money(total),
            currency=(currency or "BDT")[:10],
            notes=notes,
            request_id=request_id,
            created_by_user_id=user_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(doc)
        try:
            await db.flush()
        except IntegrityError:
            await safe_async_session_rollback(db)
            if request_id:
                existing = await _find_by_request(db, tenant_id=tenant.id, request_id=request_id)
                if existing is not None:
                    return existing
            raise

        for kind, amt, ln_notes in parsed:
            db.add(
                MaterialLandedCostLine(
                    tenant_id=tenant.id,
                    doc_id=doc.id,
                    cost_kind=kind,
                    amount=_money(amt),
                    notes=ln_notes,
                    created_at=datetime.utcnow(),
                )
            )
        await db.flush()
        return doc
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


async def _layers_for_grn(
    db: AsyncSession, *, tenant_id: int, goods_receiving_id: int, open_only: bool = True
) -> list[InventoryCostLayer]:
    """FIFO layers created from stock movements of this GRN."""
    mv_ids = list(
        (
            await db.execute(
                select(StockMovement.id).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.goods_receiving_id == goods_receiving_id,
                    StockMovement.movement_type == "IN",
                )
            )
        )
        .scalars()
        .all()
    )
    if not mv_ids:
        return []
    q = select(InventoryCostLayer).where(
        InventoryCostLayer.tenant_id == tenant_id,
        InventoryCostLayer.source_movement_id.in_(mv_ids),
    )
    if open_only:
        q = q.where(InventoryCostLayer.qty_remaining > 0)
    return list(
        (await db.execute(q.order_by(InventoryCostLayer.id).with_for_update())).scalars().all()
    )


async def allocate_landed_cost(
    db: AsyncSession,
    *,
    tenant: Tenant,
    doc_id: int,
    user: User,
    credit_account_id: int,
) -> MaterialLandedCostDoc:
    """Bump layer unit_cost by the doc total AND post Dr Inventory / Cr ``credit_account_id``.

    Layer bump + voucher happen in one transaction so stock value and books never diverge.
    Idempotent when the doc is already ALLOCATED (returns it without re-posting).
    """
    require_landed_cost_flag(tenant)
    try:
        doc = (
            await db.execute(
                select(MaterialLandedCostDoc)
                .where(
                    MaterialLandedCostDoc.id == doc_id,
                    MaterialLandedCostDoc.tenant_id == tenant.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if doc is None:
            raise HTTPException(status_code=404, detail="Landed cost doc not found")
        if doc.status == "ALLOCATED":
            return doc
        if doc.status != "DRAFT":
            raise HTTPException(status_code=409, detail=f"Cannot allocate from status {doc.status}")

        from app.modules.material_control.debit_note_gate import assert_can_post_landed_cost_gl

        await assert_can_post_landed_cost_gl(db, user, tenant)
        await ensure_owned(db, ChartOfAccount, credit_account_id, tenant.id, "Account", status_code=404)

        total = _dec(doc.total_amount)
        if total <= 0:
            raise HTTPException(status_code=400, detail="total_amount must be positive")

        # One ALLOCATED landed-cost doc per GRN — prevents double-bumping FIFO layers.
        other = (
            await db.execute(
                select(MaterialLandedCostDoc.id).where(
                    MaterialLandedCostDoc.tenant_id == tenant.id,
                    MaterialLandedCostDoc.goods_receiving_id == doc.goods_receiving_id,
                    MaterialLandedCostDoc.status == "ALLOCATED",
                    MaterialLandedCostDoc.id != doc.id,
                )
            )
        ).scalar_one_or_none()
        if other is not None:
            raise HTTPException(
                status_code=409,
                detail="LANDED_COST_ALREADY_ALLOCATED: this GRN already has an allocated landed-cost document",
            )

        # Refuse after partial/full issue so freight is not dumped onto remaining stock only.
        all_layers = await _layers_for_grn(
            db, tenant_id=tenant.id, goods_receiving_id=doc.goods_receiving_id, open_only=False
        )
        if not all_layers:
            raise HTTPException(
                status_code=409,
                detail="No FIFO layers for this GRN (receive stock first)",
            )
        for layer in all_layers:
            orig = _dec(layer.qty_original)
            rem = _dec(layer.qty_remaining)
            if rem + Decimal("0.0001") < orig:
                raise HTTPException(
                    status_code=409,
                    detail="LANDED_COST_AFTER_ISSUE: allocate before any stock is issued from this GRN",
                )

        layers = [layer for layer in all_layers if _dec(layer.qty_remaining) > 0]
        if not layers:
            raise HTTPException(
                status_code=409,
                detail="No open FIFO layers for this GRN (layers fully consumed)",
            )

        # Fully open layers ⇒ weight by qty_original (== remaining).
        weights = [_dec(layer.qty_original) for layer in layers]
        weight_sum = sum(weights, Decimal("0"))
        if weight_sum <= 0:
            raise HTTPException(status_code=409, detail="No remaining qty on GRN layers")

        from app.services.inventory_account_resolver import resolve_inventory_accounts

        allocated = Decimal("0")
        by_inventory_account: dict[int, Decimal] = {}
        for i, layer in enumerate(layers):
            if i == len(layers) - 1:
                share = total - allocated
            else:
                share = (total * weights[i] / weight_sum).quantize(_MONEY, rounding=ROUND_HALF_UP)
                allocated += share
            rem = _dec(layer.qty_remaining)
            if rem <= 0:
                continue
            acc = await resolve_inventory_accounts(db, tenant.id, layer.item_id)
            inv_acc = acc.get("inventory")
            if not inv_acc:
                raise HTTPException(
                    status_code=409,
                    detail=f"No inventory GL account for item {layer.item_id}; map the stock group first",
                )
            by_inventory_account[int(inv_acc)] = by_inventory_account.get(int(inv_acc), Decimal("0")) + share
            old_uc = _dec(layer.unit_cost)
            new_uc = ((old_uc * rem) + share) / rem
            layer.unit_cost = new_uc.quantize(_MONEY, rounding=ROUND_HALF_UP)

        # GL: Dr Inventory (per mapped account) / Cr supplied account, same transaction as the layer bump.
        from app.common.business_date import today_local
        from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher

        gl_lines = [
            AutoPostingLine(
                entry_type="DEBIT",
                amount=amt,
                account_id=acc_id,
                notes=f"Landed cost {doc.doc_no}",
            )
            for acc_id, amt in by_inventory_account.items()
            if amt > 0
        ]
        gl_lines.append(
            AutoPostingLine(
                entry_type="CREDIT",
                amount=sum((ln.amount for ln in gl_lines), Decimal("0")),
                account_id=int(credit_account_id),
                notes=f"Landed cost {doc.doc_no}",
            )
        )
        voucher = await create_system_voucher(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            voucher_type="JOURNAL",
            voucher_date=today_local(tenant),
            lines=gl_lines,
            description=f"Landed cost {doc.doc_no} on GRN {doc.goods_receiving_id}",
            reference=doc.doc_no,
            source_module="MATERIAL_LANDED_COST",
            source_module_ref=f"LC:{doc.id}",
            auto_post=True,
        )
        doc.voucher_id = voucher.id

        doc.status = "ALLOCATED"
        doc.updated_at = datetime.utcnow()
        try:
            await db.flush()
        except IntegrityError:
            await safe_async_session_rollback(db)
            raise HTTPException(
                status_code=409,
                detail="LANDED_COST_ALREADY_ALLOCATED: this GRN already has an allocated landed-cost document",
            )
        return doc
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


def landed_doc_to_dict(row: MaterialLandedCostDoc) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "doc_no": row.doc_no,
        "goods_receiving_id": row.goods_receiving_id,
        "status": row.status,
        "total_amount": row.total_amount,
        "currency": row.currency,
        "notes": row.notes,
        "voucher_id": row.voucher_id,
        "request_id": row.request_id,
    }
