"""One-off: build routers/alerts.py from legacy router slice. Run from repo root."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
router_path = ROOT / "app" / "modules" / "merch" / "router.py"
out_path = ROOT / "app" / "modules" / "merch" / "routers" / "alerts.py"

lines = router_path.read_text(encoding="utf-8").splitlines()
# 1-based 4232-5034 inclusive
chunk = lines[4231:5034]

header = '''"""Persisted merch alerts: definitions, list, detail, mutations, views, scan."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AlertComment,
    AlertDefinition,
    AlertEscalationLog,
    AlertHistory,
    AlertInstance,
    AlertRelatedEntity,
    AlertSavedView,
    Order,
    Tenant,
    User,
)
from app.modules.merch.deps import ensure_tenant as _ensure_tenant
from app.modules.merch.permissions import (
    MERCH_PERMISSION_ALERT_ASSIGN,
    MERCH_PERMISSION_ALERT_DEFINITIONS,
    MERCH_PERMISSION_ALERT_SCAN,
    require_merch_permission,
)

router = APIRouter(tags=["merch"])

'''

out_path.write_text(header + "\n".join(chunk) + "\n", encoding="utf-8")
print(f"Wrote {out_path} ({len(chunk) + len(header.splitlines())} lines total)")
