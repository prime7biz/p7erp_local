from __future__ import annotations

# Valid (from_status, to_status) transitions for ai_system_tasks.
ALLOWED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("created", "pending_approval"),
        ("created", "queued"),
        ("created", "cancelled"),
        ("pending_approval", "queued"),
        ("pending_approval", "cancelled"),
        ("queued", "running"),
        ("queued", "cancelled"),
        ("running", "completed"),
        ("running", "failed"),
        ("running", "queued"),
        ("failed", "queued"),  # manual retry
    }
)


def can_transition(from_status: str, to_status: str) -> bool:
    return (from_status, to_status) in ALLOWED_TRANSITIONS
