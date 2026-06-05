"""Delete dependency guards return 409 when dependents exist."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.common.delete_guards import ensure_customer_deletable
from app.models.merch import Inquiry

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style


@pytest.mark.asyncio
async def test_customer_delete_guard_blocks_when_inquiry_exists(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    inquiry = Inquiry(
        tenant_id=tenant.id,
        customer_id=customer.id,
        style_id=style.id,
        inquiry_code=f"INQ-GUARD-{customer.id}",
        status="OPEN",
    )
    db.add(inquiry)
    await db.commit()

    with pytest.raises(HTTPException) as exc:
        await ensure_customer_deletable(db, tenant.id, customer.id)
    assert exc.value.status_code == 409
    assert "inquiries" in (exc.value.detail or "").lower()
