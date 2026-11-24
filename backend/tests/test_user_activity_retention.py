"""User Activity retention + audit_logs immutability (migration 316).

Run:
  docker compose exec backend pytest tests/test_user_activity_retention.py -q
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.common.auth import hash_password
from app.models import AuditLog, Role, Tenant, User
from app.models.tenant import TenantType
from app.modules.audit.retention import purge_technical_audit_for_tenant, retention_cutoff
from app.modules.audit.service import log_action


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Retention {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"rt{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"admin_{slug}@example.com",
        username=f"admin_{slug}",
        password_hash=await hash_password("RetentionTest123!"),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    return tenant, user


@pytest.mark.asyncio
async def test_audit_business_row_cannot_be_updated_or_deleted(db_session_integration):
    db = db_session_integration
    tenant, user = await _seed(db)
    await log_action(
        db,
        tenant_id=tenant.id,
        action="LOGIN",
        user_id=user.id,
        resource="auth",
        details="keep me",
    )
    await db.commit()
    row = (
        await db.execute(
            text("SELECT id FROM audit_logs WHERE tenant_id = :tid AND action = 'LOGIN' ORDER BY id DESC LIMIT 1"),
            {"tid": tenant.id},
        )
    ).scalar_one()

    with pytest.raises(DBAPIError):
        await db.execute(
            text("UPDATE audit_logs SET details = 'tampered' WHERE id = :id"),
            {"id": row},
        )
        await db.commit()
    await db.rollback()

    with pytest.raises(DBAPIError):
        await db.execute(text("DELETE FROM audit_logs WHERE id = :id"), {"id": row})
        await db.commit()
    await db.rollback()


@pytest.mark.asyncio
async def test_purge_deletes_only_old_technical_rows(db_session_integration, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "audit_api_purge_dry_run", False)

    db = db_session_integration
    tenant, user = await _seed(db)
    old = datetime.utcnow() - timedelta(days=45)
    recent = datetime.utcnow() - timedelta(days=1)

    db.add(
        AuditLog(
            tenant_id=tenant.id,
            user_id=user.id,
            action="API_REQUEST",
            resource="GET /api/v1/orders",
            details="old api",
            created_at=old,
        )
    )
    db.add(
        AuditLog(
            tenant_id=tenant.id,
            user_id=user.id,
            action="API_REQUEST",
            resource="GET /api/v1/orders",
            details="new api",
            created_at=recent,
        )
    )
    db.add(
        AuditLog(
            tenant_id=tenant.id,
            user_id=user.id,
            action="LOGIN",
            resource="auth",
            details="business old",
            created_at=old,
        )
    )
    await db.commit()

    cutoff = retention_cutoff(retention_days=30)
    assert cutoff is not None
    result = await purge_technical_audit_for_tenant(
        db,
        tenant_id=tenant.id,
        cutoff=cutoff,
        batch_size=100,
        dry_run=False,
    )
    assert result["deleted"] >= 1

    remaining_api = (
        await db.execute(
            text(
                "SELECT details FROM audit_logs WHERE tenant_id = :tid AND action = 'API_REQUEST' ORDER BY id"
            ),
            {"tid": tenant.id},
        )
    ).scalars().all()
    assert "old api" not in remaining_api
    assert "new api" in remaining_api

    login_left = (
        await db.execute(
            text(
                "SELECT COUNT(*) FROM audit_logs WHERE tenant_id = :tid AND action = 'LOGIN' AND details = 'business old'"
            ),
            {"tid": tenant.id},
        )
    ).scalar_one()
    assert int(login_left) == 1


@pytest.mark.asyncio
async def test_purge_dry_run_does_not_delete(db_session_integration):
    db = db_session_integration
    tenant, user = await _seed(db)
    old = datetime.utcnow() - timedelta(days=60)
    db.add(
        AuditLog(
            tenant_id=tenant.id,
            user_id=user.id,
            action="API_ERROR",
            resource="GET /x",
            details="dry",
            created_at=old,
        )
    )
    await db.commit()
    cutoff = retention_cutoff(retention_days=30)
    result = await purge_technical_audit_for_tenant(
        db,
        tenant_id=tenant.id,
        cutoff=cutoff,
        batch_size=100,
        dry_run=True,
    )
    assert result["dry_run"] is True
    assert result["would_delete"] >= 1
    assert result["deleted"] == 0
    still = (
        await db.execute(
            text("SELECT COUNT(*) FROM audit_logs WHERE tenant_id = :tid AND details = 'dry'"),
            {"tid": tenant.id},
        )
    ).scalar_one()
    assert int(still) == 1
