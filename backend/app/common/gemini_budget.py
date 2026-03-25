"""Optional monthly cap on Gemini API calls (process-wide)."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

_STATE_FILE = "gemini_monthly_usage.json"


def _state_path() -> Path:
    base = Path(__file__).resolve().parents[2] / "media"
    base.mkdir(parents=True, exist_ok=True)
    return base / _STATE_FILE


def allow_gemini_call() -> bool:
    """Return True if a call is allowed under the monthly budget; increments counter when allowed."""
    s = get_settings()
    limit = int(s.ai_monthly_budget_limit or 0)
    if limit <= 0:
        return True

    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y-%m")
    path = _state_path()
    data: dict = {}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}

    if data.get("month") != month_key:
        data = {"month": month_key, "count": 0}

    count = int(data.get("count") or 0)
    if count >= limit:
        logger.warning("Gemini monthly budget exhausted: %s/%s for %s", count, limit, month_key)
        return False

    data["count"] = count + 1
    try:
        path.write_text(json.dumps(data), encoding="utf-8")
    except OSError as e:
        logger.warning("Could not persist Gemini usage: %s", e)
    return True
