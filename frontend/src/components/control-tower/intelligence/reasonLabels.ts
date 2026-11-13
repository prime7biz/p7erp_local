/**
 * Plain-English labels for the reason / missing-input codes returned by /api/v1/mfg-intelligence.
 * Unknown codes fall back to a readable version of the code, so a new backend code never shows blank.
 */
const LABELS: Record<string, string> = {
  // capacity
  SHIFT_ASSUMED_ALL_ACTIVE: "Shift assumed: all active shifts",
  OPERATORS_FROM_LINE_DEFAULT: "Operators taken from the line default",
  OPERATORS_FROM_PLAN_ROW: "Operators taken from the line plan",
  SHIFTS_OVERLAP_MERGED: "Overlapping shifts counted once",
  SHIFT_TIMES_MISSING: "A shift has no start / end time",
  SHIFT_OPERATORS_MISSING: "A shift has no operator count",
  UNRESOLVED_FIRM_LOAD: "A firm booking has no SMV, so the load is unknown",
  UNRESOLVED_SOFT_LOAD: "A soft booking has no SMV",
  EFFICIENCY_FROM_LATEST_PLAN: "Efficiency taken from the latest plan",
  CLOSED_DAY: "Closed day (holiday / weekend)",
  INPUT_MISSING: "A required input is missing",
  INPUT_MISSING_ON_SOME_DAYS: "Some days have missing inputs",
  UNITS_NOT_COMPUTED_NO_SMV: "Units not computed: no SMV",
  UNITS_NOT_COMPUTED_MULTIPLE_SMV: "Units not computed: several SMV values on the line",
  MACHINE_PROFILE_NOT_EVALUATED: "Machine limits not evaluated yet",
  PLANNING_MATH_V2_OFF: "Corrected maths is off",
  // line loading
  SMV_FROM_PLAN_ROW: "SMV taken from the plan row (low confidence)",
  SMV_UNKNOWN: "SMV unknown",
  SMV_FROM_UNAPPROVED_OB: "SMV from an unapproved operation bulletin (low confidence)",
  RESERVATION_STATUS_NOT_CLASSIFIED: "Booking status not recognised",
  PLAN_SPAN_TRUNCATED: "Plan span was cut short",
  NO_WORKING_DAY_FOUND: "No working day found",
  NO_WORKING_DAY_IN_WINDOW: "No working day inside the window",
  // readiness
  SHARED_SUPPLY_NOT_ALLOCATED: "Stock is not yet allocated between orders",
  MATERIAL_DETAIL_HIDDEN_NO_INVENTORY_ACCESS: "Item stock details need inventory access",
  STYLE_ESTIMATE_ONLY: "Estimate from the style BOM only",
  NO_BOM_FOUND: "No BOM found",
  ORDER_BOM_NOT_APPROVED: "Order BOM is not approved",
  ORDER_BOM_HAS_NO_ITEMS: "Order BOM has no items",
  ORDER_BOM_MISSING: "Order BOM is missing",
  ORDER_BOM_REQUIRED_FOR_FULL_READINESS: "An approved order BOM is needed for full readiness",
  ORDER_BOM_READINESS_FLAG_OFF: "Order-BOM readiness is off",
  MATERIAL_SHORT: "Material is short",
  REQUIREMENT_UNKNOWN: "Requirement unknown",
  BOM_ITEMS_WITHOUT_ITEM_MASTER: "BOM lines without an item master",
  AVAILABILITY_INCLUDES_OPEN_PO_SUPPLY: "Availability includes open purchase orders",
  FINANCE_NOT_EVALUATED_PHASE1: "Finance cover is not evaluated yet",
  NO_TECHNICAL_APPROVAL_ACTIONS: "No technical approvals defined",
  APPROVAL_REJECTED: "An approval was rejected",
  APPROVAL_OVERDUE: "An approval is overdue",
  APPROVAL_PENDING: "Approval pending",
  ORDER_NOT_CONFIRMED: "Order is not confirmed",
  NO_LINE_BOOKING: "Not booked on any sewing line",
  ONLY_SOFT_BOOKED: "Only soft-booked",
  ONLY_DRAFT_BOOKED: "Only draft-booked",
  FIRM_PLANNED_QTY_BELOW_ORDER_QTY: "Firm planned quantity is below the order quantity",
  MANDATORY_DIMENSION_BLOCKED: "A required check is blocked",
  MANDATORY_DIMENSION_NOT_READY: "A required check is not ready",
  // delivery
  ORDER_QUANTITY_MISSING: "Order quantity missing",
  NO_LINE_PLAN: "No line plan",
  NO_FIRM_LINE_PLAN: "No firm line plan",
  DRAFT_ROWS_IGNORED: "Draft plan rows ignored for the start date",
  NOTHING_REMAINING: "Nothing left to produce",
  MATERIAL_NOT_READY: "Material is not ready",
  RATE_UNKNOWN: "Daily output rate unknown",
  COMPLETION_BEYOND_HORIZON: "Completion is beyond the planning horizon",
  NO_DELIVERY_DATE: "No ex-factory date on the order",
  // Phase 2: material allocation
  READY_MEANS_ISSUED_PLUS_OWN_HARD_HOLDS: "Ready = issued stock plus this order's approved hard holds",
  TENTATIVE_HOLD_NOT_READY: "Tentative holds never count as ready",
  SUPPLY_NOT_PEGGED: "Shortage is not linked to an open purchase order yet",
  SUPPLY_ETA_UNKNOWN: "Linked purchase order has no expected date",
  MATERIAL_EXPECTED_DATE: "Expected material date (from linked purchase orders)",
  MATERIAL_EXPECTED_DATE_USED: "Start waits for the expected material date",
  CONSUMPTION_MISSING: "Consumption missing on a BOM line",
  HIGHER_PRIORITY_DEMAND_PROTECTED: "Stock kept for a higher-priority order",
  QUEUE_TRUNCATED: "Only part of the order queue was checked",
  // Phase 2: allocation conflicts
  PEG_EXCEEDS_OPEN_SUPPLY: "Linked quantity is more than the open purchase order",
  ORDER_CANCELLED: "Order is cancelled but still holds material",
  ORDER_NOT_OPEN: "Order is not open but still holds material",
  BOM_LINE_REMOVED: "BOM line was removed",
  ALLOCATED_ABOVE_REQUIREMENT: "More is held than the order needs",
  TENTATIVE_EXPIRED: "Tentative hold has expired",
  HOLD_ABOVE_USABLE_ON_HAND: "Held more than the usable stock on hand",
  // Phase 2: allocation refusals (409)
  TENTATIVE_ONLY_FOR_DRAFT_ORDERS: "Tentative allocation is only for draft orders",
  NO_ORDER_BOM: "The order has no active order BOM",
  STALE_STATE: "Stock or demand changed since the preview",
  // Phase 2: people & machines, routes
  OPERATORS_FROM_ASSIGNMENTS: "Operators counted from line assignments",
  OPERATORS_FROM_ATTENDANCE_TODAY: "Operators counted from today's attendance",
  MACHINES_FROM_ASSIGNMENTS: "Machines counted from line assignments",
  MACHINES_FEWER_THAN_OPERATORS: "Fewer machines than operators on the line",
  ATTENDANCE_NOT_RECORDED: "Attendance not recorded yet (assignments used)",
  ASSIGNED_SHIFT_NOT_ACTIVE: "An assigned shift is not active",
  NO_OPERATORS_PRESENT: "No assigned operators present",
  EXTERNAL_STAGE_LEAD_TIME_ADDED: "Outside process lead time added after sewing",
  // Phase 2: tentative demand
  EXPIRED: "Expired",
  CONVERTED: "An order now exists (counted as firm demand instead)",
  QUOTATION_BOOKING_EXISTS: "A quotation booking already covers this inquiry",
  SUPERSEDED_QUOTATION: "A newer quotation revision replaced this one",
  // Phase 3: cost at completion
  SNAPSHOT_QUOTED: "Revenue from the order's price snapshot",
  PI_SINGLE_ORDER: "Revenue from the proforma invoice",
  PI_MULTI_ORDER: "Proforma invoice covers several orders (not used)",
  PI_MULTIPLE_FOR_ORDER: "Several proforma invoices for this order",
  QUOTATION_TOTAL_SCALED: "Revenue from the quotation total, scaled to order qty",
  REVENUE_FROM_QUOTATION: "Revenue taken from the quotation",
  REVENUE_FX_UNKNOWN: "Revenue currency has no exchange rate",
  REVENUE_UNKNOWN: "Revenue unknown",
  REVENUE_NOT_SCALED_NO_PROJECTED_QTY: "Revenue not scaled: quotation has no projected qty",
  BUDGET_SCALED: "Budget scaled to the order quantity",
  BUDGET_NOT_SCALED_NO_PROJECTED_QTY: "Budget not scaled: quotation has no projected qty",
  NO_QUOTATION_BUDGET: "No quotation budget",
  BUDGET_FX_UNKNOWN: "Budget currency has no exchange rate",
  BOM_NOT_PRICED: "Order BOM has no prices",
  BOM_PARTIALLY_PRICED: "Order BOM is only partly priced",
  BOM_QTY_BASE_MISSING: "Order BOM has no base quantity",
  BOM_CURRENCY_UNKNOWN: "Order BOM currency unknown",
  BOM_FX_UNKNOWN: "Order BOM currency has no exchange rate",
  MATERIAL_BUDGET_FROM_QUOTATION: "Material budget from the quotation",
  MATERIAL_BUDGET_UNKNOWN: "Material budget unknown",
  PO_FX_UNKNOWN: "A foreign purchase order has no exchange rate",
  PO_CURRENCY_ASSUMED_BASE: "Purchase order currency assumed to be the base currency",
  CPM_UNKNOWN: "Cost per minute unknown",
  CPM_NO_CM_POSTING: "No factory cost posted in the CPM months",
  CPM_NO_EARNED_MINUTES: "No sewing minutes in the CPM months",
  CPM_PERIOD_NOT_LOCKED: "A CPM month is not locked yet",
  CPM_PERIODS_MISSING: "Not enough locked months for CPM",
  CPM_FROM_OVERRIDE: "Cost per minute set by finance",
  CPM_UNCODED_DIRECT_EXPENSES: "Some direct expenses are not coded as factory cost",
  CPM_OUTPUT_WITHOUT_SMV: "Some sewing output has no SMV",
  NO_ORDER_COST_POSTING: "No cost is posted against the order",
  CONVERSION_FROM_BUDGET_CM: "Conversion cost taken from the budget CM",
  PROGRESS_UNKNOWN: "Progress unknown",
  GL_MATERIAL_EXCEEDS_PROCURED: "Ledger material is higher than purchase orders",
  // Phase 3: cash requirement
  FINANCING_GAP: "Cash runs short",
  OVERDUE: "Overdue",
  OVERDUE_IN_WEEK_1: "Overdue items are counted in week 1",
  FX_UNKNOWN: "No exchange rate",
  FX_UNKNOWN_EXCLUDED: "Items without an exchange rate are left out",
  ORDERS_TRUNCATED: "Only the first orders were counted",
  BTB_DATE_ESTIMATED: "BTB payment date estimated",
  BTB_DATE_UNKNOWN: "BTB payment date unknown",
  MATURITY_DATE_MISSING: "Maturity date missing",
  PAYMENT_STATUS_UNKNOWN: "Payment status unknown",
  PO_FUNDING_UNKNOWN: "Not known if a BTB LC pays this purchase order",
  PO_EXPECTED_DATE_MISSING: "Purchase order has no expected date",
  GRN_DATE_MISSING: "Goods receipt has no date",
  PAYROLL_REPEATS_LAST_PERIOD: "Repeats the last payroll",
  DELIVERY_DATE_USED: "Order delivery date used",
  SHIP_DATE_UNKNOWN: "Shipment date unknown",
  STALE_PAYABLES: "Old unpaid supplier bills left out",
  STALE_RECEIVABLES: "Long-overdue buyer invoices left out",
  DUE_BEFORE_START: "Due before the start date",
  DUE_BEFORE_START_IN_WEEK_1: "Items due before the start date are counted in week 1",
  NET_OF_BUYING_COMMISSION: "After buying commission",
  DATE_OUT_OF_RANGE: "Date out of range",
  SOURCE_TRUNCATED: "Too many records - forecast incomplete",
  // Phase 4: predictions
  INSUFFICIENT_HISTORY: "Not enough history (fixed safety bands used)",
  MATERIAL_NOT_ON_ORDER: "Shortage is not on any open purchase order",
  MATERIAL_ETA_UNKNOWN: "Purchase order has no expected date",
  MATERIAL_NOT_BINDING: "Material is not the limit",
  MATERIAL_READY: "Material is ready",
  PO_DETAIL_HIDDEN_NO_INVENTORY_ACCESS: "Purchase order detail hidden (no inventory access)",
  CAPACITY_UNKNOWN: "Line capacity unknown",
  PLANNED_EFFICIENCY_MISSING: "No planned efficiency on the plan",
  FAMILY_FALLBACK_LINE_ALL: "Too few days for this style family; all families of the line used",
  HIGH_DISPERSION_WEIGHT_CAPPED: "Results vary a lot, so history counts less",
  CV_UNSTABLE: "Results vary a lot, so history counts less",
  PLAN_OR_OB_CHANGED_WEIGHT_CAPPED: "Plan or operation bulletin changed, so history counts less",
  PLAN_BASIS_EFFICIENCY: "Plan-basis efficiency (includes absence and balancing loss)",
  EXTERNAL_STAGE_ASSUMPTION: "Outside process days assumed",
  HISTORY_TRUNCATED: "Only part of the history was read",
  PLAN_ROWS_TRUNCATED: "Only part of the line plan was read",
  HOURLY_ROWS_TRUNCATED: "Only part of the hourly output was read",
  NO_AVAILABLE_MINUTES: "No available minutes that day",
  NO_OUTPUT: "No output recorded",
  EFFICIENCY_ABOVE_150_PCT: "Above 150 % (likely a typing error)",
  INSUFFICIENT_BASELINE: "Too few earlier points to compare",
  NO_DISPERSION: "Results never change, so nothing to compare",
  LOW_VOLUME: "Too few pieces to judge",
  OPEN_LATE_LOWER_BOUND: "Open and already late (at least this late)",
  CLOSED_NO_RECEIPT: "Closed without a receipt",
  NOT_DUE: "Not due yet",
  STALE: "More than 180 days past the promise",
  // Phase 5: forward plan
  CAPACITY_PARTIAL: "Capacity partly unknown",
  CAPACITY_UNKNOWN_ON_SOME_LINE_DAYS: "Capacity unknown on some line-days",
  PARTIAL_MONTH: "Part of a month",
  OVERLOADED: "Overloaded",
  BOOKED_OVERLOAD: "Booked work alone overloads",
  VIRTUAL: "Includes virtual lines",
  FIXED_BANDS: "Fixed safety bands (not enough history)",
  DRAFT_ROWS_PRESENT: "Draft bookings are not counted",
  OVER_PLANNED: "Booked more than the order quantity",
  UNPLANNED_AT_NEED_BY_BUCKET: "Unbooked work placed at its ex-factory period",
  UNCONFIRMED_ORDERS_WITHOUT_ROWS: "Unconfirmed orders without bookings are not demand",
  FORECAST_NOT_ATTRIBUTED_TO_UNIT: "Forecast is not split by factory unit",
  UNPLANNED_NOT_ATTRIBUTED_TO_UNIT: "Unbooked work is not split by factory unit",
  TENTATIVE_REQUIRES_INTEGRATED_PLANNING: "Tentative bookings need Integrated planning",
  IDENTITY_TRUNCATED: "Only part of the order check is listed",
  ORDER_PLAN_ROWS_TRUNCATED: "Only part of the order bookings was read",
  DEFERRED_BEYOND_HORIZON: "Pushed past the horizon",
  CONVERSION_IN_PAYROLL: "Sewing cost is already in payroll",
  CONFIRMED_FINANCING_GAP: "Confirmed work needs financing",
  TENTATIVE_CUT: "Some tentative bookings cut for cash",
  FORECAST_NOT_FUNDED: "Forecast is never funded",
  CASH_FORECAST_INCOMPLETE: "Cash forecast incomplete",
  CASH_NEED_UNKNOWN: "Cash need unknown",
  FINANCE_CUT: "Cut: not enough cash",
  CONFIRMED_MATERIAL_NOT_ORDERED: "Confirmed material not yet ordered",
  PROPOSAL_ONLY: "Proposal only",
  FIRM_RESCHEDULE_SUGGESTED: "Firm booking will be late",
  OVERTIME_WOULD_RECOVER: "Overtime could recover the delay",
  JOB_LIMIT: "Too many jobs",
  REVISION_ITEM_LIMIT: "More than 50 changes",
  line_plan: "line plan",
  firm_line_plan: "firm line plan",
  order_quantity: "order quantity",
  delivery_date: "ex-factory date",
  materials: "materials",
};

