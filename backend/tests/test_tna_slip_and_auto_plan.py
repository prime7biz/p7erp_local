"""Phase 1A: TNA working-calendar dates + read-only slip cascade (pure unit tests)."""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

from app.modules.merch.tna_auto_plan_service import planned_date_from_delivery, subtract_working_days
from app.modules.merch.tna_slip_service import compute_tna_slip_impact


def test_subtract_working_days_skips_weekend():
    # Friday 2026-11-20; 1 working day back stays Friday; 2 -> Thursday
    fri = date(2026, 11, 20)
    assert subtract_working_days(fri, 1, weekend_days=["saturday", "sunday"], overrides={}) == fri
    assert subtract_working_days(fri, 2, weekend_days=["saturday", "sunday"], overrides={}) == date(2026, 11, 19)


def test_planned_date_calendar_vs_raw():
    delivery = date(2026, 11, 23)  # Monday
    raw = planned_date_from_delivery(
        delivery, 2, use_working_calendar=False, weekend_days=None, overrides={}
    )
    cal = planned_date_from_delivery(
        delivery,
        2,
        use_working_calendar=True,
        weekend_days=["saturday", "sunday"],
        overrides={},
    )
    assert raw == date(2026, 11, 21)  # Saturday (raw calendar)
    assert cal == date(2026, 11, 20)  # Friday (working)


def test_slip_cascade_from_late_fabric():
    as_of = date(2026, 11, 20)
    fabric = SimpleNamespace(
        milestone_type="fabric_in_house",
        template_id=1,
        title="Fabric in-house",
        status="pending",
        planned_date=date(2026, 11, 10),
        actual_completion_date=None,
    )
    cutting = SimpleNamespace(
        milestone_type="cutting_start",
        template_id=2,
        title="Cutting start",
        status="pending",
        planned_date=date(2026, 11, 15),
        actual_completion_date=None,
    )
    sewing = SimpleNamespace(
        milestone_type="sewing_start",
        template_id=3,
        title="Sewing start",
        status="pending",
        planned_date=date(2026, 11, 18),
        actual_completion_date=None,
    )
    warnings = compute_tna_slip_impact(
        actions=[fabric, cutting, sewing],
        templates_by_id={},
        as_of=as_of,
        eta_by_milestone=None,
    )
    codes = {w.milestone_code for w in warnings}
    assert "cutting_start" in codes
    cut = next(w for w in warnings if w.milestone_code == "cutting_start")
    assert cut.slip_days > 0
    assert "fabric_in_house" in cut.cause_codes


def test_new_milestone_codes_in_seed():
    from app.modules.merch.constants import TNA_DEFAULT_TEMPLATE_SEED, TNA_EVENT_MILESTONE_MAP

    codes = {c for c, *_ in TNA_DEFAULT_TEMPLATE_SEED}
    assert "cad_marker_approved" in codes
    assert "line_machine_allocated" in codes
    assert "finishing_start" in codes
    assert "packing_complete" in codes
    assert TNA_EVENT_MILESTONE_MAP["finishing_start"] == ("finishing_start",)
