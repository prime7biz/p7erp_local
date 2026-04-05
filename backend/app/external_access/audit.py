"""Write external audit log rows."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExternalAuditLog


async def log_external_action(
    db: AsyncSession,
    *,
    tenant_id: int,
    action: str,
    resource_type: str,
    resource_id: int | None = None,
    external_principal_id: int | None = None,
    internal_user_id: int | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    row = ExternalAuditLog(
        tenant_id=tenant_id,
        external_principal_id=external_principal_id,
        internal_user_id=internal_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details_json=details,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(row)
    await db.flush()