export function humanizeCode(code: string): string {
  const s = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : code;
}

export function reasonLabel(code: string): string {
  // "SOURCE_TRUNCATED:<category>" names the data source that hit its row cap
  if (code.startsWith("SOURCE_TRUNCATED:")) return `${LABELS.SOURCE_TRUNCATED} (${humanizeCode(code.slice(17))})`;
  return LABELS[code] ?? humanizeCode(code);
}

export function reasonLabels(codes: string[] | null | undefined): string[] {
  return Array.from(new Set(codes ?? [])).map(reasonLabel);
}

/** Warnings / notices may be "CODE" or "CODE:detail" (e.g. "HIGHER_PRIORITY_DEMAND_PROTECTED:42"). */
export function warningLabel(raw: string): string {
  const idx = raw.indexOf(":");
  if (idx <= 0) return reasonLabel(raw);
  const code = raw.slice(0, idx).trim();
  const detail = raw.slice(idx + 1).trim();
  if (!/^[A-Z][A-Z0-9_]+$/.test(code)) return raw;
  return detail ? `${reasonLabel(code)} (${detail})` : reasonLabel(code);
}

export const ALLOCATION_KIND_LABEL: Record<string, string> = {
  HARD_ATP: "Hard hold (confirmed order)",
  TENTATIVE: "Tentative hold (draft order)",
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SOFT_BOOKED: "Soft booked",
  FIRM_BOOKED: "Firm booked",
  IN_PROGRESS: "In progress",
};

export const REVISION_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Waiting for approval",
  APPLIED: "Applied",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const ASSIGNMENT_ROLE_LABEL: Record<string, string> = {
  OPERATOR: "Operator",
  HELPER: "Helper",
  SUPERVISOR: "Supervisor",
  QC: "Quality checker",
  IRON: "Ironing",
  FINISHING: "Finishing",
};

export const DIMENSION_STATUS_LABEL: Record<string, string> = {
  READY: "Ready",
  PARTIAL: "Partly ready",
  BLOCKED: "Blocked",
  UNKNOWN: "Unknown",
  NOT_APPLICABLE: "Not applicable",
  NOT_EVALUATED: "Not evaluated",
};

export const BAND_LABEL: Record<string, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  LATE: "Late",
  COMPLETE: "Complete",
  UNKNOWN: "Unknown",
};

export const MATERIAL_AUTHORITY_LABEL: Record<string, string> = {
  ORDER_BOM: "Order BOM",
  STYLE_ESTIMATE: "Style estimate",
  LEGACY_STYLE_BOM: "Legacy (style BOM)",
  NONE: "No BOM",
};
