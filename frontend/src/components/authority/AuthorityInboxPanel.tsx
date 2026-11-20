/**
 * Actor-eligible approvals panel for user_authority_classes_v1 (dashboard + All Approvals).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type {
  AuthorityChangeRequestRow,
  AuthorityInboxItem,
  AuthorityInboxResponse,
} from "@/api/authorityInbox";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { useAuth } from "@/context/AuthContext";
import { useMobileUiV2Phone } from "@/hooks/useMobileUiV2";
import { logApiError } from "@/utils/logApiError";

const DECISION_LABEL: Record<string, string> = {
  VERIFY: "Verify",
  RECOMMEND: "Recommend",
  APPROVE: "Approve",
  REJECT: "Reject",
  RETURN: "Return",
  TAKEOVER: "Take over",
  check: "Check",
  recommend: "Recommend",
  approve: "Approve",
  reject: "Reject",
  class1_approve: "Class 1 approve",
  class1_reject: "Class 1 reject",
};

function snapshotDiff(
  before: Record<string, unknown> | null | undefined,
  proposed: Record<string, unknown> | null | undefined,
): { key: string; from: string; to: string }[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(proposed || {})]);
  const rows: { key: string; from: string; to: string }[] = [];
  for (const key of [...keys].sort()) {
    const from = before?.[key];
    const to = proposed?.[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    rows.push({
      key,
      from: from == null ? "—" : String(from),
      to: to == null ? "—" : String(to),
    });
  }
  return rows;
}

function countTotal(counts: AuthorityInboxResponse["counts"] | undefined): number {
  if (!counts) return 0;
  return (
    (counts.verify || 0) +
    (counts.recommend || 0) +
    (counts.approve || 0) +
    (counts.class1_pending || 0) +
    (counts.change_requests || 0)
  );
}

type Props = {
  /** Compact card for dashboard home; full section for /app/approvals */
  variant?: "dashboard" | "page";
};

