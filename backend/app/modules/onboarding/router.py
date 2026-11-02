"""First-run checklist: which setup steps a tenant has done, derived from real data (nothing stored)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Customer, Tenant, User
from app.models.costing import Item
from app.models.finance import Voucher
from app.models.hr import Employee
from app.models.inventory import Vendor
from app.models.merch import Order

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class ChecklistStep(BaseModel):
    key: str
    title: str
    description: str
    href: str
    done: bool


class ChecklistOut(BaseModel):
    steps: list[ChecklistStep]
    completed: int
    total: int


# key, title, description, href, model, extra "more than N rows" threshold
_STEPS = [
    ("team", "Invite your team", "Add users and give each a role.", "/app/settings/users", User, 1),
    ("customer", "Add your first buyer", "Create a customer profile with contacts.", "/app/customers/new", Customer, 0),
    ("vendor", "Add a supplier", "Fabric, trims and service vendors for POs.", "/app/inventory/vendors", Vendor, 0),
    ("item", "Set up inventory items", "Materials you buy, store and issue.", "/app/inventory/items", Item, 0),
    ("order", "Create your first order", "Start the order → BOM → PO → production flow.", "/app/orders/new", Order, 0),
    ("voucher", "Record a voucher", "Payment, receipt or journal entry in Accounts.", "/app/accounts/vouchers", Voucher, 0),
    ("employee", "Add employees", "Needed for attendance, leave and payroll.", "/app/hr/employees", Employee, 0),
]


@router.get("/checklist", response_model=ChecklistOut)
async def onboarding_checklist(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    steps: list[ChecklistStep] = []
    for key, title, description, href, model, threshold in _STEPS:
        try:
            if threshold:
                count = await db.scalar(
                    select(func.count()).select_from(
                        select(model.id).where(model.tenant_id == tenant.id).limit(threshold + 1).subquery()
                    )
                )
                done = int(count or 0) > threshold
            else:
                done = bool(await db.scalar(select(exists().where(model.tenant_id == tenant.id))))
        except Exception:
            logger.exception("onboarding_step_failed key=%s tenant_id=%s", key, tenant.id)
            await safe_async_session_rollback(db)
            done = False
        steps.append(ChecklistStep(key=key, title=title, description=description, href=href, done=done))
    completed = sum(1 for s in steps if s.done)
    return ChecklistOut(steps=steps, completed=completed, total=len(steps))
