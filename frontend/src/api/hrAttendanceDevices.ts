/**
 * Attendance devices (biometric / card terminals) and punch imports.
 * Backend: backend/app/modules/hr_attendance/device_router.py
 */
import { request } from "@/api/core";

export type HrAttendanceDeviceType = "GENERIC" | "ZKTECO";
export type HrPunchFileFormat = "csv" | "json" | "zkteco";

export interface HrAttendanceDevice {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  device_type: HrAttendanceDeviceType | string;
  serial_number: string | null;
  /** Public part of the API key, safe to show. */
  api_key_prefix: string;
  default_shift_id: number | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  /** ZKTeco cloud push (/iclock): comma-separated IPs / CIDR ranges the machine connects from. */
  push_allowed_ips?: string | null;
  /** True when cloud push works for this device: active + serial number + allowed IPs. */
  iclock_ready?: boolean;
}

/** Returned only by create and rotate-key: the full key is shown once and never again. */
export interface HrAttendanceDeviceWithKey extends HrAttendanceDevice {
  api_key: string;
}

export interface HrAttendanceDeviceCreate {
  code: string;
  name: string;
  device_type?: HrAttendanceDeviceType;
  serial_number?: string | null;
  default_shift_id?: number | null;
  push_allowed_ips?: string | null;
}

export type HrAttendanceDeviceUpdate = Partial<HrAttendanceDeviceCreate> & { is_active?: boolean };

export interface HrPunchImportSummary {
  received: number;
  inserted: number;
  duplicates: number;
  unmatched_codes: string[];
  unmatched_punches: number;
  invalid_lines: { line: number; error: string }[];
  invalid_count: number;
  entries_created: number;
  entries_updated: number;
  entries_unchanged: number;
  skipped_manual: number;
  skipped_locked: number;
}

const BASE = "/api/v1/hr/attendance/devices";

export const hrAttendanceDevicesApi = {
  listHrAttendanceDevices() {
    return request<HrAttendanceDevice[]>(BASE);
  },
  createHrAttendanceDevice(body: HrAttendanceDeviceCreate) {
    return request<HrAttendanceDeviceWithKey>(BASE, { method: "POST", body: JSON.stringify(body) });
  },
  updateHrAttendanceDevice(id: number, body: HrAttendanceDeviceUpdate) {
    return request<HrAttendanceDevice>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  rotateHrAttendanceDeviceKey(id: number) {
    return request<HrAttendanceDeviceWithKey>(`${BASE}/${id}/rotate-key`, { method: "POST" });
  },
  /** Upload a CSV / ZKTeco attlog / JSON file; format is guessed from the file when not given. */
  importHrAttendancePunches(id: number, file: File, format?: HrPunchFileFormat) {
    const form = new FormData();
    form.append("file", file);
    if (format) form.append("format", format);
    return request<HrPunchImportSummary>(`${BASE}/${id}/punches/import`, { method: "POST", body: form });
  },
};
