"""Unexpected errors must not leak internal exception text in API responses.

Each test forces a service call to raise an "internal" error and checks that the
endpoint answers with a generic message, rolls back the session, and still passes
intentional business errors (HTTPException / ValueError) through unchanged.
"""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.modules.hr_compliance import router as hr_compliance_router
from app.modules.inventory import grn_qc_router, inventory_analytics_router, mrp_idt_router
from app.modules.inventory import router as inventory_router
from app.modules.inventory import serial_kit_consignment_router as skc_router

INTERNAL_TEXT = 'relation "secret_internal_table" does not exist'


class _EmptyResult:
    def scalars(self):
        return self

    def all(self):
        return []


class FakeSession:
    """Just enough of AsyncSession for the endpoints under test."""

    def __init__(self, get_result=None):
        self.rollbacks = 0
        self.get_result = get_result

    async def rollback(self):
        self.rollbacks += 1

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def get(self, model, pk):
        return self.get_result

    async def execute(self, *args, **kwargs):
        return _EmptyResult()


def _tenant():
    return SimpleNamespace(id=1, feature_flags={})


def _user():
    return SimpleNamespace(id=7, tenant_id=1)


async def _allow(*args, **kwargs):
    return None


def _raise(exc: Exception):
    async def _fn(*args, **kwargs):
        raise exc

    return _fn


@pytest.fixture
def open_gates(monkeypatch):
    """Turn off feature-flag and permission checks so the try block runs."""
    for mod in (skc_router, mrp_idt_router, inventory_analytics_router, grn_qc_router, hr_compliance_router):
        monkeypatch.setattr(mod, "assert_soft_permission_allowed", _allow)
    monkeypatch.setattr(skc_router, "_require_kit", lambda t: None)
    monkeypatch.setattr(skc_router, "_require_serial", lambda t: None)
    monkeypatch.setattr(skc_router, "_require_consignment", lambda t: None)
    monkeypatch.setattr(mrp_idt_router, "_require_mrp", lambda t: None)
    monkeypatch.setattr(mrp_idt_router, "_require_idt", lambda t: None)
    monkeypatch.setattr(inventory_analytics_router, "_require_abc", lambda t: None)
    monkeypatch.setattr(inventory_analytics_router, "_require_cycle", lambda t: None)
    monkeypatch.setattr(grn_qc_router, "_require_qc", lambda t: None)
    monkeypatch.setattr(hr_compliance_router, "_require_compliance", lambda t: None)


def _assert_generic(exc_info, db: FakeSession):
    assert exc_info.value.status_code == 500
    assert INTERNAL_TEXT not in str(exc_info.value.detail)
    assert "secret_internal_table" not in str(exc_info.value.detail)
    assert "Please try again or contact support" in str(exc_info.value.detail)
    assert db.rollbacks >= 1


# ---- Serial / kit / consignment ----


async def test_kit_sell_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(skc_router.kitting_service, "sell_kit", _raise(RuntimeError(INTERNAL_TEXT)))
    db = FakeSession()
    body = skc_router.KitOrderBody(kit_id=1, qty=Decimal("1"), warehouse_id=1)
    with pytest.raises(HTTPException) as ei:
        await skc_router.sell_kit(body=body, tenant=_tenant(), user=_user(), db=db)
    _assert_generic(ei, db)


async def test_kit_sell_keeps_business_http_error(monkeypatch, open_gates):
    business = HTTPException(status_code=400, detail="Insufficient stock for component")
    monkeypatch.setattr(skc_router.kitting_service, "sell_kit", _raise(business))
    db = FakeSession()
    body = skc_router.KitOrderBody(kit_id=1, qty=Decimal("1"), warehouse_id=1)
    with pytest.raises(HTTPException) as ei:
        await skc_router.sell_kit(body=body, tenant=_tenant(), user=_user(), db=db)
    assert ei.value.status_code == 400
    assert ei.value.detail == "Insufficient stock for component"


async def test_consignment_settle_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(
        skc_router.consignment_service, "settle_consignment", _raise(RuntimeError(INTERNAL_TEXT))
    )
    db = FakeSession()
    body = skc_router.ConsignmentSettleBody(vendor_id=1)
    with pytest.raises(HTTPException) as ei:
        await skc_router.settle_consignment(body=body, tenant=_tenant(), user=_user(), db=db)
    _assert_generic(ei, db)


def test_http_response_body_is_generic(monkeypatch, open_gates):
    monkeypatch.setattr(skc_router.kitting_service, "sell_kit", _raise(RuntimeError(INTERNAL_TEXT)))
    app = FastAPI()
    app.include_router(skc_router.router)
    db = FakeSession()

    async def _db():
        yield db

    app.dependency_overrides[require_tenant] = _tenant
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_db] = _db
    with TestClient(app) as client:
        res = client.post("/inventory/kits/sell", json={"kit_id": 1, "qty": "1", "warehouse_id": 1})
    assert res.status_code == 500
    assert "secret_internal_table" not in res.text
    assert "Please try again or contact support" in res.json()["detail"]


# ---- MRP / IDT ----


