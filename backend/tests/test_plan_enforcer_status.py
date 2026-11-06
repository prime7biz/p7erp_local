"""Subscription status enforcement: cancelled stays usable until the paid period ends; expired blocks.

Run:
    docker compose exec backend pytest tests/test_plan_enforcer_status.py -q
"""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.common import plan_enforcer
from app.config import get_settings


@pytest.mark.parametrize(
    ("status", "period_end_days", "blocked"),
    [
        ("active", None, False),
        ("cancelled", 5, False),
        ("cancelled", -1, True),
        ("cancelled", None, True),
        ("expired", 5, True),
        ("past_due", None, True),
    ],
)
@pytest.mark.asyncio
async def test_subscription_status_enforcement(monkeypatch, status, period_end_days, blocked):
    monkeypatch.setattr(get_settings(), "plan_enforcement_enabled", True)
    end = None if period_end_days is None else datetime.utcnow() + timedelta(days=period_end_days)
    sub = SimpleNamespace(status=status, current_period_end=end)

    async def fake_plan(_db, _tenant_id):
        return sub, None

    monkeypatch.setattr(plan_enforcer, "_subscription_plan", fake_plan)
    if blocked:
        with pytest.raises(HTTPException) as exc:
            await plan_enforcer.assert_subscription_active(None, 1)
        assert exc.value.status_code == 402
    else:
        await plan_enforcer.assert_subscription_active(None, 1)
