import type { ReactNode } from "react";
import { CheckboxField, Section, SelectField, TextField } from "./formControls";
import {
  checkBirthRegistration,
  checkMobile,
  checkNid,
  GENDER_OPTIONS,
  RELIGION_OPTIONS,
  type EmployeeFormState,
} from "./employeeWorkspaceLogic";

export type FieldAccess = {
  /** Fields hidden for this user (masked by the API). */
  masked: ReadonlySet<string>;
  /** May change family / religion / nationality / addresses / relation / bKash flag. */
  canManageIdentity: boolean;
};

type Props = {
  form: EmployeeFormState;
  setField: <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) => void;
  access: FieldAccess;
  highlight: ReadonlySet<string>;
  sameAsPresent: boolean;
  onSameAsPresentChange: (value: boolean) => void;
  aiPanel?: ReactNode;
};

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const MARITAL = opts(["Single", "Married", "Widowed", "Divorced"]);
const BLOOD = opts(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

export function PersonalTab({ form, setField, access, highlight, sameAsPresent, onSameAsPresentChange, aiPanel }: Props) {
  const m = (k: keyof EmployeeFormState) => access.masked.has(k);
  const hl = (k: keyof EmployeeFormState) => highlight.has(k);
  const identityLocked = !access.canManageIdentity;
  const identityHint = identityLocked ? "Needs the HR identity permission to change" : undefined;
  const text = (key: keyof EmployeeFormState, label: string, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
    <TextField
      label={label}
      value={String(form[key] ?? "")}
      onChange={(v) => setField(key, v as never)}
      masked={m(key)}
      highlight={hl(key)}
      {...extra}
    />
  );
  const nid = checkNid(form.national_id);
  const brn = checkBirthRegistration(form.birth_registration_no);
  const mobile = checkMobile(form.phone);

  return (
    <div className="space-y-4">
      {aiPanel}
      <Section title="Basic details">
        {text("first_name", "First name", { required: true, maxLength: 128 })}
        {text("last_name", "Last name", { maxLength: 128 })}
        <SelectField label="Gender" value={form.gender} onChange={(v) => setField("gender", v)} options={opts(GENDER_OPTIONS)} highlight={hl("gender")} />
        {text("date_of_birth", "Date of birth", { type: "date" })}
        <SelectField label="Marital status" value={form.marital_status} onChange={(v) => setField("marital_status", v)} options={MARITAL} />
        <SelectField label="Blood group" value={form.blood_group} onChange={(v) => setField("blood_group", v)} options={BLOOD} />
        <SelectField
          label="Religion"
          value={form.religion}
          onChange={(v) => setField("religion", v)}
          options={opts(RELIGION_OPTIONS)}
          masked={m("religion")}
          disabled={identityLocked}
          hint={identityHint}
        />
        {text("nationality", "Nationality", { disabled: identityLocked, maxLength: 64 })}
        {text("national_id", "NID", { inputMode: "numeric", hint: "10, 13 or 17 digits", error: nid.ok ? undefined : nid.message })}
        {text("birth_registration_no", "Birth registration no.", {
          inputMode: "numeric",
          hint: "17 digits",
          error: brn.ok ? undefined : brn.message,
        })}
      </Section>

      <Section title="Family" description="Printed on the appointment letter.">
        {text("father_name", "Father's name", { disabled: identityLocked, hint: identityHint, maxLength: 128 })}
        {text("mother_name", "Mother's name", { disabled: identityLocked, maxLength: 128 })}
        {text("spouse_name", "Spouse's name", { disabled: identityLocked, maxLength: 128 })}
      </Section>

      <Section title="Contact & emergency">
        <div className="space-y-2">
          {text("phone", "Mobile", { type: "tel", inputMode: "tel", hint: "e.g. 01712345678", error: mobile.ok ? undefined : mobile.message })}
          <CheckboxField
            label="This mobile is a bKash number"
            checked={form.mobile_is_bkash}
            onChange={(v) => setField("mobile_is_bkash", v)}
            disabled={identityLocked || m("mobile_is_bkash")}
          />
        </div>
        {text("email", "Email", { type: "email", maxLength: 255 })}
        {text("emergency_contact_name", "Emergency contact name", { maxLength: 128 })}
        {text("emergency_contact_relation", "Relation", { disabled: identityLocked, maxLength: 64, hint: "e.g. Mother, Husband" })}
        {text("emergency_contact_phone", "Emergency contact number", { type: "tel", inputMode: "tel" })}
      </Section>

      <Section title="Present address">
        {text("present_address_line", "Address", { disabled: identityLocked, hint: identityHint, className: "sm:col-span-2 lg:col-span-3", maxLength: 255 })}
        {text("present_city", "City / thana", { disabled: identityLocked, maxLength: 128 })}
        {text("present_district", "District", { disabled: identityLocked, maxLength: 128 })}
        {text("present_postal_code", "Postal code", { disabled: identityLocked, inputMode: "numeric", maxLength: 16 })}
        {text("present_country", "Country", { disabled: identityLocked, maxLength: 128 })}
      </Section>

      <section className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Permanent address</h3>
          <CheckboxField
            label="Same as present address"
            checked={sameAsPresent}
            onChange={onSameAsPresentChange}
            disabled={identityLocked || m("permanent_address_line")}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {text("permanent_address_line", "Address", { disabled: identityLocked || sameAsPresent, className: "sm:col-span-2 lg:col-span-3", maxLength: 255 })}
          {text("permanent_city", "City / thana", { disabled: identityLocked || sameAsPresent, maxLength: 128 })}
          {text("permanent_district", "District", { disabled: identityLocked || sameAsPresent, maxLength: 128 })}
          {text("permanent_postal_code", "Postal code", { disabled: identityLocked || sameAsPresent, inputMode: "numeric", maxLength: 16 })}
          {text("permanent_country", "Country", { disabled: identityLocked || sameAsPresent, maxLength: 128 })}
        </div>
      </section>
      <p className="text-xs text-text-muted">Bangladesh setup: a mobile number and either the NID or the birth registration number are required.</p>
    </div>
  );
}
