import type { ReactNode } from "react";
import type { QuotationCmMode, QuotationManufacturingLine } from "@/api/client";
import { toSafeNumber } from "../mappers/quotationNumeric";

interface DozenCmLinesProps {
  rows: QuotationManufacturingLine[];
  isEditing: boolean;
  docCur: string;
  currencyOptions: string[];
  onChange: (index: number, patch: Partial<QuotationManufacturingLine>) => void;
  renderRowActions: (index: number) => ReactNode;
}

const MODE_LABEL: Record<QuotationCmMode, string> = {
  SMV_CPM: "SMV × CPM",
  LINE_OUTPUT: "Line output (daily line cost ÷ daily output)",
  DIRECT: "Direct CM",
};

const inputClass = "w-full rounded border border-border px-1.5 py-1 text-xs";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-[11px] font-medium text-text-secondary">
      {label}
      <div className="mt-0.5 font-normal">{children}</div>
      {hint ? <span className="mt-0.5 block text-[10px] font-normal text-text-muted">{hint}</span> : null}
    </label>
  );
}

/** Patch that moves a line to another CM method without losing what was typed. */
function modePatch(row: QuotationManufacturingLine, mode: QuotationCmMode | ""): Partial<QuotationManufacturingLine> {
  if (mode === "") return { cm_mode: null };
  const patch: Partial<QuotationManufacturingLine> = { cm_mode: mode };
  if (mode === "SMV_CPM") {
    patch.cpm_basis = row.cpm_basis ?? "EARNED_MIN";
  } else if (mode === "LINE_OUTPUT") {
    patch.working_hours_per_day = row.working_hours_per_day ?? "8";
  } else {
    patch.direct_cm_basis = row.direct_cm_basis ?? "PER_DOZEN";
  }
  return patch;
}

/**
 * CM (cut and make) lines for dozen-first quotations: pick one method per line.
 * The amounts come from the costing engine; this component only collects the inputs.
 */
