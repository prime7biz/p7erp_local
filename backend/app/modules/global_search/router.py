"""Global record search for the Ctrl+K palette: a few matches per module, tenant-scoped, permission-aware."""

from __future__ import annotations

import logging
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import get_user_role_for_tenant, internal_permission_granted
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import RBAC_MODE_ENFORCE, get_tenant_rbac_mode
from app.database import get_db, safe_async_session_rollback
from app.models import Customer, Tenant, User
from app.models.costing import Item
from app.models.finance import Voucher
from app.models.hr import Employee
from app.models.inventory import PurchaseOrder, Vendor
from app.models.merch import Order

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


class SearchHit(BaseModel):
    kind: str
    id: int
    title: str
    subtitle: str | None = None
    href: str


class SearchGroup(BaseModel):
    kind: str
    label: str
    hits: list[SearchHit]


class SearchResponse(BaseModel):
    query: str
    groups: list[SearchGroup]


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _join(*parts: Any) -> str | None:
    text = " · ".join(str(p) for p in parts if p not in (None, ""))
    return text or None


# kind, label, permission key, model, searchable columns, ordering column, hit builder
_SOURCES: list[tuple[str, str, str, Any, Callable[[Any], list], Any, Callable[[Any], SearchHit]]] = [
    (
        "customer",
        "Customers",
        "merch.access",
        Customer,
        lambda m: [m.name, m.customer_code],
        Customer.name,
        lambda r: SearchHit(
            kind="customer", id=r.id, title=r.name, subtitle=_join(r.customer_code, r.status), href=f"/app/customers/{r.id}"
        ),
    ),
    (
        "order",
        "Orders",
        "merch.access",
        Order,
        lambda m: [m.order_code, m.style_ref],
        Order.id.desc(),
        lambda r: SearchHit(
            kind="order", id=r.id, title=r.order_code, subtitle=_join(r.style_ref, r.status), href=f"/app/orders/{r.id}"
        ),
    ),
    (
        "purchase_order",
        "Purchase orders",
        "inventory.access",
        PurchaseOrder,
        lambda m: [m.po_code, m.supplier_name],
        PurchaseOrder.id.desc(),
        lambda r: SearchHit(
            kind="purchase_order",
            id=r.id,
            title=r.po_code,
            subtitle=_join(r.supplier_name, r.status),
            href=f"/app/inventory/purchase-orders/{r.id}/print",
        ),
    ),
    (
        "voucher",
        "Vouchers",
        "finance.access",
        Voucher,
        lambda m: [m.voucher_number],
        Voucher.voucher_date.desc(),
        lambda r: SearchHit(
            kind="voucher",
            id=r.id,
            title=r.voucher_number,
            subtitle=_join(r.voucher_type, r.voucher_date.isoformat() if r.voucher_date else None, r.status),
            href=f"/app/accounts/vouchers/{r.id}",
        ),
    ),
    (
        "item",
        "Items",
        "inventory.access",
        Item,
        lambda m: [m.name, m.item_code],
        Item.name,
        lambda r: SearchHit(
            kind="item", id=r.id, title=r.name, subtitle=r.item_code, href=f"/app/inventory/items?item={r.id}"
        ),
    ),
    (
        "vendor",
        "Vendors",
        "inventory.access",
        Vendor,
        lambda m: [m.name, m.vendor_code],
        Vendor.name,
        lambda r: SearchHit(
            kind="vendor",
            id=r.id,
            title=r.name,
            subtitle=_join(r.vendor_code, None if r.is_active else "inactive"),
            href=f"/app/inventory/vendors?search={r.vendor_code}",
        ),
    ),
    (
        "employee",
        "Employees",
        "hr.access",
        Employee,
        lambda m: [m.first_name, m.last_name, m.employee_code],
        Employee.first_name,
        lambda r: SearchHit(
            kind="employee",
            id=r.id,
            title=_join(r.first_name, r.last_name) or r.employee_code,
            subtitle=_join(r.employee_code, None if r.is_active else "inactive"),
            href=f"/app/hr/employees/{r.id}",
        ),
    ),
]


@router.get("", response_model=SearchResponse)
async def global_search(
    request: Request,
    q: str = Query(..., min_length=2, max_length=80),
    limit: int = Query(5, ge=1, le=10),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    query = q.strip()
    if len(query) < 2:
        return SearchResponse(query=query, groups=[])

    enforce = get_tenant_rbac_mode(tenant.feature_flags) == RBAC_MODE_ENFORCE
    role = await get_user_role_for_tenant(db, user, tenant.id) if enforce else None
    pattern = _like(query)
    groups: list[SearchGroup] = []

    for kind, label, perm, model, cols, order_by, build in _SOURCES:
        if enforce and not internal_permission_granted(role=role, permission_key=perm):
            continue
        try:
            stmt = (
                select(model)
                .where(model.tenant_id == tenant.id, or_(*[c.ilike(pattern, escape="\\") for c in cols(model)]))
                .order_by(order_by)
                .limit(limit)
            )
            rows = (await db.execute(stmt)).scalars().all()
        except Exception:
            logger.exception("global_search_source_failed kind=%s tenant_id=%s", kind, tenant.id)
            await safe_async_session_rollback(db)
            continue
        if rows:
            groups.append(SearchGroup(kind=kind, label=label, hits=[build(r) for r in rows]))

    return SearchResponse(query=query, groups=groups)
