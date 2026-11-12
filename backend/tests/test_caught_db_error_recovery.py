"""Caught database errors must not leave the session unusable (RC-06).

Each test makes one statement fail with a real PostgreSQL error (it queries a table that does not
exist). Without a savepoint or rollback, PostgreSQL rejects every later statement in the transaction
with InFailedSQLTransactionError.

Run:
    docker compose exec backend pytest tests/test_caught_db_error_recovery.py -q
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select, text

from app.models import AiActionRun, ManufacturingWorkOrder, StockSerial
from app.common.tenant_feature_keys import SERIAL_TRACKING_ENABLED
from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order

MISSING = text("SELECT 1 FROM p7_table_that_does_not_exist")


def _fail_when(db, monkeypatch, needle: str):
    """Make statements whose SQL contains `needle` fail inside PostgreSQL.

    The real statement runs first (so an ORM query still autoflushes pending changes, as in
    production), then the failing one.
    """
    real_execute = db.execute

    async def execute(statement, *args, **kwargs):
        if needle in str(statement):
            await real_execute(statement, *args, **kwargs)
            return await real_execute(MISSING)
        return await real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", execute)
    return real_execute


async def _session_still_works(real_execute) -> None:
    assert (await real_execute(text("SELECT 1"))).scalar_one() == 1


@pytest.mark.asyncio
async def test_pipeline_optional_production_check_keeps_session_usable(db_session_integration, monkeypatch):
    from app.modules.orders.pipeline_service import _has_production

    db = db_session_integration
    tenant, _user, _ = await create_admin_tenant_with_user(db)
    await db.flush()
    real = _fail_when(db, monkeypatch, "hourly_production_entries")
    assert await _has_production(db, tenant.id, 999999) is False
    await _session_still_works(real)


@pytest.mark.asyncio
async def test_serial_import_skips_bad_rows_and_saves_good_ones(db_session_integration):
    from app.modules.inventory.serial_tracking_service import import_serials_csv

    db = db_session_integration
    tenant, _user, wh, _vendor, item = await seed_inventory_chain(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), SERIAL_TRACKING_ENABLED: True}
    await db.flush()
    sn = f"SN-{uuid.uuid4().hex[:8]}"
    out = await import_serials_csv(
        db,
        tenant,
        rows=[
            {"item_id": item.id, "serial_number": f"{sn}-A", "warehouse_id": wh.id},
            {"item_id": item.id, "serial_number": f"{sn}-B", "status": "X" * 500},  # too long for the column
            {"item_id": "abc", "serial_number": f"{sn}-C"},
            {"item_id": item.id, "serial_number": f"{sn}-D", "warehouse_id": wh.id},
        ],
    )
    assert out["created"] == 2
    assert len(out["errors"]) == 2
    saved = (
        await db.execute(select(StockSerial.serial_number).where(StockSerial.tenant_id == tenant.id))
    ).scalars().all()
    assert sorted(saved) == [f"{sn}-A", f"{sn}-D"]


@pytest.mark.asyncio
async def test_turnover_prediction_survives_failed_leave_balance_read(db_session_integration, monkeypatch):
    from app.models.hr import Employee
    from app.modules.ai_tool.ai_turnover_prediction_service import predict_turnover_risk

    db = db_session_integration
    tenant, _user, _ = await create_admin_tenant_with_user(db)
    db.add(Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker", is_active=True))
    await db.flush()
    real = _fail_when(db, monkeypatch, "hr_leave_balances")
    out = await predict_turnover_risk(db, tenant.id)
    assert out is not None
    await _session_still_works(real)


@pytest.mark.asyncio
async def test_failed_ai_action_is_recorded_as_failed(db_session_integration, monkeypatch):
    from app.modules.ai_tool import automation
    from app.modules.ai_tool.security import confirmation_token_hash, normalize_confirmation_token

    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    token = "ABCD-1234"
    run = AiActionRun(
        tenant_id=tenant.id,
        user_id=user.id,
        request_id=uuid.uuid4().hex,
        action_key="draft_reminder_trade_doc",
        status="PROPOSED",
        requires_confirmation=True,
        confirmation_token_hash=confirmation_token_hash(normalize_confirmation_token(token)),
        risk_level="LOW",
        prompt_text="remind me",
        input_json={},
    )
    db.add(run)
    await db.flush()

    async def broken_rule(session, tenant_id, config=None):
        await session.execute(MISSING)

    import app.modules.merch.alert_rules as alert_rules

    monkeypatch.setattr(alert_rules, "rule_trade_docs_missing_before_etd", broken_rule)
    _run, output, error = await automation.confirm_and_execute_action(
        db, tenant_id=tenant.id, user=user, action_run_id=run.id, confirmation_token=token
    )
    assert output is None
    assert "could not be completed" in error
    assert "p7_table_that_does_not_exist" not in error  # no raw SQL detail to the user
    await db.refresh(run)
    assert run.status == "FAILED"


@pytest.mark.asyncio
async def test_release_keeps_work_orders_when_material_estimate_fails(db_session_integration, monkeypatch):
    from app.modules.production.planning_router import ReleaseWorkOrdersBody, release_work_orders

    db = db_session_integration
    tenant, user, _wh, _vendor, item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    wo = ManufacturingWorkOrder(
        tenant_id=tenant.id, mo_number=f"MO-{uuid.uuid4().hex[:6]}", item_id=item.id, order_id=order.id, status="planned"
    )
    db.add(wo)
    await db.commit()
    wo_id, tenant_id = wo.id, tenant.id
    _fail_when(db, monkeypatch, "bom_items")
    _fail_when(db, monkeypatch, "boms.order_id")

    # Production sessions autoflush: the pending "released" updates must not land inside the savepoint.
    db.sync_session.autoflush = True
    try:
        out = await release_work_orders(
            body=ReleaseWorkOrdersBody(order_ids=[order.id]), tenant=tenant, user=user, db=db
        )
    finally:
        db.sync_session.autoflush = False
    assert out["released"] == 1
    assert out["material_count_estimate"] == 0
    db.expire_all()
    status = (
        await db.execute(
            select(ManufacturingWorkOrder.status).where(
                ManufacturingWorkOrder.id == wo_id, ManufacturingWorkOrder.tenant_id == tenant_id
            )
        )
    ).scalar_one()
    assert status == "released"
