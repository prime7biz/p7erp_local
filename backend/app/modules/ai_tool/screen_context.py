"""Screen context for the AI assistant: "what record is the user looking at right now?".

The chat drawer sends the current route plus (record_type, record_id). We load a *small*,
tenant-scoped, permission-checked summary of that record so the assistant can answer
"this order" questions, and return a deep link (citation) back to the record.

Only non-sensitive headline fields are included (no salaries, bank data or personal IDs).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import get_user_role_for_tenant, internal_permission_granted
from app.common.tenant_feature_keys import RBAC_MODE_ENFORCE, get_tenant_rbac_mode
from app.models import Tenant, User

RecordType = Literal["order", "customer", "style", "voucher", "employee"]
RECORD_TYPES: tuple[str, ...] = ("order", "customer", "style", "voucher", "employee")

PERMISSION_FOR: dict[str, str] = {
    "order": "merch.access",
    "customer": "merch.access",
    "style": "merch.access",
    "voucher": "finance.access",
    "employee": "hr.access",
}


@dataclass
class ScreenContext:
    record_type: str
    record_id: int
    label: str
    href: str
    facts: dict[str, Any] = field(default_factory=dict)

    def citation(self) -> dict[str, str]:
        return {"label": self.label, "href": self.href, "record_type": self.record_type}

    def summary_line(self) -> str:
        parts = [f"{k.replace('_', ' ')}: {v}" for k, v in self.facts.items() if v not in (None, "")]
        return f"{self.label} — " + "; ".join(parts) if parts else self.label


async def can_access_module(db: AsyncSession, tenant: Tenant, user: User, permission_key: str) -> bool:
    """Mirror require_internal_permission: only an *enforced* RBAC mode can deny."""
    if get_tenant_rbac_mode(tenant.feature_flags) != RBAC_MODE_ENFORCE:
        return True
    role = await get_user_role_for_tenant(db, user, tenant.id)
    return internal_permission_granted(role=role, permission_key=permission_key)


def _iso(v: Any) -> str | None:
    return v.isoformat() if v is not None and hasattr(v, "isoformat") else (str(v) if v is not None else None)


async def resolve_screen_context(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    record_type: str | None,
    record_id: int | None,
) -> ScreenContext | None:
    """Return a summary of the record on screen, or None (unknown type, not found, no permission)."""
    if not record_type or record_type not in RECORD_TYPES or not record_id or record_id < 1:
        return None
    if not await can_access_module(db, tenant, user, PERMISSION_FOR[record_type]):
        return None
    try:
        if record_type == "order":
            return await _order(db, tenant.id, record_id)
        if record_type == "customer":
            return await _customer(db, tenant.id, record_id)
        if record_type == "style":
            return await _style(db, tenant.id, record_id)
        if record_type == "voucher":
            return await _voucher(db, tenant.id, record_id)
        if record_type == "employee":
            return await _employee(db, tenant.id, record_id)
    except Exception:
        # Context is a nice-to-have: never fail the chat because of it.
        from app.database import safe_async_session_rollback

        await safe_async_session_rollback(db)
        return None
    return None


async def _order(db: AsyncSession, tenant_id: int, rid: int) -> ScreenContext | None:
    from app.models.customer import Customer
    from app.models.merch import Order

    row = (
        await db.execute(
            select(Order, Customer.name)
            .outerjoin(Customer, (Customer.id == Order.customer_id) & (Customer.tenant_id == tenant_id))
            .where(Order.id == rid, Order.tenant_id == tenant_id)
        )
    ).first()
    if not row:
        return None
    o, cname = row
    return ScreenContext(
        record_type="order",
        record_id=o.id,
        label=f"Order {o.order_code}",
        href=f"/app/orders/{o.id}",
        facts={
            "buyer": cname,
            "status": o.status,
            "pipeline_status": getattr(o, "pipeline_status", None),
            "quantity": o.quantity,
            "order_date": _iso(o.order_date),
            "delivery_date": _iso(o.delivery_date),
            "style_ref": o.style_ref,
        },
    )


async def _customer(db: AsyncSession, tenant_id: int, rid: int) -> ScreenContext | None:
    from app.models.customer import Customer
    from app.models.merch import Order

    c = (
        await db.execute(select(Customer).where(Customer.id == rid, Customer.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not c:
        return None
    open_orders = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.tenant_id == tenant_id,
                Order.customer_id == c.id,
                func.upper(Order.status).notin_(("COMPLETED", "CANCELLED", "CLOSED", "SHIPPED")),
            )
        )
    ).scalar_one()
    return ScreenContext(
        record_type="customer",
        record_id=c.id,
        label=f"Customer {c.name}",
        href=f"/app/customers/{c.id}",
        facts={"customer_code": c.customer_code, "open_orders": int(open_orders or 0), "active": getattr(c, "is_active", None)},
    )


async def _style(db: AsyncSession, tenant_id: int, rid: int) -> ScreenContext | None:
    from app.models.merch import GarmentStyle

    s = (
        await db.execute(select(GarmentStyle).where(GarmentStyle.id == rid, GarmentStyle.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not s:
        return None
    return ScreenContext(
        record_type="style",
        record_id=s.id,
        label=f"Style {s.style_code}",
        href=f"/app/merchandising/styles/{s.id}",
        facts={"name": s.name, "season": s.season, "status": getattr(s, "status", None)},
    )


async def _voucher(db: AsyncSession, tenant_id: int, rid: int) -> ScreenContext | None:
    from app.models.finance import Voucher

    v = (await db.execute(select(Voucher).where(Voucher.id == rid, Voucher.tenant_id == tenant_id))).scalar_one_or_none()
    if not v:
        return None
    return ScreenContext(
        record_type="voucher",
        record_id=v.id,
        label=f"Voucher {v.voucher_number}",
        href=f"/app/accounts/vouchers/{v.id}",
        facts={"type": v.voucher_type, "date": _iso(v.voucher_date), "status": v.status},
    )


async def _employee(db: AsyncSession, tenant_id: int, rid: int) -> ScreenContext | None:
    from app.models.hr import Employee

    e = (await db.execute(select(Employee).where(Employee.id == rid, Employee.tenant_id == tenant_id))).scalar_one_or_none()
    if not e:
        return None
    name = " ".join(x for x in [e.first_name, getattr(e, "last_name", None)] if x)
    return ScreenContext(
        record_type="employee",
        record_id=e.id,
        label=f"Employee {e.employee_code} {name}".strip(),
        href=f"/app/hr/employees/{e.id}",
        facts={"joining_date": _iso(getattr(e, "joining_date", None)), "active": getattr(e, "is_active", None)},
    )
