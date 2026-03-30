"""Unit tests for quotation costing intelligence (no database)."""

from __future__ import annotations

from types import SimpleNamespace

from app.modules.quotations.quotation_costing_intelligence import build_costing_intelligence_bundle


def test_bundle_flags_missing_materials() -> None:
    q = SimpleNamespace(
        currency="USD",
        target_price_currency="USD",
        exchange_rate="1",
        projected_quantity=100,
        style_id=1,
        style_ref=None,
        inquiry_id=1,
        size_ratio_enabled=False,
        material_cost="0",
        manufacturing_cost="0",
        other_cost="0",
        total_cost="0",
        quoted_price="100",
        total_amount=None,
    )
    b = build_costing_intelligence_bundle(q, material_lines=[], manufacturing_lines=[], other_cost_lines=[], size_ratio_lines=[])
    rcs = {x["reason_code"] for x in b["completeness_items"]}
    assert "missing_material_rows" in rcs
    assert "missing_material_rows" in b["reason_codes"]
    assert b["cost_completeness_score"] < 100


def test_bundle_detects_negative_line() -> None:
    q = SimpleNamespace(
        currency="USD",
        target_price_currency="USD",
        exchange_rate="1",
        projected_quantity=500,
        style_id=None,
        style_ref="X",
        inquiry_id=None,
        size_ratio_enabled=False,
        material_cost="10",
        manufacturing_cost="0",
        other_cost="0",
        total_cost="10",
        quoted_price="20",
        total_amount=None,
    )
    mats = [{"description": "A", "total_amount": "-5", "amount_per_dozen": "0", "currency": "USD"}]
    b = build_costing_intelligence_bundle(q, material_lines=mats, manufacturing_lines=[], other_cost_lines=[], size_ratio_lines=[])
    assert any(a["reason_code"] == "negative_line_amount" for a in b["anomaly_items"])
    assert "negative_line_amount" in b["reason_codes"]


def test_bundle_header_only_signal_scope_is_partial_basis() -> None:
    q = SimpleNamespace(
        currency="USD",
        target_price_currency="USD",
        exchange_rate="1",
        projected_quantity=100,
        style_id=1,
        style_ref=None,
        inquiry_id=1,
        size_ratio_enabled=False,
        material_cost="10",
        manufacturing_cost="10",
        other_cost="0",
        total_cost="20",
        quoted_price="100",
        total_amount=None,
    )
    mats = [{"description": "A", "total_amount": "10", "amount_per_dozen": "0", "currency": "USD"}]
    mfgs = [{"style_part": "S", "total_order_cost": "10", "total_line_cost": "0", "currency": "USD"}]
    b = build_costing_intelligence_bundle(
        q,
        material_lines=mats,
        manufacturing_lines=mfgs,
        other_cost_lines=[],
        size_ratio_lines=[],
        signal_scope="header_only",
    )
    assert b["signal_scope"] == "header_only"
    assert b["confidence_basis"] == "partial"
    assert b["limited_confidence"] is True
