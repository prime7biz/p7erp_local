from __future__ import annotations

from app.modules.ai_tool.tasks.policies import classify_task


def task_requires_mcp_approval(task_type: str) -> bool:
    _, requires = classify_task(task_type)
    return requires
