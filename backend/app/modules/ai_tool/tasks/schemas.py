from __future__ import annotations

from enum import Enum


class TaskCategory(str, Enum):
    informational = "informational"
    draft = "draft"
    approval_gated = "approval_gated"


class TaskStatus(str, Enum):
    created = "created"
    pending_approval = "pending_approval"
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