export function DozenCmLines({ rows, isEditing, docCur, currencyOptions, onChange, renderRowActions }: DozenCmLinesProps) {
  return (
    <div className="space-y-3">
      {rows.map((m, idx) => {
        const mode = m.cm_mode ?? null;
        const basis = m.cpm_basis ?? null;
        const directBasis = m.direct_cm_basis ?? "PER_DOZEN";
        const cmPc = toSafeNumber(m.cm_per_piece);
        const cmDz = toSafeNumber(m.cost_per_dozen);
        const inLineCurrency = (m.currency ?? docCur).toUpperCase() !== docCur.toUpperCase();
        return (
          <div
            key={m._rowKey ?? idx}
            className="rounded-xl border border-border-subtle bg-surface-subtle/40 p-3"
            data-testid={`cm-line-${idx}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-[180px] flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">CM line {idx + 1}</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={m.style_part}
                    onChange={(e) => onChange(idx, { style_part: e.target.value })}
                    placeholder="Style part (e.g. Sewing, Complete garment)"
                    aria-label={`CM style part row ${idx + 1}`}
                    className={`${inputClass} mt-0.5`}
                  />
                ) : (
                  <div className="mt-0.5 text-sm font-medium text-text-primary">{m.style_part || "—"}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[11px] text-text-muted">CM / piece</div>
                <div className="text-lg font-bold text-text-primary">{cmPc.toFixed(4)}</div>
                <div className="text-[11px] text-text-muted">{cmDz.toFixed(4)} per dozen</div>
              </div>
              {isEditing ? <div className="self-center">{renderRowActions(idx)}</div> : null}
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Method">
                {isEditing ? (
                  <select
                    value={mode ?? ""}
                    onChange={(e) => onChange(idx, modePatch(m, e.target.value as QuotationCmMode | ""))}
                    aria-label={`CM method row ${idx + 1}`}
                    className={inputClass}
                  >
                    {mode == null ? <option value="">Saved value (choose a method)</option> : null}
                    {(Object.keys(MODE_LABEL) as QuotationCmMode[]).map((k) => (
                      <option key={k} value={k}>
                        {MODE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs">{mode ? MODE_LABEL[mode] : "Saved value"}</span>
                )}
              </Field>

              {mode === "SMV_CPM" ? (
                <>
                  <Field label="SMV (minutes per piece)">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={!isEditing}
                      value={m.smv ?? ""}
                      onChange={(e) => onChange(idx, { smv: e.target.value || null })}
                      aria-label={`SMV row ${idx + 1}`}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="CPM (cost per minute)">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={!isEditing}
                      value={m.cpm ?? ""}
                      onChange={(e) => onChange(idx, { cpm: e.target.value || null })}
                      aria-label={`CPM row ${idx + 1}`}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="CPM is per">
                    <select
                      disabled={!isEditing}
                      value={basis ?? ""}
                      onChange={(e) =>
                        onChange(idx, { cpm_basis: (e.target.value || null) as QuotationManufacturingLine["cpm_basis"] })
                      }
                      aria-label={`CPM basis row ${idx + 1}`}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      <option value="EARNED_MIN">Earned (SMV) minute</option>
                      <option value="AVAILABLE_MIN">Available minute</option>
                    </select>
                  </Field>
                  {basis === "AVAILABLE_MIN" ? (
                    <Field label="Efficiency %" hint="Cost per piece = SMV ÷ efficiency × CPM">
                      <input
                        type="number"
                        min={0}
                        max={150}
                        step="any"
                        disabled={!isEditing}
                        value={m.efficiency_pct ?? ""}
                        onChange={(e) => onChange(idx, { efficiency_pct: e.target.value || null })}
                        aria-label={`Efficiency row ${idx + 1}`}
                        className={inputClass}
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              {mode === "LINE_OUTPUT" ? (
                <>
                  <Field label="Machines (whole line)">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={!isEditing}
                      value={m.machines_required}
                      onChange={(e) => onChange(idx, { machines_required: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                      aria-label={`Machines row ${idx + 1}`}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Cost per machine per day">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={!isEditing}
                      value={m.cost_per_machine}
                      onChange={(e) => onChange(idx, { cost_per_machine: e.target.value })}
                      aria-label={`Cost per machine row ${idx + 1}`}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Line output per hour (pcs)" hint="Output of the whole line, not per machine">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={!isEditing}
                      value={m.production_per_hour}
                      onChange={(e) => onChange(idx, { production_per_hour: e.target.value })}
                      aria-label={`Line output row ${idx + 1}`}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Working hours per day">
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step="any"
                      disabled={!isEditing}
                      value={m.working_hours_per_day ?? "8"}
                      onChange={(e) => onChange(idx, { working_hours_per_day: e.target.value || null })}
                      aria-label={`Working hours row ${idx + 1}`}
                      className={inputClass}
                    />
                  </Field>
                  <div className="text-[11px] text-text-muted sm:col-span-2 lg:col-span-4">
                    Daily line cost {toSafeNumber(m.total_line_cost).toFixed(2)} ÷ daily output {toSafeNumber(m.production_per_day).toLocaleString()} pcs
                  </div>
                </>
              ) : null}

              {mode === "DIRECT" ? (
                <>
                  <Field label="CM is entered per">
                    <select
                      disabled={!isEditing}
                      value={directBasis}
                      onChange={(e) => {
                        const next = e.target.value as "PER_DOZEN" | "PER_PIECE";
                        onChange(
                          idx,
                          next === "PER_PIECE"
                            ? { direct_cm_basis: next, cm_per_piece: (cmDz / 12).toFixed(4) }
                            : { direct_cm_basis: next, cost_per_dozen: (cmPc * 12).toFixed(4) },
                        );
                      }}
                      aria-label={`Direct CM basis row ${idx + 1}`}
                      className={inputClass}
                    >
                      <option value="PER_DOZEN">Dozen (12 pcs)</option>
                      <option value="PER_PIECE">Piece</option>
                    </select>
                  </Field>
                  <Field label={directBasis === "PER_DOZEN" ? "CM per dozen" : "CM per piece"}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={!isEditing}
                      value={directBasis === "PER_DOZEN" ? m.cost_per_dozen : m.cm_per_piece}
                      onChange={(e) =>
                        onChange(idx, directBasis === "PER_DOZEN" ? { cost_per_dozen: e.target.value } : { cm_per_piece: e.target.value })
                      }
                      aria-label={`Direct CM value row ${idx + 1}`}
                      className={inputClass}
                    />
                  </Field>
                </>
              ) : null}

              {mode == null ? (
                <div className="text-[11px] text-text-muted sm:col-span-2 lg:col-span-3">
                  This line keeps the CM value saved before dozen-first costing. Choose a method to recalculate it.
                </div>
              ) : null}

              <Field label="Currency">
                {isEditing ? (
                  <select
                    value={m.currency ?? docCur}
                    onChange={(e) => onChange(idx, { currency: e.target.value })}
                    aria-label={`CM currency row ${idx + 1}`}
                    className={inputClass}
                  >
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs">{m.currency ?? docCur}</span>
                )}
              </Field>
              {inLineCurrency ? (
                <Field label={`FX (1 ${(m.currency ?? docCur).toUpperCase()} = ? ${docCur})`}>
                  <input
                    type="number"
                    step="0.000001"
                    min={0}
                    disabled={!isEditing}
                    value={m.exchange_rate}
                    onChange={(e) => onChange(idx, { exchange_rate: e.target.value })}
                    aria-label={`CM FX row ${idx + 1}`}
                    className={inputClass}
                  />
                </Field>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
