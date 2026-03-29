"""Valid status transitions for ai_approval_artifacts."""

from __future__ import annotations

ALLOWED_ARTIFACT_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("created", "pending_review"),
        ("created", "rejected"),
        ("created", "expired"),
        ("pending_review", "approved"),
        ("pending_review", "rejected"),
        ("pending_review", "expired"),
        ("approved", "committed"),
        ("approved", "rejected"),
        ("committed", "rolled_back"),
    }
)


def can_transition_artifact(from_status: str, to_status: str) -> bool:
    return (from_status, to_status) in ALLOWED_ARTIFACT_TRANSITIONS
