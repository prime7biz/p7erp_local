"""Map Lemon Squeezy webhooks to `tenant_subscriptions` (entitlements).

The tenant for an event always comes from our own records: a `LemonsqueezyCheckoutSession`
(found by the `checkout_ref` we put in checkout custom data) or an existing `TenantSubscription`
with the same Lemon Squeezy subscription id. A `tenant_id` in custom data is only cross-checked.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.db_datetime import utc_now_naive
from app.models import LemonsqueezyCheckoutSession, PlatformPlan, TenantSubscription

logger = logging.getLogger(__name__)

# Lemon Squeezy subscription status -> our `tenant_subscriptions.status`.
LS_TO_LOCAL_STATUS = {
    "active": "active",
    "on_trial": "trial",
    "past_due": "past_due",
    "unpaid": "past_due",
    "cancelled": "cancelled",
    "expired": "expired",
    "paused": "suspended",
}
BLOCKED_STATUSES = frozenset({"past_due", "cancelled", "expired", "suspended"})

# Events whose `data` is a subscription object.
SUBSCRIPTION_LIFECYCLE_EVENTS = frozenset(
    {
        "subscription_updated",
        "subscription_cancelled",
        "subscription_resumed",
        "subscription_expired",
        "subscription_paused",
        "subscription_unpaused",
    }
)
# Events whose `data` is a subscription invoice (subscription id is in `attributes.subscription_id`).
SUBSCRIPTION_PAYMENT_EVENTS = frozenset(
    {
        "subscription_payment_failed",
        "subscription_payment_success",
        "subscription_payment_recovered",
    }
)


@dataclass
class WebhookResult:
    """Outcome of one webhook: the tenant it belongs to and an error code when it was not applied."""

    tenant_id: int | None = None
    error: str | None = None


def _to_naive_utc(dt: datetime) -> datetime:
    """Subscription columns are TIMESTAMP WITHOUT TIME ZONE; store UTC without tzinfo."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _parse_ls_datetime(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return _to_naive_utc(val)
    if not isinstance(val, str):
        return None
    s = val.strip().replace("Z", "+00:00")
    try:
        return _to_naive_utc(datetime.fromisoformat(s))
    except ValueError:
        return None


def _as_dict(val: Any) -> dict[str, Any]:
    return val if isinstance(val, dict) else {}


