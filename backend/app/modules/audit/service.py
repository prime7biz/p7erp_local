from sqlalchemy.ext.asyncio import AsyncSession
from app.common.auth import current_impersonator_admin_id
from app.models import AuditLog


async def log_action(
    db: AsyncSession,
    tenant_id: int,
    action: str,
    user_id: int | None = None,
    resource: str | None = None,
    details: str | None = None,
) -> None:
    impersonator = current_impersonator_admin_id.get()
    if impersonator is not None:
        tag = f"impersonated_by_platform_admin={impersonator}"
        details = f"{details} [{tag}]" if details else tag
    entry = AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource=resource,
        details=details,
    )
    db.add(entry)
    await db.flush()
