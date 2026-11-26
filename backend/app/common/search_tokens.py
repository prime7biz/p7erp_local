"""Multi-word search helper for list endpoints.

Typing "cotton 180" must find "Cotton Single Jersey 180 GSM": every typed word has to appear
somewhere in one of the searched columns (in any order). The old filter looked for the whole
phrase as one piece, so a phrase with gaps found nothing.

Safe by design: user text is only ever passed as a bound parameter (never put into SQL text),
and the LIKE characters `%`, `_` and `\\` typed by the user are escaped so they match literally.
Callers still add their own `tenant_id` filter; this helper only builds the text condition.
"""

from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import and_, or_

MAX_SEARCH_TOKENS = 6
MAX_SEARCH_LENGTH = 200
_ESCAPE = "\\"


def split_search_tokens(search: str | None, max_tokens: int = MAX_SEARCH_TOKENS) -> list[str]:
    """Lower-case words from the typed text (at most `max_tokens`, text capped at 200 chars)."""
    if not search:
        return []
    text = search.strip()[:MAX_SEARCH_LENGTH].lower()
    return [t for t in text.split() if t][:max_tokens]


def escape_like(token: str) -> str:
    """Escape LIKE wildcards so user text matches literally."""
    return token.replace(_ESCAPE, _ESCAPE * 2).replace("%", _ESCAPE + "%").replace("_", _ESCAPE + "_")


def multi_word_ilike_clause(
    search: str | None,
    columns: Iterable[Any],
    max_tokens: int = MAX_SEARCH_TOKENS,
) -> Any | None:
    """Build a SQLAlchemy condition, or None when there is nothing to search.

    Every word must match (contains) at least one of `columns`. Use as:
        clause = multi_word_ilike_clause(search, [Item.item_code, Item.name])
        if clause is not None:
            stmt = stmt.where(clause)
    """
    cols = list(columns)
    tokens = split_search_tokens(search, max_tokens)
    if not tokens or not cols:
        return None
    per_token = []
    for token in tokens:
        pat = f"%{escape_like(token)}%"
        per_token.append(or_(*[c.ilike(pat, escape=_ESCAPE) for c in cols]))
    return and_(*per_token)
