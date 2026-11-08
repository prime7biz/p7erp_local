import { describe, expect, it } from "vitest";
import type { HrOnboardingRun } from "@/api/models";
import {
  addFacility,
  addressesMatch,
  aiAutofillEnabled,
  buildCompensation,
  buildOnboardingRequest,
  buildResumeSteps,
  buildTabUpdate,
  calculateConfirmationDate,
  checkBirthRegistration,
  checkMobile,
  checkNid,
  emptyEmployeeForm,
  emptySalaryForm,
  formFromEmployee,
  isDirty,
  isTabLocked,
  isValidationError,
  mergeExtraction,
  newRequestId,
  omittedCreateKeys,
  PERSONAL_KEYS,
  PAYMENT_KEYS,
  syncPermanentAddress,
  toggleFacility,
} from "./employeeWorkspaceLogic";

describe("employee workspace: create flow", () => {
  it("locks record tabs only in create mode", () => {
    for (const tab of ["identity", "documents", "age", "medical", "history", "production", "checklist"] as const) {
      expect(isTabLocked("create", tab)).toBe(true);
      expect(isTabLocked("edit", tab)).toBe(false);
    }
    for (const tab of ["personal", "job", "salary"] as const) expect(isTabLocked("create", tab)).toBe(false);
  });

  it("builds one onboarding request (never the legacy employee create) with a stable request id", () => {
    const form = { ...emptyEmployeeForm(), first_name: " Rahima ", phone: "01712345678", mobile_is_bkash: true, probation_months: "6" };
    const salary = { ...emptySalaryForm(), structure_id: 4, bd_wage_rate_id: 9 };
    const id = newRequestId();
    expect(id).toMatch(/^onb-[A-Za-z0-9]+$/);
    expect(id.length).toBeLessThanOrEqual(64);
    const req = buildOnboardingRequest(id, { ...form, joining_date: "2026-11-15" }, salary, true);
    expect(req.request_id).toBe(id);
    expect(req.employee.first_name).toBe("Rahima");
    expect(req.employee.mobile_is_bkash).toBe(true);
    expect(req.employee.probation_months).toBe(6);
    expect(req.employee).not.toHaveProperty("bank_account_number");
    expect(req.compensation).toEqual({ structure_id: 4, bd_wage_rate_id: 9, base_salary: null, effective_from: "2026-11-15" });
    expect(req.issue_temp_gate_pass).toBe(true);
    expect(buildCompensation(emptySalaryForm(), "2026-01-01")).toBeNull();
  });

  it("leaves out fields the user may not set, so a clerk's create is not refused", () => {
    const form = { ...emptyEmployeeForm(), first_name: "A", father_name: "F", bank_name: "B", salary_payment_method: "bank" as const };
    const clerk = buildOnboardingRequest("onb-x", form, emptySalaryForm(), false, omittedCreateKeys({ can_manage_identity: false, can_manage_payroll: false }));
    for (const key of ["father_name", "nationality", "present_country", "permanent_country", "bank_name", "salary_payment_method"]) {
      expect(clerk.employee).not.toHaveProperty(key);
    }
    const manager = buildOnboardingRequest("onb-y", form, emptySalaryForm(), false, omittedCreateKeys({ can_manage_identity: true, can_manage_payroll: true }));
    expect(manager.employee).toMatchObject({ father_name: "F", nationality: "Bangladeshi", bank_name: "B", salary_payment_method: "bank" });
  });

  it("resumes only the steps that did not finish", () => {
    const req = buildOnboardingRequest("onb-1", emptyEmployeeForm(), { ...emptySalaryForm(), structure_id: 1 }, true);
    const run = {
      steps: { employee: "COMPLETED", payroll: "FAILED", gate_pass: "COMPLETED", checklist: "COMPLETED" },
    } as HrOnboardingRun;
    expect(buildResumeSteps(run, req)).toEqual({ compensation: req.compensation, issue_temp_gate_pass: false });
    const gateFailed = { steps: { ...run.steps, payroll: "COMPLETED", gate_pass: "FAILED" } } as HrOnboardingRun;
    expect(buildResumeSteps(gateFailed, req)).toEqual({ compensation: null, issue_temp_gate_pass: true });
  });

  it("treats 4xx step errors as needing a correction rather than a retry", () => {
    expect(isValidationError("http_400")).toBe(true);
    expect(isValidationError("http_409")).toBe(true);
    expect(isValidationError("http_503")).toBe(false);
    expect(isValidationError("conflict")).toBe(false);
    expect(isValidationError(null)).toBe(false);
  });

  it("detects unsaved changes", () => {
    const a = emptyEmployeeForm();
    expect(isDirty(a, { ...a })).toBe(false);
    expect(isDirty(a, { ...a, first_name: "x" })).toBe(true);
  });
});

describe("employee workspace: AI autofill never overwrites manual input", () => {
  it("fills untouched fields and reports conflicts for touched ones", () => {
    const form = { ...emptyEmployeeForm(), first_name: "Typed", national_id: "" };
    const touched = new Set(["first_name"]);
    const res = mergeExtraction(
      form,
      { first_name: { value: "Ocr" }, national_id: { value: "1234567890" }, address_line: "Road 1", unknown_key: "x" },
      touched,
    );
    expect(res.form.first_name).toBe("Typed");
    expect(res.conflicts).toEqual([{ field: "first_name", extracted: "Ocr" }]);
    expect(res.form.national_id).toBe("1234567890");
    expect(res.form.present_address_line).toBe("Road 1");
    expect(res.filled).toEqual(expect.arrayContaining(["national_id", "present_address_line"]));
    expect(res.filled).not.toContain("first_name");
  });

  it("shows the AI panel only when a document OCR flag is on", () => {
    expect(aiAutofillEnabled(null)).toBe(false);
    expect(aiAutofillEnabled({ ocr_cv_extraction_enabled: false })).toBe(false);
    expect(aiAutofillEnabled({ ocr_id_extraction_enabled: true })).toBe(true);
  });

  it("ignores empty extracted values", () => {
    const res = mergeExtraction(emptyEmployeeForm(), { first_name: { value: null }, email: "" }, new Set());
    expect(res.filled).toEqual([]);
  });
});

