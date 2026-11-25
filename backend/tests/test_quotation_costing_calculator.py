"""Dozen-first quotation costing calculator (pure Decimal maths, no database).

Run:
    docker compose exec backend pytest tests/test_quotation_costing_calculator.py -q
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from app.modules.quotations.quotation_costing_calculator import (
    CmInput,
    CommissionInput,
    CostingCalcError,
    MaterialInput,
    OtherCostInput,
    QuotationInput,
    compute_cm,
    compute_material,
    compute_other_cost,
    compute_quotation,
    q4,
)

D = Decimal
FIXTURE = Path(__file__).parent / "fixtures" / "quotation_costing_parity.json"


def _mat(cons="2.5", price="4", wastage=None, fx="1"):
    return MaterialInput(D(cons), D(price), D(wastage) if wastage is not None else None, D(fx))


def _quote(**kw) -> QuotationInput:
    base = dict(
        materials=[_mat(), _mat("0.3", "10")],
        manufacturing=[CmInput(mode="SMV_CPM", smv=D("12"), cpm=D("0.05"), cpm_basis="EARNED_MIN")],
        other_costs=[OtherCostInput(cost_type="fixed", value=D("1.8"), cost_basis="PER_DOZEN")],
        projected_qty=1200,
        profit_pct=D("15"),
    )
    base.update(kw)
    return QuotationInput(**base)


# ---------- materials ----------
def test_material_wastage_raises_effective_consumption():
    r = compute_material(_mat("2.5", "4", "10"))
    assert r.effective_consumption == D("2.75")
    assert r.amount_per_dozen == D("11")


def test_material_applies_line_fx():
    assert compute_material(_mat("2", "5", None, "110")).amount_per_dozen == D("1100")


def test_material_rejects_negative_and_absurd_wastage():
    with pytest.raises(CostingCalcError):
        compute_material(_mat("-1", "4"))
    with pytest.raises(CostingCalcError):
        compute_material(_mat("1", "4", "1001"))


# ---------- CM modes ----------
def test_cm_smv_cpm_earned_minute_ignores_efficiency():
    r = compute_cm(CmInput(mode="SMV_CPM", smv=D("12"), cpm=D("0.05"), cpm_basis="EARNED_MIN", efficiency_pct=D("50")))
    assert r.cm_per_piece == D("0.6")
    assert r.cost_per_dozen == D("7.2")


def test_cm_smv_cpm_available_minute_divides_by_efficiency():
    r = compute_cm(CmInput(mode="SMV_CPM", smv=D("12"), cpm=D("0.05"), cpm_basis="AVAILABLE_MIN", efficiency_pct=D("50")))
    assert r.cm_per_piece == D("1.2")


def test_cm_smv_cpm_needs_an_explicit_basis_and_valid_efficiency():
    with pytest.raises(CostingCalcError) as e:
        compute_cm(CmInput(mode="SMV_CPM", smv=D("12"), cpm=D("0.05")))
    assert e.value.code == "CM_CPM_BASIS_REQUIRED"
    with pytest.raises(CostingCalcError) as e2:
        compute_cm(CmInput(mode="SMV_CPM", smv=D("12"), cpm=D("0.05"), cpm_basis="AVAILABLE_MIN", efficiency_pct=D("0")))
    assert e2.value.code == "CM_EFFICIENCY_INVALID"


def test_cm_line_output_is_daily_line_cost_over_line_output_not_times_machines():
    r = compute_cm(
        CmInput(
            mode="LINE_OUTPUT",
            machines_required=20,
            cost_per_machine=D("25"),
            production_per_hour=D("60"),
            working_hours_per_day=D("8"),
        )
    )
    assert r.daily_line_cost == D("500")
    assert r.production_per_day == D("480")  # 60/hr x 8h for the whole line, never x 20 machines
    assert q4(r.cm_per_piece) == D("1.0417")
    assert r.cost_per_dozen == D("12.5")


def test_cm_line_output_needs_output_when_there_is_cost():
    with pytest.raises(CostingCalcError) as e:
        compute_cm(CmInput(mode="LINE_OUTPUT", machines_required=5, cost_per_machine=D("25"), production_per_hour=D("0")))
    assert e.value.code == "CM_LINE_OUTPUT_REQUIRED"


def test_cm_direct_per_dozen_and_per_piece():
    dz = compute_cm(CmInput(mode="DIRECT", direct_cm_basis="PER_DOZEN", stored_cost_per_dozen=D("10")))
    assert dz.cost_per_dozen == D("10")
    pc = compute_cm(CmInput(mode="DIRECT", direct_cm_basis="PER_PIECE", stored_cm_per_piece=D("0.8")))
    assert pc.cost_per_dozen == D("9.6")


def test_cm_legacy_line_keeps_stored_per_piece_value():
    r = compute_cm(CmInput(mode=None, stored_cm_per_piece=D("0.4167"), stored_cost_per_dozen=D("5")))
    assert r.cm_per_piece == D("0.4167")


# ---------- other costs ----------
def test_other_cost_fixed_bases():
    ctx = dict(material_per_dozen=D("13"), manufacturing_per_dozen=D("7.2"), projected_qty=2400)
    assert compute_other_cost(OtherCostInput("fixed", D("2"), cost_basis="PER_DOZEN"), **ctx).amount_per_dozen == D("2")
    assert compute_other_cost(OtherCostInput("fixed", D("0.1"), cost_basis="PER_PIECE"), **ctx).amount_per_dozen == D("1.2")
    # 1200 for the whole 2400 pcs order = 6 per dozen
    assert compute_other_cost(OtherCostInput("fixed", D("1200"), cost_basis="PER_ORDER"), **ctx).amount_per_dozen == D("6")


def test_other_cost_per_order_needs_quantity():
    with pytest.raises(CostingCalcError) as e:
        compute_other_cost(
            OtherCostInput("fixed", D("1200"), cost_basis="PER_ORDER"),
            material_per_dozen=D("1"),
            manufacturing_per_dozen=D("1"),
            projected_qty=0,
        )
    assert e.value.code == "OTHER_COST_NEEDS_QUANTITY"


def test_other_cost_percentage_bases_never_include_other_rows():
    ctx = dict(material_per_dozen=D("20"), manufacturing_per_dozen=D("10"), projected_qty=0)
    assert compute_other_cost(OtherCostInput("percentage", D("10"), based_on="materials"), **ctx).amount_per_dozen == D("2")
    assert compute_other_cost(OtherCostInput("percentage", D("10"), based_on="manufacturing"), **ctx).amount_per_dozen == D("1")
    assert compute_other_cost(OtherCostInput("percentage", D("10"), based_on="subtotal"), **ctx).amount_per_dozen == D("3")


# ---------- whole quotation ----------
def test_dozen_first_totals_and_markup_price():
    r = compute_quotation(_quote(materials=[_mat("2.5", "4", "10"), _mat("0.3", "10")]))
    assert r.material_per_dozen == D("14")
    assert r.manufacturing_per_dozen == D("7.2")
    assert r.other_per_dozen == D("1.8")
    assert r.total_cost_per_dozen == D("23")
    assert r.price_per_dozen == D("26.45")
    assert q4(r.price_per_piece) == D("2.2042")


def test_quantity_zero_still_prices_per_dozen():
    r = compute_quotation(_quote(projected_qty=0))
    assert r.total_cost_per_dozen == D("22")
    assert q4(r.price_per_piece) == q4(D("22") * D("1.15") / 12)


def test_markup_percentage_commission_included_is_added_on_top():
    r = compute_quotation(_quote(commission=CommissionInput("INCLUDE", "PERCENTAGE", D("5"))))
    assert r.price_per_dozen == D("22") * D("1.15") * D("1.05")


def test_excluded_commission_never_enters_the_price():
    r = compute_quotation(_quote(commission=CommissionInput("EXCLUDE", "PERCENTAGE", D("5"))))
    assert r.price_per_dozen == D("22") * D("1.15")
    assert r.commission_per_dozen == 0
    assert r.commission_memo_per_dozen > 0


def test_fixed_commission_is_per_order_and_needs_quantity():
    r = compute_quotation(_quote(commission=CommissionInput("INCLUDE", "FIXED", D("600"))))
    # 600 for 1200 pcs = 6 per dozen
    assert r.price_per_dozen == D("22") * D("1.15") + D("6")
    with pytest.raises(CostingCalcError) as e:
        compute_quotation(_quote(projected_qty=0, commission=CommissionInput("INCLUDE", "FIXED", D("600"))))
    assert e.value.code == "COMMISSION_NEEDS_QUANTITY"


def test_excluded_fixed_commission_does_not_need_quantity():
    r = compute_quotation(_quote(projected_qty=0, commission=CommissionInput("EXCLUDE", "FIXED", D("600"))))
    assert r.commission_per_dozen == 0


def test_margin_on_fob_is_a_share_of_the_price():
    r = compute_quotation(_quote(margin_method="MARGIN_ON_FOB"))
    assert q4(r.price_per_dozen) == q4(D("22") / D("0.85"))
    assert q4((r.price_per_dozen - r.total_cost_per_dozen) / r.price_per_dozen) == D("0.1500")


def test_margin_on_fob_with_included_percentage_commission():
    r = compute_quotation(_quote(margin_method="MARGIN_ON_FOB", commission=CommissionInput("INCLUDE", "PERCENTAGE", D("5"))))
    assert r.price_per_dozen == D("22") / D("0.80")
    assert r.commission_per_dozen == D("0.05") * r.price_per_dozen


def test_margin_on_fob_with_included_fixed_commission():
    r = compute_quotation(_quote(margin_method="MARGIN_ON_FOB", commission=CommissionInput("INCLUDE", "FIXED", D("600"))))
    assert q4(r.price_per_dozen) == q4((D("22") + D("6")) / D("0.85"))


def test_margin_on_fob_rejects_a_near_zero_denominator():
    with pytest.raises(CostingCalcError) as e:
        compute_quotation(_quote(margin_method="MARGIN_ON_FOB", profit_pct=D("99.5")))
    assert e.value.code == "MARGIN_ON_FOB_DENOMINATOR"


def test_manual_per_piece_price_is_authoritative():
    r = compute_quotation(_quote(manual_price_per_piece=D("2.5")))
    assert r.price_is_manual is True
    assert r.price_per_piece == D("2.5")
    assert r.price_per_dozen == D("30")


def test_non_terminating_division_is_rounded_once_per_stored_column():
    # cost 10.00 per dozen -> 10 / 12 = 0.83333... per piece; the order total must use the unrounded value.
    r = compute_quotation(
        QuotationInput(
            materials=[_mat("1", "10")],
            projected_qty=1200,
            profit_pct=D("0"),
        )
    )
    assert q4(r.price_per_piece) == D("0.8333")
    assert q4(r.price_per_piece * 1200) == D("1000.0000")  # not 0.8333 x 1200 = 999.96


def test_unknown_margin_method_is_rejected():
    with pytest.raises(CostingCalcError):
        compute_quotation(_quote(margin_method="NOPE"))


# ---------- shared parity fixtures (the frontend mirror must produce the same numbers) ----------
def _parse_quote(raw: dict) -> QuotationInput:
    comm = raw.get("commission") or {}
    return QuotationInput(
        materials=[MaterialInput(D(m["cons"]), D(m["price"]), D(m["wastage"]) if m.get("wastage") else None, D(m.get("fx", "1"))) for m in raw.get("materials", [])],
        manufacturing=[
            CmInput(
                mode=c["mode"],
                fx=D(c.get("fx", "1")),
                smv=D(c["smv"]) if c.get("smv") else None,
                efficiency_pct=D(c["eff"]) if c.get("eff") else None,
                cpm=D(c["cpm"]) if c.get("cpm") else None,
                cpm_basis=c.get("cpm_basis"),
                machines_required=int(c.get("machines", 0)),
                production_per_hour=D(c["pph"]) if c.get("pph") else None,
                working_hours_per_day=D(c["hours"]) if c.get("hours") else None,
                cost_per_machine=D(c["cost_machine"]) if c.get("cost_machine") else None,
                direct_cm_basis=c.get("direct_basis"),
                stored_cost_per_dozen=D(c["direct_dozen"]) if c.get("direct_dozen") else None,
                stored_cm_per_piece=D(c["direct_piece"]) if c.get("direct_piece") else None,
            )
            for c in raw.get("manufacturing", [])
        ],
        other_costs=[
            OtherCostInput(o["type"], D(o["value"]), o.get("based_on", "subtotal"), o.get("basis"), D(o.get("fx", "1")))
            for o in raw.get("other_costs", [])
        ],
        projected_qty=int(raw.get("qty", 0)),
        profit_pct=D(raw.get("profit_pct", "0")),
        margin_method=raw.get("margin_method", "MARKUP_ON_COST"),
        commission=CommissionInput(comm.get("mode"), comm.get("type"), D(comm.get("value", "0"))),
        manual_price_per_piece=D(raw["manual_pc"]) if raw.get("manual_pc") else None,
    )


def _fixture_cases() -> list[dict]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", _fixture_cases(), ids=lambda c: c["name"])
def test_parity_fixture_expected_values(case):
    r = compute_quotation(_parse_quote(case["input"]))
    exp = case["expected"]
    assert str(q4(r.material_per_dozen)) == exp["material_per_dozen"]
    assert str(q4(r.manufacturing_per_dozen)) == exp["manufacturing_per_dozen"]
    assert str(q4(r.other_per_dozen)) == exp["other_per_dozen"]
    assert str(q4(r.total_cost_per_dozen)) == exp["total_cost_per_dozen"]
    assert str(q4(r.price_per_dozen)) == exp["price_per_dozen"]
    assert str(q4(r.price_per_piece)) == exp["price_per_piece"]
