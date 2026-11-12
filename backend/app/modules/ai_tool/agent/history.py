"""Recent chat messages sent to the agent model so follow-up questions keep their context."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiMessage
from app.modules.ai_tool.llm_provider.prompt_sanitizer import clamp_text_for_llm, redact_pii_for_external_provider

HISTORY_MESSAGES = 10
HISTORY_MAX_CHARS_PER_MESSAGE = 2000


async def load_recent_history(
    db: AsyncSession,
    *,
    tenant_id: int,
    session_id: int,
    exclude_message_id: int | None,
    limit: int = HISTORY_MESSAGES,
) -> list[dict[str, str]]:
    """Newest ``limit`` user/assistant messages of the session (oldest first), redacted and clamped.

    The caller must already have checked that the session belongs to the user and tenant.
    """
    stmt = select(AiMessage.role, AiMessage.content).where(
        AiMessage.tenant_id == tenant_id,
        AiMessage.session_id == session_id,
        AiMessage.role.in_(("user", "assistant")),
    )
    if exclude_message_id is not None:
        stmt = stmt.where(AiMessage.id != exclude_message_id)
    rows = (await db.execute(stmt.order_by(AiMessage.message_index.desc()).limit(limit))).all()
    out: list[dict[str, str]] = []
    for role, content in reversed(rows):
        text = clamp_text_for_llm(redact_pii_for_external_provider(str(content or "")), max_chars=HISTORY_MAX_CHARS_PER_MESSAGE)
        if text.strip():
            out.append({"role": role, "content": text})
    return out