describe("employee workspace: addresses, dates and validation", () => {
  it("copies present address to permanent", () => {
    const form = { ...emptyEmployeeForm(), present_address_line: "Road 5", present_district: "Gazipur" };
    expect(addressesMatch(form)).toBe(false);
    const synced = syncPermanentAddress(form);
    expect(synced.permanent_address_line).toBe("Road 5");
    expect(synced.permanent_district).toBe("Gazipur");
    expect(addressesMatch(synced)).toBe(true);
  });

  it("calculates the confirmation date from joining date and probation", () => {
    expect(calculateConfirmationDate("2026-01-31", "1")).toBe("2026-02-28");
    expect(calculateConfirmationDate("2026-11-15", "6")).toBe("2027-05-15");
    expect(calculateConfirmationDate("2026-11-15", "")).toBe("");
    expect(calculateConfirmationDate("", "6")).toBe("");
    expect(calculateConfirmationDate("2026-11-15", "30")).toBe("");
  });

  it("checks NID, birth registration and mobile digits", () => {
    expect(checkNid("1234567890").ok).toBe(true);
    expect(checkNid("12345").ok).toBe(false);
    expect(checkNid("12345678901234567").ok).toBe(true);
    expect(checkBirthRegistration("1".repeat(17)).ok).toBe(true);
    expect(checkBirthRegistration("123").ok).toBe(false);
    expect(checkMobile("01712345678").ok).toBe(true);
    expect(checkMobile("8801712345678").ok).toBe(true);
    expect(checkMobile("12345").ok).toBe(false);
  });

  it("keeps the facilities list clean", () => {
    expect(addFacility(["Lunch"], " Lunch ")).toEqual(["Lunch"]);
    expect(addFacility([], "  ")).toEqual([]);
    expect(toggleFacility(["Lunch"], "Lunch")).toEqual([]);
    expect(toggleFacility([], "Transport")).toEqual(["Transport"]);
  });
});

describe("employee workspace: edit payloads respect masking", () => {
  it("never sends masked fields back and keeps the legacy address as present address", () => {
    const row = {
      id: 1, tenant_id: 1, employee_code: "EMP-1", first_name: "A", last_name: null, email: null, phone: null,
      reporting_manager_id: null, user_id: null, department_id: null, designation_id: null, section_id: null,
      employee_category: null, joining_date: null, date_of_birth: null, gender: null, marital_status: null,
      blood_group: null, emergency_contact_name: null, emergency_contact_phone: null, address_line: "Old road",
      city: "Khulna", country: "Bangladesh", national_id: null, employment_type: "seasonal", confirmation_date: null,
      exit_date: null, is_active: true, bank_account_number: null, masked_fields: ["bank_account_number"],
    };
    const form = formFromEmployee(row);
    expect(form.present_address_line).toBe("Old road");
    expect(form.employment_type).toBe("seasonal"); // legacy custom value kept as-is
    const personal = buildTabUpdate(form, PERSONAL_KEYS, row.masked_fields);
    expect(personal.first_name).toBe("A");
    expect(personal.present_city).toBe("Khulna");
    const payment = buildTabUpdate(form, PAYMENT_KEYS, row.masked_fields);
    expect(payment).not.toHaveProperty("bank_account_number");
    expect(payment.facilities).toBeNull();
  });

  it("sends only changed fields, so a clerk editing the phone never resends the legacy address", () => {
    const initial = formFromEmployee({
      id: 1, tenant_id: 1, employee_code: "EMP-1", first_name: "A", last_name: null, email: null, phone: "01711111111",
      reporting_manager_id: null, user_id: null, department_id: null, designation_id: null, section_id: null,
      employee_category: null, joining_date: null, date_of_birth: null, gender: null, marital_status: null,
      blood_group: null, emergency_contact_name: null, emergency_contact_phone: null, address_line: "Old road",
      city: "Khulna", country: "Bangladesh", national_id: null, employment_type: null, confirmation_date: null,
      exit_date: null, is_active: true,
    });
    const edited = { ...initial, phone: "01722222222" };
    expect(buildTabUpdate(edited, PERSONAL_KEYS, [], initial)).toEqual({ phone: "01722222222" });
    expect(buildTabUpdate(initial, PERSONAL_KEYS, [], initial)).toEqual({});
    expect(buildTabUpdate({ ...initial, first_name: " B " }, PERSONAL_KEYS, [], initial)).toEqual({ first_name: "B" });
    // Changing one part of the present address sends the whole group (shown legacy values included).
    expect(buildTabUpdate({ ...initial, present_city: "Jessore" }, PERSONAL_KEYS, [], initial)).toEqual({
      present_address_line: "Old road",
      present_city: "Jessore",
      present_district: null,
      present_postal_code: null,
      present_country: "Bangladesh",
    });
  });
});
