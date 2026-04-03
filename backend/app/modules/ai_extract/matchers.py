"""Fuzzy match extracted text to tenant master data (ranked suggestions)."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer
from app.models.merch import GarmentStyle


def _score_match(query: str, name: str, code: str | None = None, ref: str | None = None) -> float:
    q = query.strip().lower()
    if not q:
        return 0.0
    name_l = (name or "").lower()
    code_l = (code or "").lower()
    ref_l = (ref or "").lower()
    if name_l == q or code_l == q or ref_l == q:
        return 1.0
    if q in name_l or name_l in q:
        return 0.88
    if code_l and q in code_l:
        return 0.85
    if ref_l and q in ref_l:
        return 0.82
    if name_l.startswith(q[: min(4, len(q))]) if len(q) >= 4 else False:
        return 0.72
    return 0.65


def _max_score(score_or_scores: float | Iterable[float]) -> float:
    """Accept a single score or an iterable of scores safely."""
    if isinstance(score_or_scores, (int, float)):
        return float(score_or_scores)
    scores = [float(score) for score in score_or_scores]
    return max(scores) if scores else 0.0


async def match_customers(
    db: AsyncSession,
    tenant_id: int,
    text: str | None,
    *,
    limit: int = 8,
) -> list[dict]:
    t = (text or "").strip()
    if len(t) < 2:
        return []
    pattern = f"%{t}%"
    stmt = (
        select(Customer)
        .where(Customer.tenant_id == tenant_id)
        .where(
            or_(
                Customer.name.ilike(pattern),
                Customer.legal_entity_name.ilike(pattern),
                Customer.customer_code.ilike(pattern),
                Customer.contact_email.ilike(pattern),
            )
        )
        .limit(40)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    scored: list[tuple[float, Customer]] = []
    for c in rows:
        score = max(
            _score_match(t, c.name, c.customer_code),
            _score_match(t, c.legal_entity_name or "", c.customer_code) if c.legal_entity_name else 0,
        )
        if score > 0:
            scored.append((score, c))
    scored.sort(key=lambda x: (-x[0], x[1].name))
    out: list[dict] = []
    seen: set[int] = set()
    for score, c in scored:
        if c.id in seen:
            continue
        seen.add(c.id)
        out.append({"id": c.id, "name": c.name, "score": round(min(1.0, score), 4)})
        if len(out) >= limit:
            break
    return out


async def match_styles(
    db: AsyncSession,
    tenant_id: int,
    text: str | None,
    *,
    limit: int = 8,
) -> list[dict]:
    t = (text or "").strip()
    if len(t) < 2:
        return []
    pattern = f"%{t}%"
    stmt = (
        select(GarmentStyle)
        .where(GarmentStyle.tenant_id == tenant_id)
        .where(
            or_(
                GarmentStyle.name.ilike(pattern),
                GarmentStyle.style_code.ilike(pattern),
                GarmentStyle.buyer_style_ref.ilike(pattern),
            )
        )
        .limit(40)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    scored: list[tuple[float, GarmentStyle]] = []
    for s in rows:
        score = _max_score(
            _score_match(t, s.name, s.style_code, s.buyer_style_ref),
        )
        if score > 0:
            scored.append((score, s))
    scored.sort(key=lambda x: (-x[0], x[1].name))
    out: list[dict] = []
    seen: set[int] = set()
    for score, st in scored:
        if st.id in seen:
            continue
        seen.add(st.id)
        label = f"{st.name} ({st.style_code})"
        out.append({"id": st.id, "name": label, "score": round(min(1.0, score), 4)})
        if len(out) >= limit:
            break
    return out
