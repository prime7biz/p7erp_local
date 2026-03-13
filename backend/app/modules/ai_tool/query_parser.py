from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal


SearchDomain = Literal["orders", "approvals", "inventory", "production", "vendors", "finance", "unknown"]


@dataclass(slots=True)
class SearchQuery:
    raw_prompt: str
    normalized: str
    domain: SearchDomain
    statuses: list[str] = field(default_factory=list)
    delayed_only: bool = False
    shortage_only: bool = False
    buyer_wise: bool = False
    repeated_only: bool = False
    min_count: int | None = None
    top_n: int = 20
    from_date: date | None = None
    to_date: date | None = None
    reference_text: str | None = None
    ambiguous: bool = False
    ambiguity_reason: str | None = None


def _extract_threshold(text: str) -> int | None:
    patterns = [
        r"(?:above|over|greater than|more than)\s+(\d+)",
        r"(?:at least|min(?:imum)?)\s+(\d+)",
        r"threshold\s+(\d+)",
    ]
    for pat in patterns:
        match = re.search(pat, text)
        if match:
            return int(match.group(1))
    return None


def _extract_top_n(text: str) -> int:
    match = re.search(r"(?:top|first)\s+(\d+)", text)
    if match:
        return max(1, min(100, int(match.group(1))))
    return 20


def _extract_date_window(text: str) -> tuple[date | None, date | None]:
    today = date.today()
    if "today" in text:
        return today, today
    if "this month" in text:
        start = today.replace(day=1)
        return start, today
    last_days_match = re.search(r"last\s+(\d+)\s+days?", text)
    if last_days_match:
        days = int(last_days_match.group(1))
        days = max(1, min(365, days))
        return today - timedelta(days=days), today
    return None, None


def parse_search_query(prompt: str) -> SearchQuery:
    text = " ".join(prompt.lower().strip().split())
    statuses: list[str] = []
    status_map = {
        "draft": "DRAFT",
        "new": "NEW",
        "in progress": "IN_PROGRESS",
        "completed": "COMPLETED",
        "closed": "CLOSED",
        "pending": "PENDING",
        "approved": "APPROVED",
        "rejected": "REJECTED",
        "submitted": "SUBMITTED",
        "posted": "POSTED",
        "open": "OPEN",
    }
    for k, v in status_map.items():
        if k in text:
            statuses.append(v)

    domain: SearchDomain = "unknown"
    if any(x in text for x in {"order", "orders", "buyer", "customer"}):
        domain = "orders"
    if any(x in text for x in {"approval", "approvals", "voucher", "payment run"}):
        domain = "approvals" if domain == "unknown" else domain
    if any(x in text for x in {"inventory", "stock", "shortage", "on hand"}):
        domain = "inventory" if domain == "unknown" else domain
    if any(x in text for x in {"production", "shopfloor", "ncr", "downtime", "issue"}):
        domain = "production" if domain == "unknown" else domain
    if any(x in text for x in {"vendor", "supplier", "late vendor"}):
        domain = "vendors"
    if any(x in text for x in {"finance", "cash", "reconciliation"}):
        domain = "finance" if domain == "unknown" else domain

    delayed_only = any(x in text for x in {"delayed", "late", "overdue"})
    shortage_only = any(x in text for x in {"shortage", "low stock", "below stock", "stock out"})
    buyer_wise = "buyer-wise" in text or "buyer wise" in text or "by buyer" in text
    repeated_only = any(x in text for x in {"repeated", "repeat", "again and again"})

    min_count = _extract_threshold(text)
    top_n = _extract_top_n(text)
    from_date, to_date = _extract_date_window(text)

    reference_text: str | None = None
    quoted = re.findall(r"'([^']+)'|\"([^\"]+)\"", prompt)
    if quoted:
        first = quoted[0][0] or quoted[0][1]
        reference_text = first.strip() or None

    query = SearchQuery(
        raw_prompt=prompt,
        normalized=text,
        domain=domain,
        statuses=statuses,
        delayed_only=delayed_only,
        shortage_only=shortage_only,
        buyer_wise=buyer_wise,
        repeated_only=repeated_only,
        min_count=min_count,
        top_n=top_n,
        from_date=from_date,
        to_date=to_date,
        reference_text=reference_text,
    )

    if domain == "unknown" and not any(
        [delayed_only, shortage_only, buyer_wise, repeated_only, bool(statuses), bool(reference_text)]
    ):
        query.ambiguous = True
        query.ambiguity_reason = "Could not determine target module from prompt"
    return query
