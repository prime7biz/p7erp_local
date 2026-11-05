"""Celery: activate post-dated vouchers + generate recurring vouchers daily."""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_post_dated_voucher_enabled, is_recurring_voucher_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.models.advanced_vouchers import RecurringVoucherTemplate
from app.modules.finance.advanced_voucher_service import (
    activate_due_post_dated,
    generate_from_recurring_template,
)
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            activated = 0
            generated = 0
            try:
                if is_post_dated_voucher_enabled(flags):
                    ids = await activate_due_post_dated(db, tenant_id, feature_flags=flags)
                    activated = len(ids)
                    if ids:
                        logger.info(
                            "post_dated_activated tenant=%s count=%s ids=%s",
                            tenant_id,
                            activated,
                            ids[:20],
                        )
                if is_recurring_voucher_enabled(flags):
                    templates = list(
                        (
                            await db.execute(
                                select(RecurringVoucherTemplate).where(
                                    RecurringVoucherTemplate.tenant_id == tenant_id,
                                    RecurringVoucherTemplate.is_active.is_(True),
                                )
                            )
                        )
                        .scalars()
                        .all()
                    )
                    template_rows = [(tpl.id, tpl.created_by, tpl) for tpl in templates]
                    for tpl_id, created_by, tpl in template_rows:
                        tpl_generated = 0
                        try:
                            # Savepoint: a failing template must not undo the others.
                            async with db.begin_nested():
                                # Catch up: generate while due
                                safety = 0
                                while safety < 24:
                                    safety += 1
                                    voucher = await generate_from_recurring_template(
                                        db, tenant_id, tpl, created_by=created_by
                                    )
                                    if not voucher:
                                        break
                                    tpl_generated += 1
                            generated += tpl_generated
                        except Exception:
                            logger.exception(
                                "recurring generate failed tenant=%s template=%s", tenant_id, tpl_id
                            )
                await db.commit()
                results.append(
                    {
                        "tenant_id": tenant_id,
                        "post_dated_activated": activated,
                        "recurring_generated": generated,
                    }
                )
            except Exception:
                logger.exception("advanced voucher daily failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="finance.advanced_voucher_daily")
def advanced_voucher_daily() -> dict:
    """Activate due post-dated vouchers and generate recurring templates."""
    return run_async(_run_all_tenants())
