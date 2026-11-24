"""Phase 2/3 pure math: cutting 3-way variance + floor efficiency / DHU / RFT."""
from __future__ import annotations

from decimal import Decimal

from app.modules.production.cutting_control_service import three_way_variance
from app.modules.production.floor_monitor_service import dhu_pct, efficiency_pct, rft_pct
from app.modules.mfg_intelligence.feeding_readiness_service import classify


def test_three_way_excess_loss():
    out = three_way_variance(
        bom_per_dz=Decimal("10"),
        cad_per_dz=Decimal("10.5"),
        actual_per_dz=Decimal("12"),
        allowed_wastage_pct=Decimal("15"),
    )
    assert out["excess_loss"] is True
    assert float(out["process_loss_pct"]) == 20.0


def test_efficiency_and_dhu_rft():
    assert float(efficiency_pct(good_qty=Decimal("100"), smv=Decimal("12"), operators=Decimal("20"), run_minutes=Decimal("480"))) > 0
    assert float(dhu_pct(total_defects=Decimal("5"), total_checked=Decimal("100"))) == 5.0
    assert float(rft_pct(pass_qty=Decimal("95"), total_checked=Decimal("100"))) == 95.0


def test_feeding_classify_starvation():
    st = classify(
        fabric_pct=Decimal("50"),
        shade_ok=False,
        trims_pct=Decimal("50"),
        cut_days_buffer=Decimal("0.2"),
        days_to_start=2,
        buffer_days=3,
    )
    assert st == "STARVATION_RISK"
