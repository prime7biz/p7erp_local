"""TNA event sync: merch follow-up milestones complete from business events."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models.merch import OrderFollowupAction
from app.modules.merch.constants import (
    TNA_EVENT_GRN,
    TNA_EVENT_SAMPLE_APPROVED,
    milestones_for_event,
)
from app.modules.merch.followup_sync_service import sync_order_followup_from_events
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


def test_milestones_for_event_mapping():
    assert "fabric_in_house" in milestones_for_event(TNA_EVENT_GRN)
    assert "pp_approval" in milestones_for_event(TNA_EVENT_SAMPLE_APPROVED, sample_type="pp")
    assert milestones_for_event(TNA_EVENT_SAMPLE_APPROVED, sample_type="unknown") == ()


@pytest.mark.asyncio
async def test_sync_noop_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    order.delivery_date = date.today() + timedelta(days=60)
    db.add(
        OrderFollowupAction(
            tenant_id=tenant.id,
            order_id=order.id,
            sequence_no=1,
            phase="fabric",
            title="Fabric in-house",
            status="pending",
            is_active=True,
            milestone_type="fabric_in_house",
            planned_date=date.today() + timedelta(days=10),
        )
    )
    await db.commit()

    ids = await sync_order_followup_from_events(
        db,
        tenant_id=tenant.id,
        order_id=order.id,
        event_key=TNA_EVENT_GRN,
        user_id=user.id,
    )
    assert ids == []
    row = (
        await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.order_id == order.id,
                OrderFollowupAction.milestone_type == "fabric_in_house",
            )
        )
    ).scalar_one()
    assert row.status == "pending"


@pytest.mark.asyncio
async def test_sync_grn_completes_fabric_in_house(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "tna_event_sync": True}
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    order.delivery_date = date.today() + timedelta(days=60)
    db.add(
        OrderFollowupAction(
            tenant_id=tenant.id,
            order_id=order.id,
            sequence_no=1,
            phase="fabric",
            title="Fabric in-house",
            status="pending",
            is_active=True,
            milestone_type="fabric_in_house",
            planned_date=date.today() + timedelta(days=10),
        )
    )
    db.add(
        OrderFollowupAction(
            tenant_id=tenant.id,
            order_id=order.id,
            sequence_no=2,
            phase="production",
            title="Cutting start",
            status="pending",
            is_active=True,
            milestone_type="cutting_start",
            planned_date=date.today() + timedelta(days=20),
        )
    )
    await db.commit()

    ids = await sync_order_followup_from_events(
        db,
        tenant_id=tenant.id,
        order_id=order.id,
        event_key=TNA_EVENT_GRN,
        user_id=user.id,
        note="[auto-sync] test GRN",
    )
    await db.commit()
    assert len(ids) == 1

    fabric = (
        await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.order_id == order.id,
                OrderFollowupAction.milestone_type == "fabric_in_house",
            )
        )
    ).scalar_one()
    assert fabric.status == "completed"
    assert fabric.remarks and "[auto-sync]" in fabric.remarks

    cutting = (
        await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.order_id == order.id,
                OrderFollowupAction.milestone_type == "cutting_start",
            )
        )
    ).scalar_one()
    assert cutting.status == "pending"

    # Idempotent
    ids2 = await sync_order_followup_from_events(
        db,
        tenant_id=tenant.id,
        order_id=order.id,
        event_key=TNA_EVENT_GRN,
        user_id=user.id,
    )
    assert ids2 == []


@pytest.mark.asyncio
async def test_sync_sample_approval_pp(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "tna_event_sync": True}
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    db.add(
        OrderFollowupAction(
            tenant_id=tenant.id,
            order_id=order.id,
            sequence_no=1,
            phase="sampling",
            title="PP approval",
            status="pending",
            is_active=True,
            milestone_type="pp_approval",
        )
    )
    await db.commit()

    ids = await sync_order_followup_from_events(
        db,
        tenant_id=tenant.id,
        order_id=order.id,
        event_key=TNA_EVENT_SAMPLE_APPROVED,
        sample_type="pp",
        user_id=user.id,
    )
    await db.commit()
    assert len(ids) == 1
    row = (
        await db.execute(select(OrderFollowupAction).where(OrderFollowupAction.id == ids[0]))
    ).scalar_one()
    assert row.status == "completed"


@pytest.mark.asyncio
async def test_milestones_include_next_required_action(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    order.delivery_date = date.today() + timedelta(days=30)
    db.add(
        OrderFollowupAction(
            tenant_id=tenant.id,
            order_id=order.id,
            sequence_no=1,
            phase="approval",
            title="Lab dip approval",
            status="pending",
            is_active=True,
            is_mandatory=True,
            milestone_type="lab_dip_approval",
            planned_date=date.today() + timedelta(days=5),
        )
    )
    await db.commit()

    from app.modules.orders.pipeline_service import build_milestone_payload

    payload = await build_milestone_payload(db, tenant_id=tenant.id, order_id=order.id)
    assert payload.get("next_required_action")
    assert "Lab dip" in (payload["next_required_action"].get("label") or "")
