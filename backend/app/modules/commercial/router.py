"""Commercial API: export cases, proforma invoices, BTB LCs."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.commercial import BtbLc, ExportCase, ProformaInvoice
from app.modules.commercial.schemas import (
    BtbLcCreate,
    BtbLcResponse,
    ExportCaseCreate,
    ExportCaseResponse,
    ProformaInvoiceCreate,
    ProformaInvoiceResponse,
)

router = APIRouter(prefix="/commercial", tags=["commercial"])


def _export_case_to_response(r: ExportCase) -> ExportCaseResponse:
    return ExportCaseResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        reference=r.reference,
        status=r.status,
        case_date=r.case_date.isoformat() if r.case_date else None,
        amount=float(r.amount) if r.amount is not None else None,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


def _proforma_invoice_to_response(r: ProformaInvoice) -> ProformaInvoiceResponse:
    return ProformaInvoiceResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        reference=r.reference,
        status=r.status,
        invoice_date=r.invoice_date.isoformat() if r.invoice_date else None,
        amount=float(r.amount) if r.amount is not None else None,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


def _btb_lc_to_response(r: BtbLc) -> BtbLcResponse:
    return BtbLcResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        reference=r.reference,
        status=r.status,
        lc_date=r.lc_date.isoformat() if r.lc_date else None,
        amount=float(r.amount) if r.amount is not None else None,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


# ---------- Export cases ----------
@router.get("/export-cases", response_model=list[ExportCaseResponse], tags=["export-cases"])
async def list_export_cases(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
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
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _export_case_to_response(row)


# ---------- Proforma invoices ----------
@router.get(
    "/proforma-invoices",
    response_model=list[ProformaInvoiceResponse],
    tags=["proforma-invoices"],
)
async def list_proforma_invoices(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(ProformaInvoice).where(ProformaInvoice.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(ProformaInvoice.status == status_filter)
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
    row = await db.get(ProformaInvoice, invoice_id)
    if not row or row.tenant_id != tenant.id:
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
    row = ProformaInvoice(
        tenant_id=tenant.id,
        reference=body.reference,
        status=body.status or "DRAFT",
        invoice_date=body.invoice_date,
        amount=body.amount,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _proforma_invoice_to_response(row)


# ---------- BTB LCs ----------
@router.get("/btb-lcs", response_model=list[BtbLcResponse], tags=["btb-lcs"])
async def list_btb_lcs(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
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
    row = BtbLc(
        tenant_id=tenant.id,
        reference=body.reference,
        status=body.status or "DRAFT",
        lc_date=body.lc_date,
        amount=body.amount,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _btb_lc_to_response(row)
