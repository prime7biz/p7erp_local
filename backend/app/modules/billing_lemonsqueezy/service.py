"""Map Lemon Squeezy webhooks to `tenant_subscriptions` (entitlements)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PlatformPlan, TenantSubscription

logger = logging.getLogger(__name__)


def _parse_ls_datetime(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if not isinstance(val, str):
        return None
    s = val.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _tenant_id_from_meta(meta: dict[str, Any]) -> int | None:
    custom = meta.get("custom_data") or meta.get("custom") or {}
    if not isinstance(custom, dict):
        return None
    raw = custom.get("tenant_id")
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


async def resolve_plan_for_variant(
    db: AsyncSession, variant_id: str | int | None
) -> tuple[PlatformPlan | None, str]:
    """Return (plan, billing_cycle) where billing_cycle is monthly|yearly."""
    if variant_id is None:
        return None, "monthly"
    vid = str(variant_id).strip()
    if not vid:
        return None, "monthly"
    r = await db.execute(
        select(PlatformPlan).where(
            or_(
                PlatformPlan.lemonsqueezy_variant_id_monthly == vid,
                PlatformPlan.lemonsqueezy_variant_id_yearly == vid,
            )
        )
    )
    plans = r.scalars().all()
    if not plans:
        return None, "monthly"
    plan = plans[0]
    if (plan.lemonsqueezy_variant_id_monthly or "") == vid:
        return plan, "monthly"
    if (plan.lemonsqueezy_variant_id_yearly or "") == vid:
        return plan, "yearly"
    return plan, "monthly"


async def update_tenant_billing_status(
    db: AsyncSession,
    *,
    tenant_id: int,
    plan_id: int,
    plan_code: str,
    status: str,
    billing_cycle: str = "monthly",
    ls_subscription_id: str | None = None,
    ls_customer_id: str | None = None,
    ls_order_id: str | None = None,
    period_end: datetime | None = None,
    period_start: datetime | None = None,
) -> TenantSubscription:
    """Upsert the tenant's subscription row (source of truth for plan_enforcer / limits)."""
    r = await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    sub = r.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if sub is None:
        sub = TenantSubscription(
            tenant_id=tenant_id,
            plan_id=plan_id,
            status=status,
            billing_cycle=billing_cycle,
            provider="lemonsqueezy",
            lemonsqueezy_subscription_id=ls_subscription_id,
            lemonsqueezy_customer_id=ls_customer_id,
            lemonsqueezy_order_id=ls_order_id,
            current_period_start=period_start,
            current_period_end=period_end,
            notes=f"Lemon Squeezy — plan {plan_code}",
        )
        db.add(sub)
    else:
        sub.plan_id = plan_id
        sub.status = status
        sub.billing_cycle = billing_cycle
        sub.provider = "lemonsqueezy"
        if ls_subscription_id:
            sub.lemonsqueezy_subscription_id = ls_subscription_id
        if ls_customer_id:
            sub.lemonsqueezy_customer_id = ls_customer_id
        if ls_order_id:
            sub.lemonsqueezy_order_id = ls_order_id
        if period_start is not None:
            sub.current_period_start = period_start
        if period_end is not None:
            sub.current_period_end = period_end
        note = f"Lemon Squeezy — plan {plan_code} — updated {now.isoformat()}"
        sub.notes = (sub.notes + "\n" + note) if sub.notes else note
    await db.flush()
    return sub


async def handle_subscription_created(db: AsyncSession, payload: dict[str, Any]) -> int | None:
    meta = payload.get("meta") or {}
    if not isinstance(meta, dict):
        logger.warning("subscription_created: missing meta dict")
        return None
    tenant_id = _tenant_id_from_meta(meta)
    if tenant_id is None:
        logger.warning("subscription_created: no tenant_id in meta.custom_data")
        return None

    data = payload.get("data") or {}
    attrs = data.get("attributes") or {}
    variant_id = attrs.get("variant_id")
    sub_id = str(data.get("id") or "") or None
    customer_id = attrs.get("customer_id")
    if customer_id is not None:
        customer_id = str(customer_id)

    renews_at = _parse_ls_datetime(attrs.get("renews_at") or attrs.get("ends_at"))
    created = _parse_ls_datetime(attrs.get("created_at"))

    plan, cycle = await resolve_plan_for_variant(db, variant_id)
    if plan is None:
        logger.error(
            "subscription_created: no platform_plans row matches variant_id=%s (tenant_id=%s)",
            variant_id,
            tenant_id,
        )
        return tenant_id

    await update_tenant_billing_status(
        db,
        tenant_id=tenant_id,
        plan_id=plan.id,
        plan_code=plan.code,
        status="active",
        billing_cycle=cycle,
        ls_subscription_id=sub_id,
        ls_customer_id=customer_id,
        period_start=created,
        period_end=renews_at,
    )
    return tenant_id


async def handle_order_created(db: AsyncSession, payload: dict[str, Any]) -> int | None:
    meta = payload.get("meta") or {}
    if not isinstance(meta, dict):
        logger.warning("order_created: missing meta dict")
        return None
    tenant_id = _tenant_id_from_meta(meta)
    if tenant_id is None:
        logger.warning("order_created: no tenant_id in meta.custom_data")
        return None

    data = payload.get("data") or {}
    attrs = data.get("attributes") or {}
    status = (attrs.get("status") or "").lower()
    if status and status not in ("paid", "complete", "completed"):
        logger.info("order_created: skipping non-paid order status=%s tenant_id=%s", status, tenant_id)
        return tenant_id

    order_id = str(data.get("id") or "") or None
    variant_id = attrs.get("variant_id")
    foi = attrs.get("first_order_item")
    if variant_id is None and isinstance(foi, dict):
        variant_id = foi.get("variant_id")

    customer_id = attrs.get("customer_id")
    if customer_id is not None:
        customer_id = str(customer_id)

    plan, cycle = await resolve_plan_for_variant(db, variant_id)
    if plan is None:
        logger.error(
            "order_created: no platform_plans row matches variant_id=%s (tenant_id=%s)",
            variant_id,
            tenant_id,
        )
        return tenant_id

    await update_tenant_billing_status(
        db,
        tenant_id=tenant_id,
        plan_id=plan.id,
        plan_code=plan.code,
        status="active",
        billing_cycle=cycle,
        ls_customer_id=customer_id,
        ls_order_id=order_id,
        period_end=None,
    )
    return tenant_id
