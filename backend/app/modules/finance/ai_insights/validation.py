"""Validate a provider answer against the fact catalog (PLAN guardrails 3 and 4).

Accepted only when:
  * the answer is a JSON object {summary: str, findings: [{text: str, fact_ids: [str]}]} within the size limits;
  * every fact id exists in the catalog;
  * every numeric token in a finding is a (rounded / grouped / lakh / crore) form of a fact that finding cites;
  * every numeric token in the summary is such a form of some fact in the catalog.
Dates / month keys / fiscal-year labels, years named in the period text and numbers inside fact labels are not "figures"
and are allowed. Anything else is an invented number and the whole answer is discarded.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from app.modules.finance.ai_insights.constants import (
    MAX_FACT_IDS_PER_FINDING,
    MAX_FINDING_CHARS,
    MAX_FINDINGS,
    MAX_SUMMARY_CHARS,
)
from app.modules.finance.ai_insights.facts import FactRow

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
# ISO dates, month keys and fiscal-year labels (2026-07-01, 2026-07, 2026-27) are not figures.
_DATE_LIKE = re.compile(r"(?<!\d)(?<!\d[.,])\d{4}-\d{2}(?:-\d{2})?(?!\d)(?![.,]\d)")
_YEAR = re.compile(r"(?<!\d)(?<!\d[.,])(?:19|20|21)\d{2}(?!\d)(?![.,]\d)")
_LAKH, _CRORE = Decimal(100000), Decimal(10000000)


class ValidationFailure(Exception):
    """`code` is a short machine reason; it never contains provider text or figures."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass
class ValidAnswer:
    summary: str
    findings: list[dict[str, Any]]


def parse_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValidationFailure("not_json")
    try:
        data = json.loads(text[start : end + 1])
    except (TypeError, ValueError):
        raise ValidationFailure("not_json") from None
    if not isinstance(data, dict):
        raise ValidationFailure("not_json")
    return data


def number_tokens(text: str) -> list[tuple[Decimal, int]]:
    """(value, decimal places) of every number written in `text`; thousands separators of any grouping are removed."""
    out: list[tuple[Decimal, int]] = []
    for match in _NUMBER.finditer(_DATE_LIKE.sub(" ", text or "")):
        raw = match.group(0).rstrip(",")
        cleaned = raw.replace(",", "")
        try:
            value = Decimal(cleaned)
        except InvalidOperation:
            continue
        places = len(cleaned.split(".")[1]) if "." in cleaned else 0
        out.append((value, places))
    return out


def _forms_match(token: Decimal, places: int, value: Decimal) -> bool:
    quant = Decimal(1).scaleb(-places)
    absolute = abs(value)
    candidates = [absolute]
    if absolute >= _LAKH:
        candidates.append(absolute / _LAKH)
    if absolute >= _CRORE:
        candidates.append(absolute / _CRORE)
    return any(c.quantize(quant, rounding=ROUND_HALF_UP) == token for c in candidates)


def _allowed_literals(context_texts: list[str], labels: list[str]) -> set[Decimal]:
    """Years named in the period text (including the years of its dates) and numbers that are part of a fact label."""
    years = {Decimal(m.group(0)) for text in context_texts for m in _YEAR.finditer(text or "")}
    return years | {value for text in labels for value, _places in number_tokens(text)}


def _numbers_ok(text: str, values: list[Decimal], literals: set[Decimal]) -> bool:
    for token, places in number_tokens(text):
        if token in literals:
            continue
        if not any(_forms_match(token, places, v) for v in values):
            return False
    return True


def validate_answer(raw: str, facts: list[FactRow], context_texts: list[str]) -> ValidAnswer:
    """`context_texts` = period strings etc. whose digits are allowed. Raises ValidationFailure."""
    data = parse_json_object(raw)
    summary = data.get("summary")
    findings = data.get("findings")
    if not isinstance(summary, str) or not summary.strip():
        raise ValidationFailure("no_summary")
    if len(summary) > MAX_SUMMARY_CHARS:
        raise ValidationFailure("summary_too_long")
    if not isinstance(findings, list) or not findings or len(findings) > MAX_FINDINGS:
        raise ValidationFailure("bad_findings")

    by_id = {f.id: f for f in facts}
    literals = _allowed_literals(context_texts, [f.label for f in facts])
    clean: list[dict[str, Any]] = []
    for item in findings:
        if not isinstance(item, dict):
            raise ValidationFailure("bad_findings")
        text, ids = item.get("text"), item.get("fact_ids")
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_FINDING_CHARS:
            raise ValidationFailure("bad_finding_text")
        if not isinstance(ids, list) or len(ids) > MAX_FACT_IDS_PER_FINDING or not all(isinstance(i, str) for i in ids):
            raise ValidationFailure("bad_fact_ids")
        if any(i not in by_id for i in ids):
            raise ValidationFailure("unknown_fact")
        cited = [by_id[i].value for i in dict.fromkeys(ids)]
        if not _numbers_ok(text, cited, literals):
            raise ValidationFailure("number_not_in_facts")
        clean.append({"text": text.strip(), "fact_ids": list(dict.fromkeys(ids))})

    if not _numbers_ok(summary, [f.value for f in facts], literals):
        raise ValidationFailure("number_not_in_facts")
    return ValidAnswer(summary=summary.strip(), findings=clean)
