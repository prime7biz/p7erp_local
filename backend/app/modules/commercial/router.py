"""Commercial API: export cases, proforma invoices, BTB LCs."""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.commercial import (
    BtbLc,
    ExportCase,
    MasterContract,
    ProformaInvoice,
    ProformaInvoiceOrder,
)
from app.models.finance import BankAccount
from app.models.inventory import PurchaseOrder, Vendor
from app.models.merch import Order
from app.models.customer import Customer
from app.modules.commercial.schemas import (
    BtbLcCreate,
    BtbLcUpdate,
    BtbLcResponse,
    CustomerForPrint,
    ExportCaseCreate,
    ExportCaseResponse,
    MasterContractCreate,
    MasterContractUpdate,
    MasterContractResponse,
    ProformaInvoiceCreate,
    ProformaInvoiceForPrint,
    ProformaInvoiceOrderForPrint,
    ProformaInvoiceResponse,
    ProformaInvoiceUpdate,
    ProformaVerifyResponse,
    ShipperBankForPrint,
)

router = APIRouter(prefix="/commercial", tags=["commercial"])


def _master_contract_to_response(r: MasterContract) -> MasterContractResponse:
    return MasterContractResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        contract_type=r.contract_type,
        reference=r.reference,
        status=r.status,
        contract_date=r.contract_date.isoformat() if r.contract_date else None,
        amount=float(r.amount) if r.amount is not None else None,
        btb_utilized_amount=float(r.btb_utilized_amount) if r.btb_utilized_amount is not None else None,
        currency=r.currency,
        buyer_name=r.buyer_name,
        bank_name=r.bank_name,
        expiry_date=r.expiry_date.isoformat() if r.expiry_date else None,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


def _export_case_to_response(r: ExportCase) -> ExportCaseResponse:
    return ExportCaseResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        reference=r.reference,
        status=r.status,
        case_date=r.case_date.isoformat() if r.case_date else None,
        amount=float(r.amount) if r.amount is not None else None,
        trade_case_id=r.trade_case_id,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


def _order_ids_from_pi(pi: ProformaInvoice) -> list[int]:
    if pi.proforma_invoice_orders:
        return [pio.order_id for pio in sorted(pi.proforma_invoice_orders, key=lambda x: x.sort_order)]
    return []


def _proforma_invoice_to_response(pi: ProformaInvoice) -> ProformaInvoiceResponse:
    order_ids = _order_ids_from_pi(pi)
    return ProformaInvoiceResponse(
        id=pi.id,
        tenant_id=pi.tenant_id,
        reference=pi.reference,
        status=pi.status,
        direction=pi.direction,
        vendor_id=pi.vendor_id,
        master_contract_id=pi.master_contract_id,
        invoice_date=pi.invoice_date.isoformat() if pi.invoice_date else None,
        amount=float(pi.amount) if pi.amount is not None else None,
        order_ids=order_ids,
        buyer_name=pi.buyer_name,
        buyer_address=pi.buyer_address,
        buyer_bank_details=pi.buyer_bank_details,
        consignee_name=pi.consignee_name,
        consignee_address=pi.consignee_address,
        notify_party_name=pi.notify_party_name,
        notify_party_address=pi.notify_party_address,
        beneficiary_name=pi.beneficiary_name,
        beneficiary_address=pi.beneficiary_address,
        terms_of_shipping=pi.terms_of_shipping,
        terms_of_payment=pi.terms_of_payment,
        currency=pi.currency,
        shipping_country=pi.shipping_country,
        destination_port_or_airport=pi.destination_port_or_airport,
        shipment_port=pi.shipment_port,
        documents_to_provide=pi.documents_to_provide,
        terms_and_conditions=pi.terms_and_conditions,
        shipper_bank_name=pi.shipper_bank_name,
        shipper_bank_branch=pi.shipper_bank_branch,
        shipper_bank_account_number=pi.shipper_bank_account_number,
        shipper_bank_account_name=pi.shipper_bank_account_name,
        shipper_bank_address=pi.shipper_bank_address,
        shipper_bank_swift=pi.shipper_bank_swift,
        shipper_bank_account_id=pi.shipper_bank_account_id,
        verification_token=pi.verification_token,
        created_at=pi.created_at.isoformat(),
        updated_at=pi.updated_at.isoformat(),
    )


