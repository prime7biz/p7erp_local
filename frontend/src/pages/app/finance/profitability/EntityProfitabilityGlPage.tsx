import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { ENTITY_KINDS, fetchersFor, type EntityPickKind } from "@/components/finance/profitability/entityFetchers";
import { ProfitDetail } from "@/components/finance/profitability/ProfitDetail";
import { initialPeriod, type StatementPeriod } from "@/components/finance/statements/statementPeriod";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useControlTowerEnabled, useProfitability } from "@/hooks/useFinanceControl";
import { todayLocalISO } from "@/lib/dates";

const fieldClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

function asKind(text: string | null): EntityPickKind {
  return ENTITY_KINDS.find((k) => k.kind === text)?.kind ?? "styles";
}

function asId(text: string | null): number | null {
  const n = Number(text);
  return text && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Real profit (from the posted books) of one style, master contract / LC or buyer.
 * The choice lives in the address (?kind=styles&id=12), so a link from the Order P&L opens it directly.
 */
export function EntityProfitabilityGlPage() {
  const enabled = useControlTowerEnabled();
  const startMonth = useFiscalStartMonth();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<StatementPeriod>(() => initialPeriod(startMonth, todayLocalISO()));
  const kind = asKind(params.get("kind"));
  const id = asId(params.get("id"));
  const { data, loading, error, errorStatus, reload } = useProfitability(kind, id, period.from, period.to, enabled);
  const meta = ENTITY_KINDS.find((k) => k.kind === kind)!;
  const fetchers = fetchersFor(kind);

  function update(nextKind: EntityPickKind, nextId: number | null) {
    const next = new URLSearchParams(params);
    next.set("kind", nextKind);
    if (nextId == null) next.delete("id");
    else next.set("id", String(nextId));
    setParams(next, { replace: true });
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Style / LC / Buyer P&L (GL)"
        description="Real profit of a style, a master contract (LC) or a buyer, from the posted books. A style adds up its orders; an LC adds its orders and its own cost centre."
      />

      {!enabled ? (
        <div role="status" className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">GL profitability is switched off</p>
          <p className="mt-1">
            An admin can switch on <b>Finance Control Tower and GL profitability</b> in Settings → Configuration → More features → Finance
            navigation.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-text-muted">
              Show profit of
              <select
                className={`${fieldClass} mt-1 block`}
                value={kind}
                onChange={(e) => update(e.target.value as EntityPickKind, null)}
              >
                {ENTITY_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="min-w-[16rem] flex-1 text-xs font-medium text-text-muted sm:max-w-md">
              {meta.label}
              <div className="mt-1">
                <RemoteSearchSelect
                  key={kind}
                  value={id}
                  onChange={(next) => update(kind, next === "" ? null : next)}
                  fetchPage={fetchers.fetchPage}
                  hydrateById={fetchers.hydrateById}
                  placeholder={meta.placeholder}
                  aria-label={meta.label}
                  menuPortal
                />
              </div>
            </div>
            <StatementPeriodPicker mode="range" value={period} onChange={setPeriod} />
          </div>

          {id == null ? (
            <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-muted">
              Choose a {meta.label.toLowerCase()} above to see its profit.
            </p>
          ) : null}

          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
              <span>
                {errorStatus === 403
                  ? "You do not have permission to view profitability."
                  : errorStatus === 404
                    ? "Not found. The record does not exist, or GL profitability is not switched on."
                    : error}
              </span>
              {errorStatus !== 403 && errorStatus !== 404 ? (
                <button type="button" className="rounded border border-current px-2 py-0.5 text-xs" onClick={reload}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {loading && !data && id != null ? <div className="h-48 animate-pulse rounded-xl bg-surface-subtle" aria-busy="true" aria-label="Loading profit" /> : null}

          {data && id != null ? (
            <>
              <p className="text-sm text-text-secondary">
                <b>{data.entity.code ?? `#${data.entity.id}`}</b>
                {data.entity.name ? <> · {data.entity.name}</> : null} · {data.period.from_date ?? "start"} to {data.period.to_date ?? "today"}
                {loading ? " · refreshing…" : ""}
              </p>
              <ProfitDetail data={data} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
