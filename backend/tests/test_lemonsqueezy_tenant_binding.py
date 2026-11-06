"""Lemon Squeezy webhooks only apply to the tenant bound by our own checkout/subscription records."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from dataclasses import dataclass

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import (
    LemonsqueezyCheckoutSession,
    LemonsqueezyWebhookEvent,
    PlatformPlan,
    Tenant,
    TenantSubscription,
)
from tests.go_live_fixtures import create_admin_tenant_with_user

WEBHOOK_SECRET = "test_webhook_signing_secret_binding"
STORE_ID = "777"


@pytest.fixture
def ls_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LEMONSQUEEZY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setenv("LEMONSQUEEZY_STORE_ID", STORE_ID)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _new_id() -> str:
    return str(100000000 + uuid.uuid4().int % 800000000)


@dataclass
class Seed:
    tenant: Tenant
    plan: PlatformPlan
    monthly_variant: str
    yearly_variant: str
    checkout: LemonsqueezyCheckoutSession


async def _seed(db) -> Seed:
    tenant, user, _role = await create_admin_tenant_with_user(db)
    slug = uuid.uuid4().hex[:10]
    monthly_variant = _new_id()
    yearly_variant = _new_id()
    plan = PlatformPlan(
        name=f"LS Plan {slug}",
        code=f"ls-bind-{slug}",
        max_users=10,
        price_monthly_usd=0,
        lemonsqueezy_variant_id_monthly=monthly_variant,
        lemonsqueezy_variant_id_yearly=yearly_variant,
    )
    checkout = LemonsqueezyCheckoutSession(
        checkout_ref=f"ref-{slug}",
        tenant_id=tenant.id,
        user_id=user.id,
        variant_id=monthly_variant,
    )
    db.add_all([plan, checkout])
    await db.flush()
    return Seed(tenant, plan, monthly_variant, yearly_variant, checkout)


async def _post_webhook(db, payload: dict) -> tuple[int, LemonsqueezyWebhookEvent | None]:
    raw = json.dumps(payload).encode("utf-8")
    sig = hmac.new(WEBHOOK_SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/webhooks/lemonsqueezy",
                content=raw,
                headers={"X-Signature": sig, "Content-Type": "application/json"},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)

    row = (
        await db.execute(
            select(LemonsqueezyWebhookEvent).where(
                LemonsqueezyWebhookEvent.event_id == hashlib.sha256(raw).hexdigest()
            )
        )
    ).scalar_one_or_none()
    return resp.status_code, row


async def _tenant_sub(db, tenant_id: int) -> TenantSubscription | None:
    return (
        await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    ).scalar_one_or_none()


def _subscription_payload(
    event_name: str,
    *,
    sub_id: str,
    variant_id: str,
    status: str,
    custom: dict | None = None,
    store_id: str = STORE_ID,
    ends_at: str | None = None,
) -> dict:
    return {
        "meta": {"event_name": event_name, "custom_data": custom or {}},
        "data": {
            "type": "subscriptions",
            "id": sub_id,
            "attributes": {
                "store_id": int(store_id),
                "customer_id": 4321,
                "variant_id": int(variant_id),
                "status": status,
                "created_at": "2026-11-01T00:00:00.000000Z",
                "renews_at": "2026-12-01T00:00:00.000000Z",
                "ends_at": ends_at,
            },
        },
    }


def _order_payload(*, order_id: str, variant_id: str, status: str, custom: dict) -> dict:
    return {
        "meta": {"event_name": "order_created", "custom_data": custom},
        "data": {
            "type": "orders",
            "id": order_id,
            "attributes": {
                "store_id": int(STORE_ID),
                "customer_id": 4321,
                "status": status,
                "first_order_item": {"variant_id": int(variant_id)},
            },
        },
    }


def _invoice_payload(event_name: str, *, sub_id: str, status: str) -> dict:
    return {
        "meta": {"event_name": event_name, "custom_data": {}},
        "data": {
            "type": "subscription-invoices",
            "id": _new_id(),
            "attributes": {
                "store_id": int(STORE_ID),
                "subscription_id": int(sub_id),
                "status": status,
            },
        },
    }


async def _existing_subscription(db, seed: Seed, *, status: str = "active") -> str:
    """A subscription created before checkout sessions existed (bound only by its LS id)."""
    sub_id = _new_id()
    db.add(
        TenantSubscription(
            tenant_id=seed.tenant.id,
            plan_id=seed.plan.id,
            provider="lemonsqueezy",
            status=status,
            billing_cycle="monthly",
            lemonsqueezy_subscription_id=sub_id,
        )
    )
    await db.flush()
    return sub_id


@pytest.mark.asyncio
async def test_order_without_checkout_ref_is_not_applied(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)

    code, row = await _post_webhook(
        db,
        _order_payload(
            order_id=_new_id(),
            variant_id=seed.monthly_variant,
            status="paid",
            custom={"tenant_id": str(seed.tenant.id)},
        ),
    )

    assert code == 200
    assert row is not None and row.processed_at is not None
    assert row.error == "unbound_checkout"
    assert await _tenant_sub(db, seed.tenant.id) is None


@pytest.mark.asyncio
async def test_unknown_checkout_ref_is_not_applied(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)

    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_created",
            sub_id=_new_id(),
            variant_id=seed.monthly_variant,
            status="active",
            custom={"checkout_ref": "not-a-real-ref", "tenant_id": str(seed.tenant.id)},
        ),
    )

    assert code == 200
    assert row.error == "unbound_checkout"
    assert await _tenant_sub(db, seed.tenant.id) is None


@pytest.mark.asyncio
async def test_tenant_id_mismatch_is_not_applied(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    other_tenant, _user, _role = await create_admin_tenant_with_user(db)

    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_created",
            sub_id=_new_id(),
            variant_id=seed.monthly_variant,
            status="active",
            custom={"checkout_ref": seed.checkout.checkout_ref, "tenant_id": str(other_tenant.id)},
        ),
    )

    assert code == 200
    assert row.error == "tenant_mismatch"
    assert await _tenant_sub(db, seed.tenant.id) is None
    assert await _tenant_sub(db, other_tenant.id) is None


@pytest.mark.asyncio
async def test_store_mismatch_is_not_applied(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)

    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_created",
            sub_id=_new_id(),
            variant_id=seed.monthly_variant,
            status="active",
            custom={"checkout_ref": seed.checkout.checkout_ref},
            store_id="999",
        ),
    )

    assert code == 200
    assert row.error == "store_mismatch"
    assert row.processed_at is not None
    assert await _tenant_sub(db, seed.tenant.id) is None


@pytest.mark.asyncio
async def test_order_with_empty_status_does_not_activate(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)

    code, row = await _post_webhook(
        db,
        _order_payload(
            order_id=_new_id(),
            variant_id=seed.monthly_variant,
            status="",
            custom={"checkout_ref": seed.checkout.checkout_ref},
        ),
    )

    assert code == 200
    assert row.error == "order_not_paid"
    assert await _tenant_sub(db, seed.tenant.id) is None


@pytest.mark.asyncio
async def test_paid_order_with_session_activates(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    order_id = _new_id()

    code, row = await _post_webhook(
        db,
        _order_payload(
            order_id=order_id,
            variant_id=seed.monthly_variant,
            status="paid",
            custom={"checkout_ref": seed.checkout.checkout_ref, "tenant_id": str(seed.tenant.id)},
        ),
    )

    assert code == 200
    assert row.error is None
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub is not None and sub.status == "active"
    assert sub.lemonsqueezy_order_id == order_id
    assert seed.checkout.lemonsqueezy_order_id == order_id
    assert seed.checkout.completed_at is not None


@pytest.mark.asyncio
async def test_subscription_created_with_session_activates(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    sub_id = _new_id()

    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_created",
            sub_id=sub_id,
            variant_id=seed.monthly_variant,
            status="active",
            custom={"checkout_ref": seed.checkout.checkout_ref, "tenant_id": str(seed.tenant.id)},
        ),
    )

    assert code == 200
    assert row.error is None
    assert row.tenant_id == seed.tenant.id
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub is not None
    assert sub.status == "active"
    assert sub.plan_id == seed.plan.id
    assert sub.lemonsqueezy_subscription_id == sub_id
    assert sub.current_period_end is not None
    assert seed.checkout.completed_at is not None
    assert seed.checkout.lemonsqueezy_subscription_id == sub_id


@pytest.mark.asyncio
async def test_subscription_created_with_other_variant_is_not_applied(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)

    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_created",
            sub_id=_new_id(),
            variant_id=seed.yearly_variant,
            status="active",
            custom={"checkout_ref": seed.checkout.checkout_ref},
        ),
    )

    assert code == 200
    assert row.error == "variant_mismatch"
    assert await _tenant_sub(db, seed.tenant.id) is None


@pytest.mark.asyncio
async def test_subscription_updated_by_subscription_id_changes_status_and_plan(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    sub_id = await _existing_subscription(db, seed)

    code, row = await _post_webhook(
        db,
        _subscription_payload("subscription_updated", sub_id=sub_id, variant_id=seed.yearly_variant, status="unpaid"),
    )

    assert code == 200
    assert row.error is None
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub.status == "past_due"
    assert sub.billing_cycle == "yearly"


@pytest.mark.asyncio
async def test_subscription_updated_with_only_raw_tenant_id_is_not_applied(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)

    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_updated",
            sub_id=_new_id(),
            variant_id=seed.monthly_variant,
            status="active",
            custom={"tenant_id": str(seed.tenant.id)},
        ),
    )

    assert code == 200
    assert row.error == "unbound_subscription"
    assert await _tenant_sub(db, seed.tenant.id) is None


@pytest.mark.asyncio
async def test_payment_failed_sets_past_due(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    sub_id = await _existing_subscription(db, seed)

    code, row = await _post_webhook(db, _invoice_payload("subscription_payment_failed", sub_id=sub_id, status="pending"))

    assert code == 200
    assert row.error is None
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub.status == "past_due"


@pytest.mark.asyncio
async def test_payment_recovered_reactivates_past_due(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    sub_id = await _existing_subscription(db, seed, status="past_due")

    code, row = await _post_webhook(db, _invoice_payload("subscription_payment_recovered", sub_id=sub_id, status="paid"))

    assert code == 200
    assert row.error is None
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub.status == "active"


@pytest.mark.asyncio
async def test_payment_success_does_not_reactivate_cancelled(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    sub_id = await _existing_subscription(db, seed, status="cancelled")

    code, _row = await _post_webhook(db, _invoice_payload("subscription_payment_success", sub_id=sub_id, status="paid"))

    assert code == 200
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub.status == "cancelled"


@pytest.mark.asyncio
async def test_subscription_cancelled_sets_cancelled(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    sub_id = await _existing_subscription(db, seed)

    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_cancelled",
            sub_id=sub_id,
            variant_id=seed.monthly_variant,
            status="cancelled",
            ends_at="2026-12-15T00:00:00.000000Z",
        ),
    )

    assert code == 200
    assert row.error is None
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub.status == "cancelled"
    assert sub.current_period_end.isoformat().startswith("2026-12-15")


@pytest.mark.asyncio
async def test_lifecycle_event_after_checkout_binds_by_session(db_session_integration, ls_env):
    db = db_session_integration
    seed = await _seed(db)
    sub_id = _new_id()
    custom = {"checkout_ref": seed.checkout.checkout_ref}

    await _post_webhook(
        db,
        _subscription_payload(
            "subscription_created", sub_id=sub_id, variant_id=seed.monthly_variant, status="active", custom=custom
        ),
    )
    code, row = await _post_webhook(
        db,
        _subscription_payload(
            "subscription_paused", sub_id=sub_id, variant_id=seed.monthly_variant, status="paused", custom=custom
        ),
    )

    assert code == 200
    assert row.error is None
    sub = await _tenant_sub(db, seed.tenant.id)
    assert sub.status == "suspended"


@pytest.mark.asyncio
async def test_unsupported_event_is_stored_and_acknowledged(db_session_integration, ls_env):
    db = db_session_integration
    payload = {
        "meta": {"event_name": "license_key_created", "custom_data": {}},
        "data": {"id": _new_id(), "attributes": {"store_id": int(STORE_ID)}},
    }

    code, row = await _post_webhook(db, payload)

    assert code == 200
    assert row is not None
    assert row.processed_at is not None
    assert row.error is None
