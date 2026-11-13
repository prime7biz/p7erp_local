"""LLM wording of a deterministic Phase 4 result (plan 15 sections D26, 17.6, 17.8).

The LLM never produces a number: the subject (an order forecast or a stored finding) is recomputed server-side,
turned into a fact list (`FactRow`, units percent / days / count) and a date list, and the provider answer must
pass `validate_answer` (every number matches a cited fact, every date is one of the given dates).
Placeholders without digits stand for codes (ORDER_A, LINE_A, LINE_B ...); P50 / P80 / P90 are written as
"likely / safe / worst-case date". Placeholders are mapped back server-side after validation. No buyer, employee or
vendor names are ever sent. Any validation failure, timeout or empty answer -> the deterministic rule text.
"""
from __future__ import annotations

import string
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.modules.finance.ai_insights.facts import FactRow
from app.modules.finance.ai_insights.validation import ValidationFailure, validate_answer

MAX_PROMPT_CHARS = 6000
EXPLAIN_TIMEOUT_SECONDS = 20
ORDER_PLACEHOLDER = "ORDER_A"
UNITS = frozenset({"percent", "days", "count"})
# Payload date keys -> words without digits (17.6: never "P50 / P80 / P90" in a prompt).
DATE_WORDS = {
    "target_date": "ex-factory date",
    "start_date": "planned start date",
    "p50_date": "likely finish date",
    "p80_date": "safe date",
    "p90_date": "worst-case date",
    "need_date": "material need date",
    "ready_p50": "likely material date",
    "ready_p80": "safe material date",
    "ready_p90": "worst-case material date",
    "first_day": "first affected day",
    "last_day": "last affected day",
    "latest_day": "latest unusual day",
}


@dataclass
class ExplainSubject:
    facts: list[FactRow]
    dates: dict[str, str]  # wording ("likely finish date") -> ISO date
    placeholders: dict[str, str]  # placeholder -> real code (mapped back after validation)
    rules_text: str
    reason_codes: list[str] = field(default_factory=list)

    def context_texts(self) -> list[str]:
        return list(self.dates.values())


def _line_placeholder(i: int) -> str:
    return f"LINE_{string.ascii_uppercase[i % 26]}"


def _add(facts: list[FactRow], fid: str, label: str, value: Any, unit: str) -> None:
    if value is None or unit not in UNITS:
        return
    try:
        facts.append(FactRow(id=fid, label=label, value=Decimal(str(value)), unit=unit))
    except Exception:  # noqa: BLE001 - a bad number is simply left out
        return


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def order_subject(forecast: dict[str, Any]) -> ExplainSubject:
    """Facts / dates of one `forecast_deliveries` result (pure)."""
    placeholders = {ORDER_PLACEHOLDER: forecast.get("order_code") or "the order"}
    facts: list[FactRow] = []
    p = forecast.get("on_time_probability")
    if p is not None:
        _add(facts, "on_time_chance", "chance of shipping on time", Decimal(str(p)) * 100, "percent")
    _add(facts, "likely_delay", "likely delay after the ex-factory date", forecast.get("delay_days"), "days")
    _add(facts, "likely_early", "likely days ahead of the ex-factory date", forecast.get("early_days"), "days")
    _add(facts, "pieces_left", "pieces still to sew", forecast.get("remaining_qty"), "count")
    _add(facts, "working_days_needed", "working days still needed", forecast.get("working_days_needed"), "days")
    for d in forecast.get("drivers") or []:
        _add(facts, f"driver_{str(d['driver']).lower()}", f"days added by {str(d['driver']).lower()}", d.get("impact_days"),
             "days")
    for i, ln in enumerate(forecast.get("lines") or []):
        ph = _line_placeholder(i)
        placeholders[ph] = ln.get("line_code") or f"line {ln.get('line_id')}"
        eff = ln.get("efficiency") or {}
        _add(facts, f"{ph.lower()}_efficiency", f"{ph} efficiency used", eff.get("blended_pct"), "percent")
        _add(facts, f"{ph.lower()}_history", f"{ph} production days of history", eff.get("n"), "count")
    material = forecast.get("material") or {}
    dates = {
        "ex-factory date": _iso(forecast.get("target_date")),
        "planned start date": _iso(forecast.get("start_date")),
        "likely finish date": _iso(forecast.get("p50_date")),
        "safe date": _iso(forecast.get("p80_date")),
        "worst-case date": _iso(forecast.get("p90_date")),
        "likely material date": _iso(material.get("ready_p50")),
        "worst-case material date": _iso(material.get("ready_p90")),
    }
    dates = {k: v for k, v in dates.items() if v}
    code = placeholders[ORDER_PLACEHOLDER]
    parts = [f"Order {code}: forecast {forecast.get('band') or 'UNKNOWN'}"]
    if dates.get("likely finish date"):
        parts.append(f"likely finish {dates['likely finish date']}")
    if dates.get("worst-case date"):
        parts.append(f"worst case {dates['worst-case date']}")
    if dates.get("ex-factory date"):
        parts.append(f"ex-factory {dates['ex-factory date']}")
    if forecast.get("probability_display"):
        parts.append(f"on-time chance {forecast['probability_display']}")
    top = next(iter(forecast.get("drivers") or []), None)
    rules = "; ".join(parts) + "."
    if top and top.get("impact_days"):
        rules += f" Main driver: {str(top['driver']).lower()} ({top['impact_days']} day(s))."
    return ExplainSubject(facts, dates, placeholders, rules, list(forecast.get("reason_codes") or []))


