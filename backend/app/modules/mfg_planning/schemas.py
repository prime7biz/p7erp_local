"""Request / response shapes of the material allocation API. Quantities are Decimal strings (4 places)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

KindLiteral = Literal["HARD_ATP", "TENTATIVE"]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ requests


class AllocatePreviewIn(_In):
    kind: KindLiteral = "HARD_ATP"
    expires_at: datetime | None = Field(None, description="Required for TENTATIVE: future date, at most 180 days ahead")


class AllocateConfirmIn(AllocatePreviewIn):
    state_token: str = Field(..., min_length=16, max_length=128)


class AllocationRunPreviewIn(_In):
    order_ids: list[int] | None = Field(None, max_length=200, description="Default: every open order of that kind (max 200)")
    kind: KindLiteral = "HARD_ATP"
    expires_at: datetime | None = None


class AllocationRunConfirmIn(AllocationRunPreviewIn):
    state_token: str = Field(..., min_length=16, max_length=128)


class ReleaseReservationIn(_In):
    reason: str | None = Field(None, max_length=500, description="At least 10 characters when releasing a hard hold of a confirmed order")
    quantity: Decimal | None = Field(None, gt=0, description="Partial release; omit to release the whole hold")
    expected_lock_version: int | None = Field(None, ge=0, description="Required to make a partial release replay-safe")


class ReleasePegIn(_In):
    reason: str | None = Field(None, max_length=500)
    expected_lock_version: int | None = Field(None, ge=0)


class ReassignIn(_In):
    from_reservation_id: int = Field(..., ge=1)
    to_order_id: int = Field(..., ge=1)
    quantity: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=500, description="At least 10 characters")


# ------------------------------------------------------------------ responses


class PegPlanOut(_Out):
    purchase_order_item_id: int
    purchase_order_id: int
    po_code: str
    quantity: str
    expected_date: date | None = None
    eta_source: str


class PlanLineOut(_Out):
    bom_item_id: int
    item_id: int
    item_name: str | None = None
    category: str | None = None
    uom: str | None = None
    required_qty: str | None = None
    requirement_source: str
    issued_qty: str
    held_qty: str  # effective own hard holds (tentative holds are shown separately)
    tentative_held_qty: str
    pegged_qty: str  # effective own hard pegs
    tentative_pegged_qty: str
    shortfall_qty: str
    hold_qty: str  # to be held from usable stock
    pegs: list[PegPlanOut] = Field(default_factory=list)  # to be pegged to open PO supply
    remaining_short_qty: str


class AllocationPreviewOut(_Out):
    order_id: int
    order_code: str
    order_status: str
    kind: KindLiteral
    expires_at: datetime | None = None
    order_bom_id: int | None = None
    order_bom_status: str | None = None
    priority_rank: int = Field(description="0 in progress, 1 firm by plan start, 2 firm by delivery date, 3 tentative")
    state_token: str
    creates_anything: bool
    lines: list[PlanLineOut]
    warnings: list[str] = Field(default_factory=list)


class CreatedHoldOut(_Out):
    reservation_id: int
    item_id: int
    bom_item_id: int | None = None
    quantity: str
    kind: KindLiteral


class CreatedPegOut(_Out):
    peg_id: int
    purchase_order_item_id: int
    po_code: str
    item_id: int
    quantity: str
    expected_date: date | None = None
    kind: str


class AllocationConfirmOut(_Out):
    order_id: int
    kind: KindLiteral
    status: Literal["ALLOCATED", "NOOP"]
    replayed: bool
    holds: list[CreatedHoldOut] = Field(default_factory=list)
    pegs: list[CreatedPegOut] = Field(default_factory=list)
    state_token: str = Field(description="Token of the state after this call (use it for the next preview check)")
    after: AllocationPreviewOut


class RunPreviewItemOut(_Out):
    order_id: int
    order_code: str
    skipped_code: str | None = None
    skipped_message: str | None = None
    preview: AllocationPreviewOut | None = None


class AllocationRunPreviewOut(_Out):
    kind: KindLiteral
    expires_at: datetime | None = None
    state_token: str
    truncated: bool
    orders: list[RunPreviewItemOut]


class RunResultItemOut(_Out):
    order_id: int
    status: Literal["ALLOCATED", "NOOP", "SKIPPED"]
    code: str | None = None
    detail: str | None = None
    holds: list[CreatedHoldOut] = Field(default_factory=list)
    pegs: list[CreatedPegOut] = Field(default_factory=list)


class AllocationRunConfirmOut(_Out):
    kind: KindLiteral
    state_token: str
    results: list[RunResultItemOut]


class HoldOut(_Out):
    reservation_id: int
    status: str
    kind: str | None = None
    source: str | None = None
    item_id: int
    bom_item_id: int | None = None
    reserved_qty: str
    consumed_qty: str | None = None
    effective_qty: str | None = None
    expires_at: datetime | None = None
    lock_version: int
    legacy: bool = False


class PegOut(_Out):
    peg_id: int
    kind: str
    item_id: int
    bom_item_id: int | None = None
    purchase_order_item_id: int | None = None
    po_code: str | None = None
    pegged_qty: str
    effective_qty: str | None = None
    expected_date: date | None = None
    eta_source: str | None = None
    expires_at: datetime | None = None
    lock_version: int


class AllocationStateOut(_Out):
    order_id: int
    order_code: str
    order_status: str
    order_bom_id: int | None = None
    order_bom_status: str | None = None
    order_bom_usable: bool
    default_kind: KindLiteral
    priority_rank: int
    priority_date: date | None = None
    lines: list[PlanLineOut]
    holds: list[HoldOut]
    pegs: list[PegOut]


class ItemPoLineOut(_Out):
    purchase_order_item_id: int
    po_code: str
    ordered_qty: str
    usable_received_qty: str
    pending_qc_qty: str
    on_order_net_qty: str
    expected_date: date | None = None
    eta_source: str


class ItemAllocationAvailabilityOut(_Out):
    item_id: int
    item_code: str | None = None
    item_name: str | None = None
    own_order_id: int | None = None
    on_hand_qty: str
    hard_reserved_qty: str
    tentative_reserved_qty: str
    on_order_net_qty: str
    hard_pegged_qty: str
    tentative_pegged_qty: str
    free_inbound_qty: str
    pending_qc_qty: str
    pending_po_qty: str
    earliest_expected_date: date | None = None
    atp_hard_qty: str
    atp_stressed_qty: str
    holds: list[HoldOut]
    pegs: list[PegOut]
    po_lines: list[ItemPoLineOut]


class ReleaseOut(_Out):
    id: int
    status: str
    released_qty: str | None = None
    remaining_qty: str | None = None
    lock_version: int
    changed: bool


class ReassignOut(_Out):
    from_reservation_id: int
    from_order_id: int
    to_reservation_id: int
    to_order_id: int
    item_id: int
    kind: KindLiteral
    quantity: str
    source_remaining_qty: str


class ConflictOut(_Out):
    code: str
    severity: str
    order_id: int | None = None
    order_code: str | None = None
    item_id: int | None = None
    item_code: str | None = None
    item_name: str | None = None
    reservation_id: int | None = None
    peg_id: int | None = None
    quantity: str | None = None
    detail: str = ""


class ConflictListOut(_Out):
    items: list[ConflictOut]
    truncated: bool


JsonDict = dict[str, Any]
