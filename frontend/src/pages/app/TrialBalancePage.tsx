import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type AccountGroupResponse, type ChartOfAccountResponse, type ReportBasis, type TrialBalanceResponse } from "@/api/client";
import { dateParam, idParam, ledgerActivityHref, yearStart } from "@/lib/financeDrilldown";
import { downloadCsv, downloadXlsx, printCurrentPage } from "@/lib/reportExport";
import { todayLocalISO } from "@/lib/dates";
import { sumMoneyBy } from "@/lib/money";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";
import { useEmbeddedPage } from "@/components/app/embeddedPage";

export function TrialBalancePage() {
  const embedded = useEmbeddedPage();
  const [searchParams] = useSearchParams();
  const natureFilter = searchParams.get("nature") ?? "";
  const [asOfDate, setAsOfDate] = useState(() => dateParam(searchParams.get("as_of"), todayLocalISO()));
  const [groupId, setGroupId] = useState<number | "">(() => idParam(searchParams.get("group_id")) ?? "");
  const [accountId, setAccountId] = useState<number | "">("");
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [basis, setBasis] = useState<ReportBasis>(() => (searchParams.get("basis") === "cumulative" ? "cumulative" : "fy"));
  const [data, setData] = useState<TrialBalanceResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    try {
      setError("");
      const res = await api.getTrialBalance({ as_of_date: asOfDate, group_id: groupId || undefined, account_id: accountId || undefined, basis });
      if (!latest.isCurrent(token)) return;
      setData(res);
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, asOfDate, groupId, accountId, basis]);

  async function loadMeta() {
    try {
      const [accountGroups, chartAccounts] = await Promise.all([api.listAccountGroups(), api.listChartOfAccounts({ active_only: true })]);
      setGroups(accountGroups);
      setAccounts(chartAccounts);
    } catch (e) {
      logApiError("TrialBalancePage.loadMeta", e);
      setGroups([]);
      setAccounts([]);
    }
  }

  useEffect(() => {
    void loadMeta();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const visibleRows = useMemo(
    () => (data?.rows ?? []).filter((r) => !natureFilter || r.nature === natureFilter),
    [data, natureFilter],
  );
  const visibleDebit = natureFilter ? sumMoneyBy(visibleRows, (r) => r.debit) : Number(data?.total_debit ?? 0);
  const visibleCredit = natureFilter ? sumMoneyBy(visibleRows, (r) => r.credit) : Number(data?.total_credit ?? 0);

  function exportCsv() {
    const headers = ["account_number", "account_name", "group_name", "nature", "debit", "credit"];
    const lines = visibleRows.map((r) =>
      [r.account_number, r.account_name.replaceAll(",", " "), r.group_name.replaceAll(",", " "), r.nature, String(r.debit), String(r.credit)].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "trial_balance_report");
    setSuccess("Trial Balance exported successfully.");
  }

  async function exportExcel() {
    await downloadXlsx(
      ["Account number", "Account name", "Group", "Nature", "Debit", "Credit"],
      visibleRows.map((r) => [r.account_number, r.account_name, r.group_name, r.nature, Number(r.debit), Number(r.credit)]),
      "trial_balance_report",
    );
    setSuccess("Trial Balance exported to Excel.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Trial Balance print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border-strong pb-2">
        <h1 className="text-lg font-semibold">Trial Balance</h1>
        <p className="text-xs text-text-secondary">As of: {asOfDate}</p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
      {!embedded && (
        <>
        <h1 className="text-2xl font-semibold text-text-primary">Trial Balance</h1>
        <p className="text-sm text-text-muted">
          Ledger-wise debit and credit summary. Click an account to see its vouchers.
          {data?.fiscal_year && basis === "fy" ? (
            <>
              {" "}Financial year <b>{data.fiscal_year.label}</b> ({data.fiscal_year.start_date} to {data.fiscal_year.end_date}): income and
              expense show this year only; earlier years are in <i>Profit &amp; Loss brought forward</i>.
            </>
          ) : null}
          {natureFilter ? (
            <>
              {" "}Showing <b>{natureFilter}</b> accounts only.{" "}
              <Link className="text-brand-primary hover:underline" to="/app/accounts/reports/trial-balance">
                Show all
              </Link>
            </>
          ) : null}
        </p>
        </>
      )}
        </div>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        <select className="rounded border px-3 py-2 text-sm" value={basis} onChange={(e) => setBasis(e.target.value as ReportBasis)} title="Income & expense period">
          <option value="fy">This financial year</option>
          <option value="cumulative">Since start (all years)</option>
        </select>
        <select className="rounded border px-3 py-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} - {g.name}
            </option>
          ))}
        </select>
        <select className="rounded border px-3 py-2 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_number} - {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`rounded border px-3 py-2 text-sm ${compactView ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary" : "border-border text-text-secondary"}`}
          onClick={() => setCompactView((v) => !v)}
        >
          {compactView ? "Comfort View" : "Compact View"}
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => handlePrint()}>Print</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()}>Export CSV</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void exportExcel().catch((e) => setError((e as Error).message))}>Export Excel</button>
      </div>
      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}
      <div className="print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className={`min-w-full ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Account</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Group</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Nature</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Debit</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.is_computed ? "pl-bf" : r.account_id} className="border-t">
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>
                  {r.is_computed ? (
                    <span className="italic text-text-secondary">{r.account_name}</span>
                  ) : (
                    <Link
                      className="text-brand-primary hover:underline print:text-inherit print:no-underline"
                      to={ledgerActivityHref(r.account_id, data?.fiscal_year?.start_date ?? yearStart(asOfDate), asOfDate)}
                      title="Open ledger activity"
                    >
                      {r.account_number} - {r.account_name}
                    </Link>
                  )}
                </td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.group_name}</td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.nature}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{r.debit.toLocaleString()}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{r.credit.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t bg-surface-subtle font-semibold">
              <td className={compactView ? "px-2 py-1" : "px-3 py-2"} colSpan={3}>
                Total
              </td>
              <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{visibleDebit.toLocaleString()}</td>
              <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{visibleCredit.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
