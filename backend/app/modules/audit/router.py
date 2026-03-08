from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import AuditLog, User
from app.modules.audit.schemas import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    tenant=Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    """List audit logs for the current tenant. Requires auth."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant.id)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    rows = result.scalars().all()
    return [
        AuditLogResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            user_id=r.user_id,
            action=r.action,
            resource=r.resource,
            details=r.details,
            created_at=r.created_at,
        )
        for r in rows
    ]
