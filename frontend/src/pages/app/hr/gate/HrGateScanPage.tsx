/**
 * Guard screen. A USB / Bluetooth QR scanner types the code and presses Enter.
 * Works for employee ID cards (P7EMP:) and temporary gate passes (P7GP:). Every scan is logged.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { hrBangladeshApi, newIdempotencyKey } from "@/api/hrBangladesh";
import { Field, Messages, inputCls } from "@/components/hr/bd/BdUi";
import { useAction } from "@/components/hr/bd/bdHooks";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

interface ScanResult {
  at: string;
  result: string;
  reason: string;
  name: string;
  ref: string;
  duplicate: boolean;
}

export function HrGateScanPage() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [qr, setQr] = useState("");
  const [gate, setGate] = useState(() => localStorage.getItem("p7_gate_name") || "MAIN");
  const [zone, setZone] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [last, setLast] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<ScanResult[]>([]);
  const { busy, error, run } = useAction();

  useEffect(() => {
    inputRef.current?.focus();
  }, [last]);

  useEffect(() => {
    localStorage.setItem("p7_gate_name", gate);
  }, [gate]);

  const scan = () => {
    const text = qr.trim();
    if (text.length < 4) return;
    setQr("");
    void run(async () => {
      const r = await hrBangladeshApi.scanGatePass({ qr: text, direction, gate: gate.trim() || "MAIN", zone: zone.trim() || undefined, idempotency_key: newIdempotencyKey() });
      const holder = r.holder ?? {};
      const item: ScanResult = {
        at: new Date().toLocaleTimeString(),
        result: r.result,
        reason: r.reason,
        name: holder.name ?? "",
        ref: holder.employee_code ?? holder.pass_code ?? "",
        duplicate: r.duplicate,
      };
      setLast(item);
      setRecent((prev) => [item, ...prev].slice(0, 20));
    });
  };

  const allowed = last?.result === "ALLOWED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <HrPageHeader title={t("gateScan.title")} description={t("gateScan.subtitle")} breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: t("gateScan.title") }]} />
        <LanguageSwitcher />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("gateScan.gate")} htmlFor="gs-gate">
          <input id="gs-gate" className={inputCls} value={gate} maxLength={64} onChange={(e) => setGate(e.target.value)} />
        </Field>
        <Field label={t("gateScan.zone")} htmlFor="gs-zone">
          <input id="gs-zone" className={inputCls} value={zone} maxLength={64} onChange={(e) => setZone(e.target.value)} />
        </Field>
        <Field label={t("gateScan.direction")} htmlFor="gs-dir">
          <select id="gs-dir" className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}>
            <option value="IN">{t("gateScan.in")}</option>
            <option value="OUT">{t("gateScan.out")}</option>
          </select>
        </Field>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          scan();
        }}
      >
        <input
          ref={inputRef}
          aria-label={t("gateScan.scanPlaceholder")}
          className="w-full rounded-xl border-2 border-brand-primary px-4 py-4 text-lg"
          placeholder={t("gateScan.scanPlaceholder")}
          value={qr}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setQr(e.target.value)}
        />
      </form>
      <Messages error={error} />
      {last ? (
        <div role="status" aria-live="assertive" className={`rounded-xl p-6 text-center ${allowed ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          <p className="text-3xl font-bold">{allowed ? t("gateScan.allowed") : t("gateScan.denied")}</p>
          <p className="mt-2 text-lg">{last.name}</p>
          <p className="text-sm opacity-90">
            {last.ref} · {last.reason}
          </p>
          {last.duplicate ? <p className="mt-1 text-sm">{t("gateScan.duplicate")}</p> : null}
          <p className="mt-3 text-xs opacity-80">{t("gateScan.scanAgain")}</p>
        </div>
      ) : null}
      {recent.length ? (
        <section aria-label={t("gateScan.recent")} className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">{t("gateScan.recent")}</h2>
          <ul className="divide-y divide-border text-sm">
            {recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex justify-between gap-3 py-1.5">
                <span className="text-text-muted">{r.at}</span>
                <span className="flex-1 text-text-secondary">
                  {r.name} {r.ref ? `(${r.ref})` : ""}
                </span>
                <span className={r.result === "ALLOWED" ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{r.result}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