def _btb_lc_to_response(r: BtbLc) -> BtbLcResponse:
    return BtbLcResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        reference=r.reference,
        status=r.status,
        lc_date=r.lc_date.isoformat() if r.lc_date else None,
        amount=float(r.amount) if r.amount is not None else None,
        master_contract_id=r.master_contract_id,
        proforma_invoice_id=r.proforma_invoice_id,
        vendor_proforma_invoice_id=r.vendor_proforma_invoice_id,
        purchase_order_id=r.purchase_order_id,
        vendor_id=r.vendor_id,
        bank_account_id=r.bank_account_id,
        currency=r.currency,
        exchange_rate_to_base=(
            float(r.exchange_rate_to_base) if r.exchange_rate_to_base is not None else None
        ),
        base_currency_amount=(
            float(r.base_currency_amount) if r.base_currency_amount is not None else None
        ),
        open_date=r.open_date.isoformat() if r.open_date else None,
        expiry_date=r.expiry_date.isoformat() if r.expiry_date else None,
        maturity_date=r.maturity_date.isoformat() if r.maturity_date else None,
        maturity_amount=float(r.maturity_amount) if r.maturity_amount is not None else None,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


async def _recompute_master_contract_utilization(db: AsyncSession, master_contract_id: int) -> None:
    contract = await db.get(MasterContract, master_contract_id)
    if not contract:
        return
    result = await db.execute(
        select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
            BtbLc.master_contract_id == master_contract_id,
            BtbLc.tenant_id == contract.tenant_id,
        )
    )
    contract.btb_utilized_amount = result.scalar() or 0


