from __future__ import annotations

from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def tenant_scoped_query(
    db: AsyncSession,
    *,
    tenant_id: int,
    query_template: str,
    params: dict[str, Any] | None = None,
) -> pd.DataFrame:
    if ":tenant_id" not in query_template:
        raise ValueError("query_template must include :tenant_id bind parameter")
    bind: dict[str, Any] = dict(params or {})
    bind["tenant_id"] = tenant_id
    result = await db.execute(text(query_template), bind)
    rows = result.mappings().all()
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame([dict(r) for r in rows])
