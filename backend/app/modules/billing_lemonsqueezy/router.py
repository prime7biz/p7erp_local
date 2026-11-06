"""Tenant checkout API + public Lemon Squeezy webhook."""

from __future__ import annotations

import hashlib
import json
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import ensure_user_is_tenant_admin
from app.common.db_datetime import utc_now_naive
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db, safe_async_session_rollback
from app.models import LemonsqueezyCheckoutSession, LemonsqueezyWebhookEvent, Tenant, User
from app.modules.billing_lemonsqueezy import client as ls_client
from app.modules.billing_lemonsqueezy.schemas import LemonSqueezyCheckoutRequest, LemonSqueezyCheckoutResponse
from app.modules.billing_lemonsqueezy.service import (
    SUBSCRIPTION_LIFECYCLE_EVENTS,
    SUBSCRIPTION_PAYMENT_EVENTS,
    WebhookResult,
    handle_order_created,
    handle_subscription_created,
    handle_subscription_lifecycle,
    handle_subscription_payment,
    resolve_plan_for_variant,
    store_matches,
)
from app.modules.billing_lemonsqueezy.signature import verify_x_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing/lemonsqueezy", tags=["billing-lemon-squeezy"])

webhook_router = APIRouter(tags=["webhooks-lemon-squeezy"])


@router.post("/checkout", response_model=LemonSqueezyCheckoutResponse)
async def create_lemon_squeezy_checkout(
    body: LemonSqueezyCheckoutRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    """Create a hosted checkout URL; `custom_data` carries the server-side `checkout_ref` for webhooks."""
    await ensure_user_is_tenant_admin(db, user, tenant.id)

    settings = get_settings()
    if not (settings.lemonsqueezy_api_key or "").strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Lemon Squeezy is not configured (missing API key)",
        )
    if not (settings.lemonsqueezy_store_id or "").strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Lemon Squeezy is not configured (missing store id)",
        )

    email = (body.email or user.email or "").strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required for checkout",
        )

    variant_id = str(body.variant_id).strip()
    plan, _cycle = await resolve_plan_for_variant(db, variant_id)
    if plan is None or not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown plan variant",
        )

    redirect = (settings.lemonsqueezy_checkout_success_url or "").strip()
    if not redirect:
        base = (settings.frontend_url or "").rstrip("/")
        redirect = f"{base}/app/settings?ls_success=1" if base else None

    checkout_session = LemonsqueezyCheckoutSession(
        checkout_ref=secrets.token_urlsafe(24),
        tenant_id=tenant.id,
        user_id=user.id,
        variant_id=variant_id,
    )
    db.add(checkout_session)
    try:
        await db.commit()
    except Exception as exc:
        logger.exception("Could not save Lemon Squeezy checkout session for tenant_id=%s", tenant.id)
        await safe_async_session_rollback(db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not start checkout",
        ) from exc

    try:
        checkout_url = await ls_client.create_checkout(
            api_base_url=settings.lemonsqueezy_api_base_url,
            api_key=settings.lemonsqueezy_api_key.strip(),
            store_id=str(settings.lemonsqueezy_store_id).strip(),
            variant_id=variant_id,
            email=email,
            tenant_id=tenant.id,
            user_id=user.id,
            checkout_ref=checkout_session.checkout_ref,
            redirect_url=redirect,
        )
    except Exception as exc:
        logger.exception("Lemon Squeezy checkout failed for tenant_id=%s: %s", tenant.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create Lemon Squeezy checkout",
        ) from exc

    return LemonSqueezyCheckoutResponse(checkout_url=checkout_url)


@webhook_router.post("/webhooks/lemonsqueezy")
async def lemon_squeezy_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Verify HMAC, persist idempotency row, apply order/subscription events to the bound tenant.

    Events that cannot be applied are stored with `error` set and still answered with 200,
    so Lemon Squeezy does not keep retrying them.
    """
    settings = get_settings()
    secret = (settings.lemonsqueezy_webhook_secret or "").strip()
    raw = await request.body()
    sig_header = request.headers.get("X-Signature") or request.headers.get("x-signature")

    if not secret:
        logger.error("LEMONSQUEEZY_WEBHOOK_SECRET is not set; refusing webhook")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Webhook not configured")

    if not verify_x_signature(raw_body=raw, x_signature=sig_header, secret=secret):
        logger.warning("Lemon Squeezy webhook signature verification failed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        logger.warning("Lemon Squeezy webhook invalid JSON: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body") from exc

    meta = payload.get("meta") if isinstance(payload, dict) else None
    event_name = None
    if isinstance(meta, dict):
        event_name = meta.get("event_name")
    if not event_name:
        event_name = request.headers.get("X-Event-Name") or request.headers.get("x-event-name")

    event_name = str(event_name or "unknown")
    dedup_id = hashlib.sha256(raw).hexdigest()

    existing = (
        await db.execute(select(LemonsqueezyWebhookEvent).where(LemonsqueezyWebhookEvent.event_id == dedup_id))
    ).scalar_one_or_none()
    if existing is not None:
        return Response(status_code=200)

    row = LemonsqueezyWebhookEvent(
        event_id=dedup_id,
        event_name=event_name,
        payload_json=payload if isinstance(payload, dict) else {"_raw": str(payload)},
        signature_ok=True,
        processed_at=None,
        tenant_id=None,
        error=None,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await safe_async_session_rollback(db)
        return Response(status_code=200)

    body = payload if isinstance(payload, dict) else {}
    result = WebhookResult()
    try:
        if not store_matches(body, settings.lemonsqueezy_store_id):
            result = WebhookResult(error="store_mismatch")
        elif event_name == "subscription_created":
            result = await handle_subscription_created(db, body)
        elif event_name == "order_created":
            result = await handle_order_created(db, body)
        elif event_name in SUBSCRIPTION_LIFECYCLE_EVENTS:
            result = await handle_subscription_lifecycle(db, event_name, body)
        elif event_name in SUBSCRIPTION_PAYMENT_EVENTS:
            result = await handle_subscription_payment(db, event_name, body)
        else:
            logger.info("Lemon Squeezy webhook ignored event_name=%s", event_name)

        if result.error:
            logger.warning(
                "Lemon Squeezy webhook not applied event_name=%s error=%s tenant_id=%s",
                event_name,
                result.error,
                result.tenant_id,
            )
        row.processed_at = utc_now_naive()
        row.tenant_id = result.tenant_id
        row.error = result.error
        await db.commit()
    except Exception:
        logger.exception("Lemon Squeezy webhook handler failed event_name=%s", event_name)
        await safe_async_session_rollback(db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed",
        )

    return Response(status_code=200)
