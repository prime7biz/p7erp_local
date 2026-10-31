"""Sprint 3: auto-tax hooks on voucher create/update (flag-gated)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_auto_tax_calculation, is_gst_system_enabled
from app.models.finance import Voucher

logger = logging.getLogger(__name__)


async def maybe_auto_calculate_tax_on_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    *,
    feature_flags: Any = None,
    place_of_supply_state: str | None = None,
    direction: str | None = None,
) -> dict[str, Any] | None:
    """Best-effort apply tax when GST + auto_tax_calculation are on.

    Failures are logged and rolled back via savepoint so voucher create still succeeds.
    """
    if not is_gst_system_enabled(feature_flags):
        return None
    if not is_auto_tax_calculation(feature_flags):
        return None
    try:
        from app.modules.finance.tax_calculation_service import calculate_tax_on_voucher

        async with db.begin_nested():
            result = await calculate_tax_on_voucher(
                db,
                tenant_id,
                voucher.id,
                feature_flags=feature_flags,
                place_of_supply_state=place_of_supply_state,
                direction=direction,  # type: ignore[arg-type]
                apply=True,
            )
            return result
    except Exception as exc:
        # The savepoint above already rolled back only the tax work; a full session
        # rollback here would also discard the caller's unflushed voucher.
        logger.warning(
            "auto_tax_calculation skipped voucher_id=%s: %s",
            getattr(voucher, "id", None),
            exc,
        )
        return {"skipped": True, "reason": str(exc)}
