"""Screen context for the AI assistant: "what record is the user looking at right now?".

The chat drawer sends the current route plus (record_type, record_id). We load a *small*,
tenant-scoped, permission-checked summary of that record so the assistant can answer
"this order" questions, and return a deep link (citation) back to the record.

Only non-sensitive headline fields are included (no salaries, bank data or personal IDs).
Customer receivable amounts are fail-closed (finance / AI-finance only).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.permissions import get_user_role_for_tenant, internal_permission_granted
from app.common.tenant_feature_keys import (
    RBAC_MODE_ENFORCE,
    get_tenant_rbac_mode,
    is_inbound_job_work_v1_enabled,
)
from app.models import Tenant, User

RecordType = Literal["order", "customer", "style", "voucher", "employee", "inquiry", "quotation"]
RECORD_TYPES: tuple[str, ...] = ("order", "customer", "style", "voucher", "employee", "inquiry", "quotation")

PERMISSION_FOR: dict[str, str] = {
    "order": "merch.access",
    "customer": "merch.access",
    "style": "merch.access",
    "voucher": "finance.access",
    "employee": "hr.access",
    "inquiry": "merch.access",
    "quotation": "merch.access",
}

_CLOSED_ORDER_STATUSES = ("COMPLETED", "CANCELLED", "CLOSED", "SHIPPED")
_ACTIVE_JOB_WORK_EXCLUDED = ("CLOSED",)


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


async def _has_authority_module(
    db: AsyncSession,
    user: User,
    *,
    permission_key: str,
    feature_flags: Any,
) -> bool:
    """When user_authority_classes_v1 is ON, require the mapped module grant (super-admin bypass)."""
    from app.common.authority.module_access import module_code_for_permission
    from app.common.authority.policy import (
        is_authority_classes_enabled_for_tenant,
        load_user_module_codes,
        user_has_module,
    )

    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return True
    if not user.is_active:
        return False
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return True
    code = module_code_for_permission(permission_key)
    if code is None:
        return True
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    return user_has_module(modules, code)


async def _may_include_job_work(db: AsyncSession, tenant: Tenant, user: User) -> bool:
    if not is_inbound_job_work_v1_enabled(tenant.feature_flags):
        return False
    if not await _has_authority_module(
        db, user, permission_key="production.access", feature_flags=tenant.feature_flags
    ):
        return False
    return await can_access_module(db, tenant, user, "production.access")


async def _may_include_customer_receivables(db: AsyncSession, tenant: Tenant, user: User) -> bool:
    """Fail-closed finance / AI-finance only — never plain can_access_module(finance.access).

    Allowed when:
    - authority finance module grant (when user_authority_classes_v1 is ON), AND
    - may_view_mfg_finance OR explicit fail-closed ai.tools.finance.read.
    """
    from app.modules.ai_tool.authz import has_tool_permission
    from app.modules.mfg_intelligence.finance_gate import may_view_mfg_finance

    if not await _has_authority_module(
        db, user, permission_key="finance.access", feature_flags=tenant.feature_flags
    ):
        return False
    if await may_view_mfg_finance(db, user, tenant):
        return True
    return await has_tool_permission(db, user, "ai.tools.finance.read")


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
        return await _load_record(db, tenant=tenant, user=user, record_type=record_type, record_id=record_id)
    except Exception:
        # Context is a nice-to-have: never fail the chat because of it.
        from app.database import safe_async_session_rollback

        await safe_async_session_rollback(db)
        return None


async def resolve_screen_context_nested(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    record_type: str | None,
    record_id: int | None,
) -> ScreenContext | None:
    """Same as ``resolve_screen_context`` but safe inside a transaction that already holds unsaved rows.

    A failed lookup rolls back only its SAVEPOINT, never the caller's transaction.
    """
    if not record_type or record_type not in RECORD_TYPES or not record_id or record_id < 1:
        return None
    if not await can_access_module(db, tenant, user, PERMISSION_FOR[record_type]):
        return None
    try:
        async with db.begin_nested():
            return await _load_record(
                db, tenant=tenant, user=user, record_type=record_type, record_id=record_id
            )
    except Exception:
        return None


async def _load_record(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    record_type: str,
    record_id: int,
) -> ScreenContext | None:
    if record_type == "order":
        return await _order(db, tenant.id, record_id)
    if record_type == "customer":
        return await _customer(db, tenant=tenant, user=user, rid=record_id)
    if record_type == "style":
        return await _style(db, tenant.id, record_id)
    if record_type == "voucher":
        return await _voucher(db, tenant.id, record_id)
    if record_type == "employee":
        return await _employee(db, tenant.id, record_id)
    if record_type == "inquiry":
        return await _inquiry(db, tenant.id, record_id)
    if record_type == "quotation":
        return await _quotation(db, tenant.id, record_id)
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


async def _customer(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    rid: int,
) -> ScreenContext | None:
    from app.models.customer import Customer
    from app.models.merch import Order

    tenant_id = tenant.id
    c = (
        await db.execute(select(Customer).where(Customer.id == rid, Customer.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not c:
        return None

    open_filter = and_(
        Order.tenant_id == tenant_id,
        Order.customer_id == c.id,
        func.upper(Order.status).notin_(_CLOSED_ORDER_STATUSES),
    )
    open_orders = int(
        (await db.execute(select(func.count(Order.id)).where(open_filter))).scalar_one() or 0
    )
    today = today_local(tenant)
    delayed_orders = int(
        (
            await db.execute(
                select(func.count(Order.id)).where(
                    open_filter,
                    Order.delivery_date.is_not(None),
                    Order.delivery_date < today,
                )
            )
        ).scalar_one()
        or 0
    )

    facts: dict[str, Any] = {
        "customer_code": c.customer_code,
        "open_orders": open_orders,
        "delayed_orders": delayed_orders,
        "preferred_currency": getattr(c, "preferred_currency", None),
        "default_incoterm": getattr(c, "default_incoterm", None),
        "payment_terms": getattr(c, "payment_terms", None),
        "active": getattr(c, "is_active", None),
    }

    if await _may_include_job_work(db, tenant, user):
        from app.models.job_work import JobWorkContract

        active_jw = int(
            (
                await db.execute(
                    select(func.count(JobWorkContract.id)).where(
                        JobWorkContract.tenant_id == tenant_id,
                        or_(
                            JobWorkContract.customer_id == c.id,
                            JobWorkContract.final_customer_id == c.id,
                        ),
                        func.upper(JobWorkContract.status).notin_(_ACTIVE_JOB_WORK_EXCLUDED),
                    )
                )
            ).scalar_one()
            or 0
        )
        facts["active_job_work"] = active_jw

    if await _may_include_customer_receivables(db, tenant, user):
        from app.models.finance import OutstandingBill

        party_names = [
            n.strip()
            for n in (c.name, getattr(c, "legal_entity_name", None), getattr(c, "trade_name", None))
            if n and str(n).strip()
        ]
        name_conds = [func.lower(OutstandingBill.party_name) == nm.lower() for nm in party_names]
        match = OutstandingBill.customer_id == c.id
        if name_conds:
            match = or_(match, and_(OutstandingBill.customer_id.is_(None), or_(*name_conds)))

        recv_base = and_(
            OutstandingBill.tenant_id == tenant_id,
            OutstandingBill.bill_type == "RECEIVABLE",
            func.upper(OutstandingBill.status) == "OPEN",
            match,
        )
        open_recv_count = int(
            (await db.execute(select(func.count(OutstandingBill.id)).where(recv_base))).scalar_one()
            or 0
        )
        open_recv_amount = (
            await db.execute(
                select(
                    func.coalesce(
                        func.sum(OutstandingBill.amount - OutstandingBill.paid_amount),
                        0,
                    )
                ).where(recv_base)
            )
        ).scalar_one()
        amount = Decimal(str(open_recv_amount or 0))
        facts["open_receivables"] = open_recv_count
        facts["open_receivable_amount"] = format(amount, "f")

    return ScreenContext(
        record_type="customer",
        record_id=c.id,
        label=f"Customer {c.name}",
        href=f"/app/customers/{c.id}",
        facts=facts,
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


async def _inquiry(db: AsyncSession, tenant_id: int, rid: int) -> ScreenContext | None:
    from app.models.customer import Customer
    from app.models.merch import Inquiry

    row = (
        await db.execute(
            select(Inquiry, Customer.name)
            .outerjoin(Customer, (Customer.id == Inquiry.customer_id) & (Customer.tenant_id == tenant_id))
            .where(Inquiry.id == rid, Inquiry.tenant_id == tenant_id)
        )
    ).first()
    if not row:
        return None
    iq, cname = row
    return ScreenContext(
        record_type="inquiry",
        record_id=iq.id,
        label=f"Inquiry {iq.inquiry_code}",
        href=f"/app/inquiries/{iq.id}",
        facts={
            "buyer": cname,
            "status": iq.status,
            "style_ref": iq.style_ref,
            "brand": iq.brand,
            "season": iq.season,
            "department": iq.department,
            "quantity": iq.quantity,
            "inquiry_type": getattr(iq, "inquiry_type", None),
        },
    )


async def _quotation(db: AsyncSession, tenant_id: int, rid: int) -> ScreenContext | None:
    from app.models.customer import Customer
    from app.models.merch import Quotation

    row = (
        await db.execute(
            select(Quotation, Customer.name)
            .outerjoin(Customer, (Customer.id == Quotation.customer_id) & (Customer.tenant_id == tenant_id))
            .where(Quotation.id == rid, Quotation.tenant_id == tenant_id)
        )
    ).first()
    if not row:
        return None
    q, cname = row
    return ScreenContext(
        record_type="quotation",
        record_id=q.id,
        label=f"Quotation {q.quotation_code}",
        href=f"/app/quotations/{q.id}",
        facts={
            "buyer": cname,
            "status": q.status,
            "style_ref": q.style_ref,
            "version_no": q.version_no,
            "currency": q.currency,
            "quoted_price": str(q.quoted_price) if q.quoted_price is not None else None,
        },
    )
