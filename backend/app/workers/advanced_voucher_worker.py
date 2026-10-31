"""Celery: activate post-dated vouchers + generate recurring vouchers daily."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.common.tenant_feature_keys import is_post_dated_voucher_enabled, is_recurring_voucher_enabled
from app.database import AsyncSessionLocal
from app.models.advanced_vouchers import RecurringVoucherTemplate
from app.models.tenant import Tenant
from app.modules.finance.advanced_voucher_service import (
    activate_due_post_dated,
    generate_from_recurring_template,
)

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenants = list((await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all())
        for tenant in tenants:
            activated = 0
            generated = 0
            try:
                if is_post_dated_voucher_enabled(tenant.feature_flags):
                    ids = await activate_due_post_dated(db, tenant.id)
                    activated = len(ids)
                    if ids:
                        logger.info(
                            "post_dated_activated tenant=%s count=%s ids=%s",
                            tenant.id,
                            activated,
                            ids[:20],
                        )
                if is_recurring_voucher_enabled(tenant.feature_flags):
                    templates = list(
                        (
                            await db.execute(
                                select(RecurringVoucherTemplate).where(
                                    RecurringVoucherTemplate.tenant_id == tenant.id,
                                    RecurringVoucherTemplate.is_active.is_(True),
                                )
                            )
                        )
                        .scalars()
                        .all()
                    )
                    for tpl in templates:
                        try:
                            # Catch up: generate while due
                            safety = 0
                            while safety < 24:
                                safety += 1
                                voucher = await generate_from_recurring_template(
                                    db, tenant.id, tpl, created_by=tpl.created_by
                                )
                                if not voucher:
                                    break
                                generated += 1
                        except Exception:
                            logger.exception(
                                "recurring generate failed tenant=%s template=%s", tenant.id, tpl.id
                            )
                await db.commit()
                results.append(
                    {
                        "tenant_id": tenant.id,
                        "post_dated_activated": activated,
                        "recurring_generated": generated,
                    }
                )
            except Exception:
                logger.exception("advanced voucher daily failed tenant=%s", tenant.id)
                await db.rollback()
                results.append({"tenant_id": tenant.id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="finance.advanced_voucher_daily")
def advanced_voucher_daily() -> dict:
    """Activate due post-dated vouchers and generate recurring templates."""
    return asyncio.run(_run_all_tenants())
