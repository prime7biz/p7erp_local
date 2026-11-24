"""Allowed status transitions for HR class requests."""

from __future__ import annotations

from fastapi import HTTPException

# action -> (from_statuses, to_status)
TRANSITIONS: dict[str, tuple[frozenset[str], str]] = {
    "SUBMIT": (frozenset({"DRAFT"}), "SUBMITTED"),
    "RESUBMIT": (frozenset({"RETURNED"}), "SUBMITTED"),
    "RECOMMEND": (frozenset({"SUBMITTED"}), "RECOMMENDED"),
    "RETURN": (frozenset({"SUBMITTED", "RECOMMENDED"}), "RETURNED"),
    "REJECT": (frozenset({"SUBMITTED", "RECOMMENDED"}), "REJECTED"),
    "APPROVE": (frozenset({"RECOMMENDED"}), "APPLYING"),
    "CANCEL": (frozenset({"DRAFT", "SUBMITTED", "RETURNED"}), "CANCELLED"),
    "RETRY": (frozenset({"APPROVED", "FAILED"}), "APPLYING"),
}

TERMINAL = frozenset({"APPLIED", "REJECTED", "CANCELLED"})


def assert_transition(status: str, action: str) -> str:
    """Return the next status or raise 409."""
    rule = TRANSITIONS.get(action)
    if rule is None:
        raise HTTPException(status_code=400, detail=f"Unknown action {action}")
    allowed_from, to_status = rule
    if status not in allowed_from:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot {action.lower()} a request in status {status}",
        )
    return to_status


def can_auto_recommend_on_entry(role: str) -> bool:
    return role == "RECOMMEND"
