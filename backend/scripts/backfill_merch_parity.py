"""
Backfill helper for merchandising strict parity tables.

Usage (inside backend container):
  python -m scripts.backfill_merch_parity
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import GarmentStyle, StyleSizeScale


async def run() -> None:
    async with AsyncSessionLocal() as db:
        # For each style, ensure at least one size scale row exists.
        styles = (await db.execute(select(GarmentStyle))).scalars().all()
        created = 0
        for style in styles:
            existing = (
                await db.execute(
                    select(StyleSizeScale).where(
                        StyleSizeScale.tenant_id == style.tenant_id,
                        StyleSizeScale.style_id == style.id,
                    )
                )
            ).scalars().first()
            if existing:
                continue
            db.add(
                StyleSizeScale(
                    tenant_id=style.tenant_id,
                    style_id=style.id,
                    scale_name="Default",
                    sizes_csv="S,M,L,XL",
                    notes="Backfilled default size scale for parity",
                )
            )
            created += 1
        await db.commit()
        print(f"Backfill complete. Created size scales: {created}")


if __name__ == "__main__":
    asyncio.run(run())
