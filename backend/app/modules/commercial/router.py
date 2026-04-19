"""Commercial API: export cases, proforma invoices, BTB LCs."""

from datetime import date, datetime
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.auth import get_current_user
from app.common.master_contract_workflow import (
    LC_RECEIVED_OPERATIONAL_STATUSES,
    MASTER_CONTRACT_STATUS_VALUES,
)
from app.common.codegen import next_tenant_code
from app.modules.finance.auto_posting_service import (
    SYSTEM_BTB_DOCS_CREDIT,
    SYSTEM_BTB_DOCS_DEBIT,
    SYSTEM_BTB_OPENING_CREDIT,
    SYSTEM_BTB_OPENING_DEBIT,
    SYSTEM_BTB_REALIZE_DEBIT,
    create_system_voucher_from_mapping,
)
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.commercial import (
    BtbLc,
    BtbLcAccounting,
    ExportCase,
    MasterContract,
    ProformaInvoice,
    ProformaInvoiceOrder,
)
from app.models.finance import (
    AccountGroup,
    BankAccount,
    ChartOfAccount,
    CostCenter,
)
from app.models.inventory import PurchaseOrder, Vendor
from app.models.merch import Order
from app.models.customer import Customer
from app.modules.commercial.schemas import (
    BtbLcAccountingResponse,
    BtbLcCreate,
    BtbLcRecordDocumentsAcceptanceBody,
    BtbLcRecordOpeningBody,
    BtbLcRecordRealizationBody,
    BtbLcUpdate,
    BtbLcResponse,
    CustomerForPrint,
    ExportCaseCreate,
    ExportCaseResponse,
    ExportCaseUpdate,
    MasterContractCreate,
    MasterContractUpdate,
    MasterContractResponse,
    IssuedExportProformaOrderIdsResponse,
    ProformaInvoiceCreate,
    ProformaInvoiceForPrint,
    ProformaInvoiceOrderForPrint,
    ProformaInvoiceResponse,
    ProformaInvoiceUpdate,
    ProformaVerifyResponse,
    ShipperBankForPrint,
)

router = APIRouter(prefix="/commercial", tags=["commercial"])

BTB_LC_MAX_UTILIZATION_PERCENT = 70.0


def _compute_btb_warning_band(percent: float | None) -> str | None:
    if percent is None:
        return None
    if percent < 50:
        return "VERY_GOOD"
    if percent < 60:
        return "GOOD"
    if percent < 65:
        return "SATISFACTORY"
    if percent <= 70:
        return "NO_CREDIT"
    return "RED_FLAG"


def _utilization_percent(used: float | None, total: float | None) -> float | None:
    if total is None or total <= 0:
        return None
    return round((used or 0) / total * 100, 2)


def _normalize_master_contract_status(value: str | None) -> str:
    s = (value or "DRAFT").strip().upper()
    if s not in MASTER_CONTRACT_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid master contract status: {value}",
        )
    return s


def _master_contract_to_response(
    r: MasterContract,
    *,
    linked_order_id: int | None = None,
) -> MasterContractResponse:
    amount = float(r.amount) if r.amount is not None else None
    utilized_amount = float(r.btb_utilized_amount) if r.btb_utilized_amount is not None else None
    utilization_pct = _utilization_percent(utilized_amount, amount)
    return MasterContractResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        contract_type=r.contract_type,
        reference=r.reference,
        status=r.status,
        lc_number=getattr(r, "lc_number", None),
        advising_bank=getattr(r, "advising_bank", None),
        advised_at=r.advised_at.isoformat() if getattr(r, "advised_at", None) else None,
        contract_date=r.contract_date.isoformat() if r.contract_date else None,
        amount=amount,
        btb_utilized_amount=utilized_amount,
        currency=r.currency,
        buyer_name=r.buyer_name,
        bank_name=r.bank_name,
        expiry_date=r.expiry_date.isoformat() if r.expiry_date else None,
        cost_center_id=r.cost_center_id,
        btb_utilization_pct=utilization_pct,
        btb_warning_band=_compute_btb_warning_band(utilization_pct),
        linked_order_id=linked_order_id,
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
        order_id=r.order_id,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


