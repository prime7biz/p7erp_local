import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calculator, Info } from "lucide-react";
import { calculateRoi, type RoiInput } from "@/lib/roiCalculator";
import { trackEvent } from "@/lib/analytics";

const fmtBdt = (n: number) => `৳${n.toLocaleString("en-IN")}`;

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        {label}
      </label>
      <p className="mb-1.5 text-xs text-text-muted">{hint}</p>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="w-full rounded-lg border border-border px-4 py-2.5 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
      />
    </div>
  );
}

export function RoiCalculatorPage() {
  const [input, setInput] = useState<RoiInput>({ staff: 10, adminHoursPerWeek: 6, monthlySalary: 45_000, reductionPct: 30 });
  const result = useMemo(() => calculateRoi(input), [input]);
  const set = (key: keyof RoiInput) => (v: number) => setInput((prev) => ({ ...prev, [key]: v }));

  // One analytics event per settled change, not per keystroke.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => trackEvent("roi_calculated", { staff: input.staff, reduction_pct: input.reductionPct }), 1500);
    return () => window.clearTimeout(t);
  }, [input]);

  return (
    <section className="bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-4 inline-flex rounded-xl bg-brand-primary/10 p-3 text-brand-primary">
            <Calculator className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-4xl font-bold leading-tight text-text-primary sm:text-5xl">How much time could your team get back?</h1>
          <p className="mt-4 text-lg text-text-secondary">
            Enter your own numbers. The estimate covers only admin time — re-typing between Excel sheets, chasing order
            status, reconciling stock and vouchers — not sales growth or penalty savings.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="space-y-6 rounded-xl border border-border bg-surface-raised p-6 shadow-sm sm:p-8">
            <NumberField
              id="roi-staff"
              label="People doing admin work"
              hint="Merchandisers, store keepers, commercial, accounts and HR staff."
              value={input.staff}
              onChange={set("staff")}
              min={0}
              max={10000}
            />
            <NumberField
              id="roi-hours"
              label="Admin hours per person per week"
              hint="Time on spreadsheets, re-entering data, follow-up calls and reports."
              value={input.adminHoursPerWeek}
              onChange={set("adminHoursPerWeek")}
              min={0}
              max={60}
            />
            <NumberField
              id="roi-salary"
              label="Average monthly salary (BDT)"
              hint="Used to turn hours into cost: salary ÷ 208 working hours."
              value={input.monthlySalary}
              onChange={set("monthlySalary")}
              min={0}
              max={10000000}
              step={1000}
            />
            <div>
              <label htmlFor="roi-reduction" className="block text-sm font-medium text-text-primary">
                Admin time removed by the ERP: <span className="text-brand-primary">{input.reductionPct}%</span>
              </label>
              <p className="mb-1.5 text-xs text-text-muted">Start low. 20–30% is a cautious figure for teams moving off spreadsheets.</p>
              <input
                id="roi-reduction"
                type="range"
                min={5}
                max={60}
                step={5}
                value={input.reductionPct}
                onChange={(e) => set("reductionPct")(Number(e.target.value))}
                className="w-full accent-[var(--color-brand-primary)]"
              />
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-brand-primary/20 bg-surface-raised p-6 shadow-sm sm:p-8" aria-live="polite">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Your estimate</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-surface-subtle p-4">
                <dt className="text-xs text-text-muted">Hours back per month</dt>
                <dd className="mt-1 text-3xl font-bold text-text-primary">{result.hoursSavedPerMonth.toLocaleString("en-IN")}</dd>
              </div>
              <div className="rounded-lg bg-surface-subtle p-4">
                <dt className="text-xs text-text-muted">Working days per month</dt>
                <dd className="mt-1 text-3xl font-bold text-text-primary">{result.daysSavedPerMonth}</dd>
              </div>
              <div className="rounded-lg bg-surface-subtle p-4">
                <dt className="text-xs text-text-muted">Salary cost per month</dt>
                <dd className="mt-1 text-2xl font-bold text-brand-primary">{fmtBdt(result.costSavedPerMonth)}</dd>
              </div>
              <div className="rounded-lg bg-surface-subtle p-4">
                <dt className="text-xs text-text-muted">Salary cost per year</dt>
                <dd className="mt-1 text-2xl font-bold text-brand-primary">{fmtBdt(result.costSavedPerYear)}</dd>
              </div>
            </dl>
            <p className="mt-5 flex gap-2 text-xs text-text-muted">
              <Info className="h-4 w-4 shrink-0" aria-hidden />
              This is an estimate from your inputs, not a promise. Formula: people × hours per week × 4.33 weeks × % removed,
              then × (salary ÷ 208 hours). Real results depend on how fully your team moves its work into the system.
            </p>
            <div className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row">
              <Link
                to="/book-demo"
                onClick={() => trackEvent("cta_click", { cta: "book_demo", from: "roi_calculator" })}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-primary px-5 py-3 font-semibold text-brand-primary-foreground hover:bg-brand-primary/90"
              >
                Check it with a demo <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-5 py-3 font-semibold text-text-primary hover:bg-surface-subtle"
              >
                Compare with pricing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
