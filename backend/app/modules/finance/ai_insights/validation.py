"""Validate a provider answer against the fact catalog (PLAN guardrails 3 and 4).

Accepted only when the answer is a JSON object {summary: str, findings: [{text: str, fact_ids: [str]}]} within the
size limits, every fact id exists in the catalog, and every number written in the text passes these rules:

  * Unit of the number decides which facts it may match:
      - followed by "%", "percent", "per cent" or "percentage point(s)"  -> only facts with unit percent;
      - followed by lakh / lakhs / lac / lacs                          -> only currency facts, compared at lakh scale;
      - followed by crore / crores / cr                                -> only currency facts, compared at crore scale;
      - anything else (a plain number)                                 -> only currency / count / days / ratio facts,
        never rescaled.
  * Rounding: the fact value (scaled for lakh / crore) rounded half-up to the number of decimals written must equal
    the number. A lakh / crore number may have at most 2 decimals and may not be 0.
  * Sign: a number matches the ABSOLUTE value of a fact (wording such as "fell" / "loss" is not interpreted). A number
    written with an explicit minus sign ("-5,000") only matches a negative fact. Nothing else about sign is checked.
  * A finding's numbers must match a fact that finding cites. The summary's numbers must match a fact cited by at
    least one finding.
  * Numbers and dates that are part of a fact LABEL (user-entered ledger / cost-centre names) are allowed only in a
    finding that cites that fact, with the same unit word. Never in the summary.
  * Dates / month keys / fiscal-year labels (shape dddd-dd or dddd-dd-dd) are allowed only when written exactly as
    in the request context (period dates, fiscal-year labels) or in the label of a fact the finding cites.
  * A bare 4-digit year (no separator, no unit) is allowed when it is a year of the request context.
Anything else is an invented number and the whole answer is discarded.
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

# A date-like string (2026-07-01, 2026-07, 2026-27) is tried first; otherwise a plain number with any digit grouping.
_TOKEN = re.compile(
    r"(?P<date>(?<![\d.,])\d{4}-\d{2}(?:-\d{2})?(?!\d)(?![.,]\d))"
    r"|(?P<num>\d[\d,]*(?:\.\d+)?)"
)
_PERCENT_AFTER = re.compile(r"\s{0,2}(?:%|percent(?:age\s+points?)?\b|per\s?cent\b)", re.IGNORECASE)
_SCALE_AFTER = re.compile(r"\s{0,2}(lakhs?|lacs?|crores?|cr)\b", re.IGNORECASE)
_YEAR_RAW = re.compile(r"^(?:19|20|21)\d{2}$")
_MINUS = ("-", "\u2212")

_LAKH, _CRORE = Decimal(100000), Decimal(10000000)
_SCALES = {"lakh": _LAKH, "crore": _CRORE}
PLAIN_UNITS = frozenset({"currency", "count", "days", "ratio"})
MAX_SCALED_PLACES = 2


class ValidationFailure(Exception):
    """`code` is a short machine reason; it never contains provider text or figures."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass
class ValidAnswer:
    summary: str
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class Token:
    raw: str
    kind: str  # "date" | "number"
    value: Decimal | None = None
    places: int = 0
    unit: str = ""  # "" (plain) | "percent" | "lakh" | "crore"
    negative: bool = False

    @property
    def is_bare_year(self) -> bool:
        return self.kind == "number" and not self.unit and not self.negative and bool(_YEAR_RAW.match(self.raw))


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


def _has_minus(text: str, start: int) -> bool:
    if start == 0 or text[start - 1] not in _MINUS:
        return False
    return start == 1 or not text[start - 2].isalnum()


def tokenize(text: str) -> list[Token]:
    """Every date-like string and number written in `text`, with the unit word that follows a number."""
    text = text or ""
    out: list[Token] = []
    for match in _TOKEN.finditer(text):
        if match.group("date"):
            out.append(Token(raw=match.group("date"), kind="date"))
            continue
        raw = match.group("num").rstrip(",")
        cleaned = raw.replace(",", "")
        try:
            value = Decimal(cleaned)
        except InvalidOperation:
            continue
        places = len(cleaned.split(".")[1]) if "." in cleaned else 0
        rest = text[match.end() :]
        unit = ""
        if _PERCENT_AFTER.match(rest):
            unit = "percent"
        else:
            scale = _SCALE_AFTER.match(rest)
            if scale:
                unit = "crore" if scale.group(1).lower().startswith("cr") else "lakh"
        out.append(Token(raw=raw, kind="number", value=value, places=places, unit=unit, negative=_has_minus(text, match.start())))
    return out


