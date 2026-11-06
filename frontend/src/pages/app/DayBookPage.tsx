import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type AccountGroupResponse, type ChartOfAccountResponse, type DayBookResponse } from "@/api/client";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { voucherHref } from "@/lib/financeDrilldown";
import { downloadCsv, downloadXlsx, printCurrentPage } from "@/lib/reportExport";
import { startOfMonthLocalISO, todayLocalISO } from "@/lib/dates";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";

const CTL =
  "rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";
const BTN =
  "rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle";

/** Statuses the voucher form accepts for editing; the backend rejects the rest. */
const EDITABLE_STATUSES = new Set(["DRAFT", "REJECTED"]);

export function DayBookPage() {
  const navigate = useNavigate();
  const [fromDate, setFromDate] = useState(startOfMonthLocalISO());
  const [toDate, setToDate] = useState(todayLocalISO());
  const [voucherType, setVoucherType] = useState("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [partyName, setPartyName] = useState("");
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [data, setData] = useState<DayBookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    try {
      setError("");
      const res = await api.getDayBook({
        from_date: fromDate,
        to_date: toDate,
        voucher_type: voucherType || undefined,
        group_id: groupId || undefined,
        account_id: accountId || undefined,
        party_name: partyName.trim() || undefined,
      });
      if (!latest.isCurrent(token)) return;
      setData(res);
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, fromDate, toDate, voucherType, groupId, accountId, partyName]);

  async function loadMeta() {
    try {
      const [types, accountGroups, chartAccounts] = await Promise.all([
        api.getVoucherTypesMeta(),
        api.listAccountGroups(),
        api.listChartOfAccounts({ active_only: true }),
      ]);
      setVoucherTypes(types);
      setGroups(accountGroups);
      setAccounts(chartAccounts);
    } catch (e) {
      logApiError("DayBookPage.loadMeta", e);
      // Keep day book usable even if metadata call fails.
      setVoucherTypes([]);
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

  function exportCsv() {
    const headers = ["voucher_number", "voucher_date", "voucher_type", "status", "description", "amount"];
    const lines = (data?.rows ?? []).map((r) =>
      [r.voucher_number, r.voucher_date, r.voucher_type, r.status, (r.description ?? "").replaceAll(",", " "), String(r.amount)].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "day_book_report");
    setSuccess("Day Book exported successfully.");
  }

  async function exportExcel() {
    await downloadXlsx(
      ["Voucher", "Date", "Type", "Status", "Description", "Amount"],
      (data?.rows ?? []).map((r) => [r.voucher_number, r.voucher_date, r.voucher_type, r.status, r.description ?? "", Number(r.amount)]),
      "day_book_report",
    );
    setSuccess("Day Book exported to Excel.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Day Book print dialog opened.");
  }

  const rows = data?.rows ?? [];
  const cell = compactView ? "px-2 py-1" : "px-3 py-2";

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border pb-2">
        <h1 className="text-lg font-semibold">Day Book</h1>
        <p className="text-xs text-text-muted">
          Period: {fromDate} to {toDate}
        </p>
      </div>
      <div className="no-print space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Day Book</h1>
          <p className="text-sm text-text-muted">
            Voucher transaction register with date range filtering. Click a voucher number to open it, or use Actions to view, edit or print.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" className={CTL} value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From date" />
          <input type="date" className={CTL} value={toDate} onChange={(e) => setToDate(e.target.value)} title="To date" />
          <select className={CTL} value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
            <option value="">All Types</option>
            {voucherTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className={CTL} value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} - {g.name}
              </option>
            ))}
          </select>
          <select className={CTL} value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number} - {a.name}
              </option>
            ))}
          </select>
          <input
            className={CTL}
            placeholder="Party/Ref contains..."
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
          />
          <button
            type="button"
            className={compactView ? "rounded-lg border border-brand-primary bg-brand-primary px-3 py-2 text-sm text-brand-primary-foreground" : BTN}
            onClick={() => setCompactView((v) => !v)}
          >
            {compactView ? "Comfort View" : "Compact View"}
          </button>
          <button type="button" className={BTN} onClick={() => handlePrint()}>Print</button>
          <button type="button" className={BTN} onClick={() => exportCsv()}>Export CSV</button>
          <button type="button" className={BTN} onClick={() => void exportExcel().catch((e) => setError((e as Error).message))}>Export Excel</button>
        </div>
      </div>
      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}
      <div className="print-card rounded-xl border border-border bg-surface-raised">
        <div className="no-print flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Vouchers</h2>
          <span className="text-xs text-text-muted">
            {loading ? "Loading…" : `${rows.length} voucher${rows.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className={`min-w-full ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className={cell}>Voucher</th>
                <th className={cell}>Date</th>
                <th className={cell}>Type</th>
                <th className={cell}>Status</th>
                <th className={cell}>Description</th>
                <th className={`${cell} text-right`}>Amount</th>
                <th className={`${cell} no-print`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-5 text-text-muted" colSpan={7}>Loading vouchers...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-5 text-text-muted" colSpan={7}>No vouchers found for this period.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className={cell}>
                      <Link className="text-brand-primary hover:underline print:text-inherit print:no-underline" to={voucherHref(r.id)}>
                        {r.voucher_number}
                      </Link>
                    </td>
                    <td className={cell}>{r.voucher_date}</td>
                    <td className={cell}>{r.voucher_type}</td>
                    <td className={cell}>{r.status}</td>
                    <td className={`${cell} max-w-[16rem] truncate print:max-w-none print:whitespace-normal`} title={r.description ?? undefined}>
                      {r.description ?? "-"}
                    </td>
                    <td className={`${cell} text-right`}>{r.amount.toLocaleString()}</td>
                    <td className={`${cell} no-print`}>
                      <RowActionsMenu
                        menuPortal
                        rowId={r.id}
                        openId={openActionsId}
                        onOpenChange={(id) => setOpenActionsId(id == null ? null : Number(id))}
                        items={[
                          { key: "view", label: "View Details", onClick: () => navigate(voucherHref(r.id)) },
                          ...(EDITABLE_STATUSES.has((r.status || "").toUpperCase())
                            ? [{ key: "edit", label: "Edit", onClick: () => navigate(`/app/accounts/vouchers?edit=${r.id}`) }]
                            : []),
                          {
                            key: "print",
                            label: "Print / PDF",
                            onClick: () => navigate(`/app/accounts/vouchers/print?voucher_id=${r.id}`),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
              {!loading && rows.length > 0 ? (
                <tr className="border-t border-border bg-surface-subtle font-semibold">
                  <td className={cell} colSpan={5}>
                    Total
                  </td>
                  <td className={`${cell} text-right`}>{Number(data?.total_amount ?? 0).toLocaleString()}</td>
                  <td className={`${cell} no-print`} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
