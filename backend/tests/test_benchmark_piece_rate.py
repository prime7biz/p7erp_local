"""Roadmap item 17: piece-rate and SAM-minute pay from shop-floor scans, next to salary / daily wage.

Run: docker compose exec backend pytest tests/test_benchmark_piece_rate.py tests/test_payroll_auto_calculate.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.hr import Employee
from app.models.hr_payroll import (
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollStructure,
    PayrollStructureLine,
)
from app.models.production import CutTicket, CuttingBundle, LayPlan, MarkerPlan, OperationBulletin, OperationBulletinOp
from app.models.shop_floor_scan import BundleOperationScan
from app.modules.hr_payroll.formula_engine import assert_valid_calculation_type, calculate_component_amount
from app.modules.hr_payroll.payroll_calculation_service import calculate_employee_payroll
from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def test_preview_api_schema_exposes_every_preview_field():
    """The auto-calculate preview API must not silently drop fields the frontend reads (pay_basis, pieces...)."""
    from dataclasses import fields

    from app.modules.hr_payroll.payroll_calculation_service import EmployeeCalcPreview
    from app.modules.hr_payroll.schemas import PayrollEmployeeCalcPreviewOut

    internal_only = {"trace"}
    missing = {f.name for f in fields(EmployeeCalcPreview)} - internal_only - set(PayrollEmployeeCalcPreviewOut.model_fields)
    assert not missing, f"Preview fields missing from API schema: {sorted(missing)}"


def test_preview_endpoint_copies_every_preview_field():
    """The preview endpoint builds the response field by field; a field it forgets silently shows its default."""
    import inspect
    from dataclasses import fields

    from app.modules.hr_payroll import router
    from app.modules.hr_payroll.payroll_calculation_service import EmployeeCalcPreview

    source = inspect.getsource(router.auto_calculate_preview)
    not_copied = [
        f.name
        for f in fields(EmployeeCalcPreview)
        if f.name not in {"trace", "components"} and f"{f.name}=e.{f.name}" not in source
    ]
    assert not not_copied, f"auto_calculate_preview does not copy: {not_copied}"


def test_formula_engine_output_types():
    assert assert_valid_calculation_type("per_piece") == "PER_PIECE"
    assert calculate_component_amount(calculation_type="PER_PIECE", amount="2.5", pieces=40) == Decimal("100.0000")
    assert calculate_component_amount(calculation_type="PER_SAM_MINUTE", amount="1.5", earned_minutes="22.5") == Decimal("33.7500")
    assert calculate_component_amount(calculation_type="PER_DAY", amount="600", days_present=26) == Decimal("15600.0000")


async def _scans(db, tenant, code: str):
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    slug = uuid.uuid4().hex[:6]
    ob = OperationBulletin(tenant_id=tenant.id, style_id=style.id, ob_code=f"OB-{slug}", version_no=1)
    marker = MarkerPlan(tenant_id=tenant.id, marker_code=f"MK-{slug}")
    db.add_all([ob, marker])
    await db.flush()
    collar = OperationBulletinOp(tenant_id=tenant.id, ob_id=ob.id, sequence_no=1, operation_name="Collar", smv=Decimal("0.5"))
    side = OperationBulletinOp(tenant_id=tenant.id, ob_id=ob.id, sequence_no=2, operation_name="Side seam", smv=Decimal("0.8"))
    lay = LayPlan(tenant_id=tenant.id, marker_plan_id=marker.id, lay_code=f"LAY-{slug}")
    db.add_all([collar, side, lay])
    await db.flush()
    ct = CutTicket(tenant_id=tenant.id, order_id=order.id, lay_plan_id=lay.id, ticket_code=f"CT-{slug}")
    db.add(ct)
    await db.flush()
    b1 = CuttingBundle(tenant_id=tenant.id, cut_ticket_id=ct.id, order_id=order.id, bundle_no="B1", barcode=f"PR{slug}1", qty_in_bundle=25)
    b2 = CuttingBundle(tenant_id=tenant.id, cut_ticket_id=ct.id, order_id=order.id, bundle_no="B2", barcode=f"PR{slug}2", qty_in_bundle=20)
    db.add_all([b1, b2])
    await db.flush()
    now = datetime.utcnow()

    def scan(bundle, op, pieces, who, when):
        return BundleOperationScan(tenant_id=tenant.id, client_key=uuid.uuid4().hex, bundle_id=bundle.id, order_id=order.id,
                                   ob_op_id=op.id, operation_name=op.operation_name, smv=op.smv, pieces=pieces,
                                   operator_code=who, scanned_at=when)

    db.add_all([
        scan(b1, collar, 25, code.lower(), now - timedelta(days=1)),  # code match is case-insensitive
        scan(b2, collar, 20, f" {code} ", now - timedelta(days=2)),
        scan(b1, side, 25, "SOMEONE-ELSE", now - timedelta(days=1)),
        scan(b2, side, 20, code, now - timedelta(days=60)),  # outside the pay period
    ])
    await db.flush()


@pytest.mark.asyncio
async def test_piece_rate_worker_paid_from_scans(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await create_admin_tenant_with_user(db)
    slug = uuid.uuid4().hex[:6]
    code = f"OP{slug}"[:12].upper()
    emp = Employee(tenant_id=tenant.id, employee_code=code, first_name="Piece", last_name="Worker", is_active=True)
    piece = PayrollComponent(tenant_id=tenant.id, code=f"PC{slug}", name="Piece wage", component_type="EARNING",
                             calculation_type="PER_PIECE", is_active=True)
    sam = PayrollComponent(tenant_id=tenant.id, code=f"SM{slug}", name="SAM bonus", component_type="EARNING",
                           calculation_type="PER_SAM_MINUTE", is_active=True)
    structure = PayrollStructure(tenant_id=tenant.id, code=f"PS{slug}", name="Piece rate", is_active=True)
    db.add_all([emp, piece, sam, structure])
    await db.flush()
    db.add_all([
        PayrollStructureLine(tenant_id=tenant.id, structure_id=structure.id, component_id=piece.id, amount=Decimal("2"), sort_order=0),
        PayrollStructureLine(tenant_id=tenant.id, structure_id=structure.id, component_id=sam.id, amount=Decimal("1.5"), sort_order=1),
        PayrollEmployeeStructureAssignment(tenant_id=tenant.id, employee_id=emp.id, structure_id=structure.id,
                                           effective_from=date.today() - timedelta(days=90), base_salary=Decimal("12500")),
    ])
    today = date.today()
    period = PayrollPeriod(tenant_id=tenant.id, period_code=f"PP{slug}", start_date=today - timedelta(days=9),
                           end_date=today, payment_date=today, status="OPEN", is_locked=False)
    db.add(period)
    await _scans(db, tenant, code)
    await db.flush()

    preview = await calculate_employee_payroll(db, tenant_id=tenant.id, employee=emp, period=period)

    assert preview.pay_basis == "PIECE"
    assert Decimal(preview.pieces) == Decimal("45")
    assert Decimal(preview.earned_minutes) == Decimal("22.5")
    amounts = {c.calculation_type: Decimal(c.amount) for c in preview.components}
    assert amounts["PER_PIECE"] == Decimal("90")
    assert amounts["PER_SAM_MINUTE"] == Decimal("33.75")
    assert Decimal(preview.gross_pay) == Decimal("123.75")
    assert any("below the base salary / minimum wage" in w for w in preview.warnings)
    assert preview.trace["pieces"] and preview.trace["pay_basis"] == "PIECE"


@pytest.mark.asyncio
async def test_mixed_fixed_plus_piece_bonus_no_minimum_wage_warning(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await create_admin_tenant_with_user(db)
    slug = uuid.uuid4().hex[:6]
    code = f"OP{slug}"[:12].upper()
    emp = Employee(tenant_id=tenant.id, employee_code=code, first_name="Mixed", last_name="Worker", is_active=True)
    basic = PayrollComponent(tenant_id=tenant.id, code=f"BA{slug}", name="Basic", component_type="EARNING",
                             calculation_type="FIXED", is_active=True)
    piece = PayrollComponent(tenant_id=tenant.id, code=f"PB{slug}", name="Piece bonus", component_type="EARNING",
                             calculation_type="PER_PIECE", is_active=True)
    structure = PayrollStructure(tenant_id=tenant.id, code=f"MX{slug}", name="Basic + piece bonus", is_active=True)
    db.add_all([emp, basic, piece, structure])
    await db.flush()
    db.add_all([
        PayrollStructureLine(tenant_id=tenant.id, structure_id=structure.id, component_id=basic.id, amount=Decimal("10000"), sort_order=0),
        PayrollStructureLine(tenant_id=tenant.id, structure_id=structure.id, component_id=piece.id, amount=Decimal("2"), sort_order=1),
        PayrollEmployeeStructureAssignment(tenant_id=tenant.id, employee_id=emp.id, structure_id=structure.id,
                                           effective_from=date.today() - timedelta(days=90), base_salary=Decimal("10000")),
    ])
    today = date.today()
    period = PayrollPeriod(tenant_id=tenant.id, period_code=f"MX{slug}", start_date=today - timedelta(days=9),
                           end_date=today, payment_date=today, status="OPEN", is_locked=False)
    db.add(period)
    await _scans(db, tenant, code)
    await db.flush()

    preview = await calculate_employee_payroll(db, tenant_id=tenant.id, employee=emp, period=period)

    assert preview.pay_basis == "PIECE"
    assert Decimal(preview.gross_pay) == Decimal("10090")
    assert not any("minimum wage" in w for w in preview.warnings)