def _clean_id(val: Any) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _split_payload(payload: Any) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Return (custom_data, data, data.attributes) as dicts (empty when missing)."""
    payload = _as_dict(payload)
    meta = _as_dict(payload.get("meta"))
    custom = _as_dict(meta.get("custom_data") or meta.get("custom"))
    data = _as_dict(payload.get("data"))
    attrs = _as_dict(data.get("attributes"))
    return custom, data, attrs


def _custom_tenant_conflicts(custom: dict[str, Any], tenant_id: int) -> bool:
    """True when custom data names a tenant different from the one we resolved."""
    claimed = _clean_id(custom.get("tenant_id"))
    return claimed is not None and claimed != str(tenant_id)


def _period_end(attrs: dict[str, Any]) -> datetime | None:
    return _parse_ls_datetime(attrs.get("ends_at") or attrs.get("renews_at"))


def _local_status(attrs: dict[str, Any]) -> str | None:
    return LS_TO_LOCAL_STATUS.get(str(attrs.get("status") or "").strip().lower())


def store_matches(payload: Any, expected_store_id: str | None) -> bool:
    """When a store id is configured, the event must come from that store."""
    expected = (expected_store_id or "").strip()
    if not expected:
        return True
    _custom, _data, attrs = _split_payload(payload)
    return _clean_id(attrs.get("store_id")) == expected


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


async def _session_by_ref(db: AsyncSession, checkout_ref: Any) -> LemonsqueezyCheckoutSession | None:
    ref = _clean_id(checkout_ref)
    if not ref:
        return None
    r = await db.execute(
        select(LemonsqueezyCheckoutSession).where(LemonsqueezyCheckoutSession.checkout_ref == ref)
    )
    return r.scalar_one_or_none()


async def _plan_for_checkout(
    db: AsyncSession, session: LemonsqueezyCheckoutSession, variant_id: Any
) -> tuple[PlatformPlan | None, str, str | None]:
    """Return (plan, billing_cycle, error). The variant must be the one the checkout was started for."""
    if _clean_id(variant_id) != session.variant_id:
        return None, "monthly", "variant_mismatch"
    plan, cycle = await resolve_plan_for_variant(db, variant_id)
    if plan is None:
        return None, cycle, "unknown_variant"
    return plan, cycle, None


def _mark_session_completed(
    session: LemonsqueezyCheckoutSession,
    *,
    order_id: str | None = None,
    subscription_id: str | None = None,
) -> None:
    if session.completed_at is None:
        session.completed_at = utc_now_naive()
    if order_id:
        session.lemonsqueezy_order_id = order_id
    if subscription_id:
        session.lemonsqueezy_subscription_id = subscription_id


async def _resolve_subscription_tenant(
    db: AsyncSession, sub_id: str, custom: dict[str, Any]
) -> tuple[int | None, TenantSubscription | None, str | None]:
    """Find the tenant that owns a Lemon Squeezy subscription.

    Returns (tenant_id, tenant_subscription_or_None, error).
    """
    sub = (
        await db.execute(
            select(TenantSubscription).where(TenantSubscription.lemonsqueezy_subscription_id == sub_id).limit(1)
        )
    ).scalar_one_or_none()

    if sub is not None:
        tenant_id = sub.tenant_id
    else:
        session = (
            await db.execute(
                select(LemonsqueezyCheckoutSession)
                .where(LemonsqueezyCheckoutSession.lemonsqueezy_subscription_id == sub_id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if session is None:
            session = await _session_by_ref(db, custom.get("checkout_ref"))
            if session is not None and session.lemonsqueezy_subscription_id not in (None, sub_id):
                session = None
        if session is None:
            return None, None, "unbound_subscription"
        tenant_id = session.tenant_id
        sub = (
            await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
        ).scalar_one_or_none()
        if sub is not None and sub.lemonsqueezy_subscription_id and sub.lemonsqueezy_subscription_id != sub_id:
            return tenant_id, None, "subscription_mismatch"

    if _custom_tenant_conflicts(custom, tenant_id):
        return tenant_id, None, "tenant_mismatch"
    return tenant_id, sub, None


async def handle_subscription_created(db: AsyncSession, payload: dict[str, Any]) -> WebhookResult:
    custom, data, attrs = _split_payload(payload)
    sub_id = _clean_id(data.get("id"))
    if not sub_id:
        return WebhookResult(error="missing_subscription_id")

    session = await _session_by_ref(db, custom.get("checkout_ref"))
    if session is None:
        return WebhookResult(error="unbound_checkout")
    tenant_id = session.tenant_id
    if _custom_tenant_conflicts(custom, tenant_id):
        return WebhookResult(tenant_id=tenant_id, error="tenant_mismatch")
    if session.lemonsqueezy_subscription_id and session.lemonsqueezy_subscription_id != sub_id:
        return WebhookResult(tenant_id=tenant_id, error="checkout_already_used")

    status = _local_status(attrs)
    if status is None:
        return WebhookResult(tenant_id=tenant_id, error="unknown_status")

    plan, cycle, error = await _plan_for_checkout(db, session, attrs.get("variant_id"))
    if error:
        return WebhookResult(tenant_id=tenant_id, error=error)

    await update_tenant_billing_status(
        db,
        tenant_id=tenant_id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=status,
        billing_cycle=cycle,
        ls_subscription_id=sub_id,
        ls_customer_id=_clean_id(attrs.get("customer_id")),
        period_start=_parse_ls_datetime(attrs.get("created_at")),
        period_end=_period_end(attrs),
    )
    _mark_session_completed(session, subscription_id=sub_id)
    await db.flush()
    return WebhookResult(tenant_id=tenant_id)


async def handle_order_created(db: AsyncSession, payload: dict[str, Any]) -> WebhookResult:
    custom, data, attrs = _split_payload(payload)

    session = await _session_by_ref(db, custom.get("checkout_ref"))
    if session is None:
        return WebhookResult(error="unbound_checkout")
    tenant_id = session.tenant_id
    if _custom_tenant_conflicts(custom, tenant_id):
        return WebhookResult(tenant_id=tenant_id, error="tenant_mismatch")

    status = str(attrs.get("status") or "").strip().lower()
    if status != "paid":
        logger.info("order_created: skipping non-paid order status=%r tenant_id=%s", status, tenant_id)
        return WebhookResult(tenant_id=tenant_id, error="order_not_paid")

    order_id = _clean_id(data.get("id"))
    if session.lemonsqueezy_order_id and session.lemonsqueezy_order_id != order_id:
        return WebhookResult(tenant_id=tenant_id, error="checkout_already_used")

    variant_id = attrs.get("variant_id")
    foi = attrs.get("first_order_item")
    if variant_id is None and isinstance(foi, dict):
        variant_id = foi.get("variant_id")
    plan, cycle, error = await _plan_for_checkout(db, session, variant_id)
    if error:
        return WebhookResult(tenant_id=tenant_id, error=error)

    await update_tenant_billing_status(
        db,
        tenant_id=tenant_id,
        plan_id=plan.id,
        plan_code=plan.code,
        status="active",
        billing_cycle=cycle,
        ls_customer_id=_clean_id(attrs.get("customer_id")),
        ls_order_id=order_id,
        period_end=None,
    )
    _mark_session_completed(session, order_id=order_id)
    await db.flush()
    return WebhookResult(tenant_id=tenant_id)


async def handle_subscription_lifecycle(db: AsyncSession, event_name: str, payload: dict[str, Any]) -> WebhookResult:
    """subscription_updated / cancelled / resumed / expired / paused / unpaused."""
    custom, data, attrs = _split_payload(payload)
    sub_id = _clean_id(data.get("id"))
    if not sub_id:
        return WebhookResult(error="missing_subscription_id")

    tenant_id, sub, error = await _resolve_subscription_tenant(db, sub_id, custom)
    if error:
        return WebhookResult(tenant_id=tenant_id, error=error)

    status = _local_status(attrs)
    if status is None:
        return WebhookResult(tenant_id=tenant_id, error="unknown_status")

    plan, cycle = await resolve_plan_for_variant(db, attrs.get("variant_id"))
    if plan is None:
        # An unmapped variant may not grant access, but it must still be able to remove it.
        if sub is None or status not in BLOCKED_STATUSES:
            logger.warning("%s: no platform_plans row matches variant_id=%s", event_name, attrs.get("variant_id"))
            return WebhookResult(tenant_id=tenant_id, error="unknown_variant")
        sub.status = status
        sub.lemonsqueezy_subscription_id = sub_id
        period_end = _period_end(attrs)
        if period_end is not None:
            sub.current_period_end = period_end
        await db.flush()
        return WebhookResult(tenant_id=tenant_id)

    await update_tenant_billing_status(
        db,
        tenant_id=tenant_id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=status,
        billing_cycle=cycle,
        ls_subscription_id=sub_id,
        ls_customer_id=_clean_id(attrs.get("customer_id")),
        period_end=_period_end(attrs),
    )
    return WebhookResult(tenant_id=tenant_id)


async def handle_subscription_payment(db: AsyncSession, event_name: str, payload: dict[str, Any]) -> WebhookResult:
    """subscription_payment_failed / success / recovered (`data` is a subscription invoice)."""
    custom, _data, attrs = _split_payload(payload)
    sub_id = _clean_id(attrs.get("subscription_id"))
    if not sub_id:
        return WebhookResult(error="missing_subscription_id")

    tenant_id, sub, error = await _resolve_subscription_tenant(db, sub_id, custom)
    if error:
        return WebhookResult(tenant_id=tenant_id, error=error)
    if sub is None:
        return WebhookResult(tenant_id=tenant_id, error="no_subscription")

    if event_name == "subscription_payment_failed":
        sub.status = "past_due"
    elif str(attrs.get("status") or "").strip().lower() == "paid" and sub.status in ("past_due", "active", "trial"):
        # Cancelled / expired / paused subscriptions only come back through subscription_* status events.
        sub.status = "active"
    else:
        logger.info("%s: no status change for tenant_id=%s (current=%s)", event_name, tenant_id, sub.status)
        return WebhookResult(tenant_id=tenant_id)

    sub.lemonsqueezy_subscription_id = sub_id
    await db.flush()
    return WebhookResult(tenant_id=tenant_id)