async def _linked_order_id_for_master_contract(
    db: AsyncSession, *, tenant_id: int, master_contract_id: int
) -> int | None:
    result = await db.execute(
        select(Order.id).where(
            Order.tenant_id == tenant_id,
            Order.master_contract_id == master_contract_id,
        ).limit(1)
    )
    row = result.first()
    return int(row[0]) if row else None


async def _link_order_to_master_contract(
    db: AsyncSession,
    *,
    tenant: Tenant,
    master_contract_id: int,
    order_id: int,
) -> None:
    from app.modules.orders.pipeline_service import auto_advance_order_pipeline

    ord_row = await db.get(Order, order_id)
    if not ord_row or ord_row.tenant_id != tenant.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order not found",
        )
    ord_row.master_contract_id = master_contract_id
    await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=ord_row.id)


def _order_ids_from_pi(pi: ProformaInvoice) -> list[int]:
    if not pi.proforma_invoice_orders:
        return []
    return [pio.order_id for pio in sorted(pi.proforma_invoice_orders, key=lambda x: x.sort_order)]


async def _validate_proforma_import_rules(
    db: AsyncSession,
    *,
    tenant_id: int,
    direction: str,
    vendor_id: int | None,
    master_contract_id: int | None,
    purchase_order_id: int | None,
    exclude_pi_id: int | None = None,
) -> None:
    """IMPORT requires master contract + purchase order; EXPORT must not send purchase_order_id."""
    d = (direction or "EXPORT").strip().upper()
    if d == "EXPORT":
        if purchase_order_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="purchase_order_id is not allowed for EXPORT proforma",
            )
        return
    if d != "IMPORT":
        return
    if master_contract_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="master_contract_id is required for IMPORT proforma",
        )
    if purchase_order_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="purchase_order_id is required for IMPORT proforma",
        )
    if vendor_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="vendor_id is required for IMPORT proforma",
        )
    contract = await db.get(MasterContract, master_contract_id)
    if not contract or contract.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Master contract not found")
    po = await db.get(PurchaseOrder, purchase_order_id)
    if not po or po.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Purchase order not found")
    if po.vendor_id != vendor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Purchase order does not belong to the selected vendor",
        )
    conflict_stmt = select(ProformaInvoice.id).where(
        ProformaInvoice.tenant_id == tenant_id,
        ProformaInvoice.purchase_order_id == purchase_order_id,
    )
    if exclude_pi_id is not None:
        conflict_stmt = conflict_stmt.where(ProformaInvoice.id != exclude_pi_id)
    conflict = await db.execute(conflict_stmt)
    if conflict.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This purchase order is already linked to another proforma invoice",
        )


async def _sync_order_pipeline_from_proforma(
    db: AsyncSession, *, tenant_id: int, pi: ProformaInvoice
) -> None:
    """Copy master contract link to orders and refresh pipeline milestones."""
    from app.modules.orders.pipeline_service import auto_advance_order_pipeline

    for oid in _order_ids_from_pi(pi):
        order = await db.get(Order, oid)
        if not order or order.tenant_id != tenant_id:
            continue
        if pi.master_contract_id:
            order.master_contract_id = pi.master_contract_id
        await auto_advance_order_pipeline(db, tenant_id=tenant_id, order_id=oid)


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
        purchase_order_id=pi.purchase_order_id,
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


def _btb_lc_to_response(
    r: BtbLc,
    master_cost_center_id: int | None = None,
    accounting: BtbLcAccounting | None = None,
) -> BtbLcResponse:
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
        master_cost_center_id=master_cost_center_id,
        accounting_status=accounting.status if accounting else None,
        lc_open_voucher_id=accounting.lc_open_voucher_id if accounting else None,
        import_bill_voucher_id=accounting.import_bill_voucher_id if accounting else None,
        realization_voucher_id=accounting.realization_voucher_id if accounting else None,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


