"""Pydantic schemas for production API."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# --- Settings ---
class TenantProductionSettingsResponse(BaseModel):
    tenant_id: int
    enabled_optional_units: list[str] = Field(default_factory=list)
    weekend_days: list[str] = Field(default_factory=list)
    cm_alert_threshold_pct: float = 10.0
    ai_provider_config: dict[str, Any] | None = None


class TenantProductionSettingsUpdate(BaseModel):
    enabled_optional_units: list[str] | None = None
    weekend_days: list[str] | None = None
    cm_alert_threshold_pct: float | None = None
    ai_provider_config: dict[str, Any] | None = None


# --- Planning pipeline / Gemini AI ---
class AiPlanningSettingsResponse(BaseModel):
    effective_enabled: bool
    effective_model: str
    tenant_override: dict[str, Any] | None = None


class AiPlanningSettingsUpdate(BaseModel):
    enabled: bool | None = None
    model: str | None = Field(None, max_length=128)


class AiSuggestAllocationBody(BaseModel):
    order_id: int


class AiPredictMoveBody(BaseModel):
    config_id: int
    target_line_id: int
    target_start_date: str  # YYYY-MM-DD


class ProductionShiftCreate(BaseModel):
    shift_code: str = Field(..., max_length=16)
    name: str
    start_time: str  # "HH:MM:SS" or "HH:MM"
    end_time: str
    break_minutes: int = 0
    is_active: bool = True


class ProductionShiftResponse(BaseModel):
    id: int
    tenant_id: int
    shift_code: str
    name: str
    start_time: str
    end_time: str
    break_minutes: int
    is_active: bool


class ProductionShiftUpdate(BaseModel):
    shift_code: str | None = None
    name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    break_minutes: int | None = None
    is_active: bool | None = None


class FactoryCalendarOverrideCreate(BaseModel):
    override_date: str  # YYYY-MM-DD
    override_type: str  # holiday | working_day
    name: str | None = None
    notes: str | None = None
    category: str | None = None  # government | religious | company | optional
    source: str | None = None  # manual | auto_import | ai_suggested
    is_paid: bool = True
    affects_hr: bool = False


class FactoryCalendarOverrideResponse(BaseModel):
    id: int
    override_date: str
    override_type: str
    name: str | None
    notes: str | None
    category: str | None = None
    source: str | None = None
    is_paid: bool = True
    affects_hr: bool = False


class FactoryCalendarImportHolidaysRequest(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    selected_dates: list[str] = Field(default_factory=list)  # YYYY-MM-DD subset; empty = all from preview


class FactoryCalendarImportHolidaysResponse(BaseModel):
    imported_count: int
    skipped_count: int


class CountryHolidayPreviewItem(BaseModel):
    date: str
    name: str
    category: str = "government"
    garment_recommendation: str | None = None  # must_close | optional | none


class CountryHolidaysPreviewResponse(BaseModel):
    country_code: str
    year: int
    items: list[CountryHolidayPreviewItem]


class SewingLineCreate(BaseModel):
    line_code: str
    name: str
    default_machine_count: int = 0
    running_machine_count: int = 0
    default_operator_count: int = 0
    default_helper_count: int = 0
    supervisor_user_id: int | None = None
    is_active: bool = True


class SewingLineUpdate(BaseModel):
    name: str | None = None
    default_machine_count: int | None = None
    running_machine_count: int | None = None
    default_operator_count: int | None = None
    default_helper_count: int | None = None
    supervisor_user_id: int | None = None
    is_active: bool | None = None


class SewingLineResponse(BaseModel):
    id: int
    tenant_id: int
    line_code: str
    name: str
    default_machine_count: int
    running_machine_count: int
    default_operator_count: int
    default_helper_count: int
    supervisor_user_id: int | None
    is_active: bool


class DepartmentMachineCreate(BaseModel):
    department_type: str
    machine_code: str
    name: str
    machine_type: str | None = None
    specs: dict[str, Any] | None = None
    status: str = "active"
    is_active: bool = True


class DepartmentMachineResponse(BaseModel):
    id: int
    tenant_id: int
    department_type: str
    machine_code: str
    name: str
    machine_type: str | None
    status: str
    is_active: bool


class CrewRoleCreate(BaseModel):
    department_type: str
    role_key: str
    role_name: str
    is_named: bool = False
    designation_id: int | None = None
    designation_filter: str | None = None
    sort_order: int = 0
    is_active: bool = True


class CrewRoleUpdate(BaseModel):
    role_name: str | None = None
    is_named: bool | None = None
    designation_id: int | None = None
    designation_filter: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CrewRoleResponse(BaseModel):
    id: int
    tenant_id: int
    department_type: str
    role_key: str
    role_name: str
    is_named: bool
    designation_id: int | None = None
    designation_filter: str | None
    sort_order: int
    is_active: bool


class CrewTemplateRowInput(BaseModel):
    crew_role_id: int
    default_count: int = 0
    employee_id: int | None = None


class CrewTemplateRowResponse(BaseModel):
    crew_role_id: int
    role_key: str
    role_name: str
    is_named: bool
    designation_id: int | None = None
    designation_filter: str | None = None
    default_count: int = 0
    employee_id: int | None = None
    employee_name: str | None = None
    sort_order: int = 0


class CrewTemplateBulkUpsert(BaseModel):
    rows: list[CrewTemplateRowInput] = Field(default_factory=list)
    machine_id: int | None = None


class HrAvailableResponse(BaseModel):
    designation_id: int | None
    designation_filter: str | None
    date: str
    available_count: int
    active_count: int
    on_leave_count: int
    employees: list[dict[str, Any]] = Field(default_factory=list)


class CrewDailyFilter(BaseModel):
    production_date: str
    shift_id: int
    line_id: int | None = None
    department_type: str | None = None
    machine_id: int | None = None


class CrewDailyRowInput(BaseModel):
    crew_role_id: int
    planned_count: int = 0
    employee_id: int | None = None
    notes: str | None = None
    override_validation: bool = False


class CrewDailyRowResponse(BaseModel):
    id: int
    crew_role_id: int
    role_key: str
    role_name: str
    is_named: bool
    designation_filter: str | None = None
    planned_count: int = 0
    actual_present: int = 0
    shortfall: int = 0
    employee_id: int | None = None
    employee_name: str | None = None
    notes: str | None = None
    sort_order: int = 0
    validation_warning: str | None = None


class CrewDailyBulkUpsert(BaseModel):
    production_date: str
    shift_id: int
    line_id: int | None = None
    department_type: str | None = None
    machine_id: int | None = None
    rows: list[CrewDailyRowInput] = Field(default_factory=list)
    override_validation: bool = False


class CrewDailyInitRequest(BaseModel):
    production_date: str
    shift_id: int
    line_id: int | None = None
    department_type: str | None = None
    machine_id: int | None = None


class CmOverheadConfigUpsert(BaseModel):
    cost_category: str
    account_id: int | None = None
    cost_center_id: int | None = None
    allocation_method: str = "equal"
    is_active: bool = True


class CmOverheadConfigResponse(BaseModel):
    id: int
    tenant_id: int
    cost_category: str
    account_id: int | None
    cost_center_id: int | None
    allocation_method: str
    is_active: bool


# --- IE ---
class IeOperationCreate(BaseModel):
    operation_code: str
    name: str
    category: str = "other"
    default_smv: float = 0.0
    machine_type_required: str | None = None


class IeOperationResponse(BaseModel):
    id: int
    operation_code: str
    name: str
    category: str
    default_smv: float
    machine_type_required: str | None
    is_active: bool


class ObOpCreate(BaseModel):
    sequence_no: int
    operation_id: int | None = None
    operation_name: str
    smv: float = 0.0
    machine_type: str | None = None
    attachment_needed: str | None = None
    is_critical: bool = False


class OperationBulletinCreate(BaseModel):
    style_id: int
    ob_code: str
    version_no: int = 1
    notes: str | None = None
    operations: list[ObOpCreate] = Field(default_factory=list)


class OperationBulletinResponse(BaseModel):
    id: int
    style_id: int
    ob_code: str
    version_no: int
    total_smv: float
    status: str


class LineBalanceRequest(BaseModel):
    ob_id: int
    line_id: int  # sewing line context
    num_workstations: int


# --- Plan board ---
class SewingLineStyleConfigCreate(BaseModel):
    line_id: int
    order_id: int | None = None
    style_id: int | None = None
    ob_id: int | None = None
    machine_count: int = 0
    operator_count: int = 0
    helper_count: int = 0
    target_efficiency_pct: float = 65.0
    shift_id: int | None = None
    start_date: str
    planned_qty: float = 0.0
    sort_order: int = 0


class SewingLineStyleConfigMove(BaseModel):
    line_id: int | None = None
    start_date: str | None = None


# --- Hourly ---
class HourlyEntryUpsert(BaseModel):
    department_type: str
    machine_id: int | None = None
    line_id: int | None = None
    line_style_config_id: int | None = None
    order_id: int | None = None
    style_id: int | None = None
    shift_id: int | None = None
    production_date: str
    hour_slot: int
    target_qty: float | None = None
    good_qty: float | None = None
    reject_qty: float | None = None
    rework_qty: float | None = None
    input_qty: float | None = None
    output_qty: float | None = None
    uom: str | None = None
    remarks: str | None = None


# --- Cutting ---
class MarkerPlanCreate(BaseModel):
    order_id: int | None = None
    style_id: int | None = None
    marker_code: str
    cad_reference: str | None = None
    marker_length: float | None = None
    marker_width: float | None = None
    marker_efficiency_pct: float | None = None
    fabric_consumption_per_pcs: float | None = None
    sizes_included: list[str] | None = None
    size_ratio: dict[str, Any] | None = None
    pcs_per_marker: int | None = None
    notes: str | None = None


class BundleIssueRequest(BaseModel):
    bundle_ids: list[int]
    issued_to_line_id: int


class LayPlanCreate(BaseModel):
    marker_plan_id: int
    lay_code: str
    fabric_item_id: int | None = None


class CutTicketCreate(BaseModel):
    lay_plan_id: int
    ticket_code: str


class GenerateBundlesRequest(BaseModel):
    lines: list[dict[str, Any]] | None = None


# --- Cost ---
class ProductionCostInputCreate(BaseModel):
    department_type: str
    line_id: int | None = None
    cost_date: str
    shift_id: int | None = None
    labor_cost: float = 0.0
    helper_cost: float = 0.0
    supervision_cost: float = 0.0
    machine_depreciation: float = 0.0
    overhead_allocation: float = 0.0
    utility_cost: float = 0.0
    other_cost: float = 0.0
    notes: str | None = None


class WipJournalCreate(BaseModel):
    from_department: str
    to_department: str
    order_id: int | None = None
    style_id: int | None = None
    quantity: float = 0.0
    uom: str | None = None
    material_value: float = 0.0
    conversion_cost: float = 0.0
    journal_date: str
    cost_center_id: int | None = None
    notes: str | None = None
    # Optional: create a balanced DRAFT finance voucher (JOURNAL) — post from Finance when ready
    gl_debit_account_id: int | None = None
    gl_credit_account_id: int | None = None


class KnittingPlanCreate(BaseModel):
    machine_id: int | None = None
    yarn_item_id: int | None = None
    target_output_kg: float | None = None
    fabric_type: str | None = None
    gauge: str | None = None
    planned_date: str | None = None
    order_id: int | None = None
    notes: str | None = None


class DyeRecipeCreate(BaseModel):
    recipe_code: str
    color_name: str | None = None
    color_code: str | None = None
    chemicals: list[dict[str, Any]] | None = None
    process_time_minutes: int | None = None
    temperature: str | None = None


class DyeBatchCreate(BaseModel):
    batch_code: str
    machine_id: int | None = None
    recipe_id: int | None = None
    fabric_item_id: int | None = None
    input_qty_kg: float | None = None
    order_id: int | None = None
    planned_start: str | None = None
    planned_end: str | None = None


class DeptPlanCreate(BaseModel):
    department_type: str
    machine_id: int | None = None
    input_item_id: int | None = None
    target_output: float | None = None
    target_uom: str | None = None
    planned_date: str | None = None
    order_id: int | None = None
    style_id: int | None = None
    notes: str | None = None


# --- QC / skills / roster / dashboard ---


class ProductionDefectCodeCreate(BaseModel):
    code: str
    name: str
    category: str | None = None
    severity: str = "medium"
    is_active: bool = True


class ProductionDefectCodeResponse(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    category: str | None
    severity: str
    is_active: bool


class ProductionQcCheckUpsert(BaseModel):
    sewing_line_id: int
    shift_id: int
    production_date: str
    hour_slot: int
    check_type: str = "inline"
    total_checked: int = 0
    pass_qty: int = 0
    fail_qty: int = 0
    defect_codes: list[Any] | None = None
    notes: str | None = None


class ProductionQcCheckResponse(BaseModel):
    id: int
    tenant_id: int
    sewing_line_id: int
    shift_id: int
    production_date: str
    hour_slot: int
    check_type: str
    total_checked: int
    pass_qty: int
    fail_qty: int
    defect_codes: list[Any] | None = None
    notes: str | None = None


class WorkerSkillCreate(BaseModel):
    employee_id: int
    ie_operation_id: int
    skill_level: str = "trainee"
    certified_at: str | None = None
    is_active: bool = True


class WorkerSkillUpdate(BaseModel):
    skill_level: str | None = None
    certified_at: str | None = None
    is_active: bool | None = None


class WorkerSkillResponse(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    ie_operation_id: int
    operation_code: str | None = None
    operation_name: str | None = None
    skill_level: str
    certified_at: str | None = None
    is_active: bool


class CrewRosterCellUpsert(BaseModel):
    week_start_date: str
    sewing_line_id: int
    shift_id: int
    crew_role_id: int
    day_of_week: int
    employee_id: int | None = None
    planned_count: int = 0
    notes: str | None = None


class CrewRosterCellResponse(BaseModel):
    id: int
    week_start_date: str
    sewing_line_id: int
    shift_id: int
    crew_role_id: int
    role_name: str | None = None
    day_of_week: int
    employee_id: int | None = None
    planned_count: int
    notes: str | None = None


class LineCrewSheetStatusResponse(BaseModel):
    id: int | None = None
    sewing_line_id: int
    shift_id: int
    production_date: str
    status: str
    submitted_at: str | None = None
    approved_at: str | None = None
    locked_at: str | None = None


class LineCrewSheetStatusUpdate(BaseModel):
    action: str  # submit | approve | lock | reopen


class CrewGenerateDailyRequest(BaseModel):
    week_start_date: str
    sewing_line_id: int
    shift_id: int
    target_date: str


class ProductionDashboardResponse(BaseModel):
    production_date: str
    total_output_today: float
    overall_efficiency_pct: float | None
    crew_fill_rate_pct: float | None
    cm_alerts_open: int
    lines: list[dict[str, Any]] = Field(default_factory=list)
    cutting_bundles_pending: int = 0
    cutting_bundles_issued: int = 0
