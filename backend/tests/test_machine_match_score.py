"""Phase 1B: pure machine-match scoring (no DB)."""
from __future__ import annotations

from collections import Counter
from decimal import Decimal

from app.modules.mfg_intelligence.machine_match_service import MachineProfile, score_match


def test_perfect_match():
    req = MachineProfile(counts={"SNLS": 10, "OL_5T": 4}, smv_weights={"SNLS": Decimal("20"), "OL_5T": Decimal("8")})
    avail = Counter({"SNLS": 10, "OL_5T": 4})
    pool = Counter()
    out = score_match(req, avail, pool)
    assert out["match_pct"] == "100.00"
    assert out["swap_count"] == 0
    assert out["pool_can_cover"] is True


def test_shortage_uses_pool():
    req = MachineProfile(counts={"SNLS": 10}, smv_weights={"SNLS": Decimal("10")})
    avail = Counter({"SNLS": 7})
    pool = Counter({"SNLS": 5})
    out = score_match(req, avail, pool)
    assert float(out["match_pct"]) == 70.0
    assert out["swap_count"] == 3
    assert out["pool_can_cover"] is True
    assert out["shortage_machines"][0]["short"] == 3


def test_pool_cannot_cover():
    req = MachineProfile(counts={"FLATLOCK": 2}, smv_weights={"FLATLOCK": Decimal("2")})
    avail = Counter()
    pool = Counter({"FLATLOCK": 1})
    out = score_match(req, avail, pool)
    assert out["pool_can_cover"] is False
    assert out["swap_count"] == 2
