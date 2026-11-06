"""Auto-generated document codes for manufacturing records (plans, work orders, MRP runs, NCRs, ...).

Codes used to be built from ``max(id) + 1``. Two users saving at the same time got the same code and
the unique constraint turned that into a 500 error. Now the number comes from the shared atomic
tenant counter (``tenant_code_counters``, the same one POs and BOMs use). If a user typed that code
by hand earlier, the next number is tried instead.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code

MAX_CODE_ATTEMPTS = 20


async def next_mfg_code(
    db: AsyncSession,
    *,
    model,
    code_column,
    tenant_id: int,
    prefix: str,
    width: int = 4,
) -> str:
    """Next free ``<prefix><number>`` code for ``model`` in this tenant."""
    for _ in range(MAX_CODE_ATTEMPTS):
        code = await next_tenant_code(db, model=model, tenant_id=tenant_id, prefix=prefix, width=width)
        taken = await db.scalar(select(exists().where(model.tenant_id == tenant_id, code_column == code)))
        if not taken:
            return code
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Could not allocate a free document code; please enter one manually",
    )
