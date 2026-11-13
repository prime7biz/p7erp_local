"""Pure statistics for Manufacturing Intelligence Phase 4 (no database, Decimal only, deterministic).

Binding rules (plan 15, sections 3 and 17.12-17.14):
- quantiles are nearest-rank: rank = ceil(q x n) (clamped to 1..n) on the ascending sample
- median / MAD use the usual median (mean of the two middle values for an even sample)
- winsorise at median +/- 3.5 x 1.4826 x MAD; MAD = 0 -> 3.5 x 1.253314 x MeanAD; both 0 -> no winsorising
- EWMA alpha = 0.2, seeded with the median of the winsorised sample, applied in production-date order
- robust CV = 1.4826 x MAD / median
- blend weight w = min(0.7, n / 40) for n >= 10 (0 below), capped at 0.3 when robust CV > 0.25 or the plan / OB changed
- modified z = 0.6745 x (x - median) / MAD; MAD = 0 -> (x - median) / (1.253314 x MeanAD); both 0 -> None
- probability grid q = 0.05 .. 0.95; the ends are stored as 0.025 ("< 5 %") and 0.975 (">= 95 %")
"""
from __future__ import annotations

from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from typing import Iterable, Sequence

ZERO = Decimal("0")
ONE = Decimal("1")
TWO = Decimal("2")
MAD_SCALE = Decimal("1.4826")
MEANAD_SCALE = Decimal("1.253314")
Z_FACTOR = Decimal("0.6745")
WINSOR_K = Decimal("3.5")
ANOMALY_Z = Decimal("3.5")
EWMA_ALPHA = Decimal("0.2")
MIN_EMPIRICAL_N = 10
WEIGHT_CAP = Decimal("0.7")
WEIGHT_CAP_UNSTABLE = Decimal("0.3")
CV_UNSTABLE = Decimal("0.25")
WEIGHT_DIVISOR = Decimal("40")

GRID: tuple[Decimal, ...] = tuple(Decimal(i) / Decimal(100) for i in range(5, 100, 5))  # 0.05 .. 0.95
GRID_LOW_END = Decimal("0.025")  # shown as "< 5 %"
GRID_HIGH_END = Decimal("0.975")  # shown as ">= 95 %"
Q50 = Decimal("0.50")
Q80 = Decimal("0.80")
Q90 = Decimal("0.90")

BIN_EDGES: tuple[Decimal, ...] = (Decimal("0"), Decimal("0.2"), Decimal("0.4"), Decimal("0.6"), Decimal("0.8"), ONE)


