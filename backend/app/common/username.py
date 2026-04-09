"""Generate unique internal usernames per tenant (display / legacy)."""

from __future__ import annotations

import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def generate_unique_username_for_tenant(db: AsyncSession, tenant_id: int, email: str) -> str:
    """Derive a short unique username per tenant from the email local-part."""
    local = email.split("@", 1)[0] if "@" in email else email
    base = re.sub(r"[^a-zA-Z0-9_]", "", local).lower() or "user"
    base = base[:24]
    for _ in range(60):
        candidate = base if _ == 0 else f"{base}{secrets.token_hex(2)}"
        candidate = candidate[:128]
        exists = await db.execute(
            select(User.id).where(
                User.tenant_id == tenant_id,
                User.username.isnot(None),
                func.lower(User.username) == candidate.lower(),
            ).limit(1)
        )
        if exists.scalar_one_or_none() is None:
            return candidate
        base = base[:20] if len(base) > 20 else base
    return f"user_{secrets.token_hex(4)}"[:128]
