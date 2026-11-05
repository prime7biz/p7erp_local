"""Regression tests: TNA follow-up complete/reject and operation assignment no longer return 500.

Run:
    docker compose exec backend pytest tests/test_followup_and_execution_endpoints.py -q
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.models.merch import OrderFollowupAction
from tests.benchmark_fixtures import api_client
from tests.merch_fixtures import (
    _create_role_for_tenant,
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


async def _seed_action(db):
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    action = OrderFollowupAction(
        tenant_id=tenant.id,
        order_id=order.id,
        sequence_no=1,
        phase="fabric",
        title="Fabric in-house",
        status="pending",
        is_active=True,
        planned_date=date.today() + timedelta(days=10),
    )
    db.add(action)
    await db.flush()
    return tenant, user, action


@pytest.mark.asyncio
async def test_complete_followup_action_stores_naive_timestamp(db_session_integration):
    db = db_session_integration
    tenant, user, action = await _seed_action(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(f"/api/v1/merch/followup-actions/{action.id}/complete")
    assert r.status_code == 200, r.text
    await db.refresh(action)
    assert action.status == "completed"
    assert action.completed_at is not None
    assert action.completed_at.tzinfo is None


@pytest.mark.asyncio
async def test_reject_followup_action_via_history_and_patch(db_session_integration):
    db = db_session_integration
    tenant, user, action = await _seed_action(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(
            f"/api/v1/merch/followup-actions/{action.id}/rejection-history",
            json={"rejection_reason": "Shade off"},
        )
        assert r.status_code == 201, r.text
        r = await ac.patch(
            f"/api/v1/merch/followup-actions/{action.id}",
            json={"is_rejected": True, "rejection_reason": "Shade still off"},
        )
        assert r.status_code == 200, r.text
        history = await ac.get(f"/api/v1/merch/followup-actions/{action.id}/rejection-history")
    assert history.status_code == 200, history.text
    assert len(history.json()) == 2


@pytest.mark.asyncio
async def test_assign_operation_role_check_runs_without_error(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    body = {"work_order_operation_id": 999999999, "assigned_user_id": user.id}

    # Role "merch_tester" is not allowed to assign operations.
    async with api_client(db, tenant, user) as ac:
        r = await ac.post("/api/v1/manufacturing/execution/operations/assignments", json=body)
    assert r.status_code == 403, r.text

    supervisor = await _create_role_for_tenant(
        db, tenant_id=tenant.id, name="supervisor", display_name="Supervisor", permissions={"*": True}
    )
    user.role_id = supervisor.id
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        r = await ac.post("/api/v1/manufacturing/execution/operations/assignments", json=body)
    # Passes the role check and reaches the (missing) operation lookup.
    assert r.status_code == 404, r.text