def number_tokens(text: str) -> list[tuple[Decimal, int]]:
    """(value, decimal places) of every number written in `text` (dates excluded)."""
    return [(t.value, t.places) for t in tokenize(text) if t.kind == "number" and t.value is not None]


def _rounds_to(value: Decimal, token: Token) -> bool:
    try:
        return value.quantize(Decimal(1).scaleb(-token.places), rounding=ROUND_HALF_UP) == token.value
    except InvalidOperation:
        return False


def token_matches_fact(token: Token, fact: FactRow) -> bool:
    if token.kind != "number" or token.value is None:
        return False
    value = Decimal(fact.value)
    if token.negative and value >= 0:
        return False
    absolute = abs(value)
    if token.unit == "percent":
        return fact.unit == "percent" and _rounds_to(absolute, token)
    if token.unit in _SCALES:
        if fact.unit != "currency" or token.places > MAX_SCALED_PLACES or token.value == 0:
            return False
        return _rounds_to(absolute / _SCALES[token.unit], token)
    return fact.unit in PLAIN_UNITS and _rounds_to(absolute, token)


@dataclass
class _Context:
    dates: frozenset[str]
    years: frozenset[Decimal]


def _context(context_texts: list[str]) -> _Context:
    dates: set[str] = set()
    years: set[Decimal] = set()
    for text in context_texts:
        for tok in tokenize(text):
            if tok.kind == "date":
                dates.add(tok.raw)
                years.add(Decimal(tok.raw[:4]))
            elif tok.is_bare_year and tok.value is not None:
                years.add(tok.value)
    return _Context(frozenset(dates), frozenset(years))


def _label_literals(facts: list[FactRow]) -> tuple[set[tuple[Decimal, str]], set[str]]:
    """(number value, unit word) pairs and date strings written inside the labels of `facts`."""
    numbers: set[tuple[Decimal, str]] = set()
    dates: set[str] = set()
    for fact in facts:
        for tok in tokenize(fact.label):
            if tok.kind == "date":
                dates.add(tok.raw)
            elif tok.value is not None:
                numbers.add((tok.value, tok.unit))
    return numbers, dates


def _numbers_ok(text: str, facts: list[FactRow], ctx: _Context, label_facts: list[FactRow]) -> bool:
    label_numbers, label_dates = _label_literals(label_facts)
    for tok in tokenize(text):
        if tok.kind == "date":
            if tok.raw not in ctx.dates and tok.raw not in label_dates:
                return False
            continue
        if tok.is_bare_year and tok.value in ctx.years:
            continue
        if (tok.value, tok.unit) in label_numbers:
            continue
        if not any(token_matches_fact(tok, f) for f in facts):
            return False
    return True


def validate_answer(raw: str, facts: list[FactRow], context_texts: list[str]) -> ValidAnswer:
    """`context_texts` = period text, fiscal-year labels: the only dates / years allowed outside fact labels.
    Raises ValidationFailure."""
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
    ctx = _context(context_texts)
    clean: list[dict[str, Any]] = []
    cited_anywhere: dict[str, FactRow] = {}
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
        unique_ids = list(dict.fromkeys(ids))
        cited = [by_id[i] for i in unique_ids]
        if not _numbers_ok(text, cited, ctx, cited):
            raise ValidationFailure("number_not_in_facts")
        cited_anywhere.update({f.id: f for f in cited})
        clean.append({"text": text.strip(), "fact_ids": unique_ids})

    if not _numbers_ok(summary, list(cited_anywhere.values()), ctx, []):
        raise ValidationFailure("number_not_in_facts")
    return ValidAnswer(summary=summary.strip(), findings=clean)
