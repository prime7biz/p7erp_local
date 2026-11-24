"""Phase 5: job-work bond transfers (qty only — no FIFO / inventory GL / BondedWarehouseEntry)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import (
    is_inbound_job_work_v1_enabled,
    is_material_physical_v1_enabled,
)
from app.database import safe_async_session_rollback
from app.models.job_work import JobWorkContract, JobWorkMaterial
from app.models.material_control_alloc import JobWorkBondTransfer, JobWorkBondTransferLine
from app.models.tenant import Tenant


def require_bond_flags(tenant: Tenant) -> None:
    flags = tenant.feature_flags
    if not (is_material_physical_v1_enabled(flags) and is_inbound_job_work_v1_enabled(flags)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _find_bond_by_request(
    db: AsyncSession, *, tenant_id: int, request_id: str
) -> JobWorkBondTransfer | None:
    return (
        await db.execute(
            select(JobWorkBondTransfer)
            .where(
                JobWorkBondTransfer.tenant_id == tenant_id,
                JobWorkBondTransfer.request_id == request_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


async def create_bond_transfer(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    contract_id: int,
    lines: list[dict[str, Any]],
    request_id: str | None = None,
    notes: str | None = None,
) -> JobWorkBondTransfer:
    require_bond_flags(tenant)
    if not lines:
        raise HTTPException(status_code=400, detail="At least one line is required")

    if request_id:
        existing = await _find_bond_by_request(db, tenant_id=tenant.id, request_id=request_id)
        if existing is not None:
            return existing

    try:
        contract = await ensure_owned(
            db, JobWorkContract, contract_id, tenant.id, "Job work contract", status_code=404
        )
        assert contract is not None

        transfer_no = await next_tenant_code(
            db, model=JobWorkBondTransfer, tenant_id=tenant.id, prefix="JWB-", width=4
        )
        header = JobWorkBondTransfer(
            tenant_id=tenant.id,
            transfer_no=transfer_no,
            contract_id=contract.id,
            status="POSTED",
            notes=notes,
            request_id=request_id,
            created_by_user_id=user_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(header)
        try:
            await db.flush()
        except IntegrityError:
            await safe_async_session_rollback(db)
            if request_id:
                existing = await _find_bond_by_request(db, tenant_id=tenant.id, request_id=request_id)
                if existing is not None:
                    return existing
            raise

        for raw in lines:
            material_id = int(raw["material_id"])
            qty = Decimal(str(raw["qty"]))
            if qty <= 0:
                raise HTTPException(status_code=400, detail="line qty must be positive")
            material = await ensure_owned(
                db, JobWorkMaterial, material_id, tenant.id, "Job work material", status_code=404
            )
            assert material is not None
            if material.contract_id != contract.id:
                raise HTTPException(status_code=400, detail="Material does not belong to contract")
            db.add(
                JobWorkBondTransferLine(
                    tenant_id=tenant.id,
                    transfer_id=header.id,
                    material_id=material.id,
                    item_id=material.item_id,
                    qty=qty,
                    notes=raw.get("notes"),
                    created_at=datetime.utcnow(),
                )
            )
        await db.flush()
        return header
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


def bond_to_dict(row: JobWorkBondTransfer) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "transfer_no": row.transfer_no,
        "contract_id": row.contract_id,
        "status": row.status,
        "request_id": row.request_id,
    }
