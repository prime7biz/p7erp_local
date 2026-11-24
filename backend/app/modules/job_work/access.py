"""Feature flag and permission gates for inbound job work."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import (
    explicit_permission_granted,
    soft_permission_denied,
)
from app.common.tenant_feature_keys import is_inbound_job_work_v1_enabled
from app.models import Role, Tenant, User
from app.models.job_work import JobWorkContract

PERMISSION_JOB_WORK_VIEW = "job_work.view"
PERMISSION_JOB_WORK_MANAGE = "job_work.manage"
PERMISSION_JOB_WORK_BILL = "job_work.bill"
PERMISSION_JOB_WORK_CLOSE = "job_work.close"


def require_flag(tenant: Tenant) -> None:
    if not is_inbound_job_work_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inbound Job Work is disabled")


def assert_view(role: Role | None) -> None:
    if soft_permission_denied(role=role, permission_key=PERMISSION_JOB_WORK_VIEW):
        raise HTTPException(status_code=403, detail="Not allowed to view job work")


def assert_manage(role: Role | None) -> None:
    if soft_permission_denied(role=role, permission_key=PERMISSION_JOB_WORK_MANAGE):
        raise HTTPException(status_code=403, detail="Not allowed to manage job work")


def _is_admin_or_manager(role: Role | None) -> bool:
    name = (role.name or "").strip().lower() if role else ""
    return name in {"admin", "manager"}


def assert_bill(role: Role | None) -> None:
    """Fail-closed money action: admin/manager or explicit job_work.bill=true."""
    if _is_admin_or_manager(role):
        return
    if explicit_permission_granted(role=role, permission_key=PERMISSION_JOB_WORK_BILL):
        return
    raise HTTPException(status_code=403, detail="Not allowed to bill job work")


def assert_close(role: Role | None) -> None:
    if _is_admin_or_manager(role):
        return
    if explicit_permission_granted(role=role, permission_key=PERMISSION_JOB_WORK_CLOSE):
        return
    raise HTTPException(status_code=403, detail="Not allowed to close job work")


async def get_contract_for_tenant(
    db: AsyncSession,
    *,
    tenant_id: int,
    contract_id: int,
    for_update: bool = False,
) -> JobWorkContract:
    q = db.get if not for_update else None
    if for_update:
        from sqlalchemy import select

        row = (
            await db.execute(
                select(JobWorkContract)
                .where(JobWorkContract.id == contract_id, JobWorkContract.tenant_id == tenant_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
    else:
        row = await db.get(JobWorkContract, contract_id)
        if row is not None and row.tenant_id != tenant_id:
            row = None
        _ = q
    if row is None:
        raise HTTPException(status_code=404, detail="Job work contract not found")
    return row


def ensure_not_closed(contract: JobWorkContract) -> None:
    if (contract.status or "").upper() == "CLOSED":
        raise HTTPException(status_code=409, detail="Job work contract is closed")
