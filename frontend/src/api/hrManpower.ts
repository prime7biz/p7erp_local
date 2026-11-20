/**
 * Factory Manpower & SMV Control API (tenant flag manpower_control_v1).
 */
import { request } from "@/api/core";

export type DepartmentGroupKey = "SEWING" | "CUTTING" | "FINISHING" | "OTHER";

export interface ManpowerSanctionedRow {
  id: number;
  department_id: number;
  designation_id: number;
  department_name: string | null;
  designation_title: string | null;
  approved_quota: number;
  present_active: number;
  variance: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  updated_at: string;
}

export interface ManpowerStandingSummary {
  rows: ManpowerSanctionedRow[];
  total_quota: number;
  total_present: number;
  cells_over: number;
  cells_under: number;
  cells_exact: number;
}

export interface ManpowerTargets {
  operator_to_helper?: string | null;
  sewing_cutting_finishing?: string | null;
  staff_to_workers?: string | null;
  management_staff_workers?: string | null;
  running_machines_per_operator?: string | null;
}

export interface ManpowerSettings {
  targets: ManpowerTargets;
  allow_unmapped_hire: boolean;
  updated_at: string | null;
}

export interface ManpowerDepartmentGroup {
  id: number;
  department_id: number;
  department_name: string | null;
  group_key: DepartmentGroupKey;
}

export interface ManpowerSeedResult {
  created: number;
  skipped_existing: number;
  cells_seen: number;
}

export interface ManpowerQuotaException {
  id: number;
  department_id: number;
  designation_id: number;
  extra_slots: number;
  slots_used: number;
  slots_remaining: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  request_id: string;
  requested_by: number | null;
  requested_at: string | null;
  approved_by: number | null;
  decided_at: string | null;
  decision_note: string | null;
  expires_on: string | null;
  created_at: string | null;
}

const BASE = "/api/v1/hr/manpower";