export function AuthorityInboxPanel({ variant = "dashboard" }: Props) {
  const { me } = useAuth();
  const phone = useMobileUiV2Phone();
  const enabled =
    me?.feature_flags?.user_authority_classes_v1 === true || me?.authority_classes_enabled === true;

  const [inbox, setInbox] = useState<AuthorityInboxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);
  const [scope, setScope] = useState<"waiting" | "mine" | "history">("waiting");
  const [selected, setSelected] = useState<AuthorityInboxItem | AuthorityChangeRequestRow | null>(null);
  const [note, setNote] = useState("");
  const [historyRows, setHistoryRows] = useState<AuthorityChangeRequestRow[]>([]);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.getAuthorityInbox({ limit: 50 });
      setInbox(data);
      if (scope === "history") {
        const hist = await api.listAuthorityChangeRequests({ scope: "history", limit: 50 });
        setHistoryRows(hist.items || []);
      }
    } catch (e) {
      logApiError("AuthorityInboxPanel.load", e);
      setError((e as Error).message || "Could not load approvals");
    } finally {
      setLoading(false);
    }
  }, [enabled, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = inbox?.counts;
  const total = countTotal(counts);
  const cls = (inbox?.authority_class || me?.authority_class || "").toUpperCase();

  const displayRows = useMemo(() => {
    if (scope === "mine") return inbox?.my_requests ?? [];
    if (scope === "history") return historyRows;
    return inbox?.waiting_for_me ?? [];
  }, [scope, inbox, historyRows]);

  const waiting = inbox?.waiting_for_me ?? [];

  async function runDecision(row: AuthorityInboxItem | AuthorityChangeRequestRow, decision: string) {
    const needsReason = decision === "REJECT" || decision === "RETURN" || decision === "class1_reject";
    if (needsReason && note.trim().length < 3) {
      setError("A reason (at least 3 characters) is required for reject / return.");
      return;
    }
    const key = `${"kind" in row ? row.kind : "cr"}-${row.id}-${decision}`;
    if (busyKey) return;
    setBusyKey(key);
    setError("");
    setSuccess("");
    try {
      if ("kind" in row && row.kind === "change_request") {
        await api.decideAuthorityChangeRequest(row.id, {
          decision,
          note: note.trim() || null,
        });
      } else if ("kind" in row && row.kind.startsWith("voucher")) {
        if (decision === "check") await api.updateVoucherStatus(row.id, "CHECKED", { reason: note });
        else if (decision === "recommend") await api.updateVoucherStatus(row.id, "RECOMMENDED", { reason: note });
        else if (decision === "approve") await api.updateVoucherStatus(row.id, "APPROVED", { reason: note });
        else if (decision === "reject") await api.updateVoucherStatus(row.id, "REJECTED", { reason: note });
        else if (decision === "class1_approve") await api.class1ApproveVoucher(row.id, { reason: note || undefined });
        else if (decision === "class1_reject") await api.class1RejectVoucher(row.id, { reason: note });
        else throw new Error(`Unsupported voucher action: ${decision}`);
      } else if ("kind" in row && row.kind === "gate_pass_class1") {
        if (decision === "class1_approve") await api.class1ApproveGatePass(row.id);
        else if (decision === "class1_reject") await api.class1RejectGatePass(row.id);
        else throw new Error(`Unsupported gate pass action: ${decision}`);
      } else if ("kind" in row && row.kind === "purchase_order_class1") {
        if (decision === "class1_approve") await api.class1ApprovePurchaseOrder(row.id);
        else if (decision === "class1_reject") await api.class1RejectPurchaseOrder(row.id);
        else throw new Error(`Unsupported purchase order action: ${decision}`);
      } else if (!("kind" in row)) {
        await api.decideAuthorityChangeRequest(row.id, {
          decision,
          note: note.trim() || null,
        });
      } else {
        throw new Error("Unsupported row");
      }
      setSuccess(`${DECISION_LABEL[decision] ?? decision} completed.`);
      setNote("");
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  if (!enabled) return null;

  const modules = me?.module_grants ?? [];
  const hasFinance = modules.includes("finance") || cls === "SUPER" || Boolean(me?.is_tenant_super_admin);
  const hasInventory = modules.includes("inventory") || cls === "SUPER" || Boolean(me?.is_tenant_super_admin);
  const newEntryLinks =
    cls === "CLASS_4" || cls === "CLASS_1" || cls === "SUPER" ? (
      <div className="mt-2 flex flex-wrap gap-2">
        {hasFinance ? (
          <>
            <Link
              to="/app/accounts/vouchers/new"
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-raised px-3 text-sm font-medium text-text-primary hover:bg-state-hover"
            >
              New voucher
            </Link>
            <Link
              to="/app/accounts/chart-of-accounts"
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-raised px-3 text-sm font-medium text-text-primary hover:bg-state-hover"
            >
              Ledger / group request
            </Link>
          </>
        ) : null}
        {hasInventory ? (
          <Link
            to="/app/inventory/enhanced-gate-passes/new"
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-raised px-3 text-sm font-medium text-text-primary hover:bg-state-hover"
          >
            New gate pass
          </Link>
        ) : null}
      </div>
    ) : null;

  const countBadges = (
    <div className={`mt-3 grid gap-2 ${phone ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5"}`}>
      {[
        { label: "Verify", value: counts?.verify ?? 0, href: "/app/approvals?tab=authority&scope=waiting" },
        { label: "Recommend", value: counts?.recommend ?? 0, href: "/app/approvals?tab=authority&scope=waiting" },
        { label: "Approve", value: counts?.approve ?? 0, href: "/app/approvals?tab=authority&scope=waiting" },
        { label: "Class 1", value: counts?.class1_pending ?? 0, href: "/app/approvals?tab=authority&scope=waiting" },
        { label: "Master CRs", value: counts?.change_requests ?? 0, href: "/app/approvals?tab=authority&scope=waiting" },
      ].map((c) => (
        <Link
          key={c.label}
          to={c.href}
          className={`rounded-xl border p-3 text-center shadow-sm transition-colors hover:bg-state-hover ${
            c.value > 0 ? "border-status-warning/30 bg-status-warning-subtle" : "border-border bg-surface-raised"
          }`}
        >
          <div className="text-lg font-semibold text-text-primary">{c.value}</div>
          <div className="text-xs text-text-muted">{c.label}</div>
        </Link>
      ))}
    </div>
  );

  if (variant === "dashboard") {
    return (
      <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm" aria-label="Approvals">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Approvals</h2>
            <p className="text-xs text-text-muted">
              Only items waiting for your class{total === 0 ? " — nothing waiting" : ` (${total})`}.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-state-hover"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <Link
              to="/app/approvals?tab=authority"
              className="rounded-lg border border-brand-primary/30 bg-brand-subtle px-3 py-2 text-xs font-semibold text-brand-primary"
            >
              Open inbox
            </Link>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-status-danger-foreground">{error}</p> : null}
        {countBadges}
        {newEntryLinks}
        {waiting.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {waiting.slice(0, phone ? 5 : 8).map((row) => (
              <li key={`${row.kind}-${row.id}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-primary">
                    {row.number} · {row.status}
                  </div>
                  <div className="truncate text-xs text-text-muted">
                    {row.kind.replaceAll("_", " ")} · {row.date}
                  </div>
                </div>
                {row.href ? (
                  <Link to={row.href} className="shrink-0 text-xs font-semibold text-brand-primary hover:underline">
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !loading ? (
          <p className="mt-3 text-sm text-text-muted">Nothing waiting for you.</p>
        ) : null}
      </section>
    );
  }

  // Full page section
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface-raised p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Authority inbox</h2>
          <p className="text-sm text-text-muted">
            Waiting for me, my master change requests, and history (flag-gated).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["waiting", "mine", "history"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
                scope === s
                  ? "border-brand-primary bg-brand-subtle text-brand-primary"
                  : "border-border text-text-secondary hover:bg-state-hover"
              }`}
            >
              {s === "waiting" ? "Waiting for me" : s === "mine" ? "My requests" : "History"}
            </button>
          ))}
          <button
            type="button"
            className="min-h-11 rounded-lg border border-border px-3 text-sm hover:bg-state-hover"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </div>

      {countBadges}
      {newEntryLinks}
      {error ? (
        <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
          {success}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-5 text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-5 text-text-muted">
                  {scope === "waiting" ? "Nothing waiting for you." : "No rows in this view."}
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const isInbox = "kind" in row;
                const label = isInbox ? row.number : row.request_id;
                const status = row.status;
                const date = isInbox ? row.date : (row.created_at || "").slice(0, 10);
                const details = isInbox
                  ? `${row.kind}${row.resource_type ? ` · ${row.resource_type}` : ""}`
                  : `${row.resource_type} · ${row.action}`;
                const actions = isInbox
                  ? row.actions || []
                  : scope === "waiting"
                    ? ["VERIFY", "RECOMMEND", "APPROVE", "REJECT", "RETURN", "TAKEOVER"].filter(() => true)
                    : [];
                const rowActions = isInbox ? actions : [];
                return (
                  <tr key={`${isInbox ? row.kind : "acr"}-${row.id}`} className="border-t">
                    <td className="px-3 py-2 font-medium">{label}</td>
                    <td className="px-3 py-2">{status}</td>
                    <td className="px-3 py-2">{date}</td>
                    <td className="px-3 py-2 text-text-secondary">{details}</td>
                    <td className="px-3 py-2">
                      <RowActionsMenu
                        rowId={`${isInbox ? (row as AuthorityInboxItem).kind : "acr"}-${row.id}`}
                        openId={openActionsId}
                        onOpenChange={setOpenActionsId}
                        label={busyKey?.startsWith(String(row.id)) ? "Working…" : "Actions"}
                        items={[
                          {
                            key: "review",
                            label: "Review",
                            onClick: () => setSelected(row),
                          },
                          ...(("href" in row && row.href
                            ? [{ key: "open", label: "Open", href: row.href as string }]
                            : []) as { key: string; label: string; href?: string; onClick?: () => void; danger?: boolean }[]),
                          ...(rowActions.map((action) => ({
                            key: action,
                            label: DECISION_LABEL[action] ?? action,
                            danger: action === "REJECT" || action === "reject" || action === "class1_reject",
                            onClick: () => {
                              setSelected(row);
                              if (action === "REJECT" || action === "RETURN" || action === "reject" || action === "class1_reject") {
                                return;
                              }
                              void runDecision(row, action);
                            },
                          })) as { key: string; label: string; danger?: boolean; onClick?: () => void }[]),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {"kind" in selected ? selected.number : selected.request_id}
              </h3>
              <p className="text-xs text-text-muted">
                {selected.status}
                {"reason" in selected && selected.reason ? ` · ${selected.reason}` : ""}
              </p>
            </div>
            <button type="button" className="text-xs text-text-muted hover:underline" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          {"before_snapshot" in selected || "proposed_snapshot" in selected ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-text-muted">
                    <th className="py-1 pr-3">Field</th>
                    <th className="py-1 pr-3">Before</th>
                    <th className="py-1">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotDiff(
                    "before_snapshot" in selected ? selected.before_snapshot : null,
                    "proposed_snapshot" in selected ? selected.proposed_snapshot : null,
                  ).map((d) => (
                    <tr key={d.key} className="border-t border-border">
                      <td className="py-1 pr-3 font-medium">{d.key}</td>
                      <td className="py-1 pr-3 text-text-secondary">{d.from}</td>
                      <td className="py-1 text-text-primary">{d.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <label className="mt-3 block text-xs font-medium text-text-secondary">
            Note / reason
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Required for reject and return"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {(("actions" in selected && selected.actions) ||
              ("current_step" in selected
                ? ["VERIFY", "RECOMMEND", "APPROVE", "REJECT", "RETURN", "TAKEOVER"]
                : [])
            ).map((action) => (
              <button
                key={action}
                type="button"
                disabled={busyKey != null}
                className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
                  action === "REJECT" || action === "reject" || action === "class1_reject"
                    ? "border-status-danger/40 text-status-danger-foreground"
                    : "border-border text-text-primary hover:bg-state-hover"
                }`}
                onClick={() => void runDecision(selected, action)}
              >
                {DECISION_LABEL[action] ?? action}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
