from fastapi import HTTPException, status


INQUIRY_TRANSITIONS: dict[str, set[str]] = {
  "DRAFT": {"SUBMITTED", "CANCELLED"},
  "SUBMITTED": {"CONVERTED", "LOST", "CANCELLED"},
  "CONVERTED": set(),
  "LOST": set(),
  "CANCELLED": set(),
}

QUOTATION_TRANSITIONS: dict[str, set[str]] = {
  "DRAFT": {"SUBMITTED", "CANCELLED"},
  "NEW": {"SUBMITTED", "CANCELLED"},
  "SUBMITTED": {"APPROVED", "REJECTED", "CANCELLED"},
  "APPROVED": {"SENT", "REJECTED", "CANCELLED"},
  "SENT": {"CONVERTED", "REJECTED", "CANCELLED"},
  "CONVERTED": set(),
  "REJECTED": set(),
  "CANCELLED": set(),
}

ORDER_TRANSITIONS: dict[str, set[str]] = {
  # Synthetic "DRAFT" on create must match UI/imports: allow common starting statuses (promise check runs for IN_PROGRESS).
  "DRAFT": {"NEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"},
  # Allow closing from pre-production without forcing IN_PROGRESS (admin / trading / import parity).
  "NEW": {"DRAFT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"},
  "CONFIRMED": {"NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"},
  # Step back to CONFIRMED/NEW or finish/void as needed.
  "IN_PROGRESS": {"CONFIRMED", "COMPLETED", "CANCELLED", "NEW"},
  # Reopen, void, or reset to NEW for admin/data fixes.
  "COMPLETED": {"IN_PROGRESS", "CANCELLED", "NEW"},
  # Restore cancelled orders back to pipeline entry (mistake / buyer change of mind).
  "CANCELLED": {"NEW"},
}

BOM_TRANSITIONS: dict[str, set[str]] = {
  "DRAFT": {"SUBMITTED", "CANCELLED"},
  "SUBMITTED": {"APPROVED", "REJECTED", "CANCELLED"},
  "APPROVED": {"FROZEN", "REJECTED"},
  "FROZEN": set(),
  "REJECTED": {"DRAFT"},
  "CANCELLED": set(),
}


def normalize_status(value: str | None, fallback: str) -> str:
  return (value or fallback).strip().upper()


def next_status_options(
  transitions: dict[str, set[str]],
  current_status: str | None,
  *,
  fallback: str,
) -> list[str]:
  current = normalize_status(current_status, fallback)
  return sorted(list(transitions.get(current, set())))


def validate_transition(
  transitions: dict[str, set[str]],
  current_status: str | None,
  next_status: str | None,
  *,
  fallback: str,
  entity_label: str,
) -> str:
  current = normalize_status(current_status, fallback)
  target = normalize_status(next_status, fallback)

  if target == current:
    return target
  if current not in transitions:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=f"Unknown current {entity_label} status: {current}",
    )
  if target not in transitions:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=f"Unknown target {entity_label} status: {target}",
    )
  if target not in transitions[current]:
    allowed = ", ".join(sorted(transitions[current])) or "no further transitions"
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=(
        f"Invalid {entity_label} workflow transition: {current} -> {target}. "
        f"Allowed next statuses: {allowed}"
      ),
    )
  return target
