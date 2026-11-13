"""A18: GET endpoints perform no INSERT / UPDATE / DELETE (and nothing is added to the session).

Run: docker compose exec backend pytest tests/test_mfg_intelligence_read_only.py -q
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import event

from app.modules import mfg_intelligence
from tests.mfg_intel_fixtures import API, FLAGS_ON, MONDAY, add_holiday, add_order, add_plan, client_for
from tests.query_counting import is_rls_housekeeping
from tests.test_mfg_intelligence_readiness import FLAGS_V2_OFF, _ready_order

WINDOW = {"date_from": "2030-03-04", "date_to": "2030-03-15"}
_WRITE = re.compile(r"^\s*(INSERT|UPDATE|DELETE|TRUNCATE|MERGE)\b", re.IGNORECASE)
_FORBIDDEN_SOURCE = (
    "db.add(",
    "db.add_all(",
    ".flush(",
    ".commit(",
    ".delete(",
    ".merge(",
    "auto_advance_order_pipeline",
    "maybe_sync_followup",
    "maybe_auto_propose_line_booking",
    "line_reservation_service",
    "followup_sync_service",
)


async def _hit_every_endpoint(
    c, order_id: int, item_id: int | None = None, integrated: bool = False, style_id: int | None = None,
    phase3: bool = False, predictive: bool = False, advanced: bool = False,
) -> None:
    extra = ()
    if advanced:  # Phase 5 GETs (flag mfg_advanced_planning_v1): forward plan, scenarios, forecast, finance cut
        fp = f"{API}/forward-plan"
        extra += (
            (fp, {"horizon_days": 90}),
            (fp, {"horizon_days": 180, "bucket": "month", "scenario": "CAPACITY_CONSTRAINED"}),
            (f"{fp}/compare", {"scenarios": "BASE,OPTIMISTIC,CONSERVATIVE,CAPACITY_CONSTRAINED"}),
            (f"{fp}/forecast-demand", {"horizon_days": 120}),
            (f"{fp}/finance-constrained", {"horizon_days": 90}),
            (f"{API}/scheduler/preview", {"horizon_days": 180}),
            (f"{API}/planning-settings", {}),
        )
    if predictive:  # Phase 4 GETs (flag mfg_predictive_intelligence_v1): read-only, no snapshot / finding written
        today = date.today()
        extra += (
            (f"{API}/predictive/orders/{order_id}/delivery-forecast", {}),
            (f"{API}/predictive/line-efficiency", {}),
            (f"{API}/predictive/supplier-lateness", {}),
            (f"{API}/predictive/anomalies", {"date_from": (today.replace(day=1)).isoformat(), "date_to": today.isoformat()}),
            (f"{API}/predictive/calibration", {}),
            (f"{API}/recommendations", {"status": "ALL"}),
        )
    if phase3:  # Phase 3 GETs (flags mfg_cost_intelligence_v1 + mfg_financial_readiness_v1): read-only, no settings row
        extra += (
            (f"{API}/orders/{order_id}/cost-at-completion", {}),
            (f"{API}/cost-at-completion", {}),
            (f"{API}/cash-requirement", {"date_from": "2030-03-04", "horizon_days": 60}),
            (f"{API}/planning-settings", {}),
            (f"{API}/planning-permissions", {}),
        )
    if item_id is not None:  # Phase 2 GETs (flag mfg_material_allocation_v1)
        extra += (
            (f"{API}/items/{item_id}/allocation-availability", {}),
            (f"{API}/orders/{order_id}/materials/allocation", {}),
            (f"{API}/materials/conflicts", {}),
        )
    if integrated:  # Phase 2 GETs (flag mfg_integrated_planning_v1; R3): no write, no settings row inserted
        extra += (
            (f"{API}/bookings", WINDOW),
            (f"{API}/plan-revisions", {}),
            (f"{API}/tentative-demand", {}),
            (f"{API}/planning-settings", {}),
            # R4: line assignments, route stages, style standard SMV
            (f"{API}/line-assignments/employees", {}),
            (f"{API}/line-assignments/machines", {}),
            (f"{API}/route-stages", {"order_id": order_id}),
            (f"{API}/styles/{style_id}/standard-smv", {}),
            (f"{API}/planning-permissions", {}),
            (f"{API}/planning-people/employees", {"q": "a"}),
        )
    for url, params in extra + (
        (f"{API}/summary", WINDOW),
        (f"{API}/capacity", WINDOW),
        (f"{API}/line-loading", WINDOW),
        (f"{API}/orders/{order_id}/readiness", {}),
        (f"{API}/orders/{order_id}/delivery-prediction", {}),
    ):
        r = await c.get(url, params=params)
        assert r.status_code == 200, (url, r.text)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "flags",
    [
        FLAGS_ON,
        FLAGS_V2_OFF,
        {**FLAGS_ON, "mfg_material_allocation_v1": True},
        {**FLAGS_ON, "mfg_integrated_planning_v1": True},
        {**FLAGS_ON, "mfg_cost_intelligence_v1": True, "mfg_financial_readiness_v1": True},
        {**FLAGS_ON, "mfg_predictive_intelligence_v1": True},
        {**FLAGS_ON, "mfg_predictive_intelligence_v1": True, "mfg_material_allocation_v1": True,
         "mfg_integrated_planning_v1": True},
        {**FLAGS_ON, "mfg_advanced_planning_v1": True, "mfg_integrated_planning_v1": True,
         "mfg_predictive_intelligence_v1": True, "mfg_cost_intelligence_v1": True, "mfg_financial_readiness_v1": True},
    ],
)
async def test_get_endpoints_never_write(db_session_integration, flags):
    db = db_session_integration
    tenant, user, fx, order, _item, _bom = await _ready_order(db, flags=flags)
    alloc = bool(flags.get("mfg_material_allocation_v1"))
    integrated = bool(flags.get("mfg_integrated_planning_v1"))
    phase3 = bool(flags.get("mfg_cost_intelligence_v1"))
    predictive = bool(flags.get("mfg_predictive_intelligence_v1"))
    advanced = bool(flags.get("mfg_advanced_planning_v1"))
    if predictive:  # history, a snapshot, a finding and PO history so every Phase 4 path really runs
        from datetime import timedelta
        from decimal import Decimal

        from app.models import HourlyProductionEntry
        from app.models.inventory import PurchaseOrder, PurchaseOrderItem
        from app.models.mfg_predictive import MfgPredictionSnapshot, MfgPredictiveFinding

        today = date.today()
        hist = await add_plan(db, tenant, fx.line, start=today - timedelta(days=40), end=today - timedelta(days=1),
                              qty="99999", ob=fx.ob, style=fx.style, rs="COMPLETED")
        for back in range(1, 30):
            db.add(HourlyProductionEntry(tenant_id=tenant.id, department_type="sewing", line_id=fx.line.id,
                                         line_style_config_id=hist.id, style_id=fx.style.id,
                                         production_date=today - timedelta(days=back), hour_slot=1,
                                         good_qty=Decimal(500 + back * 7), reject_qty=Decimal(back % 4)))
        po = PurchaseOrder(tenant_id=tenant.id, po_code="PO-RO-P4", supplier_name="S", status="APPROVED",
                           expected_date=today + timedelta(days=3))
        old = PurchaseOrder(tenant_id=tenant.id, po_code="PO-RO-P4-OLD", supplier_name="S", status="APPROVED",
                            expected_date=today - timedelta(days=20))
        db.add_all([po, old])
        await db.flush()
        db.add_all([
            PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=po.id, item_id=_item.id, quantity=Decimal("5000")),
            PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=old.id, item_id=_item.id, quantity=Decimal("5")),
            MfgPredictionSnapshot(tenant_id=tenant.id, order_id=order.id, as_of_date=today - timedelta(days=20),
                                  target_date=today - timedelta(days=6), model_version="mi-forecast-4.0",
                                  band="AT_RISK", on_time_probability=Decimal("0.5")),
            MfgPredictiveFinding(tenant_id=tenant.id, finding_key="DELIVERY_RISK:RO", kind="DELIVERY_RISK",
                                 severity="high", priority=Decimal("3"), order_id=order.id, first_detected_on=today,
                                 last_detected_on=today, payload={"facts": []}),
        ])
        await db.flush()
    if phase3:  # money data so the cost / cash paths really run (PO, quotation budget, invoice, payroll period)
        from decimal import Decimal

        from app.models import Quotation
        from app.models.inventory import PurchaseOrder, PurchaseOrderItem

        q = Quotation(tenant_id=tenant.id, customer_id=fx.customer.id, quotation_code="Q-RO-1", currency="USD",
                      exchange_rate=Decimal("110"), total_amount=Decimal("1000"), material_cost=Decimal("600"),
                      manufacturing_cost=Decimal("200"), other_cost=Decimal("50"), projected_quantity=100, status="APPROVED")
        db.add(q)
        await db.flush()
        order.quotation_id = q.id
        po = PurchaseOrder(tenant_id=tenant.id, po_code="PO-RO-1", supplier_name="S", status="APPROVED", currency="USD",
                           exchange_rate_to_base=Decimal("110"), source_order_id=order.id, expected_date=date(2030, 3, 10))
        db.add(po)
        await db.flush()
        db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=po.id, item_id=_item.id, quantity=Decimal("5"),
                                 unit_price=Decimal("2")))
    await add_holiday(db, tenant, date(2030, 3, 6))
    await add_plan(db, tenant, fx.line, start=MONDAY, end=date(2030, 3, 8), qty="50", ob=fx.ob, rs="SOFT_BOOKED")
    await add_order(db, tenant, fx.customer, fx.style, status="DRAFT", delivery=date(2030, 3, 12))
    if integrated:
        from datetime import datetime, timedelta
        from decimal import Decimal

        from app.models import Inquiry
        from app.models.mfg_planning import MfgTentativeLineBooking

        inquiry = Inquiry(tenant_id=tenant.id, customer_id=fx.customer.id, inquiry_code="INQ-RO-1", status="OPEN")
        db.add(inquiry)
        await db.flush()
        db.add(
            MfgTentativeLineBooking(
                tenant_id=tenant.id, line_id=fx.line.id, inquiry_id=inquiry.id, style_id=fx.style.id, ob_id=fx.ob.id,
                start_date=MONDAY, planned_end_date=date(2030, 3, 8), planned_qty=Decimal("100"),
                smv_per_piece=Decimal("12.5"), confidence_pct=Decimal("50"),
                expires_at=datetime.utcnow() + timedelta(days=20), status="ACTIVE",
            )
        )
        # R4 data, so capacity / delivery take the assignment, route stage and style SMV paths
        from app.models import DepartmentMachine, Employee, OrderFollowupAction
        from app.models.mfg_planning import ProductionEmployeeLineAssignment, ProductionMachineLineAssignment

        emp = Employee(tenant_id=tenant.id, employee_code="RO-E1", first_name="Op", is_active=True)
        machine = DepartmentMachine(tenant_id=tenant.id, department_type="sewing", machine_code="RO-M1", name="SNLS")
        db.add_all([emp, machine])
        await db.flush()
        db.add_all([
            ProductionEmployeeLineAssignment(tenant_id=tenant.id, employee_id=emp.id, sewing_line_id=fx.line.id,
                                             valid_from=date(2030, 3, 1)),
            ProductionMachineLineAssignment(tenant_id=tenant.id, machine_id=machine.id, sewing_line_id=fx.line.id,
                                            valid_from=date(2030, 3, 1)),
            OrderFollowupAction(tenant_id=tenant.id, order_id=order.id, phase="production", title="Washing",
                                status="pending", stage_kind="EXTERNAL_PROCESS", stage_position="POST_SEWING",
                                lead_time_days=5),
        ])
        fx.style.standard_smv = Decimal("11.5")
        await db.flush()
    await db.commit()

    statements: list[str] = []
    conn = db.sync_session.get_bind()

    def _record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if not is_rls_housekeeping(statement):
            statements.append(statement)

    event.listen(conn, "before_cursor_execute", _record)
    try:
        async with client_for(db, tenant, user) as c:
            await _hit_every_endpoint(c, order.id, _item.id if alloc else None, integrated, fx.style.id, phase3,
                                      predictive, advanced)
    finally:
        event.remove(conn, "before_cursor_execute", _record)

    assert statements, "the listener recorded nothing - the test would prove nothing"
    writes = [s for s in statements if _WRITE.match(s)]
    assert writes == [], writes
    assert not db.new and not db.dirty and not db.deleted


def test_module_source_has_no_write_calls_or_write_services():
    package_dir = Path(mfg_intelligence.__file__).parent
    offenders: list[str] = []
    for path in package_dir.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        for token in _FORBIDDEN_SOURCE:
            if token in text:
                offenders.append(f"{path.name}: {token}")
    assert offenders == []
