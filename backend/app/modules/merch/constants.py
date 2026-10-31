"""Merchandising module constants (shared across routers and services)."""

STYLE_PICTURE_MAX_BYTES = 2 * 1024 * 1024
ALLOWED_STYLE_PICTURE_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

STYLE_LIFECYCLE_STAGES = {
    "INQUIRY",
    "DEVELOPMENT",
    "QUOTED",
    "ORDERED",
    "IN_PRODUCTION",
    "SHIPPED",
    "PAID",
    "CLOSED",
}
STYLE_PRIORITY_VALUES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
STYLE_RISK_VALUES = {"LOW", "MEDIUM", "HIGH"}

GOVERNED_BOM_STATUSES = {"APPROVED", "FROZEN"}

CONSUMPTION_RECON_DASHBOARD_MAX_ORDERS = 500

DEFAULT_WASTAGE_THRESHOLD_PCT = 15.0

TNA_PHASES = [
    "pre_order",
    "sampling",
    "approval",
    "sourcing",
    "fabric",
    "trims",
    "production",
    "inspection",
    "finishing",
    "packing",
    "commercial",
    "shipment",
    "payment",
    "other",
]
TNA_ACTION_STATUSES = [
    "pending",
    "in_progress",
    "submitted",
    "approved",
    "rejected",
    "resubmitted",
    "completed",
    "cancelled",
    "on_hold",
]
TNA_APPROVAL_STATUSES = ["pending", "approved", "rejected", "not_applicable"]
TNA_SEVERITIES = ["low", "medium", "high", "critical"]

# Default template seed: code, name, phase, default_days_before_delivery, sequence_no
TNA_DEFAULT_TEMPLATE_SEED: list[tuple[str, str, str, int | None, int]] = [
    ("order_confirmed", "Order confirmed", "pre_order", None, 10),
    ("lc_received", "LC received", "pre_order", None, 20),
    ("proto_sample_submit", "Proto sample submission", "sampling", 120, 30),
    ("fit_sample_submit", "Fit sample submission", "sampling", 100, 40),
    ("fit_sample_approval", "Fit sample approval", "sampling", 95, 45),
    ("size_set_submit", "Size set sample submission", "sampling", 85, 50),
    ("pp_sample_submit", "PP sample submission", "sampling", 55, 60),
    ("pp_approval", "PP approval", "sampling", 50, 65),
    ("lab_dip_approval", "Lab dip approval", "approval", 75, 70),
    ("bulk_fabric_approval", "Bulk fabric approval", "approval", 60, 75),
    ("accessories_approval", "Accessories approval", "approval", 55, 80),
    ("fabric_in_house", "Fabric in-house", "fabric", 45, 90),
    ("accessories_in_house", "Accessories in-house", "trims", 40, 95),
    ("cutting_start", "Cutting start", "production", 35, 100),
    ("sewing_start", "Sewing start", "production", 28, 110),
    ("inline_inspection", "Inline inspection", "inspection", 20, 120),
    ("final_inspection", "Final inspection", "inspection", 10, 130),
    ("ex_factory", "Ex-factory", "shipment", 5, 140),
    ("shipment_docs", "Shipping docs / BL", "commercial", 3, 145),
    ("shipment_confirmation", "Shipment confirmation to buyer", "commercial", 0, 150),
]

# Event keys for followup_sync_service → milestone_type / template.code values.
TNA_EVENT_GRN_FABRIC = "grn_fabric_in_house"
TNA_EVENT_GRN_TRIMS = "grn_accessories_in_house"
TNA_EVENT_GRN = "grn_received"
TNA_EVENT_SAMPLE_APPROVED = "sample_approved"
TNA_EVENT_CHALLAN_POSTED = "delivery_challan_posted"
TNA_EVENT_CUTTING_START = "cutting_start"
TNA_EVENT_SEWING_START = "sewing_start"
TNA_EVENT_LINE_ALLOCATED = "line_allocated"

# Map sync event_key → one or more milestone codes (template.code / milestone_type).
TNA_EVENT_MILESTONE_MAP: dict[str, tuple[str, ...]] = {
    TNA_EVENT_GRN_FABRIC: ("fabric_in_house",),
    TNA_EVENT_GRN_TRIMS: ("accessories_in_house",),
    TNA_EVENT_GRN: ("fabric_in_house", "accessories_in_house"),
    TNA_EVENT_CHALLAN_POSTED: ("shipment_confirmation", "ex_factory"),
    TNA_EVENT_CUTTING_START: ("cutting_start",),
    TNA_EVENT_SEWING_START: ("sewing_start",),
    TNA_EVENT_LINE_ALLOCATED: ("sewing_start",),  # soft: allocation unlocks sewing prep
}

# Merch sample_type → approval / submit milestone codes to complete on sample approve.
TNA_SAMPLE_TYPE_MILESTONES: dict[str, tuple[str, ...]] = {
    "proto": ("proto_sample_submit",),
    "fit": ("fit_sample_submit", "fit_sample_approval"),
    "size_set": ("size_set_submit",),
    "pp": ("pp_sample_submit", "pp_approval"),
    "sms": ("pp_approval",),
    "wash": ("lab_dip_approval",),
    "development": ("lab_dip_approval",),
}

# Approval milestones that can gate bulk fabric PO when sample_approval_gates_for_po is on.
TNA_PO_GATE_MILESTONES: tuple[str, ...] = (
    "lab_dip_approval",
    "pp_approval",
    "bulk_fabric_approval",
)


def milestones_for_event(event_key: str, *, sample_type: str | None = None) -> tuple[str, ...]:
    """Resolve milestone codes for a sync event."""
    key = (event_key or "").strip().lower()
    if key == TNA_EVENT_SAMPLE_APPROVED:
        st = (sample_type or "").strip().lower()
        return TNA_SAMPLE_TYPE_MILESTONES.get(st, ())
    return TNA_EVENT_MILESTONE_MAP.get(key, ())