async def test_mrp_run_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(mrp_idt_router.mrp_engine_service, "run_mrp", _raise(RuntimeError(INTERNAL_TEXT)))
    db = FakeSession()
    with pytest.raises(HTTPException) as ei:
        await mrp_idt_router.run_mrp(body=mrp_idt_router.MRPRunBody(), tenant=_tenant(), user=_user(), db=db)
    _assert_generic(ei, db)


async def test_mrp_run_keeps_value_error_message(monkeypatch, open_gates):
    monkeypatch.setattr(mrp_idt_router.mrp_engine_service, "run_mrp", _raise(ValueError("Item not found")))
    db = FakeSession()
    with pytest.raises(HTTPException) as ei:
        await mrp_idt_router.run_mrp(body=mrp_idt_router.MRPRunBody(), tenant=_tenant(), user=_user(), db=db)
    assert ei.value.status_code == 400
    assert ei.value.detail == "Item not found"


async def test_idt_receive_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(mrp_idt_router.idt_service, "receive_idt", _raise(RuntimeError(INTERNAL_TEXT)))
    db = FakeSession()
    body = mrp_idt_router.IDTReceiveBody(target_qty_received=Decimal("5"))
    with pytest.raises(HTTPException) as ei:
        await mrp_idt_router.receive_idt(idt_id=3, body=body, tenant=_tenant(), user=_user(), db=db)
    _assert_generic(ei, db)


# ---- ABC / cycle count ----


async def test_abc_run_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(
        inventory_analytics_router.abc_analysis_service, "run_abc_analysis", _raise(RuntimeError(INTERNAL_TEXT))
    )
    db = FakeSession()
    with pytest.raises(HTTPException) as ei:
        await inventory_analytics_router.run_abc_analysis(body=None, tenant=_tenant(), user=_user(), db=db)
    _assert_generic(ei, db)


async def test_cycle_count_submit_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(
        inventory_analytics_router.cycle_count_service, "submit_cycle_count", _raise(RuntimeError(INTERNAL_TEXT))
    )
    db = FakeSession()
    body = inventory_analytics_router.CycleSubmitBody(counted_qty=Decimal("2"))
    with pytest.raises(HTTPException) as ei:
        await inventory_analytics_router.cycle_count_submit(
            task_id=4, body=body, tenant=_tenant(), user=_user(), db=db
        )
    _assert_generic(ei, db)


# ---- GRN QC ----


async def test_grn_inspect_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(grn_qc_router.grn_qc_service, "create_inspection", _raise(RuntimeError(INTERNAL_TEXT)))
    db = FakeSession()
    body = grn_qc_router.InspectBody(lines=[grn_qc_router.InspectLineBody(grn_item_id=1)])
    with pytest.raises(HTTPException) as ei:
        await grn_qc_router.grn_inspect(grn_id=2, body=body, tenant=_tenant(), user=_user(), db=db)
    _assert_generic(ei, db)


# ---- HR compliance ----


async def test_audit_readiness_hides_internal_error(monkeypatch, open_gates):
    monkeypatch.setattr(
        hr_compliance_router, "generate_audit_readiness_report", _raise(RuntimeError(INTERNAL_TEXT))
    )
    db = FakeSession()
    with pytest.raises(HTTPException) as ei:
        await hr_compliance_router.get_audit_readiness(framework_id=9, tenant=_tenant(), user=_user(), db=db)
    _assert_generic(ei, db)


async def test_audit_readiness_keeps_not_found_message(monkeypatch, open_gates):
    monkeypatch.setattr(
        hr_compliance_router, "generate_audit_readiness_report", _raise(ValueError("Framework not found"))
    )
    db = FakeSession()
    with pytest.raises(HTTPException) as ei:
        await hr_compliance_router.get_audit_readiness(framework_id=9, tenant=_tenant(), user=_user(), db=db)
    assert ei.value.status_code == 404
    assert ei.value.detail == "Framework not found"


# ---- BOM -> PO alias in the main inventory router ----


def _bom_po_setup(monkeypatch, exc: Exception) -> FakeSession:
    from app.modules.merch import bom_procurement_service, execution_gates

    monkeypatch.setattr(execution_gates, "assert_sample_approvals_for_po", _allow)
    monkeypatch.setattr(bom_procurement_service, "bulk_create_pos_by_vendor", _raise(exc))
    return FakeSession(get_result=SimpleNamespace(id=11, tenant_id=1, order_id=5, status="APPROVED"))


async def test_po_from_bom_hides_internal_error(monkeypatch):
    db = _bom_po_setup(monkeypatch, RuntimeError(INTERNAL_TEXT))
    with pytest.raises(HTTPException) as ei:
        await inventory_router.generate_purchase_orders_from_bom(
            bom_id=11, tenant=_tenant(), user=_user(), db=db, _=None
        )
    _assert_generic(ei, db)


async def test_po_from_bom_keeps_value_error_message(monkeypatch):
    db = _bom_po_setup(monkeypatch, ValueError("Vendor not found"))
    with pytest.raises(HTTPException) as ei:
        await inventory_router.generate_purchase_orders_from_bom(
            bom_id=11, tenant=_tenant(), user=_user(), db=db, _=None
        )
    assert ei.value.status_code == 400
    assert ei.value.detail == "Vendor not found"