async def _recompute_master_contract_utilization(db: AsyncSession, master_contract_id: int, tenant_id: int) -> None:
    contract = await db.get(MasterContract, master_contract_id)
    if not contract or contract.tenant_id != tenant_id:
        return
    result = await db.execute(
        select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
            BtbLc.master_contract_id == master_contract_id,
            BtbLc.tenant_id == contract.tenant_id,
        )
    )
    contract.btb_utilized_amount = result.scalar() or 0


async def _enforce_btb_lc_utilization_cap(
    db: AsyncSession,
    tenant_id: int,
    master_contract_id: int,
    candidate_amount: float,
    excluding_btb_lc_id: int | None = None,
) -> None:
    contract = await db.get(MasterContract, master_contract_id)
    if not contract or contract.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Master contract not found")
    if contract.amount is None or float(contract.amount) <= 0:
        raise HTTPException(
            status_code=400,
            detail="Master contract amount must be set before opening BTB LC.",
        )
    total_stmt = select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
        BtbLc.master_contract_id == master_contract_id,
        BtbLc.tenant_id == tenant_id,
    )
    if excluding_btb_lc_id is not None:
        total_stmt = total_stmt.where(BtbLc.id != excluding_btb_lc_id)
    result = await db.execute(total_stmt)
    current_total = float(result.scalar() or 0)
    contract_total = float(contract.amount)
    next_total = current_total + float(candidate_amount)
    max_allowed = contract_total * (BTB_LC_MAX_UTILIZATION_PERCENT / 100)
    if next_total > max_allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"BTB LC opening limit exceeded: max {BTB_LC_MAX_UTILIZATION_PERCENT:.0f}% "
                f"({max_allowed:.2f}) of master contract amount."
            ),
        )


def _btb_lc_accounting_to_response(row: BtbLcAccounting) -> BtbLcAccountingResponse:
    return BtbLcAccountingResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        btb_lc_id=row.btb_lc_id,
        lc_open_voucher_id=row.lc_open_voucher_id,
        import_bill_voucher_id=row.import_bill_voucher_id,
        maturity_date=row.maturity_date.isoformat() if row.maturity_date else None,
        realization_voucher_id=row.realization_voucher_id,
        status=row.status,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


async def _validate_posting_account(
    db: AsyncSession,
    tenant_id: int,
    account_id: int,
) -> ChartOfAccount:
    account = await db.get(ChartOfAccount, account_id)
    if not account or account.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail=f"Account not found: {account_id}")
    if (account.account_type or "posting").lower() == "header":
        raise HTTPException(
            status_code=400,
            detail=f"Posting not allowed to header account: {account.account_number}",
        )
    group = await db.get(AccountGroup, account.group_id)
    if group and group.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Account group not found for this tenant")
    if group and not bool(group.allow_posting):
        raise HTTPException(
            status_code=400,
            detail=f"Posting not allowed to accounts in group '{group.name}'.",
        )
    return account


async def _resolve_btb_realization_payment_account_id(
    db: AsyncSession,
    tenant_id: int,
    lc: BtbLc,
    body_payment_account_id: int | None,
) -> int:
    if body_payment_account_id is not None:
        return body_payment_account_id
    if lc.bank_account_id:
        bank = await db.get(BankAccount, lc.bank_account_id)
        if bank and bank.tenant_id == tenant_id and bank.gl_account_id:
            return int(bank.gl_account_id)
    raise HTTPException(
        status_code=400,
        detail="Provide payment_account_id or link BTB LC to a bank account with GL account (gl_account_id).",
    )


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
        order_id=body.order_id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _export_case_to_response(row)


