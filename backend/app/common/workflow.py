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

# Order execution pipeline (auto-advanced; stored on orders.pipeline_status).
# Pre-order steps INQUIRY / QUOTATION are derived in the API from inquiry/quotation chain.
PIPELINE_STAGES: list[str] = [
    "INQUIRY",
    "QUOTATION",
    "ORDER_CONFIRMED",
    "PI_ISSUED",
    "LC_RECEIVED",
    "BOM_CREATED",
    "PO_ISSUED",
    "RM_RECEIVED",
    "IN_PRODUCTION",
    "SHIPPED",
    "PAYMENT_RECEIVED",
    "COMPLETED",
]

PIPELINE_NA_PRESETS: dict[str, list[str]] = {
    "local": ["LC_RECEIVED"],
    "export": [],
    "both": [],
}

# Legacy execution `status` on orders: manual edits are limited. Lifecycle is driven by
# `pipeline_status` + auto-advance; use admin "force_pipeline_status" for rare fixes.
ORDER_TRANSITIONS: dict[str, set[str]] = {
  "DRAFT": {"NEW", "CONFIRMED", "CANCELLED"},
  "NEW": {"CANCELLED"},
  "CONFIRMED": {"CANCELLED"},
  "IN_PROGRESS": {"CANCELLED"},
  "COMPLETED": {"CANCELLED"},
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
