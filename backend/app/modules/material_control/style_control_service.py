"""Style Control Sheet — style-centric material posture (read-only)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commercial import BtbLc, MasterContract, ProformaInvoice, ProformaInvoiceOrder
from app.models.finance import VendorBill
from app.models.inventory import GoodsReceiving, ProductionMaterialIssue, PurchaseOrder
from app.models.merch import Bom, GarmentStyle, Inquiry, Order, Quotation
from app.modules.material_control.schemas import (
    ChainHealthNode,
    StyleChainHealth,
    StyleControlCounts,
    StyleControlOrderRow,
    StyleControlSheetResponse,
    StyleListResponse,
    StyleListRow,
)

_CAP = 100


async def list_styles_with_orders(
    db: AsyncSession,
    *,
    tenant_id: int,
    limit: int = 50,
    offset: int = 0,
) -> StyleListResponse:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    order_counts = (
        select(Order.style_id, func.count(Order.id).label("order_count"))
        .where(Order.tenant_id == tenant_id, Order.style_id.is_not(None))
        .group_by(Order.style_id)
        .subquery()
    )
    rows = list(
        (
            await db.execute(
                select(GarmentStyle, order_counts.c.order_count)
                .outerjoin(order_counts, order_counts.c.style_id == GarmentStyle.id)
                .where(GarmentStyle.tenant_id == tenant_id)
                .order_by(GarmentStyle.style_code.asc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )
    items = [
        StyleListRow(
            style_id=style.id,
            style_code=style.style_code,
            style_name=style.name,
            order_count=int(cnt or 0),
        )
        for style, cnt in rows
    ]
    return StyleListResponse(items=items)


async def _node_from_style_rows(
    db: AsyncSession,
    *,
    model,
    tenant_id: int,
    style_id: int,
    code_attr: str,
) -> ChainHealthNode:
    count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(model)
                .where(model.tenant_id == tenant_id, model.style_id == style_id)
            )
        ).scalar_one()
        or 0
    )
    latest = (
        await db.execute(
            select(model)
            .where(model.tenant_id == tenant_id, model.style_id == style_id)
            .order_by(model.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    code = None
    latest_id = None
    if latest is not None:
        latest_id = int(latest.id)
        raw = getattr(latest, code_attr, None)
        code = str(raw) if raw else f"#{latest_id}"
    return ChainHealthNode(count=count, latest_id=latest_id, latest_code=code)


async def _build_chain_health(
    db: AsyncSession,
    *,
    tenant_id: int,
    style_id: int,
    orders: list[Order],
) -> StyleChainHealth:
    inquiries = await _node_from_style_rows(
        db, model=Inquiry, tenant_id=tenant_id, style_id=style_id, code_attr="inquiry_code"
    )
    quotations = await _node_from_style_rows(
        db, model=Quotation, tenant_id=tenant_id, style_id=style_id, code_attr="quotation_code"
    )
    boms = await _node_from_style_rows(
        db, model=Bom, tenant_id=tenant_id, style_id=style_id, code_attr="bom_code"
    )

    order_node = ChainHealthNode(count=len(orders))
    if orders:
        latest = orders[0]
        order_node.latest_id = latest.id
        order_node.latest_code = latest.order_code or f"#{latest.id}"

    pi_node = ChainHealthNode()
    mc_node = ChainHealthNode()
    btb_node = ChainHealthNode()
    order_ids = [o.id for o in orders]
    if order_ids:
        pi_rows = list(
            (
                await db.execute(
                    select(ProformaInvoice)
                    .join(
                        ProformaInvoiceOrder,
                        ProformaInvoiceOrder.proforma_invoice_id == ProformaInvoice.id,
                    )
                    .where(
                        ProformaInvoice.tenant_id == tenant_id,
                        ProformaInvoiceOrder.order_id.in_(order_ids),
                    )
                    .order_by(ProformaInvoice.id.desc())
                    .limit(_CAP)
                )
            )
            .scalars()
            .all()
        )
        # Deduplicate while preserving newest-first order
        seen_pi: set[int] = set()
        unique_pis: list[ProformaInvoice] = []
        for pi in pi_rows:
            if pi.id in seen_pi:
                continue
            seen_pi.add(pi.id)
            unique_pis.append(pi)
        pi_node = ChainHealthNode(
            count=len(unique_pis),
            latest_id=unique_pis[0].id if unique_pis else None,
            latest_code=(unique_pis[0].reference or f"#{unique_pis[0].id}") if unique_pis else None,
        )
        mc_ids = [pid for pid in (p.master_contract_id for p in unique_pis) if pid]
        if mc_ids:
            mc_rows = list(
                (
                    await db.execute(
                        select(MasterContract)
                        .where(
                            MasterContract.tenant_id == tenant_id,
                            MasterContract.id.in_(mc_ids),
                        )
                        .order_by(MasterContract.id.desc())
                        .limit(_CAP)
                    )
                )
                .scalars()
                .all()
            )
            mc_node = ChainHealthNode(
                count=len(mc_rows),
                latest_id=mc_rows[0].id if mc_rows else None,
                latest_code=(mc_rows[0].reference or f"#{mc_rows[0].id}") if mc_rows else None,
            )
            if mc_rows:
                btb_rows = list(
                    (
                        await db.execute(
                            select(BtbLc)
                            .where(
                                BtbLc.tenant_id == tenant_id,
                                BtbLc.master_contract_id.in_([m.id for m in mc_rows]),
                            )
                            .order_by(BtbLc.id.desc())
                            .limit(_CAP)
                        )
                    )
                    .scalars()
                    .all()
                )
                btb_node = ChainHealthNode(
                    count=len(btb_rows),
                    latest_id=btb_rows[0].id if btb_rows else None,
                    latest_code=(btb_rows[0].reference or f"#{btb_rows[0].id}") if btb_rows else None,
                )

    return StyleChainHealth(
        inquiries=inquiries,
        quotations=quotations,
        orders=order_node,
        boms=boms,
        proforma_invoices=pi_node,
        master_contracts=mc_node,
        btb_lcs=btb_node,
    )


async def build_style_control_sheet(
    db: AsyncSession,
    *,
    tenant_id: int,
    style_id: int,
) -> StyleControlSheetResponse | None:
    style = await db.get(GarmentStyle, style_id)
    if not style or style.tenant_id != tenant_id:
        return None

    orders = list(
        (
            await db.execute(
                select(Order)
                .where(Order.tenant_id == tenant_id, Order.style_id == style_id)
                .order_by(Order.id.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    order_ids = [o.id for o in orders]
    order_rows = [
        StyleControlOrderRow(
            order_id=o.id,
            order_code=o.order_code,
            status=o.status,
            delivery_date=o.delivery_date,
            quantity=getattr(o, "quantity", None) or getattr(o, "total_qty", None),
        )
        for o in orders
    ]

    open_pos = 0
    received_grns = 0
    unbilled_grns = 0
    pmi_issued = 0
    pmi_draft = 0

    if order_ids:
        open_pos = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(PurchaseOrder)
                    .where(
                        PurchaseOrder.tenant_id == tenant_id,
                        PurchaseOrder.source_order_id.in_(order_ids),
                        func.upper(PurchaseOrder.status).in_(
                            ("APPROVED", "PARTIAL", "OPEN", "CONFIRMED")
                        ),
                    )
                )
            ).scalar_one()
            or 0
        )
        received_grns = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(GoodsReceiving)
                    .where(
                        GoodsReceiving.tenant_id == tenant_id,
                        GoodsReceiving.source_order_id.in_(order_ids),
                        func.upper(GoodsReceiving.status) == "RECEIVED",
                    )
                )
            ).scalar_one()
            or 0
        )
        billed = select(VendorBill.goods_receiving_id).where(
            VendorBill.tenant_id == tenant_id,
            VendorBill.goods_receiving_id.is_not(None),
            func.upper(VendorBill.status) != "CANCELLED",
        )
        unbilled_grns = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(GoodsReceiving)
                    .where(
                        GoodsReceiving.tenant_id == tenant_id,
                        GoodsReceiving.source_order_id.in_(order_ids),
                        func.upper(GoodsReceiving.status) == "RECEIVED",
                        GoodsReceiving.id.not_in(billed),
                    )
                )
            ).scalar_one()
            or 0
        )
        pmi_issued = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(ProductionMaterialIssue)
                    .where(
                        ProductionMaterialIssue.tenant_id == tenant_id,
                        ProductionMaterialIssue.order_id.in_(order_ids),
                        func.upper(ProductionMaterialIssue.status).in_(("ISSUED", "POSTED", "APPROVED")),
                    )
                )
            ).scalar_one()
            or 0
        )
        pmi_draft = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(ProductionMaterialIssue)
                    .where(
                        ProductionMaterialIssue.tenant_id == tenant_id,
                        ProductionMaterialIssue.order_id.in_(order_ids),
                        func.upper(ProductionMaterialIssue.status) == "DRAFT",
                    )
                )
            ).scalar_one()
            or 0
        )

    chain_health = await _build_chain_health(
        db, tenant_id=tenant_id, style_id=style_id, orders=orders
    )

    return StyleControlSheetResponse(
        style_id=style.id,
        style_code=style.style_code,
        style_name=style.name,
        counts=StyleControlCounts(
            orders=len(orders),
            open_pos=open_pos,
            received_grns=received_grns,
            unbilled_grns=unbilled_grns,
            pmi_issued=pmi_issued,
            pmi_draft=pmi_draft,
        ),
        orders=order_rows,
        chain_health=chain_health,
    )
