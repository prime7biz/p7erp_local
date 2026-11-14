/** Setup: expense categories (group or account), warning % per category, monthly targets, cost-centre owners. */
import { useEffect, useState, type ReactNode } from "react";
import {
  mgmtPerformanceApi,
  type CategoryMapResponse,
  type OwnersResponse,
  type TargetSetupItem,
  type ThresholdItem,
} from "@/api/mgmtPerformance";
import { LoadingBlock, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { logApiError } from "@/utils/logApiError";
import { buttonClass, fieldClass, primaryButtonClass, tableWrap, td, th } from "./MpParts";
import { isDecimalText, money, pct } from "./mgmtPerformanceLogic";

function SaveMessage({ text }: { text: string }) {
  return text ? (
    <span role="status" className="text-xs text-text-muted">
      {text}
    </span>
  ) : null;
}

function Section({ title, children, help }: { title: string; help: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="text-xs text-text-muted">{help}</p>
      </div>
      {children}
    </section>
  );
}

export function SetupView({ canSetup }: { canSetup: boolean }) {
  return (
    <div className="space-y-4">
      {!canSetup ? (
        <p className="rounded-lg bg-surface-subtle px-4 py-2 text-xs text-text-muted">
          You can look at the setup; changing it needs the admin / manager role or the “Set up Management Performance” permission.
        </p>
      ) : null}
      <CategorySection canSetup={canSetup} />
      <ThresholdSection canSetup={canSetup} />
      <TargetSection canSetup={canSetup} />
      <OwnerSection canSetup={canSetup} />
    </div>
  );
}

function CategorySection({ canSetup }: { canSetup: boolean }) {
  const res = useStatementResource<CategoryMapResponse>("mp.setup.categories", "x", () => mgmtPerformanceApi.getCategoryMap());
  const [msg, setMsg] = useState("");
  async function save(item: { account_id?: number; account_group_id?: number; category: string | null }) {
    setMsg("");
    try {
      await mgmtPerformanceApi.saveCategoryMap([item]);
      setMsg("Saved.");
      res.reload();
    } catch (e) {
      logApiError("mgmtPerformance.saveCategoryMap", e);
      setMsg((e as Error).message || "Could not save");
    }
  }
  const d = res.data;
  return (
    <Section
      title="Expense categories"
      help="Give each expense group (or a single account) a management category. Direct categories (material, processing, landed, export) are product cost, not operating expense. Map commission accounts to “Not counted” - commission comes from the order terms."
    >
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.loading && !d ? <LoadingBlock label="Loading categories" /> : null}
      {d ? (
        <>
          <p className="text-xs text-text-muted">
            Expense accounts without a category: <b>{d.unmapped_accounts}</b> <SaveMessage text={msg} />
          </p>
          <div className={tableWrap}>
            <table className="min-w-full text-sm" aria-label="Expense groups">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className={th}>Account group</th>
                  <th className={th}>Category</th>
                </tr>
              </thead>
              <tbody>
                {d.groups.map((g) => (
                  <tr key={g.id} className="border-t border-border-subtle">
                    <td className={td}>{g.name}</td>
                    <td className={td}>
                      <select
                        className={fieldClass}
                        aria-label={`Category for ${g.name}`}
                        disabled={!canSetup}
                        value={g.category ?? ""}
                        onChange={(e) => void save({ account_group_id: g.id, category: e.target.value || null })}
                      >
                        <option value="">(not set - use parent group)</option>
                        {d.categories.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-brand-primary">Set a single account differently ({d.accounts.length} accounts)</summary>
            <div className={`${tableWrap} mt-2`}>
              <table className="min-w-full text-sm" aria-label="Expense accounts">
                <tbody>
                  {d.accounts.map((a) => (
                    <tr key={a.id} className="border-t border-border-subtle">
                      <td className={td}>
                        {a.label}
                        <span className="block text-[11px] text-text-muted">
                          Now: {d.categories.find((c) => c.code === a.effective_category)?.label ?? "no category"}
                        </span>
                      </td>
                      <td className={td}>
                        <select
                          className={fieldClass}
                          aria-label={`Category for account ${a.label}`}
                          disabled={!canSetup}
                          value={a.category ?? ""}
                          onChange={(e) => void save({ account_id: a.id, category: e.target.value || null })}
                        >
                          <option value="">(same as its group)</option>
                          {d.categories.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : null}
    </Section>
  );
}

function ThresholdSection({ canSetup }: { canSetup: boolean }) {
  const res = useStatementResource<{ items: ThresholdItem[] }>("mp.setup.thresholds", "x", () => mgmtPerformanceApi.getThresholds());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (res.data) setDraft(Object.fromEntries(res.data.items.map((i) => [i.category, String(Number(i.warning_pct))])));
  }, [res.data]);
  const valid = Object.values(draft).every((v) => isDecimalText(v) && Number(v) <= 100);
  async function save() {
    setMsg("");
    try {
      await mgmtPerformanceApi.saveThresholds(Object.entries(draft).map(([category, warning_pct]) => ({ category, warning_pct })));
      setMsg("Saved.");
      res.reload();
    } catch (e) {
      logApiError("mgmtPerformance.saveThresholds", e);
      setMsg((e as Error).message || "Could not save");
    }
  }
  return (
    <Section title="Early warning %" help="A budget line turns to Warning when its forecast reaches this % of the budget (default 90%).">
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.data ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {res.data.items.map((i) => (
            <label key={i.category} className="text-xs font-medium text-text-muted">
              {i.label}
              <input
                className={`${fieldClass} mt-1 block w-full`}
                inputMode="decimal"
                disabled={!canSetup}
                value={draft[i.category] ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, [i.category]: e.target.value }))}
              />
              <span className="font-normal">now {pct(i.warning_pct)}{i.is_default ? " (default)" : ""}</span>
            </label>
          ))}
        </div>
      ) : null}
      {canSetup ? (
        <div className="flex items-center gap-2">
          <button type="button" className={primaryButtonClass} disabled={!valid} onClick={() => void save()}>
            Save warning %
          </button>
          <SaveMessage text={msg} />
        </div>
      ) : null}
    </Section>
  );
}

function TargetSection({ canSetup }: { canSetup: boolean }) {
  const res = useStatementResource<{ fiscal_year: string; items: TargetSetupItem[] }>("mp.setup.targets", "x", () =>
    mgmtPerformanceApi.getTargetSetup(),
  );
  const [edit, setEdit] = useState<{ month: string; profit: string; contingency: string } | null>(null);
  const [msg, setMsg] = useState("");
  const valid = edit != null && isDecimalText(edit.profit) && isDecimalText(edit.contingency) && Number(edit.contingency) <= 100;
  async function save() {
    if (!edit) return;
    setMsg("");
    try {
      await mgmtPerformanceApi.saveTarget({ period_month: edit.month, target_profit_amount: edit.profit, contingency_pct: edit.contingency });
      setEdit(null);
      setMsg("Saved.");
      res.reload();
    } catch (e) {
      logApiError("mgmtPerformance.saveTarget", e);
      setMsg((e as Error).message || "Could not save");
    }
  }
  return (
    <Section
      title="Monthly profit target and contingency"
      help="The net-profit amount you want each month, and a contingency reserve as a % of the forecast operating expenses. Both feed the break-even and production / sales targets."
    >
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.data ? (
        <div className={tableWrap}>
          <table className="min-w-full text-sm" aria-label="Monthly targets">
            <thead className="bg-surface-subtle">
              <tr>
                <th className={th}>Month</th>
                <th className={th}>Profit target</th>
                <th className={th}>Contingency %</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((t) =>
                edit?.month === t.period_month ? (
                  <tr key={t.period_month} className="border-t border-border-subtle">
                    <td className={td}>{t.period_month}</td>
                    <td className={td}>
                      <input className={fieldClass} aria-label="Profit target" inputMode="decimal" value={edit.profit} onChange={(e) => setEdit({ ...edit, profit: e.target.value })} />
                    </td>
                    <td className={td}>
                      <input className={fieldClass} aria-label="Contingency %" inputMode="decimal" value={edit.contingency} onChange={(e) => setEdit({ ...edit, contingency: e.target.value })} />
                    </td>
                    <td className={td}>
                      <button type="button" className={primaryButtonClass} disabled={!valid} onClick={() => void save()}>
                        Save
                      </button>{" "}
                      <button type="button" className={buttonClass} onClick={() => setEdit(null)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.period_month} className="border-t border-border-subtle">
                    <td className={td}>{t.period_month}</td>
                    <td className={td}>{t.target_profit_amount == null ? "not set" : money(t.target_profit_amount)}</td>
                    <td className={td}>{pct(t.contingency_pct)}</td>
                    <td className={td}>
                      {canSetup ? (
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() =>
                            setEdit({
                              month: t.period_month,
                              profit: t.target_profit_amount ? String(Number(t.target_profit_amount)) : "",
                              contingency: t.contingency_pct ? String(Number(t.contingency_pct)) : "5",
                            })
                          }
                        >
                          Set
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      <SaveMessage text={msg} />
    </Section>
  );
}

function OwnerSection({ canSetup }: { canSetup: boolean }) {
  const res = useStatementResource<OwnersResponse>("mp.setup.owners", "x", () => mgmtPerformanceApi.getOwners());
  const [msg, setMsg] = useState("");
  async function save(costCenterId: number, ownerId: number | null) {
    setMsg("");
    try {
      await mgmtPerformanceApi.saveOwner(costCenterId, ownerId);
      setMsg("Saved.");
      res.reload();
    } catch (e) {
      logApiError("mgmtPerformance.saveOwner", e);
      setMsg((e as Error).message || "Could not save");
    }
  }
  return (
    <Section
      title="Cost-centre owners"
      help="The owner answers budget warnings of their cost centre and sees only that cost centre's budget figures."
    >
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.data ? (
        <div className={tableWrap}>
          <table className="min-w-full text-sm" aria-label="Cost-centre owners">
            <tbody>
              {res.data.cost_centers.map((c) => (
                <tr key={c.id} className="border-t border-border-subtle">
                  <td className={td}>
                    {c.code} - {c.name}
                    {c.department ? <span className="block text-[11px] text-text-muted">{c.department}</span> : null}
                  </td>
                  <td className={td}>
                    <select
                      className={fieldClass}
                      aria-label={`Owner of ${c.code}`}
                      disabled={!canSetup}
                      value={c.owner_user_id ?? ""}
                      onChange={(e) => void save(c.id, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">(no owner - finance answers)</option>
                      {res.data!.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <SaveMessage text={msg} />
    </Section>
  );
}
