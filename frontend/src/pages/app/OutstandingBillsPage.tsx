import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OutstandingBillCreate, type OutstandingBillResponse, type BillsAgingResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import {
  listPageErrorClass,
  listPageRootClass,
  listPageToolbarSelectClass,
  listTableTdClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import {
  FinanceFormDrawer,
  FinanceListToolbar,
  FormSection,
  ScrollTableCard,
  SummaryStrip,
  showingCountLabel,
} from "@/components/finance/kit";

const FIELD = "w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const LABEL = "block text-xs font-medium text-text-muted";

export function OutstandingBillsPage() {
  const actionGuard = useSubmitGuard();
  const [rows, setRows] = useState<OutstandingBillResponse[]>([]);
  const [aging, setAging] = useState<BillsAgingResponse | null>(null);
  const [billType, setBillType] = useState<"PAYABLE" | "RECEIVABLE">("RECEIVABLE");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [voucherToolId, setVoucherToolId] = useState("");
  const [autoPartyName, setAutoPartyName] = useState("");
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [settleBill, setSettleBill] = useState<OutstandingBillResponse | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [form, setForm] = useState<OutstandingBillCreate>({
    bill_no: "",
    party_name: "",
    bill_type: "RECEIVABLE",
    bill_date: todayLocalISO(),
    due_date: todayLocalISO(),
    amount: "0",
    paid_amount: "0",
    currency: "BDT",
    notes: "",
  });

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    try {
      setError("");
      const [bills, ag] = await Promise.all([
        api.listOutstandingBills({ bill_type: billType, status_filter: statusFilter || undefined }),
        api.getBillsAging({ bill_type: billType }),
      ]);
      if (!latest.isCurrent(token)) return;
      setRows(bills);
      setAging(ag);
    } catch (e) {
      logApiError("OutstandingBillsPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, billType, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = rows.filter((r) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return r.bill_no.toLowerCase().includes(query) || r.party_name.toLowerCase().includes(query);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    await actionGuard.run(async () => {
      try {
        setSuccess("");
        setFormError("");
        if (!form.party_name.trim()) throw new Error("Party name is required");
        if (!form.bill_date || !form.due_date) throw new Error("Bill date and due date are required");
        if (Number(form.amount) <= 0) throw new Error("Amount must be greater than zero");
        await api.createOutstandingBill(form);
        setForm((p) => ({ ...p, bill_no: "", party_name: "", amount: "0", notes: "" }));
        setCreateOpen(false);
        await load();
        setSuccess("Bill created successfully.");
      } catch (e) {
        setFormError((e as Error).message);
      }
    });
  }

  async function settle() {
    if (!settleBill) return;
    const id = settleBill.id;
    await actionGuard.run(async () => {
      try {
        setSuccess("");
        setFormError("");
        const amount = settleAmount || "0";
        if (Number(amount) <= 0) throw new Error("Settle amount must be greater than zero");
        await api.settleOutstandingBill(id, amount);
        setSettleBill(null);
        setSettleAmount("");
        await load();
        setSuccess("Bill settlement applied.");
      } catch (e) {
        logApiError("OutstandingBillsPage.settle", e);
        setFormError((e as Error).message);
      }
    });
  }

  async function runAutoCreateBillRefs() {
    const vid = Number(voucherToolId);
    if (!Number.isFinite(vid) || vid <= 0) {
      setFormError("Enter a valid voucher ID for auto-create.");
      return;
    }
    await actionGuard.run(async () => {
      try {
        setSuccess("");
        setFormError("");
        const res = await api.autoCreateBillRefs(vid);
        await load();
        setVoucherOpen(false);
        setSuccess(`Created ${res.bills_created} bill reference(s): ${res.bill_numbers.join(", ") || "—"}`);
      } catch (e) {
        logApiError("OutstandingBillsPage.autoCreateBillRefs", e);
        setFormError((e as Error).message);
      }
    });
  }

  async function runAutoCreateBillFromVoucher() {
    const vid = Number(voucherToolId);
    if (!Number.isFinite(vid) || vid <= 0) {
      setFormError("Enter a valid voucher ID.");
      return;
    }
    if (!autoPartyName.trim()) {
      setFormError("Party name is required for outstanding bill auto-create.");
      return;
    }
    await actionGuard.run(async () => {
      try {
        setSuccess("");
        setFormError("");
        await api.autoCreateBillFromVoucher(vid, {
          party_name: autoPartyName.trim(),
          bill_type: billType,
          due_in_days: 30,
        });
        await load();
        setVoucherOpen(false);
        setSuccess("Outstanding bill created from voucher.");
      } catch (e) {
        logApiError("OutstandingBillsPage.autoCreateBillFromVoucher", e);
        setFormError((e as Error).message);
      }
    });
  }

  const bucket = (key: string) => (aging?.buckets[key as keyof typeof aging.buckets] ?? 0).toLocaleString();

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Outstanding Bills"
        description="AP/AR bill tracking with aging buckets."
        belowTitle={
          <p className="text-sm text-text-muted">
            <Link className="font-medium text-brand-primary hover:underline" to="/app/accounts/reports/ar-ap-aging">
              View full AR/AP aging report
            </Link>
            {" · "}
            <Link className="font-medium text-brand-primary hover:underline" to="/app/accounts/vouchers">
              Vouchers
            </Link>
          </p>
        }
      />

      <FinanceListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bill no or party..."
        filters={
          <>
            <select
              className={listPageToolbarSelectClass}
              aria-label="Bill type"
              value={billType}
              onChange={(e) => setBillType(e.target.value as "PAYABLE" | "RECEIVABLE")}
            >
              <option value="RECEIVABLE">Receivable</option>
              <option value="PAYABLE">Payable</option>
            </select>
            <select
              className={listPageToolbarSelectClass}
              aria-label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="OPEN">OPEN</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="PAID">PAID</option>
            </select>
          </>
        }
        secondaryActions={
          <button
            type="button"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            onClick={() => {
              setFormError("");
              setVoucherOpen(true);
            }}
          >
            From voucher
          </button>
        }
        primaryAction={{
          label: "Add bill",
          onClick: () => {
            setFormError("");
            setForm((p) => ({ ...p, bill_type: billType }));
            setCreateOpen(true);
          },
        }}
      />

      {aging ? (
        <SummaryStrip
          items={[
            { key: "current", label: "Current", value: bucket("current") },
            { key: "1_30", label: "1-30", value: bucket("1_30") },
            { key: "31_60", label: "31-60", value: bucket("31_60"), tone: "warning" },
            { key: "61_90", label: "61-90", value: bucket("61_90"), tone: "warning" },
            { key: "90_plus", label: "90+", value: bucket("90_plus"), tone: "danger" },
          ]}
        />
      ) : null}

      {error ? <div className={listPageErrorClass}>{error}</div> : null}
      {success ? (
        <div className="rounded border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
          {success}
        </div>
      ) : null}

      <ScrollTableCard footer={showingCountLabel(filteredRows.length, rows.length, "bill")}>
        <table className="min-w-full text-sm">
          <thead className={`${listTableTheadClass} text-left`}>
            <tr>
              <th className={listTableThClass}>Bill</th>
              <th className={listTableThClass}>Party</th>
              <th className={listTableThClass}>Due</th>
              <th className={listTableThClass}>Amount</th>
              <th className={listTableThClass}>Paid</th>
              <th className={listTableThClass}>Status</th>
              <th className={listTableThClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id} className={listTableTrClass}>
                <td className={listTableTdClass}>{r.bill_no}</td>
                <td className={listTableTdClass}>{r.party_name}</td>
                <td className={listTableTdClass}>{r.due_date}</td>
                <td className={listTableTdClass}>{Number(r.amount).toLocaleString()}</td>
                <td className={listTableTdClass}>{Number(r.paid_amount).toLocaleString()}</td>
                <td className={listTableTdClass}>{r.status}</td>
                <td className={listTableTdClass}>
                  <RowActionsMenu
                    menuPortal
                    rowId={r.id}
                    openId={openActionsId}
                    onOpenChange={setOpenActionsId}
                    items={[
                      {
                        key: "settle",
                        label: "Settle",
                        onClick: () => {
                          setFormError("");
                          setSettleAmount("");
                          setSettleBill(r);
                        },
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr className={listTableTrClass}>
                <td className="px-4 py-3 text-sm text-text-muted" colSpan={7}>
                  No bills found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollTableCard>

      <FinanceFormDrawer
        open={createOpen}
        title="Add bill"
        description="Create an outstanding payable or receivable bill."
        onClose={() => setCreateOpen(false)}
        onSubmit={(e) => void submit(e)}
        submitLabel="Create Bill"
        submitting={actionGuard.busy}
        error={formError}
      >
        <FormSection title="Bill details">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL}>
              Bill No (optional)
              <input className={FIELD} value={form.bill_no} onChange={(e) => setForm((p) => ({ ...p, bill_no: e.target.value }))} />
            </label>
            <label className={LABEL}>
              Party Name
              <input className={FIELD} value={form.party_name} onChange={(e) => setForm((p) => ({ ...p, party_name: e.target.value }))} />
            </label>
            <label className={LABEL}>
              Bill date
              <input type="date" className={FIELD} value={form.bill_date} onChange={(e) => setForm((p) => ({ ...p, bill_date: e.target.value }))} />
            </label>
            <label className={LABEL}>
              Due date
              <input type="date" className={FIELD} value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
            </label>
          </div>
        </FormSection>
        <FormSection title="Amounts">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={LABEL}>
              Amount
              <input className={FIELD} value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </label>
            <label className={LABEL}>
              Paid Amount
              <input className={FIELD} value={form.paid_amount} onChange={(e) => setForm((p) => ({ ...p, paid_amount: e.target.value }))} />
            </label>
            <label className={LABEL}>
              Currency
              <input className={FIELD} value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
            </label>
          </div>
        </FormSection>
      </FinanceFormDrawer>

      <FinanceFormDrawer
        open={voucherOpen}
        mode="panel"
        title="From voucher"
        description="Create structured bill references (allocation tracking) or a simple outstanding bill row from a posted voucher."
        onClose={() => setVoucherOpen(false)}
        error={formError}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-border-strong px-4 py-2 text-sm disabled:opacity-50"
              disabled={actionGuard.busy}
              onClick={() => void runAutoCreateBillRefs()}
            >
              Auto-create bill references
            </button>
            <button
              type="button"
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50"
              disabled={actionGuard.busy}
              onClick={() => void runAutoCreateBillFromVoucher()}
            >
              Auto-create outstanding bill
            </button>
          </>
        }
      >
        <FormSection title="Voucher">
          <label className={LABEL}>
            Voucher ID
            <input className={FIELD} value={voucherToolId} onChange={(e) => setVoucherToolId(e.target.value)} placeholder="e.g. 42" />
          </label>
          <label className={LABEL}>
            Party name (for outstanding bill)
            <input className={FIELD} value={autoPartyName} onChange={(e) => setAutoPartyName(e.target.value)} placeholder="Matches customer/vendor name" />
          </label>
        </FormSection>
      </FinanceFormDrawer>

      <FinanceFormDrawer
        open={settleBill != null}
        title={settleBill ? `Settle bill ${settleBill.bill_no}` : "Settle bill"}
        size="md"
        onClose={() => setSettleBill(null)}
        onSubmit={(e) => {
          e.preventDefault();
          void settle();
        }}
        submitLabel="Settle"
        submitting={actionGuard.busy}
        error={formError}
      >
        <FormSection title="Settlement">
          <label className={LABEL}>
            Settle amount
            <input className={FIELD} value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} />
          </label>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
