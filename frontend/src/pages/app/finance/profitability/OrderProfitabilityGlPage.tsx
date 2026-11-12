import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { ORDER_PROFIT_SORT_FIELDS, type OrderProfitRow, type OrderProfitSortField } from "@/api/financeControl";
import { api } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { amountText, entityProfitHref, isLastPage, marginText } from "@/components/finance/control/controlLogic";
import { ProfitDetail } from "@/components/finance/profitability/ProfitDetail";
import { formatIndian } from "@/components/finance/statements/statementFormat";
import { initialPeriod, type StatementPeriod } from "@/components/finance/statements/statementPeriod";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import {
  ORDER_PROFIT_PAGE_SIZE,
  useControlTowerEnabled,
  useOrderProfitList,
  useProfitability,
} from "@/hooks/useFinanceControl";
import { todayLocalISO } from "@/lib/dates";
import { logApiError } from "@/utils/logApiError";

const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted whitespace-nowrap";
const btn = "rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50";

interface Column {
  key: string;
  label: string;
  sortField?: OrderProfitSortField;
  align?: "right";
}

const COLUMNS: Column[] = [
  { key: "order_code", label: "Order", sortField: "order_code" },
  { key: "buyer", label: "Buyer" },
  { key: "revenue", label: "Revenue", sortField: "revenue", align: "right" },
  { key: "material", label: "Material", align: "right" },
  { key: "cm", label: "CM", align: "right" },
  { key: "other", label: "Other", align: "right" },
  { key: "overhead", label: "Overhead", align: "right" },
  { key: "finance_cost", label: "Finance cost", align: "right" },
  { key: "gross_profit", label: "Gross", align: "right" },
  { key: "nett_profit", label: "Nett", sortField: "nett_profit", align: "right" },
  { key: "margin_percent", label: "Margin %", sortField: "margin_percent", align: "right" },
  { key: "unattributed", label: "Unattributed", align: "right" },
];

/** Customer names for the Buyer column: one request for the first 500 customers; anything else shows its number. */
function useCustomerNames(enabled: boolean): Record<number, string> {
  const [names, setNames] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api
      .listCustomersPaginated({ page: 1, page_size: 500 })
      .then((res) => {
        if (alive) setNames(Object.fromEntries(res.items.map((c) => [c.id, c.name])));
      })
      .catch((e: unknown) => logApiError("OrderProfitabilityGlPage.customers", e));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return names;
}

