"""HTTP API for inbound Job Work (CMT)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import get_user_role_for_tenant
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.job_work import billing_service, close_service, contract_service, delivery_service, materials_service
from app.modules.job_work.access import (
    assert_bill,
    assert_close,
    assert_manage,
    assert_view,
    require_flag,
)
from app.modules.job_work.schemas import (
    BillCreate,
    BillOut,
    CloseReport,
    ContractCreate,
    ContractDetail,
    ContractListItem,
    ContractUpdate,
    DeliveryCreate,
    DeliveryOut,
    LedgerOut,
    MaterialMovementIn,
    ProduceIn,
    ReceiptCreate,
    ReceiptOut,
)

router = APIRouter(prefix="/job-work", tags=["job-work"])


async def _ctx(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    require_flag(tenant)
    role = await get_user_role_for_tenant(db, user, tenant.id)
    return db, tenant, user, role


@router.get("/contracts", response_model=list[ContractListItem])
async def list_contracts(
    response: Response,
    status: str | None = None,
    q: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ctx=Depends(_ctx),
):
    db, tenant, _user, role = ctx
    assert_view(role)
    total, rows = await contract_service.list_contracts(
        db, tenant, status=status, q=q, limit=limit, offset=offset
    )
    response.headers["X-Total-Count"] = str(total)
    return rows


@router.post("/contracts", response_model=ContractDetail, status_code=201)
async def create_contract(body: ContractCreate, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await contract_service.create_contract(db, tenant, user, body)


@router.get("/contracts/{contract_id}", response_model=ContractDetail)
async def get_contract(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, _user, role = ctx
    assert_view(role)
    return await contract_service.get_detail(db, tenant, contract_id)


@router.put("/contracts/{contract_id}", response_model=ContractDetail)
async def update_contract(contract_id: int, body: ContractUpdate, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await contract_service.update_contract(db, tenant, user, contract_id, body)


@router.post("/contracts/{contract_id}/confirm", response_model=ContractDetail)
async def confirm_contract(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await contract_service.confirm_contract(db, tenant, user, contract_id)


@router.post("/contracts/{contract_id}/materials/receive", response_model=ContractDetail)
async def receive_material(contract_id: int, body: MaterialMovementIn, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await materials_service.receive_material(db, tenant, user, contract_id, body)


@router.post("/contracts/{contract_id}/materials/consume", response_model=ContractDetail)
async def consume_material(contract_id: int, body: MaterialMovementIn, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await materials_service.consume_material(db, tenant, user, contract_id, body)


@router.post("/contracts/{contract_id}/materials/return", response_model=ContractDetail)
async def return_material(contract_id: int, body: MaterialMovementIn, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await materials_service.return_material(db, tenant, user, contract_id, body)


@router.get("/contracts/{contract_id}/materials/ledger", response_model=list[LedgerOut])
async def material_ledger(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, _user, role = ctx
    assert_view(role)
    return await materials_service.list_ledger(db, tenant, contract_id)


@router.post("/contracts/{contract_id}/produce", response_model=ContractDetail)
async def produce(contract_id: int, body: ProduceIn, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await delivery_service.update_produced(db, tenant, user, contract_id, body)


@router.post("/contracts/{contract_id}/deliveries", response_model=DeliveryOut, status_code=201)
async def create_delivery(contract_id: int, body: DeliveryCreate, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_manage(role)
    return await delivery_service.create_delivery(db, tenant, user, contract_id, body)


@router.get("/contracts/{contract_id}/deliveries", response_model=list[DeliveryOut])
async def list_deliveries(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, _user, role = ctx
    assert_view(role)
    return await delivery_service.list_deliveries(db, tenant, contract_id)


@router.get("/contracts/{contract_id}/deliveries/{delivery_id}/print")
async def print_delivery(contract_id: int, delivery_id: int, ctx=Depends(_ctx)):
    db, tenant, _user, role = ctx
    assert_view(role)
    return await delivery_service.delivery_print_payload(db, tenant, contract_id, delivery_id)


@router.post("/contracts/{contract_id}/bills", response_model=BillOut, status_code=201)
async def create_bill(contract_id: int, body: BillCreate, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_bill(role)
    return await billing_service.create_bill(db, tenant, user, contract_id, body)


@router.get("/contracts/{contract_id}/bills", response_model=list[BillOut])
async def list_bills(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, _user, role = ctx
    assert_view(role)
    return await billing_service.list_bills(db, tenant, contract_id)


@router.post("/contracts/{contract_id}/bills/{bill_id}/cancel", response_model=BillOut)
async def cancel_bill(contract_id: int, bill_id: int, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_bill(role)
    return await billing_service.cancel_bill(db, tenant, user, contract_id, bill_id)


@router.post("/contracts/{contract_id}/receipts", response_model=ReceiptOut, status_code=201)
async def create_receipt(contract_id: int, body: ReceiptCreate, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_bill(role)
    return await billing_service.create_receipt(db, tenant, user, contract_id, body)


@router.get("/contracts/{contract_id}/receipts", response_model=list[ReceiptOut])
async def list_receipts(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, _user, role = ctx
    assert_view(role)
    return await billing_service.list_receipts(db, tenant, contract_id)


@router.get("/contracts/{contract_id}/close-preview", response_model=CloseReport)
async def close_preview(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, _user, role = ctx
    assert_view(role)
    return await close_service.close_preview(db, tenant, contract_id)


@router.post("/contracts/{contract_id}/close", response_model=ContractDetail)
async def close_contract(contract_id: int, ctx=Depends(_ctx)):
    db, tenant, user, role = ctx
    assert_close(role)
    return await close_service.close_contract(db, tenant, user, contract_id)
