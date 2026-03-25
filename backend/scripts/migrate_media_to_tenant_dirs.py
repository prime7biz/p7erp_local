"""
One-time migration: move files from legacy flat backend/media/{module}/ to
backend/media/{tenant_id}/{module}/ and update DB URLs to /api/v1/files/{module}/{filename}.

Run from backend directory:
  python scripts/migrate_media_to_tenant_dirs.py

Requires DATABASE_URL and the same app settings as the API.
"""

from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.config import get_settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models import Customer, GarmentStyle, TradeDocument  # noqa: E402
from app.common.storage import get_media_root  # noqa: E402


def _filename_from_logo_url(url: str) -> str | None:
    if "/customer_logos/" not in url:
        return None
    return url.split("/customer_logos/")[-1].split("?")[0].strip() or None


def _filename_from_style_url(url: str) -> str | None:
    if "/style_pictures/" not in url:
        return None
    return url.split("/style_pictures/")[-1].split("?")[0].strip() or None


async def run() -> None:
    settings = get_settings()
    api_prefix = settings.api_v1_prefix.rstrip("/")
    root = get_media_root()
    root.mkdir(parents=True, exist_ok=True)

    async with AsyncSessionLocal() as db:
        # Customers
        cust_rows = (await db.execute(select(Customer).where(Customer.company_logo_url.isnot(None)))).scalars().all()
        for c in cust_rows:
            url = (c.company_logo_url or "").strip()
            if not url or "/media/customer_logos/" not in url:
                continue
            fn = _filename_from_logo_url(url)
            if not fn:
                continue
            old = root / "customer_logos" / fn
            dest_dir = root / str(c.tenant_id) / "customer_logos"
            dest_dir.mkdir(parents=True, exist_ok=True)
            new_path = dest_dir / fn
            if old.is_file() and old.resolve() != new_path.resolve():
                shutil.move(str(old), str(new_path))
            c.company_logo_url = f"{api_prefix}/files/customer_logos/{fn}"

        # Styles
        style_rows = (await db.execute(select(GarmentStyle).where(GarmentStyle.style_image_url.isnot(None)))).scalars().all()
        for s in style_rows:
            url = (s.style_image_url or "").strip()
            if not url or "/media/style_pictures/" not in url:
                continue
            fn = _filename_from_style_url(url)
            if not fn:
                continue
            old = root / "style_pictures" / fn
            dest_dir = root / str(s.tenant_id) / "style_pictures"
            dest_dir.mkdir(parents=True, exist_ok=True)
            new_path = dest_dir / fn
            if old.is_file() and old.resolve() != new_path.resolve():
                shutil.move(str(old), str(new_path))
            s.style_image_url = f"{api_prefix}/files/style_pictures/{fn}"

        # Trade documents (absolute storage_path on disk)
        doc_rows = (await db.execute(select(TradeDocument))).scalars().all()
        for d in doc_rows:
            sp = (d.storage_path or "").strip()
            if not sp:
                continue
            p = Path(sp)
            if "trade_docs" not in str(p).replace("\\", "/"):
                continue
            fn = p.name
            old = p if p.is_absolute() else root / p
            try:
                old = old.resolve()
            except OSError:
                continue
            dest_dir = root / str(d.tenant_id) / "trade_docs"
            dest_dir.mkdir(parents=True, exist_ok=True)
            new_path = dest_dir / fn
            if old.is_file() and old.resolve() != new_path.resolve():
                try:
                    old.relative_to(root.resolve())
                except ValueError:
                    continue
                shutil.move(str(old), str(new_path))
            d.storage_path = str(new_path.resolve())

        await db.commit()
    print("Migration completed: customer logos, style pictures, trade_documents updated.")


if __name__ == "__main__":
    asyncio.run(run())