export const hrManpowerApi = {
  listSanctioned(params?: {
    department_id?: number;
    designation_id?: number;
    as_of?: string;
  }): Promise<ManpowerSanctionedRow[]> {
    const q = new URLSearchParams();
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    if (params?.designation_id != null) q.set("designation_id", String(params.designation_id));
    if (params?.as_of) q.set("as_of", params.as_of);
    const suffix = q.toString() ? `?${q}` : "";
    return request<ManpowerSanctionedRow[]>(`${BASE}/sanctioned${suffix}`);
  },

  upsertSanctioned(body: {
    department_id: number;
    designation_id: number;
    approved_quota: number;
    effective_from: string;
    effective_to?: string | null;
    notes?: string | null;
  }): Promise<ManpowerSanctionedRow> {
    return request<ManpowerSanctionedRow>(`${BASE}/sanctioned`, { method: "PUT", body: JSON.stringify(body) });
  },

  standingSummary(asOf?: string): Promise<ManpowerStandingSummary> {
    const suffix = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
    return request<ManpowerStandingSummary>(`${BASE}/standing-summary${suffix}`);
  },

  seedFromCurrent(asOf?: string): Promise<ManpowerSeedResult> {
    const suffix = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
    return request<ManpowerSeedResult>(`${BASE}/sanctioned/seed-from-current${suffix}`, { method: "POST" });
  },

  getSettings(): Promise<ManpowerSettings> {
    return request<ManpowerSettings>(`${BASE}/settings`);
  },

  putSettings(body: { targets?: ManpowerTargets; allow_unmapped_hire?: boolean }): Promise<ManpowerSettings> {
    return request<ManpowerSettings>(`${BASE}/settings`, { method: "PUT", body: JSON.stringify(body) });
  },

  listDepartmentGroups(): Promise<ManpowerDepartmentGroup[]> {
    return request<ManpowerDepartmentGroup[]>(`${BASE}/department-groups`);
  },

  upsertDepartmentGroup(body: {
    department_id: number;
    group_key: DepartmentGroupKey;
  }): Promise<ManpowerDepartmentGroup> {
    return request<ManpowerDepartmentGroup>(`${BASE}/department-groups`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  listExceptions(params?: { status?: string }): Promise<ManpowerQuotaException[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q}` : "";
    return request<ManpowerQuotaException[]>(`${BASE}/exceptions${suffix}`);
  },

  createException(body: {
    department_id: number;
    designation_id: number;
    extra_slots: number;
    reason: string;
    request_id: string;
    expires_on?: string | null;
  }): Promise<ManpowerQuotaException> {
    return request<ManpowerQuotaException>(`${BASE}/exceptions`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  decideException(
    id: number,
    body: { decision: "APPROVE" | "REJECT"; note?: string | null },
  ): Promise<ManpowerQuotaException> {
    return request<ManpowerQuotaException>(`${BASE}/exceptions/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  cancelException(id: number): Promise<ManpowerQuotaException> {
    return request<ManpowerQuotaException>(`${BASE}/exceptions/${id}/cancel`, { method: "POST" });
  },

  organogram(params?: {
    date?: string;
    root_offset?: number;
    root_limit?: number;
  }): Promise<ManpowerOrganogram> {
    const q = new URLSearchParams();
    if (params?.date) q.set("date", params.date);
    if (params?.root_offset != null) q.set("root_offset", String(params.root_offset));
    if (params?.root_limit != null) q.set("root_limit", String(params.root_limit));
    const suffix = q.toString() ? `?${q}` : "";
    return request(`${BASE}/organogram${suffix}`);
  },

  attendanceBridge(date?: string): Promise<ManpowerAttendanceBridge> {
    const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
    return request(`${BASE}/attendance-bridge${suffix}`);
  },

  dailyAttendance(params?: {
    date?: string;
    group_by?: "department" | "section" | "line" | "category";
  }): Promise<ManpowerDailyAttendance> {
    const q = new URLSearchParams();
    if (params?.date) q.set("date", params.date);
    if (params?.group_by) q.set("group_by", params.group_by);
    const suffix = q.toString() ? `?${q}` : "";
    return request(`${BASE}/daily-attendance${suffix}`);
  },
};

export type ManpowerOrgNode = {
  employee_id: number;
  employee_code: string;
  name: string;
  department_id: number | null;
  department_name: string | null;
  designation_id: number | null;
  designation_title: string | null;
  depth: number;
  suggested: number | null;
  approved_quota: number | null;
  present_standing: boolean;
  present_today: boolean;
  children: ManpowerOrgNode[];
};

export type ManpowerOrganogram = {
  date: string;
  roots: ManpowerOrgNode[];
  total_roots: number;
  nodes_returned: number;
  truncated: boolean;
  max_depth: number;
  max_nodes: number;
  /** Echoed when the API returns them; used for root pagination UI. */
  root_offset?: number;
  root_limit?: number;
};

export type ManpowerAttendanceBridge = {
  date: string;
  standing_active: number;
  present_today: number;
  absent_or_unmarked: number;
  on_floor_statuses: string[];
};

export type ManpowerDailyAttendanceRow = {
  group_key: string;
  standing: number;
  present: number;
  late: number;
  half_day: number;
  absent: number;
  leave: number;
  not_marked: number;
  on_floor: number;
  absent_pct: number | null;
};

export type ManpowerDailyAttendance = {
  date: string;
  group_by: string;
  rows: ManpowerDailyAttendanceRow[];
  totals: Omit<ManpowerDailyAttendanceRow, "group_key" | "absent_pct">;
};

/** Production floor suggested (flag manpower_floor_suggested_v1). */
const FLOOR = "/api/v1/production/manpower";

export type FloorRoleSuggestion = {
  crew_role_id: number;
  role_key: string;
  role_name: string;
  designation_id: number | null;
  suggested_count: number;
  source: string;
  advisory_label: string | null;
};

export type FloorSuggestedItem = {
  scope: "line" | "unit";
  sewing_line_id: number | null;
  line_code: string | null;
  line_name: string | null;
  factory_unit: string | null;
  department_type: string;
  running_machine_count: number;
  default_machine_count: number;
  roles: FloorRoleSuggestion[];
  suggested_operators: number;
  suggested_total: number;
};

export type MachineRatioRow = {
  sewing_line_id: number;
  line_code: string;
  line_name: string;
  factory_unit: string | null;
  running_machine_count: number;
  suggested_operators: number;
  actual_machines_per_operator: string | null;
  target_machines_per_operator: string | null;
  status: "OK" | "UNDER" | "OVER" | "UNKNOWN";
};

export const productionManpowerApi = {
  floorSuggested(params?: {
    factory_unit?: string;
    department_type?: string;
  }): Promise<{ items: FloorSuggestedItem[]; count: number }> {
    const q = new URLSearchParams();
    if (params?.factory_unit) q.set("factory_unit", params.factory_unit);
    if (params?.department_type) q.set("department_type", params.department_type);
    const suffix = q.toString() ? `?${q}` : "";
    return request(`${FLOOR}/floor-suggested${suffix}`);
  },

  machineRatio(params?: { factory_unit?: string }): Promise<{ items: MachineRatioRow[]; count: number }> {
    const q = new URLSearchParams();
    if (params?.factory_unit) q.set("factory_unit", params.factory_unit);
    const suffix = q.toString() ? `?${q}` : "";
    return request(`${FLOOR}/machine-ratio${suffix}`);
  },
};
