import { describe, expect, it } from "vitest";
import type { HrEmployeePaySnapshot, HrOnboardingRun } from "@/api/models";
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
  CORE_TABS,
  EMPLOYMENT_KEYS,
  emptyEmployeeForm,
  emptySalaryForm,
  formFromEmployee,
  IDLE_PREVIEW,
  isDirty,
  isTabLocked,
  isValidationError,
  mergeExtraction,
  newRequestId,
  normalizeMoney,
  omittedCreateKeys,
  PERSONAL_KEYS,
  PAYMENT_KEYS,
  previewableCompensation,
  previewKey,
  resolveSalaryEffectiveDate,
  salaryBlocker,
  salaryFormFromSnapshot,
  syncPermanentAddress,
  toggleFacility,
  updateSalary,
  type SalaryFormState,
  type SalaryPreviewState,
} from "./employeeWorkspaceLogic";

describe("employee workspace: create flow", () => {
  it("locks record tabs only in create mode", () => {
    for (const tab of ["identity", "documents", "age", "medical", "history", "production", "checklist"] as const) {
      expect(isTabLocked("create", tab)).toBe(true);
      expect(isTabLocked("edit", tab)).toBe(false);
    }
    for (const tab of ["personal", "employment"] as const) expect(isTabLocked("create", tab)).toBe(false);
    expect(CORE_TABS).toEqual(["personal", "employment"]);
    expect(EMPLOYMENT_KEYS).toEqual(expect.arrayContaining(["joining_date", "department_id", "bank_name", "facilities"]));
  });

  it("builds one onboarding request (never the legacy employee create) with a stable request id", () => {
    const form = { ...emptyEmployeeForm(), first_name: " Rahima ", phone: "01712345678", mobile_is_bkash: true, probation_months: "6" };
    const salary = { ...emptySalaryForm(), enabled: true, structure_id: 4, bd_wage_rate_id: 9 };
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

  it("uses today's company date for the salary when there is no joining date", () => {
    const salary = { ...emptySalaryForm(), enabled: true, structure_id: 4, base_salary: "12500" };
    const req = buildOnboardingRequest("onb-z", { ...emptyEmployeeForm(), first_name: "A" }, salary, false, [], "2026-11-09");
    expect(req.compensation).toEqual({ structure_id: 4, bd_wage_rate_id: null, base_salary: "12500", effective_from: "2026-11-09" });
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
    const req = buildOnboardingRequest("onb-1", emptyEmployeeForm(), { ...emptySalaryForm(), enabled: true, structure_id: 1, base_salary: "9000" }, true, [], "2026-11-09");
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

  it("fills NID address, blood group, gender and birth registration in the form's own format", () => {
    const res = mergeExtraction(
      emptyEmployeeForm(),
      {
        first_name: { value: "RAHIMA" },
        address: { value: "House 12, Mirpur &amp; Pallabi" },
        blood_group: { value: "B Positive" },
        gender: { value: "FEMALE" },
        national_id: { value: "1234 5678 90" },
        birth_registration_number: { value: "19982612345678901" },
      },
      new Set(),
    );
    expect(res.form).toMatchObject({
      first_name: "RAHIMA",
      present_address_line: "House 12, Mirpur & Pallabi",
      blood_group: "B+",
      gender: "Female",
      national_id: "1234567890",
      birth_registration_no: "19982612345678901",
    });
    expect(res.filled).toEqual(expect.arrayContaining(["present_address_line", "blood_group", "gender", "birth_registration_no"]));
    // A gender the form cannot show is left empty instead of a value no option matches.
    expect(mergeExtraction(emptyEmployeeForm(), { gender: { value: "N/A" } }, new Set()).filled).toEqual([]);
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

describe("employee workspace: simplified salary set-up", () => {
  const on = (patch: Partial<SalaryFormState> = {}): SalaryFormState => ({ ...emptySalaryForm(), enabled: true, structure_id: 4, ...patch });
  const validFor = (salary: SalaryFormState, date: string): SalaryPreviewState => ({
    status: "valid",
    key: previewKey(previewableCompensation(salary, date)),
    preview: null,
    message: null,
  });
  const create = { mode: "create" as const, joiningDate: "2026-11-15" };

  it("sends no salary when set-up is off, whatever stale values are hidden in the form", () => {
    const stale: SalaryFormState = {
      enabled: false, structure_id: 4, bd_wage_rate_id: 9, override: true, base_salary: "50000", effective_from: "2026-12-01", acknowledged: true,
    };
    expect(buildCompensation(stale, "2026-12-01")).toBeNull();
    expect(buildOnboardingRequest("onb-off", emptyEmployeeForm(), stale, false).compensation).toBeNull();
    expect(salaryBlocker(stale, "2026-12-01", IDLE_PREVIEW, create)).toBeNull();
  });

  it("uses the grade minimum unless the basic is overridden, and never sends the confirmation", () => {
    const standard = on({ bd_wage_rate_id: 9, base_salary: "99999" });
    expect(buildCompensation(standard, "2026-11-15")).toEqual({ structure_id: 4, bd_wage_rate_id: 9, base_salary: null, effective_from: "2026-11-15" });
    const overridden = on({ bd_wage_rate_id: 9, override: true, base_salary: " 15000 ", acknowledged: true });
    const body = buildCompensation(overridden, "2026-11-15");
    expect(body).toEqual({ structure_id: 4, bd_wage_rate_id: 9, base_salary: "15000", effective_from: "2026-11-15" });
    expect(JSON.stringify(body)).not.toMatch(/acknowledged|override/);
    expect(buildCompensation(on({ base_salary: "12000" }), "2026-11-15")?.base_salary).toBe("12000"); // no grade: typed basic
  });

  it("clears the override confirmation whenever structure, grade, override or amount changes", () => {
    const acked = on({ bd_wage_rate_id: 9, override: true, base_salary: "15000", acknowledged: true });
    for (const patch of [{ structure_id: 5 }, { bd_wage_rate_id: 10 }, { base_salary: "15001" }, { override: false }, { enabled: false }]) {
      expect(updateSalary(acked, patch).acknowledged).toBe(false);
    }
    expect(updateSalary(acked, { effective_from: "2026-12-01" }).acknowledged).toBe(true);
    expect(updateSalary(acked, { base_salary: "15000" }).acknowledged).toBe(true); // same value
    expect(updateSalary(acked, { bd_wage_rate_id: null }).override).toBe(false);
  });

  it("blocks an enabled salary until every part is complete and checked", () => {
    const date = "2026-11-15";
    expect(salaryBlocker(on({ structure_id: null }), date, IDLE_PREVIEW, create)).toMatch(/salary structure/);
    expect(salaryBlocker(on(), date, IDLE_PREVIEW, create)).toMatch(/Enter the basic salary/);
    expect(salaryBlocker(on({ base_salary: "12,000" }), date, IDLE_PREVIEW, create)).toMatch(/no commas/);
    expect(salaryBlocker(on({ base_salary: "12000" }), "", IDLE_PREVIEW, create)).toMatch(/joining date or a salary start date/);
    expect(salaryBlocker(on({ base_salary: "12000" }), "2026-11-01", IDLE_PREVIEW, create)).toMatch(/before the joining date/);
    const unacked = on({ bd_wage_rate_id: 9, override: true, base_salary: "15000" });
    expect(salaryBlocker(unacked, date, validFor(unacked, date), create)).toMatch(/confirmation box/);
    const acked = { ...unacked, acknowledged: true };
    expect(salaryBlocker(acked, date, validFor(acked, date), create)).toBeNull();
    expect(salaryBlocker(on({ bd_wage_rate_id: 9 }), date, validFor(on({ bd_wage_rate_id: 9 }), date), create)).toBeNull();
  });

  it("accepts only a finished, matching preview", () => {
    const salary = on({ base_salary: "12000" });
    const date = "2026-11-15";
    const good = validFor(salary, date);
    expect(salaryBlocker(salary, date, { ...good, status: "pending" }, create)).toMatch(/Checking/);
    expect(salaryBlocker(salary, date, IDLE_PREVIEW, create)).toMatch(/Checking/);
    expect(salaryBlocker(salary, date, { ...good, status: "error", message: "Network down" }, create)).toBe("Network down");
    expect(salaryBlocker(salary, date, { ...good, status: "invalid", message: "Basic is below the minimum" }, create)).toMatch(/below/);
    // A valid answer for older input (another amount) does not count for the current input.
    expect(salaryBlocker({ ...salary, base_salary: "11000" }, date, good, create)).toMatch(/Checking/);
    expect(salaryBlocker(salary, date, good, create)).toBeNull();
  });

  it("edit needs its own start date and a saved joining date", () => {
    const salary = on({ base_salary: "12000" });
    expect(resolveSalaryEffectiveDate(salary, "edit", "2026-01-01", "2026-11-09")).toEqual({ date: "", source: "missing" });
    expect(salaryBlocker(salary, "", IDLE_PREVIEW, { mode: "edit", joiningDate: "2026-01-01" })).toMatch(/new salary starts/);
    const dated = { ...salary, effective_from: "2026-12-01" };
    const preview = validFor(dated, "2026-12-01");
    expect(salaryBlocker(dated, "2026-12-01", preview, { mode: "edit", joiningDate: "2026-01-01", joiningDateUnsaved: true })).toMatch(
      /Save employment first/,
    );
    expect(salaryBlocker(dated, "2026-12-01", preview, { mode: "edit", joiningDate: "2026-01-01" })).toBeNull();
  });

  it("picks the create start date: typed, then joining date, then today's company date", () => {
    expect(resolveSalaryEffectiveDate(on({ effective_from: "2026-12-01" }), "create", "2026-11-15", "2026-11-09").source).toBe("custom");
    expect(resolveSalaryEffectiveDate(on(), "create", "2026-11-15", "2026-11-09")).toEqual({ date: "2026-11-15", source: "joining" });
    expect(resolveSalaryEffectiveDate(on(), "create", "", "2026-11-09")).toEqual({ date: "2026-11-09", source: "company_today" });
    expect(resolveSalaryEffectiveDate(on(), "create", "", null).source).toBe("missing");
  });

  it("starts a salary change from the pay in force", () => {
    const snap = (p: Partial<HrEmployeePaySnapshot>): HrEmployeePaySnapshot => ({
      as_of: "2026-11-09", basic: "7050.0000", gross: "12500.0000", structure_id: 4, structure_code: "BD-W-G4",
      structure_assignment_id: 1, structure_effective_from: "2026-01-01", structure_effective_to: null, wage_rate_id: 9,
      wage_rate_code: "W-G4", wage_grade_basic: "7050.0000", wage_grade_gross: "12500.0000", wage_assignment_id: 2,
      wage_effective_from: "2026-01-01", ...p,
    });
    expect(salaryFormFromSnapshot(snap({}))).toMatchObject({ enabled: true, structure_id: 4, bd_wage_rate_id: 9, override: false, base_salary: "" });
    expect(salaryFormFromSnapshot(snap({ basic: "8000.5000" }))).toMatchObject({ bd_wage_rate_id: 9, override: true, base_salary: "8000.5", acknowledged: false });
    expect(salaryFormFromSnapshot(snap({ wage_rate_id: null, wage_grade_basic: null, basic: "20000.0000" }))).toMatchObject({
      bd_wage_rate_id: null, override: false, base_salary: "20000",
    });
    // A stored grade without a structure keeps the grade selected; the structure is then chosen by the user.
    expect(salaryFormFromSnapshot(snap({ structure_id: null, basic: "0.0000" }))).toEqual({ ...emptySalaryForm(), enabled: true, bd_wage_rate_id: 9 });
    // An assignment without a stored basic reports 0: that is not an override of the grade.
    expect(salaryFormFromSnapshot(snap({ basic: "0.0000" }))).toMatchObject({ bd_wage_rate_id: 9, override: false, base_salary: "" });
    expect(salaryFormFromSnapshot(snap({ wage_rate_id: null, wage_grade_basic: null, basic: "0.0000" })).base_salary).toBe("");
    expect(salaryFormFromSnapshot(null)).toEqual({ ...emptySalaryForm(), enabled: true });
  });

  it("normalizes money strings without floating point", () => {
    expect(normalizeMoney("12500.0000")).toBe("12500");
    expect(normalizeMoney("0012500.50")).toBe("12500.5");
    expect(normalizeMoney("0.0000")).toBe("0");
    expect(normalizeMoney(" abc ")).toBe("abc");
  });
});