# ---------- Export cases ----------
@router.get("/export-cases", response_model=list[ExportCaseResponse], tags=["export-cases"])
async def list_export_cases(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(ExportCase).where(ExportCase.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(ExportCase.status == status_filter)
    stmt = stmt.order_by(ExportCase.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_export_case_to_response(r) for r in rows]


@router.get("/export-cases/{case_id}", response_model=ExportCaseResponse, tags=["export-cases"])
async def get_export_case(
    case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = await db.get(ExportCase, case_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export case not found")
    return _export_case_to_response(row)


@router.post(
    "/export-cases",
    response_model=ExportCaseResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["export-cases"],
)
async def create_export_case(
    body: ExportCaseCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = ExportCase(
        tenant_id=tenant.id,
        reference=body.reference,
        status=body.status or "DRAFT",
        case_date=body.case_date,
        amount=body.amount,
        trade_case_id=body.trade_case_id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _export_case_to_response(row)


# ---------- Master contracts ----------
@router.get(
    "/master-contracts",
    response_model=list[MasterContractResponse],
    tags=["master-contracts"],
)
async def list_master_contracts(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(MasterContract).where(MasterContract.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(MasterContract.status == status_filter)
    stmt = stmt.order_by(MasterContract.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_master_contract_to_response(r) for r in rows]


@router.get(
    "/master-contracts/{contract_id}",
    response_model=MasterContractResponse,
    tags=["master-contracts"],
)
async def get_master_contract(
    contract_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = await db.get(MasterContract, contract_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Master contract not found")
    await _recompute_master_contract_utilization(db, row.id)
    await db.flush()
    return _master_contract_to_response(row)


@router.post(
    "/master-contracts",
    response_model=MasterContractResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["master-contracts"],
)
async def create_master_contract(
    body: MasterContractCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = MasterContract(
        tenant_id=tenant.id,
        contract_type=(body.contract_type or "EXPORT_LC").strip().upper(),
        reference=body.reference,
        status=body.status or "DRAFT",
        contract_date=body.contract_date,
        amount=body.amount,
        currency=body.currency,
        buyer_name=body.buyer_name,
        bank_name=body.bank_name,
        expiry_date=body.expiry_date,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _master_contract_to_response(row)


@router.patch(
    "/master-contracts/{contract_id}",
    response_model=MasterContractResponse,
    tags=["master-contracts"],
)
async def update_master_contract(
    contract_id: int,
    body: MasterContractUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = await db.get(MasterContract, contract_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Master contract not found")
    updates = body.model_dump(exclude_unset=True)
    if "contract_type" in updates and updates["contract_type"] is not None:
        updates["contract_type"] = str(updates["contract_type"]).strip().upper()
    if "status" in updates and updates["status"] is not None:
        updates["status"] = str(updates["status"]).strip().upper()
    for key, value in updates.items():
        setattr(row, key, value)
    await _recompute_master_contract_utilization(db, row.id)
    await db.flush()
    await db.refresh(row)
    return _master_contract_to_response(row)


# ---------- Proforma invoices ----------
@router.get(
    "/proforma-invoices",
    response_model=list[ProformaInvoiceResponse],
    tags=["proforma-invoices"],
)
async def list_proforma_invoices(
    status_filter: str | None = Query(default=None, alias="status"),
    direction: str | None = Query(default=None),
    vendor_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = (
        select(ProformaInvoice)
        .where(ProformaInvoice.tenant_id == tenant.id)
        .options(selectinload(ProformaInvoice.proforma_invoice_orders))
    )
    if status_filter:
        stmt = stmt.where(ProformaInvoice.status == status_filter)
    if direction:
        stmt = stmt.where(ProformaInvoice.direction == direction.strip().upper())
    if vendor_id is not None:
        stmt = stmt.where(ProformaInvoice.vendor_id == vendor_id)
    stmt = stmt.order_by(ProformaInvoice.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_proforma_invoice_to_response(r) for r in rows]


@router.get(
    "/proforma-invoices/{invoice_id}",
    response_model=ProformaInvoiceResponse,
    tags=["proforma-invoices"],
)
async def get_proforma_invoice(
    invoice_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = (
        select(ProformaInvoice)
        .where(ProformaInvoice.id == invoice_id, ProformaInvoice.tenant_id == tenant.id)
        .options(selectinload(ProformaInvoice.proforma_invoice_orders))
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proforma invoice not found"
        )
    return _proforma_invoice_to_response(row)


@router.post(
    "/proforma-invoices",
    response_model=ProformaInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["proforma-invoices"],
)
async def create_proforma_invoice(
    body: ProformaInvoiceCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    direction = (body.direction or "EXPORT").strip().upper()
    if direction not in {"EXPORT", "IMPORT"}:
        raise HTTPException(status_code=400, detail="direction must be EXPORT or IMPORT")
    if direction == "EXPORT" and len(body.order_ids) == 0:
        raise HTTPException(status_code=400, detail="At least one order is required for EXPORT proforma")
    if direction == "IMPORT" and body.vendor_id is None:
        raise HTTPException(status_code=400, detail="vendor_id is required for IMPORT proforma")
    # Validate orders exist and belong to tenant
    if body.order_ids:
        order_stmt = select(Order.id).where(
            Order.id.in_(body.order_ids), Order.tenant_id == tenant.id
        )
        order_result = await db.execute(order_stmt)
        found_ids = {r[0] for r in order_result.all()}
        missing = set(body.order_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Orders not found or not in tenant: {sorted(missing)}",
            )
    if body.vendor_id is not None:
        vendor = await db.get(Vendor, body.vendor_id)
        if not vendor or vendor.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Vendor not found")
    if body.master_contract_id is not None:
        contract = await db.get(MasterContract, body.master_contract_id)
        if not contract or contract.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Master contract not found")
    verification_token = secrets.token_urlsafe(32)
    row = ProformaInvoice(
        tenant_id=tenant.id,
        direction=direction,
        vendor_id=body.vendor_id,
        master_contract_id=body.master_contract_id,
        reference=body.reference,
        status=body.status or "DRAFT",
        invoice_date=body.invoice_date,
        amount=body.amount,
        buyer_name=body.buyer_name,
        buyer_address=body.buyer_address,
        buyer_bank_details=body.buyer_bank_details,
        consignee_name=body.consignee_name,
        consignee_address=body.consignee_address,
        notify_party_name=body.notify_party_name,
        notify_party_address=body.notify_party_address,
        beneficiary_name=body.beneficiary_name,
        beneficiary_address=body.beneficiary_address,
        terms_of_shipping=body.terms_of_shipping,
        terms_of_payment=body.terms_of_payment,
        currency=body.currency,
        shipping_country=body.shipping_country,
        destination_port_or_airport=body.destination_port_or_airport,
        shipment_port=body.shipment_port,
        documents_to_provide=body.documents_to_provide,
        terms_and_conditions=body.terms_and_conditions,
        shipper_bank_name=body.shipper_bank_name,
        shipper_bank_branch=body.shipper_bank_branch,
        shipper_bank_account_number=body.shipper_bank_account_number,
        shipper_bank_account_name=body.shipper_bank_account_name,
        shipper_bank_address=body.shipper_bank_address,
        shipper_bank_swift=body.shipper_bank_swift,
        shipper_bank_account_id=body.shipper_bank_account_id,
        verification_token=verification_token,
    )
    db.add(row)
    await db.flush()
    for idx, order_id in enumerate(body.order_ids):
        db.add(
            ProformaInvoiceOrder(
                proforma_invoice_id=row.id,
                order_id=order_id,
                sort_order=idx,
            )
        )
    await db.flush()
    # Reload with proforma_invoice_orders for response
    stmt = (
        select(ProformaInvoice)
        .where(ProformaInvoice.id == row.id)
        .options(selectinload(ProformaInvoice.proforma_invoice_orders))
    )
    result = await db.execute(stmt)
    row = result.scalar_one()
    return _proforma_invoice_to_response(row)


@router.patch(
    "/proforma-invoices/{invoice_id}",
    response_model=ProformaInvoiceResponse,
    tags=["proforma-invoices"],
)
async def update_proforma_invoice(
    invoice_id: int,
    body: ProformaInvoiceUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = (
        select(ProformaInvoice)
        .where(ProformaInvoice.id == invoice_id, ProformaInvoice.tenant_id == tenant.id)
        .options(selectinload(ProformaInvoice.proforma_invoice_orders))
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proforma invoice not found"
        )
    if row.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft proforma invoices can be updated",
        )
    update_data = body.model_dump(exclude_unset=True)
    order_ids = update_data.pop("order_ids", None)
    if "direction" in update_data and update_data["direction"] is not None:
        update_data["direction"] = str(update_data["direction"]).strip().upper()
        if update_data["direction"] not in {"EXPORT", "IMPORT"}:
            raise HTTPException(status_code=400, detail="direction must be EXPORT or IMPORT")
    if "vendor_id" in update_data and update_data["vendor_id"] is not None:
        vendor = await db.get(Vendor, int(update_data["vendor_id"]))
        if not vendor or vendor.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Vendor not found")
    if "master_contract_id" in update_data and update_data["master_contract_id"] is not None:
        contract = await db.get(MasterContract, int(update_data["master_contract_id"]))
        if not contract or contract.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Master contract not found")
    for key, value in update_data.items():
        setattr(row, key, value)
    if order_ids is not None:
        # Replace ProformaInvoiceOrder rows
        for pio in list(row.proforma_invoice_orders):
            await db.delete(pio)
        await db.flush()
        order_stmt = select(Order.id).where(
            Order.id.in_(order_ids), Order.tenant_id == tenant.id
        )
        order_result = await db.execute(order_stmt)
        found_ids = [r[0] for r in order_result.all()]
        if len(found_ids) != len(order_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more orders not found or not in tenant",
            )
        for idx, order_id in enumerate(found_ids):
            db.add(
                ProformaInvoiceOrder(
                    proforma_invoice_id=row.id,
                    order_id=order_id,
                    sort_order=idx,
                )
            )
    await db.flush()
    await db.refresh(row)
    stmt2 = (
        select(ProformaInvoice)
        .where(ProformaInvoice.id == row.id)
        .options(selectinload(ProformaInvoice.proforma_invoice_orders))
    )
    result2 = await db.execute(stmt2)
    row = result2.scalar_one()
    return _proforma_invoice_to_response(row)


@router.get(
    "/proforma-invoices/{invoice_id}/for-print",
    response_model=ProformaInvoiceForPrint,
    tags=["proforma-invoices"],
)
async def get_proforma_invoice_for_print(
    invoice_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = (
        select(ProformaInvoice)
        .where(ProformaInvoice.id == invoice_id, ProformaInvoice.tenant_id == tenant.id)
        .options(
            selectinload(ProformaInvoice.proforma_invoice_orders).selectinload(
                ProformaInvoiceOrder.order
            )
        )
    )
    result = await db.execute(stmt)
    pi = result.scalar_one_or_none()
    if not pi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proforma invoice not found"
        )
    customer_ids = []
    orders_for_print = []
    for pio in pi.proforma_invoice_orders:
        o = pio.order
        customer_ids.append(o.customer_id)
        orders_for_print.append(
            ProformaInvoiceOrderForPrint(
                order_code=o.order_code,
                quantity=o.quantity,
                delivery_date=o.delivery_date.isoformat() if o.delivery_date else None,
                customer_id=o.customer_id,
            )
        )
    customers_map: dict[int, CustomerForPrint] = {}
    if customer_ids:
        cust_stmt = select(Customer).where(
            Customer.id.in_(set(customer_ids)), Customer.tenant_id == tenant.id
        )
        cust_result = await db.execute(cust_stmt)
        for c in cust_result.scalars().all():
            customers_map[c.id] = CustomerForPrint(
                id=c.id, name=c.name, address=c.address
            )
    customers_list = list(customers_map.values())
    # Tenant: company_name (tenant.name), logo
    company_name = tenant.name
    logo = tenant.logo
    shipper_bank: ShipperBankForPrint | None = None
    if pi.shipper_bank_account_id:
        bank = await db.get(BankAccount, pi.shipper_bank_account_id)
        if bank and bank.tenant_id == tenant.id:
            shipper_bank = ShipperBankForPrint(
                bank_name=bank.bank_name,
                branch_name=bank.branch_name,
                account_number=bank.account_number,
                account_name=bank.account_name,
                swift_code=bank.swift_code,
                address=pi.shipper_bank_address,
            )
    if not shipper_bank and (
        pi.shipper_bank_name
        or pi.shipper_bank_account_number
        or pi.shipper_bank_account_name
    ):
        shipper_bank = ShipperBankForPrint(
            bank_name=pi.shipper_bank_name or "",
            branch_name=pi.shipper_bank_branch,
            account_number=pi.shipper_bank_account_number or "",
            account_name=pi.shipper_bank_account_name,
            swift_code=pi.shipper_bank_swift,
            address=pi.shipper_bank_address,
        )
    return ProformaInvoiceForPrint(
        id=pi.id,
        tenant_id=pi.tenant_id,
        reference=pi.reference,
        status=pi.status,
        invoice_date=pi.invoice_date.isoformat() if pi.invoice_date else None,
        amount=float(pi.amount) if pi.amount is not None else None,
        buyer_name=pi.buyer_name,
        buyer_address=pi.buyer_address,
        buyer_bank_details=pi.buyer_bank_details,
        consignee_name=pi.consignee_name,
        consignee_address=pi.consignee_address,
        notify_party_name=pi.notify_party_name,
        notify_party_address=pi.notify_party_address,
        beneficiary_name=pi.beneficiary_name,
        beneficiary_address=pi.beneficiary_address,
        terms_of_shipping=pi.terms_of_shipping,
        terms_of_payment=pi.terms_of_payment,
        currency=pi.currency,
        shipping_country=pi.shipping_country,
        destination_port_or_airport=pi.destination_port_or_airport,
        shipment_port=pi.shipment_port,
        documents_to_provide=pi.documents_to_provide,
        terms_and_conditions=pi.terms_and_conditions,
        shipper_bank_name=pi.shipper_bank_name,
        shipper_bank_branch=pi.shipper_bank_branch,
        shipper_bank_account_number=pi.shipper_bank_account_number,
        shipper_bank_account_name=pi.shipper_bank_account_name,
        shipper_bank_address=pi.shipper_bank_address,
        shipper_bank_swift=pi.shipper_bank_swift,
        orders=orders_for_print,
        customers=customers_list,
        company_name=company_name,
        logo=logo,
        shipper_bank=shipper_bank,
        verification_token=pi.verification_token,
    )


@router.delete(
    "/proforma-invoices/{invoice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["proforma-invoices"],
)
async def delete_proforma_invoice(
    invoice_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a proforma invoice. Only DRAFT can be deleted."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = await db.get(ProformaInvoice, invoice_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proforma invoice not found"
        )
    if row.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft proforma invoices can be deleted",
        )
    await db.delete(row)
    await db.flush()


@router.post(
    "/proforma-invoices/{invoice_id}/finalize",
    response_model=ProformaInvoiceResponse,
    tags=["proforma-invoices"],
)
async def finalize_proforma_invoice(
    invoice_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = (
        select(ProformaInvoice)
        .where(ProformaInvoice.id == invoice_id, ProformaInvoice.tenant_id == tenant.id)
        .options(selectinload(ProformaInvoice.proforma_invoice_orders))
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proforma invoice not found"
        )
    if row.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft proforma invoices can be finalized",
        )
    row.status = "ISSUED"
    if not row.verification_token:
        row.verification_token = secrets.token_urlsafe(32)
    await db.flush()
    await db.refresh(row)
    return _proforma_invoice_to_response(row)


@router.get(
    "/verify",
    response_model=ProformaVerifyResponse,
    tags=["proforma-invoices"],
)
async def verify_proforma_invoice(
    token: str = Query(..., alias="token"),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint (no auth): verify a proforma invoice by verification token."""
    stmt = select(ProformaInvoice).where(
        ProformaInvoice.verification_token == token
    )
    result = await db.execute(stmt)
    pi = result.scalar_one_or_none()
    if not pi:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired token"
        )
    tenant = await db.get(Tenant, pi.tenant_id)
    issued_by = tenant.name if tenant else ""
    return ProformaVerifyResponse(
        valid=True,
        issued_by=issued_by,
        reference=pi.reference,
        invoice_date=pi.invoice_date.isoformat() if pi.invoice_date else None,
        amount=float(pi.amount) if pi.amount is not None else None,
    )


# ---------- BTB LCs ----------
@router.get("/btb-lcs", response_model=list[BtbLcResponse], tags=["btb-lcs"])
async def list_btb_lcs(
    status_filter: str | None = Query(default=None, alias="status"),
    master_contract_id: int | None = Query(default=None),
    vendor_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(BtbLc).where(BtbLc.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(BtbLc.status == status_filter)
    if master_contract_id is not None:
        stmt = stmt.where(BtbLc.master_contract_id == master_contract_id)
    if vendor_id is not None:
        stmt = stmt.where(BtbLc.vendor_id == vendor_id)
    stmt = stmt.order_by(BtbLc.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_btb_lc_to_response(r) for r in rows]


@router.get("/btb-lcs/{lc_id}", response_model=BtbLcResponse, tags=["btb-lcs"])
async def get_btb_lc(
    lc_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = await db.get(BtbLc, lc_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BTB LC not found")
    return _btb_lc_to_response(row)


@router.post(
    "/btb-lcs",
    response_model=BtbLcResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["btb-lcs"],
)
async def create_btb_lc(
    body: BtbLcCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    contract = None
    if body.master_contract_id is not None:
        contract = await db.get(MasterContract, body.master_contract_id)
        if not contract or contract.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Master contract not found")
    if body.vendor_id is not None:
        vendor = await db.get(Vendor, body.vendor_id)
        if not vendor or vendor.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Vendor not found")
    if body.proforma_invoice_id is not None:
        pi = await db.get(ProformaInvoice, body.proforma_invoice_id)
        if not pi or pi.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Proforma invoice not found")
    if body.vendor_proforma_invoice_id is not None:
        vpi = await db.get(ProformaInvoice, body.vendor_proforma_invoice_id)
        if not vpi or vpi.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Vendor proforma invoice not found")
        if (vpi.direction or "").upper() != "IMPORT":
            raise HTTPException(
                status_code=400, detail="vendor_proforma_invoice_id must reference IMPORT proforma"
            )
        if body.vendor_id is not None and vpi.vendor_id is not None and vpi.vendor_id != body.vendor_id:
            raise HTTPException(status_code=400, detail="Vendor mismatch with vendor proforma")
    if body.purchase_order_id is not None:
        po = await db.get(PurchaseOrder, body.purchase_order_id)
        if not po or po.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Purchase order not found")
    if contract and body.amount is not None and contract.amount is not None:
        current_total_result = await db.execute(
            select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
                BtbLc.master_contract_id == contract.id, BtbLc.tenant_id == tenant.id
            )
        )
        current_total = float(current_total_result.scalar() or 0)
        if current_total + float(body.amount) > float(contract.amount):
            raise HTTPException(status_code=400, detail="BTB LC amount exceeds master contract remaining amount")
    row = BtbLc(
        tenant_id=tenant.id,
        reference=body.reference,
        status=body.status or "DRAFT",
        lc_date=body.lc_date,
        amount=body.amount,
        master_contract_id=body.master_contract_id,
        proforma_invoice_id=body.proforma_invoice_id,
        vendor_proforma_invoice_id=body.vendor_proforma_invoice_id,
        purchase_order_id=body.purchase_order_id,
        vendor_id=body.vendor_id,
        bank_account_id=body.bank_account_id,
        currency=body.currency,
        exchange_rate_to_base=body.exchange_rate_to_base,
        base_currency_amount=body.base_currency_amount,
        open_date=body.open_date,
        expiry_date=body.expiry_date,
        maturity_date=body.maturity_date,
        maturity_amount=body.maturity_amount,
    )
    db.add(row)
    await db.flush()
    if row.master_contract_id is not None:
        await _recompute_master_contract_utilization(db, row.master_contract_id)
    await db.refresh(row)
    return _btb_lc_to_response(row)


@router.patch(
    "/btb-lcs/{lc_id}",
    response_model=BtbLcResponse,
    tags=["btb-lcs"],
)
async def update_btb_lc(
    lc_id: int,
    body: BtbLcUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = await db.get(BtbLc, lc_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BTB LC not found")
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] is not None:
        updates["status"] = str(updates["status"]).strip().upper()
    target_master_id = updates.get("master_contract_id", row.master_contract_id)
    target_amount = updates.get("amount", row.amount)
    if target_master_id is not None:
        contract = await db.get(MasterContract, int(target_master_id))
        if not contract or contract.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Master contract not found")
        if target_amount is not None and contract.amount is not None:
            current_total_result = await db.execute(
                select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
                    BtbLc.master_contract_id == contract.id,
                    BtbLc.tenant_id == tenant.id,
                    BtbLc.id != row.id,
                )
            )
            current_total = float(current_total_result.scalar() or 0)
            if current_total + float(target_amount) > float(contract.amount):
                raise HTTPException(
                    status_code=400, detail="BTB LC amount exceeds master contract remaining amount"
                )
    if "vendor_id" in updates and updates["vendor_id"] is not None:
        vendor = await db.get(Vendor, int(updates["vendor_id"]))
        if not vendor or vendor.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Vendor not found")
    if "proforma_invoice_id" in updates and updates["proforma_invoice_id"] is not None:
        pi = await db.get(ProformaInvoice, int(updates["proforma_invoice_id"]))
        if not pi or pi.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Proforma invoice not found")
    if "vendor_proforma_invoice_id" in updates and updates["vendor_proforma_invoice_id"] is not None:
        vpi = await db.get(ProformaInvoice, int(updates["vendor_proforma_invoice_id"]))
        if not vpi or vpi.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Vendor proforma invoice not found")
        if (vpi.direction or "").upper() != "IMPORT":
            raise HTTPException(
                status_code=400, detail="vendor_proforma_invoice_id must reference IMPORT proforma"
            )
    if "purchase_order_id" in updates and updates["purchase_order_id"] is not None:
        po = await db.get(PurchaseOrder, int(updates["purchase_order_id"]))
        if not po or po.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Purchase order not found")
    previous_master_id = row.master_contract_id
    for key, value in updates.items():
        setattr(row, key, value)
    await db.flush()
    if previous_master_id is not None:
        await _recompute_master_contract_utilization(db, previous_master_id)
    if row.master_contract_id is not None and row.master_contract_id != previous_master_id:
        await _recompute_master_contract_utilization(db, row.master_contract_id)
    await db.flush()
    await db.refresh(row)
    return _btb_lc_to_response(row)
