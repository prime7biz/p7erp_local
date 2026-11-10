/**
 * Manual attendance in two steps: record IN (employee number or scanned ID-card QR + time),
 * then OUT later. Open days show in "Missing OUT" and block payroll finalization until closed.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { KitTable } from "@/components/hr/bd/BdKitTable";
import { Banner, Card, Field, Messages, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { todayIso, useAction, useLoad } from "@/components/hr/bd/bdHooks";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

type Tab = "in" | "out" | "missing";

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function EmployeeLookup({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const { t } = useTranslation();
  const [found, setFound] = useState<{ code: string; name: string } | null>(null);
  const [err, setErr] = useState("");
  const check = async () => {
    setErr("");
    setFound(null);
    if (!value.trim()) return;
    try {
      const r = await hrBangladeshApi.manualLookup(value.trim());
      setFound({ code: r.employee_code, name: r.name });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not found");
    }
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-secondary">
        {t("manualAttendance.employee")}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className={inputCls}
          placeholder={t("manualAttendance.employeePlaceholder")}
          value={value}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setFound(null);
          }}
          onBlur={() => void check()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void check();
            }
          }}
        />
        <button type="button" className={btnSecondary} onClick={() => void check()}>
          {t("manualAttendance.check")}
        </button>
      </div>
      {found ? <p className="text-xs text-status-success-foreground">{t("manualAttendance.found", found)}</p> : null}
      {err ? <p className="text-xs text-status-danger-foreground">{err}</p> : null}
    </div>
  );
}

export function HrManualAttendancePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("in");
  const [code, setCode] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(nowTime());
  const [nextDay, setNextDay] = useState(false);
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const missing = useLoad(() => hrBangladeshApi.missingOut(from || undefined, to || undefined), [from, to]);
  const { busy, error, notice, run, setNotice } = useAction();

  const reset = () => {
    setCode("");
    setTime(nowTime());
    setNextDay(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "in") {
      const who = code.trim();
      void run(async () => {
        await hrBangladeshApi.manualIn({ employee_code: who, work_date: date, in_time: time, reason: reason.trim() });
        reset();
        await missing.reload();
      }, t("manualAttendance.savedIn", { code: who, date }));
    } else {
      const who = code.trim();
      void (async () => {
        let status = "";
        const ok = await run(async () => {
          const r = await hrBangladeshApi.manualOut({ employee_code: who, work_date: date, out_time: time, out_next_day: nextDay, reason: reason.trim() });
          status = String(r.status ?? "");
          reset();
          await missing.reload();
        });
        if (ok) setNotice(t("manualAttendance.savedOut", { code: who, date, status }));
      })();
    }
  };

  const startOut = (r: Row) => {
    setTab("out");
    setCode(String(r.employee_code ?? ""));
    setDate(String(r.attendance_date));
    setTime(nowTime());
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "in", label: t("manualAttendance.inTab") },
    { id: "out", label: t("manualAttendance.outTab") },
    { id: "missing", label: `${t("manualAttendance.missingTab")} (${missing.data?.length ?? 0})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <HrPageHeader
          title={t("manualAttendance.title")}
          description={t("manualAttendance.subtitle")}
          breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Attendance" }, { label: t("manualAttendance.title") }]}
        />
        <LanguageSwitcher />
      </div>
      <div role="tablist" className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === x.id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <Messages error={error || missing.error} notice={notice} />

      {tab !== "missing" ? (
        <Card title={tab === "in" ? t("manualAttendance.inTab") : t("manualAttendance.outTab")}>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <EmployeeLookup id="ma-employee" value={code} onChange={setCode} />
            </div>
            <Field label={t("manualAttendance.workDate")} htmlFor="ma-date">
              <input id="ma-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label={tab === "in" ? t("manualAttendance.inTime") : t("manualAttendance.outTime")} htmlFor="ma-time">
              <input id="ma-time" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} required />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("manualAttendance.reason")} htmlFor="ma-reason">
                <input id="ma-reason" className={inputCls} placeholder={t("manualAttendance.reasonPlaceholder")} minLength={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
              </Field>
            </div>
            {tab === "out" ? (
              <label className="flex items-center gap-2 text-sm text-text-secondary sm:col-span-2">
                <input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} /> {t("manualAttendance.nextDay")}
              </label>
            ) : null}
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <button type="submit" className={btnPrimary} disabled={busy || !code.trim()}>
                {tab === "in" ? t("manualAttendance.saveIn") : t("manualAttendance.saveOut")}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <Card
          title={t("manualAttendance.missingTab")}
          actions={
            <>
              <Field label={t("manualAttendance.from")} htmlFor="ma-from">
                <input id="ma-from" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={t("manualAttendance.to")} htmlFor="ma-to">
                <input id="ma-to" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          }
        >
          {missing.data && missing.data.length > 0 ? <Banner kind="warning">{t("manualAttendance.openWarning")}</Banner> : null}
          <KitTable<Row>
            rows={missing.data ?? []}
            rowKey={(r) => String(r.id)}
            loading={missing.loading}
            onRefresh={() => void missing.reload()}
            empty={t("manualAttendance.noneMissing")}
            searchPlaceholder={t("manualAttendance.searchMissing")}
            defaultPageSize={50}
            labels={{
              refresh: t("crud.refresh"),
              exportCsv: t("crud.exportCsv"),
              retry: t("crud.retry"),
              clearSearch: t("crud.clearSearch"),
              all: t("crud.all"),
              actions: t("crud.actions"),
              filterByStatus: t("crud.filterByStatus"),
              loading: t("crud.loading"),
              noMatch: t("crud.noMatch", { query: "{{query}}", interpolation: { escapeValue: false } }),
            }}
            columns={[
              { header: t("manualAttendance.date"), cell: (r) => String(r.attendance_date), value: (r) => String(r.attendance_date) },
              { header: t("manualAttendance.code"), cell: (r) => String(r.employee_code ?? ""), value: (r) => String(r.employee_code ?? "") },
              { header: t("manualAttendance.name"), cell: (r) => String(r.employee_name ?? ""), value: (r) => String(r.employee_name ?? "") },
              { header: t("manualAttendance.in"), cell: (r) => String(r.in_time ?? "").slice(0, 5), value: (r) => String(r.in_time ?? "").slice(0, 5) },
            ]}
            actions={(r) => [{ label: t("manualAttendance.addOut"), primary: true, onClick: () => startOut(r) }]}
          />
        </Card>
      )}
    </div>
  );
}
