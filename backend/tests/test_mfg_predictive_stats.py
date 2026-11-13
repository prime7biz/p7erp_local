"""Pure statistics of Phase 4 (plan 15 sections 17.12-17.14). No database.

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_stats.py -q
"""

from __future__ import annotations

from decimal import Decimal as D

from app.modules.mfg_intelligence import predictive_stats as st


def test_nearest_rank_uses_ceil_q_times_n():
    data = [D(x) for x in (5, 1, 4, 2, 3)]  # sorted 1..5
    assert st.nearest_rank(data, D("0.5")) == D(3)  # ceil(2.5) = 3
    assert st.nearest_rank(data, D("0.8")) == D(4)  # ceil(4.0) = 4
    assert st.nearest_rank(data, D("0.9")) == D(5)  # ceil(4.5) = 5
    assert st.nearest_rank(data, D("0.05")) == D(1)  # ceil(0.25) = 1
    assert st.nearest_rank(data, D("0")) == D(1)  # clamped to rank 1
    assert st.nearest_rank([], D("0.5")) is None
    ten = [D(i) for i in range(1, 11)]
    assert st.nearest_rank(ten, D("0.8")) == D(8)
    assert st.nearest_rank(ten, D("0.81")) == D(9)


def test_median_and_mad():
    assert st.median([D(1), D(2), D(3), D(4)]) == D("2.5")
    assert st.median([D(3), D(1), D(2)]) == D(2)
    assert st.mad([D(1), D(2), D(3), D(4), D(100)]) == D(1)


def test_winsorize_with_mad():
    values = [D(x) for x in ("0.55", "0.58", "0.60", "0.62", "0.65", "0.57", "0.63", "3.00")]
    out = st.winsorize(values)
    c = st.median(values)
    m = st.mad(values)
    assert m > 0
    high = c + D("3.5") * D("1.4826") * m
    assert out[-1] == high
    assert out[:7] == values[:7]


def test_winsorize_mad_zero_uses_mean_absolute_deviation():
    values = [D("0.6")] * 9 + [D("1.6")]  # MAD = 0, MeanAD = 0.1
    assert st.mad(values) == 0
    assert st.mean_abs_dev(values) == D("0.1")
    out = st.winsorize(values)
    assert out[-1] == D("0.6") + D("3.5") * D("1.253314") * D("0.1")


def test_winsorize_both_zero_is_identity():
    values = [D("0.5")] * 6
    assert st.winsor_limits(values) is None
    assert st.winsorize(values) == values


def test_ewma_seed_is_median_and_alpha_point_two():
    values = [D("0.5"), D("0.7")]
    seed = st.median(values)  # 0.6
    expected = D("0.2") * D("0.7") + D("0.8") * (D("0.2") * D("0.5") + D("0.8") * seed)
    assert st.ewma(values) == expected
    assert st.ewma([]) is None
    assert st.ewma([D("0.4")], seed=D("0.4")) == D("0.4")


def test_robust_cv_and_blend_weight():
    values = [D("0.5"), D("0.6"), D("0.7")]
    assert st.robust_cv(values) == D("1.4826") * D("0.1") / D("0.6")
    assert st.robust_cv([D("0"), D("0")]) is None
    assert st.blend_weight(9, D("0.05"), False) == 0
    assert st.blend_weight(10, D("0.05"), False) == D("0.25")  # continuous n / 40
    assert st.blend_weight(20, D("0.05"), False) == D("0.5")
    assert st.blend_weight(28, D("0.05"), False) == D("0.7")
    assert st.blend_weight(60, D("0.05"), False) == D("0.7")  # capped
    assert st.blend_weight(28, D("0.26"), False) == D("0.3")  # dispersion cap
    assert st.blend_weight(28, D("0.05"), True) == D("0.3")  # plan / OB changed cap
    assert st.blend_weight(10, D("0.26"), True) == D("0.25")  # cap never raises the weight


def test_robust_z_mad_meanad_and_both_zero():
    base = [D(x) for x in (10, 11, 12, 13, 14)]  # median 12, MAD 1
    assert st.robust_z(D(4), base) == D("0.6745") * D(-8) / D(1)
    flat = [D(10)] * 9 + [D(12)]  # MAD 0, MeanAD 0.2
    assert st.robust_z(D(9), flat) == D(-1) / (D("1.253314") * D("0.2"))
    assert st.robust_z(D(5), [D(7)] * 10) is None


def test_rolling_means():
    assert st.rolling_means([D(1), D(2), D(3), D(4)], 2) == [D("1.5"), D("2.5"), D("3.5")]
    assert st.rolling_means([D(1)], 2) == []


def test_probability_grid_ends():
    grid = [(q, i) for i, q in enumerate(st.GRID)]  # finish index grows with q
    assert st.probability_from_grid(grid, lambda f: False) == st.GRID_LOW_END == D("0.025")
    assert st.probability_from_grid(grid, lambda f: True) == st.GRID_HIGH_END == D("0.975")
    assert st.probability_from_grid(grid, lambda f: f <= 9) == D("0.50")
    assert len(st.GRID) == 19 and st.GRID[0] == D("0.05") and st.GRID[-1] == D("0.95")


def test_brier_and_bins():
    pairs = [(D("0.9"), True), (D("0.1"), False), (D("0.5"), True), (D("1.0"), False)]
    assert st.brier(pairs) == (D("0.01") + D("0.01") + D("0.25") + D("1")) / D(4)
    assert st.brier([]) is None
    bins = st.reliability_bins(pairs)
    assert [b["n"] for b in bins] == [1, 0, 1, 0, 2]  # 1.0 lands in the last bin
    assert bins[4]["hit_rate"] == D("0.5")
    assert bins[1]["mean_probability"] is None
    for value in (st.brier(pairs), bins[0]["mean_probability"]):
        assert isinstance(value, D)