/** Order P&L from the posted books (tenant flag `finance_control_tower_v2`), one row per order. */
export function OrderProfitabilityGlPage() {
  const enabled = useControlTowerEnabled();
  const startMonth = useFiscalStartMonth();
  const [period, setPeriod] = useState<StatementPeriod>(() => initialPeriod(startMonth, todayLocalISO()));
  const [sort, setSort] = useState<string>("order_code");
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const { data, loading, error, errorStatus, reload } = useOrderProfitList(period.from, period.to, sort, offset, enabled);
  const names = useCustomerNames(enabled);

  useEffect(() => setOffset(0), [period.from, period.to, sort]);

  const sortField = sort.replace(/^-/, "");
  const descending = sort.startsWith("-");

  function toggleSort(field: OrderProfitSortField) {
    if (!(ORDER_PROFIT_SORT_FIELDS as readonly string[]).includes(field)) return;
    setSort(sortField === field && !descending ? `-${field}` : field);
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Order P&L (GL)"
        description="Profit of each order from the posted books. Only entries that are linked to an order are counted; everything else is shown as unattributed, never guessed or split."
      />

      {!enabled ? (
        <div role="status" className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">GL profitability is switched off</p>
          <p className="mt-1">
            An admin can switch on <b>Finance Control Tower and GL profitability</b> in Settings → Configuration → More features → Finance
            navigation. The quotation-based profitability pages keep working.
          </p>
        </div>
      ) : (
        <>
          <StatementPeriodPicker mode="range" value={period} onChange={setPeriod} />

          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
              <span>
                {errorStatus === 403
                  ? "You do not have permission to view profitability."
                  : errorStatus === 404
                    ? "GL profitability is not switched on for your company."
                    : error}
              </span>
              {errorStatus !== 403 && errorStatus !== 404 ? (
                <button type="button" className="rounded border border-current px-2 py-0.5 text-xs" onClick={reload}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {loading && !data ? <div className="h-48 animate-pulse rounded-xl bg-surface-subtle" aria-busy="true" aria-label="Loading orders" /> : null}

          {data ? (
            <section className="overflow-x-auto rounded-xl border border-border bg-surface-raised" aria-label="Order profit">
              <p className="px-3 py-2 text-xs text-text-muted">
                Amounts in {data.base_currency}. {data.total} order(s){loading ? " · refreshing…" : ""}
              </p>
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={`${th} ${c.align === "right" ? "text-right" : "text-left"}`}
                        aria-sort={c.sortField && sortField === c.sortField ? (descending ? "descending" : "ascending") : undefined}
                      >
                        {c.sortField ? (
                          <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={() => toggleSort(c.sortField!)}>
                            {c.label}
                            {sortField === c.sortField ? (
                              descending ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronUp className="h-3 w-3" aria-hidden />
                            ) : null}
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="px-3 py-6 text-center text-text-muted">
                        No orders for this period.
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((r) => (
                      <OrderRow
                        key={r.order_id}
                        row={r}
                        buyer={r.customer_id != null ? (names[r.customer_id] ?? `Customer #${r.customer_id}`) : "—"}
                        menuOpen={menuId === r.order_id}
                        onMenu={(open) => setMenuId(open ? r.order_id : null)}
                        onOpen={() => {
                          setMenuId(null);
                          setOpenId(r.order_id);
                        }}
                      />
                    ))
                  )}
                  <tr className="border-t-2 border-border bg-surface-subtle font-semibold" data-testid="unattributed-row">
                    <td className="px-3 py-2" colSpan={COLUMNS.length - 1}>
                      Not linked to any order or contract ({data.unlinked_lines} ledger line(s))
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" data-testid="unattributed-total">{amountText(data.unattributed_actual)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              {data.total > ORDER_PROFIT_PAGE_SIZE ? (
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-text-muted">
                  <span>
                    {offset + 1}–{Math.min(offset + ORDER_PROFIT_PAGE_SIZE, data.total)} of {data.total}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className={btn} disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - ORDER_PROFIT_PAGE_SIZE))}>
                      Previous
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={isLastPage(data.total, offset, ORDER_PROFIT_PAGE_SIZE) || loading}
                      onClick={() => setOffset(offset + ORDER_PROFIT_PAGE_SIZE)}
                    >
                      Next
                    </button>
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <OrderDetailPanel orderId={openId} from={period.from} to={period.to} onClose={() => setOpenId(null)} />
    </div>
  );
}

function OrderRow({
  row,
  buyer,
  menuOpen,
  onMenu,
  onOpen,
}: {
  row: OrderProfitRow;
  buyer: string;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onOpen: () => void;
}) {
  const num = "px-3 py-1.5 text-right tabular-nums";
  const itemClass = "block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50";
  return (
    <tr className="border-t border-border-subtle">
      <td className="px-3 py-1.5 whitespace-nowrap">
        <button type="button" className="font-medium text-brand-primary hover:underline" onClick={onOpen}>
          {row.order_code}
        </button>
      </td>
      <td className="px-3 py-1.5">{buyer}</td>
      <td className={num}>{formatIndian(row.revenue)}</td>
      <td className={num}>{formatIndian(row.material)}</td>
      <td className={num}>{formatIndian(row.cm)}</td>
      <td className={num}>{formatIndian(row.other)}</td>
      <td className={num}>{formatIndian(row.overhead)}</td>
      <td className={num}>{formatIndian(row.finance_cost)}</td>
      <td className={num}>{formatIndian(row.gross_profit)}</td>
      <td className={num}>{formatIndian(row.nett_profit)}</td>
      <td className={num}>{marginText(row.margin_percent)}</td>
      <td className={`${num} text-text-muted`}>—</td>
      <td className="px-3 py-1.5 text-right">
        <div className="relative inline-block text-left">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Actions for ${row.order_code}`}
            onClick={() => onMenu(!menuOpen)}
          >
            Actions
          </button>
          {menuOpen ? (
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => onMenu(false)} />
              <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                <button type="button" role="menuitem" className={itemClass} onClick={onOpen}>
                  Budget vs actual
                </button>
                {row.style_id != null ? (
                  <Link role="menuitem" className={itemClass} to={entityProfitHref("styles", row.style_id)}>
                    Style P&amp;L
                  </Link>
                ) : null}
                {row.master_contract_id != null ? (
                  <Link role="menuitem" className={itemClass} to={entityProfitHref("master-contracts", row.master_contract_id)}>
                    Contract / LC P&amp;L
                  </Link>
                ) : null}
                {row.customer_id != null ? (
                  <Link role="menuitem" className={itemClass} to={entityProfitHref("buyers", row.customer_id)}>
                    Buyer P&amp;L
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

/** Side panel: budget vs actual, coverage and warnings of one order. */
function OrderDetailPanel({ orderId, from, to, onClose }: { orderId: number | null; from: string; to: string; onClose: () => void }) {
  const { data, loading, error, reload } = useProfitability("orders", orderId, from, to, true);

  useEffect(() => {
    if (orderId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderId, onClose]);

  if (orderId == null) return null;
  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Order profit detail"
        className="flex h-full w-full max-w-3xl flex-col bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-text-muted">Order profit · {from} to {to}</p>
            <h2 className="truncate text-base font-semibold text-text-primary">{data?.entity.code ?? `Order #${orderId}`}</h2>
          </div>
          <button type="button" className={btn} onClick={onClose} aria-label="Close order detail">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && !data ? <p className="text-sm text-text-muted" aria-busy="true">Loading…</p> : null}
          {error ? (
            <div role="alert" className="flex items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              <span>{error}</span>
              <button type="button" className="rounded border border-current px-2 py-0.5 text-xs" onClick={reload}>
                Retry
              </button>
            </div>
          ) : null}
          {data ? <ProfitDetail data={data} /> : null}
        </div>
      </aside>
    </div>
  );
}
