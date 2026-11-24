"""Create / update / confirm / list inbound job work contracts."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.codegen import next_tenant_code
from app.common.document_history import record_doc_event
from app.common.ownership import ensure_owned
from app.common.pagination import clamp_page_size
from app.models import Tenant, User
from app.models.costing import Item
from app.models.customer import Customer
from app.models.job_work import JobWorkContract, JobWorkDeliverable, JobWorkMaterial
from app.modules.job_work.money import ZERO, money2, q4, rate6, s2, s4
from app.modules.job_work.schemas import ContractCreate, ContractUpdate
from app.modules.job_work.serializers import detail_out, list_item


def _require_process(body: ContractCreate | ContractUpdate, *, cutting: bool, sewing: bool, finishing: bool) -> None:
    if not (cutting or sewing or finishing):
        raise HTTPException(status_code=400, detail="Select at least one process: cutting, sewing, or finishing")


async def _load_children(db: AsyncSession, tenant_id: int, contract_id: int):
    deliverables = (
        await db.execute(
            select(JobWorkDeliverable).where(
                JobWorkDeliverable.tenant_id == tenant_id,
                JobWorkDeliverable.contract_id == contract_id,
            )
        )
    ).scalars().all()
    materials = (
        await db.execute(
            select(JobWorkMaterial).where(
                JobWorkMaterial.tenant_id == tenant_id,
                JobWorkMaterial.contract_id == contract_id,
            )
        )
    ).scalars().all()
    return list(deliverables), list(materials)


async def get_detail(db: AsyncSession, tenant: Tenant, contract_id: int):
    from app.modules.job_work.access import get_contract_for_tenant

    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    customer = await db.get(Customer, contract.customer_id)
    if customer and customer.tenant_id != tenant.id:
        customer = None
    deliverables, materials = await _load_children(db, tenant.id, contract.id)
    return detail_out(contract, customer=customer, deliverables=deliverables, materials=materials)


async def list_contracts(
    db: AsyncSession,
    tenant: Tenant,
    *,
    status: str | None,
    q: str | None,
    limit: int,
    offset: int,
):
    limit = clamp_page_size(limit)
    offset = max(0, offset)
    stmt = select(JobWorkContract).where(JobWorkContract.tenant_id == tenant.id)
    if status:
        stmt = stmt.where(JobWorkContract.status == status.strip().upper())
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.outerjoin(Customer, Customer.id == JobWorkContract.customer_id).where(
            (JobWorkContract.contract_no.ilike(like)) | (Customer.name.ilike(like))
        )
    total = (
        await db.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))
    ).scalar_one()
    rows = (
        await db.execute(stmt.order_by(JobWorkContract.id.desc()).limit(limit).offset(offset))
    ).scalars().all()
    cust_ids = {r.customer_id for r in rows}
    customers = {}
    if cust_ids:
        for c in (
            await db.execute(
                select(Customer).where(Customer.tenant_id == tenant.id, Customer.id.in_(cust_ids))
            )
        ).scalars().all():
            customers[c.id] = c
    return total, [list_item(r, customers.get(r.customer_id)) for r in rows]


async def create_contract(
    db: AsyncSession,
    tenant: Tenant,
    user: User,
    body: ContractCreate,
):
    await ensure_owned(db, Customer, body.customer_id, tenant.id, "Customer")
    _require_process(body, cutting=body.do_cutting, sewing=body.do_sewing, finishing=body.do_finishing)
    cm = money2(body.cm_rate, field="cm_rate")
    if cm <= ZERO:
        raise HTTPException(status_code=400, detail="cm_rate must be greater than zero")
    currency = (body.currency or tenant.base_currency or "BDT").strip().upper()[:10] or "BDT"
    base = (tenant.base_currency or "BDT").strip().upper()[:10] or "BDT"
    fx = rate6(body.exchange_rate_default or "1")
    if currency == base and fx != rate6("1"):
        fx = rate6("1")
    if currency != base and fx <= ZERO:
        raise HTTPException(status_code=400, detail="exchange_rate_default is required for foreign currency")
    vat = money2(body.vat_rate_pct or "0", field="vat_rate_pct")
    if vat < ZERO:
        raise HTTPException(status_code=400, detail="vat_rate_pct cannot be negative")

    from app.models import MasterContract, Order, ProformaInvoice
    from app.modules.material_control.style_tagging import resolve_style_colorway

    for m in body.materials:
        await ensure_owned(db, Item, m.item_id, tenant.id, "Item")
        await resolve_style_colorway(db, tenant_id=tenant.id, style_id=m.style_id, colorway_id=m.colorway_id)
    for dline in body.deliverables:
        await resolve_style_colorway(
            db, tenant_id=tenant.id, style_id=dline.style_id, colorway_id=dline.colorway_id
        )
        if dline.order_id is not None:
            await ensure_owned(db, Order, dline.order_id, tenant.id, "Order")
    if body.final_customer_id is not None:
        await ensure_owned(db, Customer, body.final_customer_id, tenant.id, "Customer")
    if body.master_contract_id is not None:
        await ensure_owned(db, MasterContract, body.master_contract_id, tenant.id, "Master contract")
    if body.proforma_invoice_id is not None:
        await ensure_owned(db, ProformaInvoice, body.proforma_invoice_id, tenant.id, "Proforma invoice")

    contract_no = await next_tenant_code(
        db, model=JobWorkContract, tenant_id=tenant.id, prefix="JW-", width=4
    )
    ordered_total = ZERO
    for dline in body.deliverables:
        ordered_total += q4(dline.qty_ordered, field="qty_ordered")

    contract = JobWorkContract(
        tenant_id=tenant.id,
        contract_no=contract_no,
        customer_id=body.customer_id,
        final_customer_id=body.final_customer_id,
        final_customer_name=(body.final_customer_name or "").strip() or None,
        master_contract_id=body.master_contract_id,
        proforma_invoice_id=body.proforma_invoice_id,
        principal_ud_ref=(body.principal_ud_ref or "").strip() or None,
        status="DRAFT",
        cm_rate=s2(cm),
        currency=currency,
        exchange_rate_default=str(fx),
        vat_rate_pct=s2(vat),
        do_cutting=bool(body.do_cutting),
        do_sewing=bool(body.do_sewing),
        do_finishing=bool(body.do_finishing),
        location_label=(body.location_label or "").strip() or None,
        contract_date=body.contract_date or today_local(tenant),
        due_date=body.due_date,
        notes=(body.notes or "").strip() or None,
        qty_ordered_total=s4(ordered_total),
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
    )
    db.add(contract)
    await db.flush()

    for dline in body.deliverables:
        qty = q4(dline.qty_ordered, field="qty_ordered")
        if qty < ZERO:
            raise HTTPException(status_code=400, detail="qty_ordered cannot be negative")
        db.add(
            JobWorkDeliverable(
                tenant_id=tenant.id,
                contract_id=contract.id,
                style_ref=(dline.style_ref or "").strip() or None,
                color=(dline.color or "").strip() or None,
                size=(dline.size or "").strip() or None,
                style_id=dline.style_id,
                colorway_id=dline.colorway_id,
                order_id=dline.order_id,
                qty_ordered=s4(qty),
                notes=(dline.notes or "").strip() or None,
            )
        )
    for m in body.materials:
        db.add(
            JobWorkMaterial(
                tenant_id=tenant.id,
                contract_id=contract.id,
                item_id=m.item_id,
                style_id=m.style_id,
                colorway_id=m.colorway_id,
                consumption_per_unit=s4(q4(m.consumption_per_unit, field="consumption_per_unit")),
                qty_planned=s4(q4(m.qty_planned, field="qty_planned")),
                notes=(m.notes or "").strip() or None,
            )
        )
    await db.flush()
    await record_doc_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        doc_type="JOB_WORK_CONTRACT",
        doc_id=contract.id,
        event="CREATED",
        summary=f"Created job work {contract.contract_no}",
        to_status="DRAFT",
    )
    await db.commit()
    return await get_detail(db, tenant, contract.id)


async def update_contract(
    db: AsyncSession,
    tenant: Tenant,
    user: User,
    contract_id: int,
    body: ContractUpdate,
):
    from app.modules.job_work.access import ensure_not_closed, get_contract_for_tenant

    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id, for_update=True)
    ensure_not_closed(contract)
    if (contract.status or "").upper() not in {"DRAFT", "CONFIRMED"}:
        raise HTTPException(status_code=409, detail="Only DRAFT or CONFIRMED contracts can be edited")
    if q4(contract.qty_billed) > ZERO and body.currency is not None:
        if body.currency.strip().upper() != (contract.currency or "").upper():
            raise HTTPException(status_code=409, detail="Currency cannot change after the first bill")

    cutting = body.do_cutting if body.do_cutting is not None else bool(contract.do_cutting)
    sewing = body.do_sewing if body.do_sewing is not None else bool(contract.do_sewing)
    finishing = body.do_finishing if body.do_finishing is not None else bool(contract.do_finishing)
    _require_process(body, cutting=cutting, sewing=sewing, finishing=finishing)

    if body.cm_rate is not None:
        cm = money2(body.cm_rate, field="cm_rate")
        if cm <= ZERO:
            raise HTTPException(status_code=400, detail="cm_rate must be greater than zero")
        contract.cm_rate = s2(cm)
    if body.currency is not None and q4(contract.qty_billed) <= ZERO:
        contract.currency = body.currency.strip().upper()[:10] or contract.currency
    if body.exchange_rate_default is not None:
        contract.exchange_rate_default = str(rate6(body.exchange_rate_default))
    if body.vat_rate_pct is not None:
        vat = money2(body.vat_rate_pct, field="vat_rate_pct")
        if vat < ZERO:
            raise HTTPException(status_code=400, detail="vat_rate_pct cannot be negative")
        contract.vat_rate_pct = s2(vat)
    contract.do_cutting = cutting
    contract.do_sewing = sewing
    contract.do_finishing = finishing
    if body.location_label is not None:
        contract.location_label = body.location_label.strip() or None
    if body.contract_date is not None:
        contract.contract_date = body.contract_date
    if body.due_date is not None:
        contract.due_date = body.due_date
    if body.notes is not None:
        contract.notes = body.notes.strip() or None

    if body.deliverables is not None:
        if (contract.status or "").upper() != "DRAFT":
            raise HTTPException(status_code=409, detail="Deliverables can only be replaced while DRAFT")
        existing = (
            await db.execute(
                select(JobWorkDeliverable).where(
                    JobWorkDeliverable.tenant_id == tenant.id,
                    JobWorkDeliverable.contract_id == contract.id,
                )
            )
        ).scalars().all()
        for row in existing:
            await db.delete(row)
        ordered_total = ZERO
        for dline in body.deliverables:
            qty = q4(dline.qty_ordered, field="qty_ordered")
            ordered_total += qty
            db.add(
                JobWorkDeliverable(
                    tenant_id=tenant.id,
                    contract_id=contract.id,
                    style_ref=(dline.style_ref or "").strip() or None,
                    color=(dline.color or "").strip() or None,
                    size=(dline.size or "").strip() or None,
                    qty_ordered=s4(qty),
                    notes=(dline.notes or "").strip() or None,
                )
            )
        contract.qty_ordered_total = s4(ordered_total)

    if body.materials is not None:
        if (contract.status or "").upper() != "DRAFT":
            raise HTTPException(status_code=409, detail="Materials can only be replaced while DRAFT")
        existing_m = (
            await db.execute(
                select(JobWorkMaterial).where(
                    JobWorkMaterial.tenant_id == tenant.id,
                    JobWorkMaterial.contract_id == contract.id,
                )
            )
        ).scalars().all()
        for row in existing_m:
            await db.delete(row)
        for m in body.materials:
            await ensure_owned(db, Item, m.item_id, tenant.id, "Item")
            db.add(
                JobWorkMaterial(
                    tenant_id=tenant.id,
                    contract_id=contract.id,
                    item_id=m.item_id,
                    consumption_per_unit=s4(q4(m.consumption_per_unit, field="consumption_per_unit")),
                    qty_planned=s4(q4(m.qty_planned, field="qty_planned")),
                    notes=(m.notes or "").strip() or None,
                )
            )

    contract.updated_by_user_id = user.id
    contract.updated_at = datetime.utcnow()
    await db.flush()
    await record_doc_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        doc_type="JOB_WORK_CONTRACT",
        doc_id=contract.id,
        event="UPDATED",
        summary=f"Updated job work {contract.contract_no}",
        from_status=contract.status,
        to_status=contract.status,
    )
    await db.commit()
    return await get_detail(db, tenant, contract.id)


async def confirm_contract(db: AsyncSession, tenant: Tenant, user: User, contract_id: int):
    from sqlalchemy import select

    from app.common.tenant_feature_keys import is_material_inbound_v2_enabled
    from app.models.job_work import JobWorkDeliverable
    from app.modules.job_work.access import ensure_not_closed, get_contract_for_tenant

    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id, for_update=True)
    ensure_not_closed(contract)
    if (contract.status or "").upper() != "DRAFT":
        raise HTTPException(status_code=409, detail="Only DRAFT contracts can be confirmed")
    if not (contract.do_cutting or contract.do_sewing or contract.do_finishing):
        raise HTTPException(status_code=400, detail="Select at least one process before confirm")
    # Phase 2A: when material_inbound_v2 is on, require final customer + real Style on deliverables.
    if is_material_inbound_v2_enabled(tenant.feature_flags):
        if not contract.final_customer_id and not (contract.final_customer_name or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Final customer (buyer) is required before confirming when Material Inbound v2 is on",
            )
        dels = list(
            (
                await db.execute(
                    select(JobWorkDeliverable).where(
                        JobWorkDeliverable.tenant_id == tenant.id,
                        JobWorkDeliverable.contract_id == contract.id,
                    )
                )
            ).scalars().all()
        )
        if not dels:
            raise HTTPException(status_code=400, detail="Add at least one style deliverable before confirm")
        if any(d.style_id is None for d in dels):
            raise HTTPException(
                status_code=400,
                detail="Every deliverable needs a real Style before confirm when Material Inbound v2 is on",
            )
    prev = contract.status
    contract.status = "CONFIRMED"
    contract.updated_by_user_id = user.id
    contract.updated_at = datetime.utcnow()
    await record_doc_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        doc_type="JOB_WORK_CONTRACT",
        doc_id=contract.id,
        event="CONFIRMED",
        summary=f"Confirmed job work {contract.contract_no}",
        from_status=prev,
        to_status="CONFIRMED",
    )
    await db.commit()
    return await get_detail(db, tenant, contract.id)


async def mark_in_progress(db: AsyncSession, contract: JobWorkContract) -> None:
    if (contract.status or "").upper() in {"CONFIRMED"}:
        contract.status = "IN_PROGRESS"
        contract.updated_at = datetime.utcnow()