def finding_subject(finding: Any, order_code: str | None, line_code: str | None) -> ExplainSubject:
    """Facts / dates of a stored finding payload (pure). Labels in the payload never contain digits."""
    payload = finding.payload if isinstance(finding.payload, dict) else {}
    placeholders: dict[str, str] = {}
    if order_code:
        placeholders[ORDER_PLACEHOLDER] = order_code
    if line_code:
        placeholders[_line_placeholder(0)] = line_code
    facts: list[FactRow] = []
    for fact in payload.get("facts") or []:
        if isinstance(fact, dict):
            _add(facts, str(fact.get("id")), str(fact.get("label")), fact.get("value"), str(fact.get("unit")))
    dates = {
        DATE_WORDS.get(str(k), "".join(c for c in str(k) if not c.isdigit()).replace("_", " ").strip()): str(v)
        for k, v in (payload.get("dates") or {}).items()
        if v
    }
    label = payload.get("kind_label") or finding.kind
    subject = line_code or order_code or ""
    rec = (payload.get("recommendation") or {}).get("action") or ""
    rules = f"{label} {subject} ({finding.severity}), {payload.get('days_affected') or 0} day(s) affected. {rec}".strip()
    return ExplainSubject(facts, dates, placeholders, rules, list(payload.get("reason_codes") or []))


def build_prompt(subject: ExplainSubject) -> str:
    from app.modules.ai_tool.llm_provider.prompt_sanitizer import clamp_text_for_llm, redact_pii_for_external_provider

    names = ", ".join(sorted(subject.placeholders)) or "none"
    fact_lines = "\n".join(f"- {f.id}: {f.label} = {f.value_text()} {f.unit}" for f in subject.facts) or "- none"
    date_lines = "\n".join(f"- {k}: {v}" for k, v in subject.dates.items()) or "- none"
    prompt = (
        "You explain a garment factory production planning result to a manager in plain, short English.\n"
        "Use ONLY the facts and dates below and never invent a number. Keep these names exactly as written: "
        f"{names}.\n"
        'Reply with JSON only: {"summary": "...", "findings": [{"text": "...", "fact_ids": ["id"]}]} with 1 to 4 '
        "findings. Every number in a finding must be the value of a fact that finding cites (rounding allowed); the "
        "summary may only repeat numbers of cited facts. Write dates exactly as given (YYYY-MM-DD).\n"
        f"Facts:\n{fact_lines}\nDates:\n{date_lines}\n"
        f"Reason codes: {', '.join(subject.reason_codes) or 'none'}\n"
    )
    return clamp_text_for_llm(redact_pii_for_external_provider(prompt), max_chars=MAX_PROMPT_CHARS)


def map_back(text: str, placeholders: dict[str, str]) -> str:
    for ph in sorted(placeholders, key=len, reverse=True):
        text = text.replace(ph, placeholders[ph])
    return text


def validated_text(raw: str | None, subject: ExplainSubject) -> tuple[dict[str, Any] | None, str | None]:
    """(answer with placeholders mapped back, None) or (None, failure code)."""
    if not raw or not raw.strip():
        return None, "empty"
    try:
        answer = validate_answer(raw, subject.facts, subject.context_texts())
    except ValidationFailure as exc:
        return None, exc.code
    return {
        "summary": map_back(answer.summary, subject.placeholders),
        "findings": [
            {"text": map_back(f["text"], subject.placeholders), "fact_ids": f["fact_ids"]} for f in answer.findings
        ],
    }, None


def facts_out(subject: ExplainSubject) -> list[dict[str, str]]:
    return [
        {"id": f.id, "label": map_back(f.label, subject.placeholders), "value": f.value_text(), "unit": f.unit}
        for f in subject.facts
    ]
