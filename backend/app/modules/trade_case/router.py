"""Trade Case API: integrated export/import case workflow."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AlertInstance,
    BtbLc,
    Customer,
    MasterContract,
    Order,
    OrderFollowupAction,
    ProformaInvoice,
    PurchaseOrder,
    Tenant,
    TradeCase,
    TradeCaseStage,
    TradeCaseStageLog,
    TradeDocument,
    User,
    Vendor,
)
from app.modules.audit.service import log_action
from app.modules.trade_case.schemas import (
    TradeCaseCreate,
    TradeCaseDashboardResponse,
    TradeCaseMarginResponse,
    TradeCaseResponse,
    TradeCaseStageCreate,
    TradeCaseStageLogResponse,
    TradeCaseStageResponse,
    TradeCaseTransition,
    TradeCaseUpdate,
)

router = APIRouter(prefix="/trade-cases", tags=["trade-cases"])

TRADE_DOCS_DIR = Path(__file__).resolve().parents[3] / "media" / "trade_docs"
TRADE_DOCS_DIR.mkdir(parents=True, exist_ok=True)


DEFAULT_STAGE_FLOW = [
    ("DRAFT", "Draft", 10, [], ["COMMERCIAL"]),
    ("COMMERCIAL", "Commercial Ready", 20, ["PI"], ["LC_OPEN", "BOOKING"]),
    ("LC_OPEN", "LC Open", 30, ["LC"], ["BOOKING"]),
    ("BOOKING", "Shipment Booking", 40, ["BOOKING_CONFIRM"], ["DOCS"]),
    ("DOCS", "Documents Complete", 50, ["BL", "INVOICE", "PACKING_LIST"], ["SHIPPED"]),
    ("SHIPPED", "Shipped", 60, [], ["SETTLED"]),
    ("SETTLED", "Settled", 70, [], []),
]


def _trade_case_to_response(row: TradeCase) -> TradeCaseResponse:
    return TradeCaseResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        direction=row.direction,
        reference=row.reference,
        status=row.status,
        current_stage=row.current_stage,
        order_id=row.order_id,
        customer_id=row.customer_id,
        vendor_id=row.vendor_id,
        proforma_invoice_id=row.proforma_invoice_id,
        master_contract_id=row.master_contract_id,
        btb_lc_id=row.btb_lc_id,
        etd=row.etd.isoformat() if row.etd else None,
        eta=row.eta.isoformat() if row.eta else None,
        amount=float(row.amount) if row.amount is not None else None,
        currency=row.currency,
        cost_amount=float(row.cost_amount) if row.cost_amount is not None else None,
        margin_amount=float(row.margin_amount) if row.margin_amount is not None else None,
        margin_pct=float(row.margin_pct) if row.margin_pct is not None else None,
        closed_at=row.closed_at.isoformat() if row.closed_at else None,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


async def _ensure_tenant_user(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _ensure_default_stages(db: AsyncSession, tenant_id: int) -> None:
    existing = await db.execute(
        select(func.count()).select_from(TradeCaseStage).where(TradeCaseStage.tenant_id == tenant_id)
    )
    if (existing.scalar() or 0) > 0:
        return
    for key, name, sort_order, required_docs, next_keys in DEFAULT_STAGE_FLOW:
        db.add(
            TradeCaseStage(
                tenant_id=tenant_id,
                stage_key=key,
                name=name,
                sort_order=sort_order,
                required_doc_types=required_docs,
                next_stage_keys=next_keys,
                is_active=True,
            )
        )
    await db.flush()


async def _validate_trade_case_links(db: AsyncSession, tenant_id: int, payload: dict) -> None:
    order_id = payload.get("order_id")
    if order_id is not None:
        row = await db.get(Order, int(order_id))
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Order not found")
    customer_id = payload.get("customer_id")
    if customer_id is not None:
        row = await db.get(Customer, int(customer_id))
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Customer not found")
    vendor_id = payload.get("vendor_id")
    if vendor_id is not None:
        row = await db.get(Vendor, int(vendor_id))
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Vendor not found")
    proforma_invoice_id = payload.get("proforma_invoice_id")
    if proforma_invoice_id is not None:
        row = await db.get(ProformaInvoice, int(proforma_invoice_id))
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Proforma invoice not found")
    master_contract_id = payload.get("master_contract_id")
    if master_contract_id is not None:
        row = await db.get(MasterContract, int(master_contract_id))
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Master contract not found")
    btb_lc_id = payload.get("btb_lc_id")
    if btb_lc_id is not None:
        row = await db.get(BtbLc, int(btb_lc_id))
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="BTB LC not found")


@router.get("", response_model=list[TradeCaseResponse])
async def list_trade_cases(
    status_filter: str | None = Query(default=None, alias="status"),
    direction: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    stmt = select(TradeCase).where(TradeCase.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(TradeCase.status == status_filter.strip().upper())
    if direction:
        stmt = stmt.where(TradeCase.direction == direction.strip().upper())
    if search:
        pattern = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(TradeCase.reference).like(pattern),
                func.lower(TradeCase.status).like(pattern),
                func.lower(TradeCase.current_stage).like(pattern),
            )
        )
    result = await db.execute(
        stmt.order_by(TradeCase.created_at.desc()).limit(limit).offset(offset)
    )
    return [_trade_case_to_response(row) for row in result.scalars().all()]


@router.post("", response_model=TradeCaseResponse, status_code=status.HTTP_201_CREATED)
async def create_trade_case(
    body: TradeCaseCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    await _ensure_default_stages(db, tenant.id)
    payload = body.model_dump()
    payload["direction"] = str(payload.get("direction") or "EXPORT").strip().upper()
    payload["status"] = str(payload.get("status") or "DRAFT").strip().upper()
    payload["current_stage"] = str(payload.get("current_stage") or "DRAFT").strip().upper()
    await _validate_trade_case_links(db, tenant.id, payload)
    row = TradeCase(tenant_id=tenant.id, **payload)
    db.add(row)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="TRADE_CASE_CREATE",
        resource="trade.case",
        details=f"Created trade case {row.reference}",
    )
    await db.refresh(row)
    return _trade_case_to_response(row)


@router.get("/{trade_case_id}", response_model=TradeCaseResponse)
async def get_trade_case(
    trade_case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    row = await db.get(TradeCase, trade_case_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Trade case not found")
    return _trade_case_to_response(row)


@router.patch("/{trade_case_id}", response_model=TradeCaseResponse)
async def update_trade_case(
    trade_case_id: int,
    body: TradeCaseUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    row = await db.get(TradeCase, trade_case_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Trade case not found")
    updates = body.model_dump(exclude_unset=True)
    if "direction" in updates and updates["direction"] is not None:
        updates["direction"] = str(updates["direction"]).strip().upper()
    if "status" in updates and updates["status"] is not None:
        updates["status"] = str(updates["status"]).strip().upper()
    if "current_stage" in updates and updates["current_stage"] is not None:
        updates["current_stage"] = str(updates["current_stage"]).strip().upper()
    await _validate_trade_case_links(db, tenant.id, updates)
    for key, value in updates.items():
        setattr(row, key, value)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="TRADE_CASE_UPDATE",
        resource="trade.case",
        details=f"Updated trade case {row.reference}",
    )
    await db.refresh(row)
    return _trade_case_to_response(row)


@router.get("/{trade_case_id}/stages", response_model=list[TradeCaseStageResponse])
async def list_trade_case_stages(
    trade_case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    row = await db.get(TradeCase, trade_case_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Trade case not found")
    await _ensure_default_stages(db, tenant.id)
    result = await db.execute(
        select(TradeCaseStage)
        .where(TradeCaseStage.tenant_id == tenant.id, TradeCaseStage.is_active == True)
        .order_by(TradeCaseStage.sort_order.asc(), TradeCaseStage.id.asc())
    )
    return result.scalars().all()


@router.post("/stages", response_model=TradeCaseStageResponse, status_code=status.HTTP_201_CREATED)
async def create_trade_case_stage(
    body: TradeCaseStageCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    row = TradeCaseStage(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="TRADE_STAGE_CREATE",
        resource="trade.stage",
        details=f"Created stage {row.stage_key}",
    )
    await db.refresh(row)
    return row


@router.get("/{trade_case_id}/stage-log", response_model=list[TradeCaseStageLogResponse])
async def list_trade_case_stage_log(
    trade_case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    result = await db.execute(
        select(TradeCaseStageLog)
        .where(
            TradeCaseStageLog.tenant_id == tenant.id,
            TradeCaseStageLog.trade_case_id == trade_case_id,
        )
        .order_by(TradeCaseStageLog.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{trade_case_id}/transition", response_model=TradeCaseResponse)
async def transition_trade_case(
    trade_case_id: int,
    body: TradeCaseTransition,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    row = await db.get(TradeCase, trade_case_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Trade case not found")

    await _ensure_default_stages(db, tenant.id)
    target_stage = body.to_stage.strip().upper()
    stage_result = await db.execute(
        select(TradeCaseStage).where(
            TradeCaseStage.tenant_id == tenant.id,
            TradeCaseStage.stage_key == target_stage,
            TradeCaseStage.is_active == True,
        )
    )
    stage = stage_result.scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=400, detail="Target stage not configured")

    current_stage = row.current_stage or "DRAFT"
    if current_stage != target_stage:
        current_result = await db.execute(
            select(TradeCaseStage).where(
                TradeCaseStage.tenant_id == tenant.id,
                TradeCaseStage.stage_key == current_stage,
            )
        )
        current_stage_row = current_result.scalar_one_or_none()
        allowed = set(current_stage_row.next_stage_keys or []) if current_stage_row else set()
        if allowed and target_stage not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid stage transition: {current_stage} -> {target_stage}")

    required_doc_types = [str(x).upper() for x in (stage.required_doc_types or [])]
    if required_doc_types:
        docs_result = await db.execute(
            select(TradeDocument.document_type).where(
                TradeDocument.tenant_id == tenant.id,
                TradeDocument.trade_case_id == row.id,
            )
        )
        doc_types = {str(x).upper() for x in docs_result.scalars().all()}
        missing = [t for t in required_doc_types if t not in doc_types]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required documents for {target_stage}: {', '.join(missing)}",
            )

    previous_stage = row.current_stage
    row.current_stage = target_stage
    row.status = target_stage
    if target_stage == "SETTLED":
        row.closed_at = datetime.utcnow()
    db.add(
        TradeCaseStageLog(
            tenant_id=tenant.id,
            trade_case_id=row.id,
            from_stage=previous_stage,
            to_stage=target_stage,
            user_id=user.id,
            notes=body.notes,
        )
    )
    await db.flush()
    # Phase E: when moving to SHIPPED or DOCS, create a follow-up for "Confirm settlement" if order linked
    if target_stage in ("SHIPPED", "DOCS") and row.order_id is not None:
        existing = await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.tenant_id == tenant.id,
                OrderFollowupAction.order_id == row.order_id,
                OrderFollowupAction.external_id == row.id,
            )
        )
        if existing.scalar_one_or_none() is None:
            db.add(
                OrderFollowupAction(
                    tenant_id=tenant.id,
                    order_id=row.order_id,
                    phase="TRADE",
                    title="Confirm settlement / Close trade case",
                    description=f"Trade case {row.reference} reached {target_stage}. Confirm settlement and close case.",
                    is_template_generated=False,
                    is_mandatory=False,
                    is_active=True,
                    status="pending",
                    external_id=row.id,
                )
            )
            await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="TRADE_CASE_TRANSITION",
        resource="trade.case",
        details=f"Transitioned trade case {row.reference}: {previous_stage} -> {target_stage}",
    )
    await db.refresh(row)
    return _trade_case_to_response(row)


@router.post("/{trade_case_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_trade_document(
    trade_case_id: int,
    document_type: str = Form(...),
    shipment_id: int | None = Form(default=None),
    linked_entity_type: str | None = Form(default=None),
    linked_entity_id: int | None = Form(default=None),
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    trade_case = await db.get(TradeCase, trade_case_id)
    if not trade_case or trade_case.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Trade case not found")

    ext = Path(file.filename or "").suffix
    safe_name = f"{tenant.id}_{trade_case_id}_{uuid4().hex}{ext}"
    full_path = TRADE_DOCS_DIR / safe_name
    content = await file.read()
    full_path.write_bytes(content)

    version_result = await db.execute(
        select(func.count()).select_from(TradeDocument).where(
            TradeDocument.tenant_id == tenant.id,
            TradeDocument.trade_case_id == trade_case_id,
            TradeDocument.document_type == document_type.strip().upper(),
        )
    )
    version = int(version_result.scalar() or 0) + 1

    row = TradeDocument(
        tenant_id=tenant.id,
        trade_case_id=trade_case_id,
        shipment_id=shipment_id,
        document_type=document_type.strip().upper(),
        file_name=file.filename or safe_name,
        storage_path=str(full_path),
        version=version,
        linked_entity_type=linked_entity_type,
        linked_entity_id=linked_entity_id,
        uploaded_by_id=user.id,
    )
    db.add(row)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="TRADE_DOCUMENT_UPLOAD",
        resource="trade.document",
        details=f"Uploaded {row.document_type} for trade case {trade_case.reference}",
    )
    return {
        "id": row.id,
        "trade_case_id": row.trade_case_id,
        "document_type": row.document_type,
        "file_name": row.file_name,
        "version": row.version,
        "created_at": row.created_at.isoformat(),
    }


@router.get("/{trade_case_id}/documents")
async def list_trade_documents(
    trade_case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    result = await db.execute(
        select(TradeDocument)
        .where(
            TradeDocument.tenant_id == tenant.id,
            TradeDocument.trade_case_id == trade_case_id,
        )
        .order_by(TradeDocument.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": row.id,
            "trade_case_id": row.trade_case_id,
            "shipment_id": row.shipment_id,
            "document_type": row.document_type,
            "file_name": row.file_name,
            "storage_path": row.storage_path,
            "version": row.version,
            "linked_entity_type": row.linked_entity_type,
            "linked_entity_id": row.linked_entity_id,
            "uploaded_by_id": row.uploaded_by_id,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.get("/{trade_case_id}/documents/{document_id}/download")
async def download_trade_document(
    trade_case_id: int,
    document_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    row = await db.get(TradeDocument, document_id)
    if (
        not row
        or row.tenant_id != tenant.id
        or row.trade_case_id != trade_case_id
    ):
        raise HTTPException(status_code=404, detail="Document not found")
    full_path = Path(row.storage_path).resolve()
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path=str(full_path), filename=row.file_name)


@router.get("/{trade_case_id}/margin", response_model=TradeCaseMarginResponse)
async def get_trade_case_margin(
    trade_case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    trade_case = await db.get(TradeCase, trade_case_id)
    if not trade_case or trade_case.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Trade case not found")

    amount = float(trade_case.amount) if trade_case.amount is not None else None
    if amount is None and trade_case.proforma_invoice_id:
        pi = await db.get(ProformaInvoice, trade_case.proforma_invoice_id)
        if pi and pi.tenant_id == tenant.id and pi.amount is not None:
            amount = float(pi.amount)

    estimated_cost: float | None = None
    if trade_case.btb_lc_id:
        po_result = await db.execute(
            select(func.coalesce(func.sum(PurchaseOrder.base_total_amount), 0)).where(
                PurchaseOrder.tenant_id == tenant.id,
                PurchaseOrder.btb_lc_id == trade_case.btb_lc_id,
            )
        )
        estimated_cost = float(po_result.scalar() or 0)
    elif trade_case.vendor_id is not None:
        po_result = await db.execute(
            select(func.coalesce(func.sum(PurchaseOrder.base_total_amount), 0)).where(
                PurchaseOrder.tenant_id == tenant.id,
                PurchaseOrder.vendor_id == trade_case.vendor_id,
                or_(PurchaseOrder.status == "APPROVED", PurchaseOrder.status == "RECEIVED"),
            )
        )
        estimated_cost = float(po_result.scalar() or 0)

    margin_amount = None
    margin_pct = None
    if amount is not None and estimated_cost is not None:
        margin_amount = amount - estimated_cost
        if amount > 0:
            margin_pct = (margin_amount / amount) * 100

    return TradeCaseMarginResponse(
        trade_case_id=trade_case.id,
        amount=amount,
        estimated_cost=estimated_cost,
        margin_amount=margin_amount,
        margin_pct=margin_pct,
        currency=trade_case.currency,
    )


@router.get("/dashboard/summary", response_model=TradeCaseDashboardResponse)
async def get_trade_dashboard_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tenant_user(user, tenant)
    total_result = await db.execute(
        select(func.count()).select_from(TradeCase).where(TradeCase.tenant_id == tenant.id)
    )
    total_cases = int(total_result.scalar() or 0)

    open_result = await db.execute(
        select(func.count()).select_from(TradeCase).where(
            TradeCase.tenant_id == tenant.id,
            TradeCase.current_stage.notin_(("SETTLED",)),
        )
    )
    shipped_result = await db.execute(
        select(func.count()).select_from(TradeCase).where(
            TradeCase.tenant_id == tenant.id,
            TradeCase.current_stage == "SHIPPED",
        )
    )
    settled_result = await db.execute(
        select(func.count()).select_from(TradeCase).where(
            TradeCase.tenant_id == tenant.id,
            TradeCase.current_stage == "SETTLED",
        )
    )

    missing_docs_result = await db.execute(
        select(func.count()).select_from(TradeCase).where(
            TradeCase.tenant_id == tenant.id,
            TradeCase.current_stage.in_(("COMMERCIAL", "LC_OPEN", "BOOKING", "DOCS")),
            ~TradeCase.id.in_(
                select(TradeDocument.trade_case_id).where(TradeDocument.tenant_id == tenant.id)
            ),
        )
    )

    overdue_shipments_result = await db.execute(
        select(func.count()).select_from(AlertInstance).where(
            AlertInstance.tenant_id == tenant.id,
            AlertInstance.alert_type == "trade_shipment_delayed",
            AlertInstance.status.in_(("new", "acknowledged", "in_progress", "snoozed", "escalated")),
        )
    )
    risk_result = await db.execute(
        select(TradeCase.id)
        .where(TradeCase.tenant_id == tenant.id)
        .order_by(TradeCase.updated_at.asc())
        .limit(10)
    )
    return TradeCaseDashboardResponse(
        total_cases=total_cases,
        open_cases=int(open_result.scalar() or 0),
        shipped_cases=int(shipped_result.scalar() or 0),
        settled_cases=int(settled_result.scalar() or 0),
        missing_docs_cases=int(missing_docs_result.scalar() or 0),
        overdue_shipments=int(overdue_shipments_result.scalar() or 0),
        at_risk_case_ids=[int(r[0]) for r in risk_result.all()],
    )
