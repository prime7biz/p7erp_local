"""Deterministic commentary: plain rules over the fact catalog, no provider involved.

Used as the answer when AI is off, unavailable, over budget or fails validation. Every sentence cites fact ids.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.modules.finance.ai_insights.constants import (
    ALERTS_SHOWN,
    COST_BUCKETS_SHOWN,
    LARGEST_CHANGES_SHOWN,
    MAX_FINDINGS,
    MAX_SUMMARY_CHARS,
)
from app.modules.finance.ai_insights.facts import FactBook, MetricMeta

ZERO = Decimal("0")
_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2, "": 3}


def fmt(value: Decimal, unit: str, currency: str) -> str:
    if unit == "count":
        return str(int(value))
    q = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    text = f"{q:,.2f}"
    if unit == "currency":
        return f"{currency} {text}"
    if unit == "percent":
        return f"{text}%"
    if unit == "days":
        return f"{text} days"
    return text


def _pts(value: Decimal) -> str:
    return f"{abs(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,.2f}"


def build_deterministic(book: FactBook, *, currency: str) -> tuple[str, list[dict]]:
    """Return (summary, findings[{text, fact_ids}])."""
    findings: list[dict] = []
    used: set[str] = set()

    def say(text: str, ids: list[str | None]) -> None:
        if len(findings) < MAX_FINDINGS:
            findings.append({"text": text, "fact_ids": [i for i in ids if i]})

    def money(meta: MetricMeta, fid: str | None) -> str:
        return fmt(book.value(fid) or ZERO, meta.unit, currency)

    compared = book.comparison_label is not None
    label = book.comparison_label or ""

    # 1. warnings first: a reader must know when the report is not complete
    for m in book.metrics:
        if m.kind == "warning" and (book.value(m.cur_id) or ZERO) != ZERO:
            say(f"{m.label}: {money(m, m.cur_id)}. Review this before relying on the report.", [m.cur_id])
            used.add(m.key)

    # 2. headline figures
    for m in [m for m in book.metrics if m.kind == "headline"][:3]:
        if compared and m.prev_id:
            pct = f" ({money_pct(book, m)})" if m.pct_id else ""
            say(f"{m.label}: {money(m, m.cur_id)} against {money(m, m.prev_id)} in the {label}{pct}.", [m.cur_id, m.prev_id, m.pct_id])
        else:
            say(f"{m.label}: {money(m, m.cur_id)}.", [m.cur_id])
        used.add(m.key)

    # 3. margin movement
    for m in [m for m in book.metrics if m.kind == "margin"]:
        change = book.value(m.change_id)
        if compared and change is not None:
            verb = "fell" if change < ZERO else "rose" if change > ZERO else "did not change"
            tail = "" if change == ZERO else f" by {_pts(change)} percentage points"
            say(f"{m.label} {verb}{tail} to {money(m, m.cur_id)} (was {money(m, m.prev_id)}).", [m.cur_id, m.prev_id, m.change_id])
        else:
            say(f"{m.label} is {money(m, m.cur_id)}.", [m.cur_id])
        used.add(m.key)

    # 4. largest changes in amounts
    if compared:
        movers = [
            m for m in book.metrics
            if m.unit == "currency" and m.change_id and m.key not in used and m.kind not in ("warning", "alert")
        ]
        movers.sort(key=lambda m: abs(book.value(m.change_id) or ZERO), reverse=True)
        for m in movers[:LARGEST_CHANGES_SHOWN]:
            change = book.value(m.change_id) or ZERO
            if change == ZERO:
                continue
            verb = "increased" if change > ZERO else "decreased"
            pct = f" ({money_pct(book, m)})" if m.pct_id else ""
            say(f"{m.label} {verb} by {fmt(abs(change), 'currency', currency)}{pct}.", [m.cur_id, m.prev_id, m.change_id, m.pct_id])
            used.add(m.key)

    # 5. ratios / indicators moving the wrong way
    if compared:
        for m in book.metrics:
            change = book.value(m.change_id)
            if change is None or change == ZERO or m.key in used:
                continue
            if (m.kind == "good_up" and change < ZERO) or (m.kind == "bad_up" and change > ZERO):
                say(
                    f"{m.label} moved the wrong way: {money(m, m.prev_id)} in the {label}, now {money(m, m.cur_id)}.",
                    [m.cur_id, m.prev_id, m.change_id],
                )
                used.add(m.key)

    # 6. largest cost buckets
    costs = [m for m in book.metrics if m.kind == "cost"]
    costs.sort(key=lambda m: abs(book.value(m.cur_id) or ZERO), reverse=True)
    if costs:
        top = costs[:COST_BUCKETS_SHOWN]
        text = "Largest cost buckets: " + "; ".join(f"{m.label} {money(m, m.cur_id)}" for m in top) + "."
        say(text, [m.cur_id for m in top])

    # 7. exceptions (control tower, budget)
    alerts = [m for m in book.metrics if m.kind == "alert" and (book.value(m.cur_id) or ZERO) > ZERO]
    alerts.sort(key=lambda m: (_SEVERITY_RANK.get(m.severity, 3), -(book.value(m.cur_id) or ZERO)))
    for m in alerts[:ALERTS_SHOWN]:
        amt = None
        if m.key.endswith("_count"):
            amt = next((x for x in book.metrics if x.key == m.key[: -len("_count")] + "_amount"), None)
        amt_text = f", amount {money(amt, amt.cur_id)}" if amt else ""
        say(f"{m.label}: {money(m, m.cur_id)}{amt_text}.", [m.cur_id, amt.cur_id if amt else None])

    if not findings:
        return "No notable movement was found in the computed figures.", []
    summary = " ".join(f["text"] for f in findings[:2])
    return summary[:MAX_SUMMARY_CHARS], findings


def money_pct(book: FactBook, m: MetricMeta) -> str:
    value = book.value(m.pct_id) or ZERO
    sign = "+" if value > ZERO else ""
    return f"{sign}{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,.2f}%"