def q4(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _sorted(values: Iterable[Decimal]) -> list[Decimal]:
    return sorted(Decimal(v) for v in values)


def nearest_rank(values: Sequence[Decimal], q: Decimal) -> Decimal | None:
    """Nearest-rank quantile: the ceil(q x n)-th smallest value (1-based, clamped to 1..n). Empty -> None."""
    data = _sorted(values)
    n = len(data)
    if n == 0:
        return None
    rank = int((Decimal(q) * Decimal(n)).to_integral_value(rounding=ROUND_CEILING))
    rank = min(max(rank, 1), n)
    return data[rank - 1]


def median(values: Sequence[Decimal]) -> Decimal | None:
    data = _sorted(values)
    n = len(data)
    if n == 0:
        return None
    mid = n // 2
    if n % 2:
        return data[mid]
    return (data[mid - 1] + data[mid]) / TWO


def mad(values: Sequence[Decimal], center: Decimal | None = None) -> Decimal | None:
    """Median absolute deviation from the median (unscaled)."""
    if not values:
        return None
    c = median(values) if center is None else center
    assert c is not None
    return median([abs(Decimal(v) - c) for v in values])


def mean_abs_dev(values: Sequence[Decimal], center: Decimal | None = None) -> Decimal | None:
    """Mean absolute deviation from the median (used when MAD = 0)."""
    if not values:
        return None
    c = median(values) if center is None else center
    assert c is not None
    return sum((abs(Decimal(v) - c) for v in values), ZERO) / Decimal(len(values))


def winsor_limits(values: Sequence[Decimal]) -> tuple[Decimal, Decimal] | None:
    """(low, high) clip limits, or None when MAD and MeanAD are both 0 (no winsorising)."""
    c = median(values)
    if c is None:
        return None
    m = mad(values, c) or ZERO
    if m > ZERO:
        half = WINSOR_K * MAD_SCALE * m
    else:
        mean_ad = mean_abs_dev(values, c) or ZERO
        if mean_ad <= ZERO:
            return None
        half = WINSOR_K * MEANAD_SCALE * mean_ad
    return c - half, c + half


def winsorize(values: Sequence[Decimal]) -> list[Decimal]:
    """Values clipped to the winsor limits, in the input order."""
    limits = winsor_limits(values)
    if limits is None:
        return [Decimal(v) for v in values]
    low, high = limits
    return [min(max(Decimal(v), low), high) for v in values]


def ewma(values_in_date_order: Sequence[Decimal], alpha: Decimal = EWMA_ALPHA, seed: Decimal | None = None) -> Decimal | None:
    """Exponentially weighted mean; seed = median of the sample unless given. Empty -> None."""
    if not values_in_date_order:
        return None
    s = median(values_in_date_order) if seed is None else seed
    assert s is not None
    for x in values_in_date_order:
        s = alpha * Decimal(x) + (ONE - alpha) * s
    return s


def robust_cv(values: Sequence[Decimal]) -> Decimal | None:
    """1.4826 x MAD / median; None when the median is not positive or the sample is empty."""
    c = median(values)
    if c is None or c <= ZERO:
        return None
    return MAD_SCALE * (mad(values, c) or ZERO) / c


def blend_weight(n: int, cv: Decimal | None, plan_changed: bool) -> Decimal:
    """Weight of the empirical value in the blend (17.13)."""
    if n < MIN_EMPIRICAL_N:
        return ZERO
    w = min(WEIGHT_CAP, Decimal(n) / WEIGHT_DIVISOR)
    if plan_changed or (cv is not None and cv > CV_UNSTABLE):
        w = min(w, WEIGHT_CAP_UNSTABLE)
    return w


def robust_z(x: Decimal, baseline: Sequence[Decimal]) -> Decimal | None:
    """Modified z-score of x against the baseline (Iglewicz-Hoaglin). None when MAD and MeanAD are both 0."""
    c = median(baseline)
    if c is None:
        return None
    m = mad(baseline, c) or ZERO
    if m > ZERO:
        return Z_FACTOR * (Decimal(x) - c) / m
    mean_ad = mean_abs_dev(baseline, c) or ZERO
    if mean_ad > ZERO:
        return (Decimal(x) - c) / (MEANAD_SCALE * mean_ad)
    return None


def rolling_means(values_in_date_order: Sequence[Decimal], k: int) -> list[Decimal]:
    """Means of every window of k consecutive values (len - k + 1 of them)."""
    data = [Decimal(v) for v in values_in_date_order]
    if k <= 0 or len(data) < k:
        return []
    out: list[Decimal] = []
    window = sum(data[:k], ZERO)
    out.append(window / Decimal(k))
    for i in range(k, len(data)):
        window += data[i] - data[i - k]
        out.append(window / Decimal(k))
    return out


def probability_from_grid(finish_by_q: Sequence[tuple[Decimal, object]], is_on_time) -> Decimal:
    """Largest grid q whose finish is on time; ends stored as 0.025 / 0.975 (D13, 17.12).

    `finish_by_q` is (q, finish) in ascending q; `is_on_time(finish)` says whether that finish meets the target.
    """
    best: Decimal | None = None
    for q, finish in finish_by_q:
        if is_on_time(finish):
            best = q
    if best is None:
        return GRID_LOW_END
    if best == GRID[-1]:
        return GRID_HIGH_END
    return best


def brier(pairs: Sequence[tuple[Decimal, bool]]) -> Decimal | None:
    """(1/N) x sum (p - o)^2 over (probability, outcome) pairs. Empty -> None."""
    if not pairs:
        return None
    total = sum(((Decimal(p) - (ONE if o else ZERO)) ** 2 for p, o in pairs), ZERO)
    return total / Decimal(len(pairs))


def reliability_bins(pairs: Sequence[tuple[Decimal, bool]]) -> list[dict[str, object]]:
    """Bins [0,0.2) .. [0.8,1.0] (the last bin includes 1.0): n, mean probability, hit rate (Decimals or None)."""
    out: list[dict[str, object]] = []
    for i in range(len(BIN_EDGES) - 1):
        low, high = BIN_EDGES[i], BIN_EDGES[i + 1]
        last = i == len(BIN_EDGES) - 2
        members = [(Decimal(p), o) for p, o in pairs if Decimal(p) >= low and (Decimal(p) < high or (last and Decimal(p) <= high))]
        n = len(members)
        out.append(
            {
                "lower": low,
                "upper": high,
                "n": n,
                "mean_probability": (sum((p for p, _ in members), ZERO) / Decimal(n)) if n else None,
                "hit_rate": (Decimal(sum(1 for _, o in members if o)) / Decimal(n)) if n else None,
            }
        )
    return out