@router.patch(
    "/export-cases/{case_id}",
    response_model=ExportCaseResponse,
    tags=["export-cases"],
)
async def update_export_case(
    case_id: int,
    body: ExportCaseUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    row = await db.get(ExportCase, case_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export case not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await db.commit()
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
    out: list[MasterContractResponse] = []
    for r in rows:
        lid = await _linked_order_id_for_master_contract(db, tenant_id=tenant.id, master_contract_id=r.id)
        out.append(_master_contract_to_response(r, linked_order_id=lid))
    return out


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
    await _recompute_master_contract_utilization(db, row.id, tenant.id)
    await db.flush()
    lid = await _linked_order_id_for_master_contract(db, tenant_id=tenant.id, master_contract_id=row.id)
    return _master_contract_to_response(row, linked_order_id=lid)


async def _ensure_master_contract_cost_center(
    db: AsyncSession, contract: MasterContract
) -> None:
    """If contract is open/active and has no cost center, create one and link it."""
    if contract.cost_center_id is not None:
        return
    status_upper = (contract.status or "").strip().upper()
    if status_upper not in ("OPEN", "ACTIVE", "CONFIRMED"):
        return
    code = await next_tenant_code(
        db,
        model=CostCenter,
        tenant_id=contract.tenant_id,
        prefix="MC-",
        width=4,
    )
    name = f"Master {contract.reference}"
    if contract.buyer_name:
        name = f"{name} – {contract.buyer_name}"
    cc = CostCenter(
        tenant_id=contract.tenant_id,
        center_code=code,
        name=name[:255],
        department="Trade",
    )
    db.add(cc)
    await db.flush()
    contract.cost_center_id = cc.id


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
        cost_center_id=body.cost_center_id,
        contract_type=(body.contract_type or "EXPORT_LC").strip().upper(),
        reference=body.reference,
        status=_normalize_master_contract_status(body.status),
        lc_number=(body.lc_number or "").strip() or None,
        advising_bank=(body.advising_bank or "").strip() or None,
        advised_at=body.advised_at,
        contract_date=body.contract_date,
        amount=body.amount,
        currency=body.currency,
        buyer_name=body.buyer_name,
        bank_name=body.bank_name,
        expiry_date=body.expiry_date,
    )
    db.add(row)
    await db.flush()
    await _ensure_master_contract_cost_center(db, row)
    await db.flush()
    await db.refresh(row)
    if body.order_id:
        await _link_order_to_master_contract(db, tenant=tenant, master_contract_id=row.id, order_id=body.order_id)
        await db.flush()
    return _master_contract_to_response(
        row,
        linked_order_id=body.order_id
        if body.order_id
        else await _linked_order_id_for_master_contract(db, tenant_id=tenant.id, master_contract_id=row.id),
    )


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
    link_requested = "order_id" in updates
    link_order_id = updates.pop("order_id", None) if link_requested else None
    if "contract_type" in updates and updates["contract_type"] is not None:
        updates["contract_type"] = str(updates["contract_type"]).strip().upper()
    prev_status = (row.status or "").strip().upper()
    if "status" in updates and updates["status"] is not None:
        updates["status"] = _normalize_master_contract_status(str(updates["status"]))
    if "lc_number" in updates and updates["lc_number"] is not None:
        updates["lc_number"] = str(updates["lc_number"]).strip() or None
    if "advising_bank" in updates and updates["advising_bank"] is not None:
        updates["advising_bank"] = str(updates["advising_bank"]).strip() or None
    for key, value in updates.items():
        setattr(row, key, value)
    new_status = (row.status or "").strip().upper()
    if new_status in LC_RECEIVED_OPERATIONAL_STATUSES and new_status != prev_status and row.advised_at is None:
        row.advised_at = datetime.utcnow()
    await _ensure_master_contract_cost_center(db, row)
    await _recompute_master_contract_utilization(db, row.id, tenant.id)
    await db.flush()
    if link_requested and link_order_id is not None:
        await _link_order_to_master_contract(db, tenant=tenant, master_contract_id=row.id, order_id=int(link_order_id))
        await db.flush()
    await db.refresh(row)
    lid = await _linked_order_id_for_master_contract(db, tenant_id=tenant.id, master_contract_id=row.id)
    return _master_contract_to_response(row, linked_order_id=lid)


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
    "/proforma-invoices/issued-export-order-ids",
    response_model=IssuedExportProformaOrderIdsResponse,
    tags=["proforma-invoices"],
)
async def list_issued_export_proforma_order_ids(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Order IDs already linked to an ISSUED EXPORT (customer) proforma — exclude from new PIs."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = (
        select(ProformaInvoiceOrder.order_id)
        .join(ProformaInvoice, ProformaInvoice.id == ProformaInvoiceOrder.proforma_invoice_id)
        .where(
            ProformaInvoice.tenant_id == tenant.id,
            ProformaInvoice.direction == "EXPORT",
            ProformaInvoice.status == "ISSUED",
        )
        .distinct()
    )
    result = await db.execute(stmt)
    ids = sorted({int(r[0]) for r in result.all()})
    return IssuedExportProformaOrderIdsResponse(order_ids=ids)


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
    await _validate_proforma_import_rules(
        db,
        tenant_id=tenant.id,
        direction=direction,
        vendor_id=body.vendor_id,
        master_contract_id=body.master_contract_id,
        purchase_order_id=body.purchase_order_id,
        exclude_pi_id=None,
    )
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
        purchase_order_id=body.purchase_order_id,
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
    await _sync_order_pipeline_from_proforma(db, tenant_id=tenant.id, pi=row)
    await db.flush()
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
    if "purchase_order_id" in update_data and update_data["purchase_order_id"] is not None:
        po = await db.get(PurchaseOrder, int(update_data["purchase_order_id"]))
        if not po or po.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Purchase order not found")
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
    await _validate_proforma_import_rules(
        db,
        tenant_id=tenant.id,
        direction=row.direction,
        vendor_id=row.vendor_id,
        master_contract_id=row.master_contract_id,
        purchase_order_id=row.purchase_order_id,
        exclude_pi_id=row.id,
    )
    if row.direction.strip().upper() == "EXPORT" and len(_order_ids_from_pi(row)) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one order is required for EXPORT proforma",
        )
    await _sync_order_pipeline_from_proforma(db, tenant_id=tenant.id, pi=row)
    await db.flush()
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
    await _validate_proforma_import_rules(
        db,
        tenant_id=tenant.id,
        direction=row.direction,
        vendor_id=row.vendor_id,
        master_contract_id=row.master_contract_id,
        purchase_order_id=row.purchase_order_id,
        exclude_pi_id=row.id,
    )
    if row.direction.strip().upper() == "EXPORT" and len(_order_ids_from_pi(row)) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one order is required for EXPORT proforma",
        )
    row.status = "ISSUED"
    if not row.verification_token:
        row.verification_token = secrets.token_urlsafe(32)
    await db.flush()
    await db.refresh(row)
    await _sync_order_pipeline_from_proforma(db, tenant_id=tenant.id, pi=row)
    await db.flush()
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
    master_ids = {int(r.master_contract_id) for r in rows if r.master_contract_id is not None}
    btb_ids = [int(r.id) for r in rows]
    cost_center_map: dict[int, int | None] = {}
    accounting_map: dict[int, BtbLcAccounting] = {}
    if master_ids:
        contracts_result = await db.execute(
            select(MasterContract.id, MasterContract.cost_center_id).where(
                MasterContract.tenant_id == tenant.id,
                MasterContract.id.in_(master_ids),
            )
        )
        cost_center_map = {int(cid): ccid for cid, ccid in contracts_result.all()}
    if btb_ids:
        accounting_result = await db.execute(
            select(BtbLcAccounting).where(
                BtbLcAccounting.tenant_id == tenant.id,
                BtbLcAccounting.btb_lc_id.in_(btb_ids),
            )
        )
        accounting_rows = accounting_result.scalars().all()
        accounting_map = {int(a.btb_lc_id): a for a in accounting_rows}
    return [
        _btb_lc_to_response(
            r,
            master_cost_center_id=cost_center_map.get(int(r.master_contract_id or 0)),
            accounting=accounting_map.get(int(r.id)),
        )
        for r in rows
    ]


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
    master_cost_center_id: int | None = None
    accounting: BtbLcAccounting | None = None
    if row.master_contract_id is not None:
        contract = await db.get(MasterContract, row.master_contract_id)
        if contract and contract.tenant_id == tenant.id:
            master_cost_center_id = contract.cost_center_id
    acc_result = await db.execute(
        select(BtbLcAccounting).where(
            BtbLcAccounting.tenant_id == tenant.id,
            BtbLcAccounting.btb_lc_id == row.id,
        )
    )
    accounting = acc_result.scalar_one_or_none()
    return _btb_lc_to_response(
        row,
        master_cost_center_id=master_cost_center_id,
        accounting=accounting,
    )


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
    if contract and body.amount is not None:
        await _enforce_btb_lc_utilization_cap(
            db=db,
            tenant_id=tenant.id,
            master_contract_id=contract.id,
            candidate_amount=float(body.amount),
        )
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
    # One accounting lifecycle record per BTB LC (LC open → import bill → realization)
    acc = BtbLcAccounting(
        tenant_id=tenant.id,
        btb_lc_id=row.id,
        maturity_date=body.maturity_date,
        status="OPEN",
    )
    db.add(acc)
    await db.flush()
    if row.master_contract_id is not None:
        await _recompute_master_contract_utilization(db, row.master_contract_id, tenant.id)
    await db.refresh(row)
    master_cost_center_id = contract.cost_center_id if contract else None
    acc_result = await db.execute(
        select(BtbLcAccounting).where(
            BtbLcAccounting.tenant_id == tenant.id,
            BtbLcAccounting.btb_lc_id == row.id,
        )
    )
    accounting = acc_result.scalar_one_or_none()
    return _btb_lc_to_response(
        row,
        master_cost_center_id=master_cost_center_id,
        accounting=accounting,
    )


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
    contract: MasterContract | None = None
    if target_master_id is not None:
        contract = await db.get(MasterContract, int(target_master_id))
        if not contract or contract.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Master contract not found")
        if target_amount is not None:
            await _enforce_btb_lc_utilization_cap(
                db=db,
                tenant_id=tenant.id,
                master_contract_id=contract.id,
                candidate_amount=float(target_amount),
                excluding_btb_lc_id=row.id,
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
    if "maturity_date" in updates:
        acc_result = await db.execute(
            select(BtbLcAccounting).where(
                BtbLcAccounting.tenant_id == tenant.id,
                BtbLcAccounting.btb_lc_id == row.id,
            )
        )
        acc_row = acc_result.scalar_one_or_none()
        if acc_row:
            acc_row.maturity_date = row.maturity_date
    await db.flush()
    if previous_master_id is not None:
        await _recompute_master_contract_utilization(db, previous_master_id, tenant.id)
    if row.master_contract_id is not None and row.master_contract_id != previous_master_id:
        await _recompute_master_contract_utilization(db, row.master_contract_id, tenant.id)
    await db.flush()
    await db.refresh(row)
    master_cost_center_id = contract.cost_center_id if target_master_id is not None and contract else None
    if master_cost_center_id is None and row.master_contract_id is not None:
        current_contract = await db.get(MasterContract, row.master_contract_id)
        if current_contract and current_contract.tenant_id == tenant.id:
            master_cost_center_id = current_contract.cost_center_id
    acc_result = await db.execute(
        select(BtbLcAccounting).where(
            BtbLcAccounting.tenant_id == tenant.id,
            BtbLcAccounting.btb_lc_id == row.id,
        )
    )
    accounting = acc_result.scalar_one_or_none()
    return _btb_lc_to_response(
        row,
        master_cost_center_id=master_cost_center_id,
        accounting=accounting,
    )


@router.get(
    "/btb-lcs/{lc_id}/accounting",
    response_model=BtbLcAccountingResponse,
    tags=["btb-lcs"],
)
async def get_btb_lc_accounting(
    lc_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    lc = await db.get(BtbLc, lc_id)
    if not lc or lc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BTB LC not found")
    row_result = await db.execute(
        select(BtbLcAccounting).where(
            BtbLcAccounting.tenant_id == tenant.id,
            BtbLcAccounting.btb_lc_id == lc_id,
        )
    )
    row = row_result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="BTB LC accounting record not found")
    return _btb_lc_accounting_to_response(row)


@router.post(
    "/btb-lcs/{lc_id}/record-opening",
    response_model=BtbLcAccountingResponse,
    tags=["btb-lcs"],
)
async def record_btb_lc_opening(
    lc_id: int,
    body: BtbLcRecordOpeningBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    lc = await db.get(BtbLc, lc_id)
    if not lc or lc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BTB LC not found")
    if lc.master_contract_id is None:
        raise HTTPException(status_code=400, detail="BTB LC is not linked to a master contract")
    contract = await db.get(MasterContract, lc.master_contract_id)
    if not contract or contract.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Master contract not found")
    await _ensure_master_contract_cost_center(db, contract)
    await db.flush()
    row_result = await db.execute(
        select(BtbLcAccounting).where(
            BtbLcAccounting.tenant_id == tenant.id,
            BtbLcAccounting.btb_lc_id == lc_id,
        )
    )
    acc = row_result.scalar_one_or_none()
    if not acc:
        acc = BtbLcAccounting(tenant_id=tenant.id, btb_lc_id=lc_id, status="OPEN")
        db.add(acc)
        await db.flush()
    if acc.lc_open_voucher_id is not None:
        raise HTTPException(status_code=400, detail="LC opening is already recorded")
    raw_amount = body.amount if body.amount is not None else lc.amount
    amount = float(raw_amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="BTB LC amount must be greater than zero")
    voucher = await create_system_voucher_from_mapping(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_type="LCJ",
        voucher_date=body.voucher_date or lc.open_date or lc.lc_date or date.today(),
        amount=amount,
        debit_system_code=SYSTEM_BTB_OPENING_DEBIT if body.upcoming_lc_liability_account_id is None else None,
        credit_system_code=SYSTEM_BTB_OPENING_CREDIT if body.blocked_credit_facility_account_id is None else None,
        debit_account_id=body.upcoming_lc_liability_account_id,
        credit_account_id=body.blocked_credit_facility_account_id,
        cost_center_id=contract.cost_center_id,
        description=body.description or f"BTB LC opening liability for {lc.reference}",
        reference=body.reference or f"{lc.reference}-OPEN",
        source_module="LC_COMMERCIAL",
        source_module_ref=f"btb_lc:{lc.id}",
        btb_lc_id=lc.id,
    )
    acc.lc_open_voucher_id = voucher.id
    acc.status = "OPEN"
    await db.flush()
    return _btb_lc_accounting_to_response(acc)


@router.post(
    "/btb-lcs/{lc_id}/record-documents-acceptance",
    response_model=BtbLcAccountingResponse,
    tags=["btb-lcs"],
)
async def record_btb_lc_documents_acceptance(
    lc_id: int,
    body: BtbLcRecordDocumentsAcceptanceBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    lc = await db.get(BtbLc, lc_id)
    if not lc or lc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BTB LC not found")
    if lc.master_contract_id is None:
        raise HTTPException(status_code=400, detail="BTB LC is not linked to a master contract")
    contract = await db.get(MasterContract, lc.master_contract_id)
    if not contract or contract.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Master contract not found")
    await _ensure_master_contract_cost_center(db, contract)
    await db.flush()
    row_result = await db.execute(
        select(BtbLcAccounting).where(
            BtbLcAccounting.tenant_id == tenant.id,
            BtbLcAccounting.btb_lc_id == lc_id,
        )
    )
    acc = row_result.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=400, detail="Record opening first before documents acceptance")
    if acc.lc_open_voucher_id is None:
        raise HTTPException(status_code=400, detail="Record opening first before documents acceptance")
    if acc.import_bill_voucher_id is not None:
        raise HTTPException(status_code=400, detail="Documents acceptance is already recorded")
    raw_amount = body.amount if body.amount is not None else lc.maturity_amount or lc.amount
    amount = float(raw_amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Import bill amount must be greater than zero")
    voucher = await create_system_voucher_from_mapping(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_type="LCJ",
        voucher_date=body.voucher_date or date.today(),
        amount=amount,
        debit_system_code=SYSTEM_BTB_DOCS_DEBIT if body.lc_liability_account_id is None else None,
        credit_system_code=SYSTEM_BTB_DOCS_CREDIT if body.import_bill_liability_account_id is None else None,
        debit_account_id=body.lc_liability_account_id,
        credit_account_id=body.import_bill_liability_account_id,
        cost_center_id=contract.cost_center_id,
        description=body.description or f"BTB LC documents acceptance for {lc.reference}",
        reference=body.reference or f"{lc.reference}-DOCS",
        source_module="LC_COMMERCIAL",
        source_module_ref=f"btb_lc:{lc.id}",
        btb_lc_id=lc.id,
    )
    if body.maturity_date is not None:
        lc.maturity_date = body.maturity_date
        acc.maturity_date = body.maturity_date
    elif lc.maturity_date is not None:
        acc.maturity_date = lc.maturity_date
    acc.import_bill_voucher_id = voucher.id
    acc.status = "DOCUMENTS_ACCEPTED"
    await db.flush()
    return _btb_lc_accounting_to_response(acc)


@router.post(
    "/btb-lcs/{lc_id}/record-realization",
    response_model=BtbLcAccountingResponse,
    tags=["btb-lcs"],
)
async def record_btb_lc_realization(
    lc_id: int,
    body: BtbLcRecordRealizationBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    lc = await db.get(BtbLc, lc_id)
    if not lc or lc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BTB LC not found")
    if lc.master_contract_id is None:
        raise HTTPException(status_code=400, detail="BTB LC is not linked to a master contract")
    contract = await db.get(MasterContract, lc.master_contract_id)
    if not contract or contract.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Master contract not found")
    await _ensure_master_contract_cost_center(db, contract)
    await db.flush()
    row_result = await db.execute(
        select(BtbLcAccounting).where(
            BtbLcAccounting.tenant_id == tenant.id,
            BtbLcAccounting.btb_lc_id == lc_id,
        )
    )
    acc = row_result.scalar_one_or_none()
    if not acc or acc.import_bill_voucher_id is None:
        raise HTTPException(status_code=400, detail="Record documents acceptance before realization")
    if acc.realization_voucher_id is not None:
        raise HTTPException(status_code=400, detail="Realization is already recorded")
    raw_amount = body.amount if body.amount is not None else lc.maturity_amount or lc.amount
    amount = float(raw_amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Realization amount must be greater than zero")
    payment_gl_id = await _resolve_btb_realization_payment_account_id(
        db, tenant.id, lc, body.payment_account_id
    )
    voucher = await create_system_voucher_from_mapping(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_type="LCJ",
        voucher_date=body.voucher_date or acc.maturity_date or lc.maturity_date or date.today(),
        amount=amount,
        debit_system_code=SYSTEM_BTB_REALIZE_DEBIT if body.import_bill_liability_account_id is None else None,
        credit_system_code=None,
        debit_account_id=body.import_bill_liability_account_id,
        credit_account_id=payment_gl_id,
        cost_center_id=contract.cost_center_id,
        description=body.description or f"BTB LC realization for {lc.reference}",
        reference=body.reference or f"{lc.reference}-REALIZED",
        source_module="LC_COMMERCIAL",
        source_module_ref=f"btb_lc:{lc.id}",
        btb_lc_id=lc.id,
    )
    acc.realization_voucher_id = voucher.id
    acc.status = "REALIZED"
    lc.status = "CLOSED"
    await db.flush()
    return _btb_lc_accounting_to_response(acc)
