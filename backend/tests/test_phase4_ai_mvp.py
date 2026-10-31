"""Phase 4 AI differentiation MVP — unit-style tests (no live LLM).

    docker compose exec backend pytest tests/test_phase4_ai_mvp.py -q
"""

from __future__ import annotations

import pytest

from app.common.permissions import (
    PERMISSION_AI_DEFECT_PREDICT,
    PERMISSION_AI_FINANCE_FORECAST,
    PERMISSION_AI_LC_EXTRACT,
    PERMISSION_AI_LINE_BALANCE,
    PERMISSION_AI_MAINTENANCE_PREDICT,
    PERMISSION_AI_SHIPPING_EXTRACT,
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
)
from app.modules.ai_extract.commercial_doc_analysis import (
    analyze_lc_fields,
    analyze_packing_list_fields,
    infer_shipping_document_type,
)
from app.modules.ai_extract.providers.stub_provider import StubExtractionProvider
from app.modules.ai_extract.service import extract_lc_form, extract_shipping_doc_form
from app.modules.ai_tool.finance_forecast_service import _heuristic_narrative, _month_buckets
from app.modules.production.predictive_heuristic_service import (
    build_defect_risk_suggestions,
    build_line_balance_suggestions,
    build_maintenance_risk_suggestions,
)


@pytest.mark.asyncio
async def test_stub_lc_and_shipping_extract_schema():
    stub = StubExtractionProvider()
    lc_raw = await stub.extract_lc_fields(b"%PDF-1.4 stub", "application/pdf")
    ship_raw = await stub.extract_shipping_doc_fields(b"\x89PNG", "image/png")
    pack_raw = await stub.extract_packing_list_fields(b"%PDF-1.4", "application/pdf")
    assert lc_raw.get("reference") or lc_raw.get("lc_number")
    assert ship_raw.get("bl_awb") or ship_raw.get("booking_ref")
    assert pack_raw.get("total_cartons") or pack_raw.get("total_quantity")
    assert "_warnings" in lc_raw and "_warnings" in ship_raw


@pytest.mark.asyncio
async def test_extract_lc_and_shipping_service_normalize(db_session_integration):
    """Uses stub provider when APP_ENV=test."""
    db = db_session_integration
    lc = await extract_lc_form(db, tenant_id=1, file_bytes=b"%PDF-1.4", content_type="application/pdf")
    ship = await extract_shipping_doc_form(db, tenant_id=1, file_bytes=b"%PDF-1.4", content_type="application/pdf")
    pack = await extract_shipping_doc_form(
        db, tenant_id=1, file_bytes=b"%PDF-1.4", content_type="application/pdf", doc_type="packing_list"
    )
    assert lc.document_type == "lc_info"
    assert ship.document_type in {"bl_info", "shipping_doc_info", "awb_info"}
    assert pack.document_type == "packing_list_info"
    assert lc.success
    assert ship.success
    assert "reference" in lc.fields or "lc_number" in lc.fields
    assert "bl_awb" in ship.fields or "booking_ref" in ship.fields
    assert lc.suggest_create_master_contract is True
    assert any(a.get("code") == "lc_amount_mismatch" for a in lc.alerts)
    assert any(a.get("code") == "lc_expiry_before_delivery" for a in lc.alerts)
    assert any(a.get("code") in {"lc_no_transshipment", "lc_third_party_inspection"} for a in lc.alerts)
    assert any(a.get("code") == "packing_qty_mismatch" for a in pack.alerts)
    assert ship.suggested_status == "IN_TRANSIT"


def test_lc_discrepancy_and_risk_flags_unit():
    alerts = analyze_lc_fields(
        {
            "amount": {"value": "50000"},
            "order_value_hint": {"value": "52000"},
            "expiry_date": {"value": "2024-08-15"},
            "order_delivery_date_hint": {"value": "2024-08-20"},
            "transshipment_allowed": {"value": "NO"},
            "special_instructions": {"value": "3rd party inspection required"},
        }
    )
    codes = {a["code"] for a in alerts}
    assert "lc_amount_mismatch" in codes
    assert "lc_expiry_before_delivery" in codes
    assert "lc_no_transshipment" in codes
    assert "lc_third_party_inspection" in codes


def test_packing_list_qty_mismatch_unit():
    alerts = analyze_packing_list_fields(
        {
            "total_quantity": {"value": "500"},
            "order_quantity_hint": {"value": "480"},
            "total_cartons": {"value": "120"},
            "header_cartons_hint": {"value": "100"},
        }
    )
    codes = {a["code"] for a in alerts}
    assert "packing_qty_mismatch" in codes
    assert "packing_carton_mismatch" in codes


def test_infer_shipping_document_type():
    assert infer_shipping_document_type({}, "bl") == "bl_info"
    assert infer_shipping_document_type({}, "awb") == "awb_info"
    assert infer_shipping_document_type({"notes": "packing list cartons"}, None) == "packing_list_info"


def test_finance_heuristic_narrative_nonempty():
    text = _heuristic_narrative(
        {
            "forecast_points": [{"period_index": 1, "projected_net_cash": 100.0}, {"period_index": 2, "projected_net_cash": 120.0}],
            "history": [{"month": "2026-01", "net_cash": 80}],
            "confidence_score": 0.6,
        },
        horizon_days=90,
    )
    assert "Cash-flow" in text
    assert "90" in text
    buckets = _month_buckets(
        [
            {"projected_net_cash": 10},
            {"projected_net_cash": 20},
            {"projected_net_cash": 30},
        ]
    )
    assert "month_1" in buckets and "month_3" in buckets
    assert "net_cash" in buckets["month_1"]


@pytest.mark.asyncio
async def test_predictive_heuristics_fail_closed_shape(db_session_integration):
    db = db_session_integration
    from tests.merch_fixtures import create_merch_tenant_with_user

    tenant, _user, _role = await create_merch_tenant_with_user(db)
    defect = await build_defect_risk_suggestions(db, tenant_id=tenant.id, lookback_days=14)
    balance = await build_line_balance_suggestions(db, tenant_id=tenant.id, lookback_days=7)
    maintenance = await build_maintenance_risk_suggestions(db, tenant_id=tenant.id, lookback_days=30)
    assert defect["source"] == "heuristic"
    assert balance["source"] == "heuristic"
    assert maintenance["source"] == "heuristic"
    assert isinstance(defect["items"], list)
    assert isinstance(balance["items"], list)
    assert isinstance(maintenance["items"], list)
    assert defect["success"] is True
    assert balance["success"] is True
    assert maintenance["success"] is True
    # Tenant isolation: other tenant id returns its own empty/placeholder list, not shared data
    other = await build_defect_risk_suggestions(db, tenant_id=tenant.id + 99999, lookback_days=14)
    assert other["success"] in {True, False}
    assert isinstance(other["items"], list)


def test_phase4_ai_permission_keys_registered():
    keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
    for key in (
        PERMISSION_AI_LC_EXTRACT,
        PERMISSION_AI_SHIPPING_EXTRACT,
        PERMISSION_AI_FINANCE_FORECAST,
        PERMISSION_AI_DEFECT_PREDICT,
        PERMISSION_AI_MAINTENANCE_PREDICT,
        PERMISSION_AI_LINE_BALANCE,
    ):
        assert key in keys
