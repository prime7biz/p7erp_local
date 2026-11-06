/**
 * HR settings (weekend days, overtime from salary).
 * Backend: backend/app/modules/hr_attendance/hr_settings_router.py
 */
import { request } from "@/api/core";
import type { HrPayrollAutoCalcEmployee } from "@/api/models";

export type HrWeekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface HrSettings {
  weekend_days: HrWeekday[];
  /** True when the company never saved weekend days (Friday is used). */
  weekend_days_is_default: boolean;
  ot_from_salary_enabled: boolean;
  ot_hours_per_month: number;
  ot_multiplier: number;
  can_edit_weekend: boolean;
  can_edit_overtime: boolean;
}

export interface HrSettingsUpdate {
  weekend_days?: HrWeekday[];
  ot_from_salary_enabled?: boolean;
  ot_hours_per_month?: number;
  ot_multiplier?: number;
}

/** Payroll preview row with the overtime-from-salary fields (present when the backend sends them). */
export type HrPayrollAutoCalcEmployeeWithOt = HrPayrollAutoCalcEmployee & {
  ot_from_salary?: boolean;
  ot_paid_hours?: string;
  ot_hourly_rate?: string;
  ot_amount?: string;
};

export const hrSettingsApi = {
  getHrSettings() {
    return request<HrSettings>("/api/v1/hr/settings");
  },
  updateHrSettings(body: HrSettingsUpdate) {
    return request<HrSettings>("/api/v1/hr/settings", { method: "PUT", body: JSON.stringify(body) });
  },
};
