"""One-off check: DB connectivity (direct Postgres or via PgBouncer when USE_PGBOUNCER=true)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[1]
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from sqlalchemy import text

from app.config import get_settings
from app.database import engine


async def main() -> None:
    settings = get_settings()
    print("use_pgbouncer:", settings.use_pgbouncer)
    async with engine.connect() as conn:
        value = (await conn.execute(text("SELECT 1"))).scalar_one()
    print("select_1:", value)


if __name__ == "__main__":
    asyncio.run(main())
