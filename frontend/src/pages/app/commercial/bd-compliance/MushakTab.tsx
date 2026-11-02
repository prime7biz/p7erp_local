import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type MushakRegister } from "@/api/client";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { listPageTableCardClass } from "@/components/app/listPageLayout";
import { logApiError } from "@/utils/logApiError";
import { btnSecondary, errMsg, inputClass, labelClass, num } from "./shared";

type Row = MushakRegister["rows"][number];

const COLUMNS: Record<"6-1" | "6-2", { id: string; header: string; money?: boolean }[]> = {
  "6-1": [
    { id: "date", header: "Date" },
    { id: "bill_code", header: "Bill no." },
    { id: "supplier_invoice_no", header: "Supplier invoice" },
    { id: "supplier_name", header: "Supplier" },
    { id: "supplier_bin", header: "Supplier BIN" },
    { id: "taxable_value", header: "Taxable value", money: true },
    { id: "vat_amount", header: "VAT", money: true },
    { id: "total", header: "Total", money: true },
  ],
  "6-2": [
    { id: "date", header: "Date" },
    { id: "invoice_code", header: "Invoice no." },
    { id: "buyer_name", header: "Buyer" },
    { id: "buyer_bin", header: "Buyer BIN" },
    { id: "currency", header: "Currency" },
    { id: "fc_value", header: "Invoice value (FC)", money: true },
    { id: "taxable_value", header: "Value (base)", money: true },
    { id: "vat_amount", header: "VAT", money: true },
    { id: "supply_type", header: "Supply type" },
  ],
};

export function MushakTab({ register }: { register: "6-1" | "6-2" }) {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState<MushakRegister | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [y, m] = period.split("-").map(Number);
    if (!y || !m) return;
    setLoading(true);
    try {
      setData(await api.getMushakRegister(register, y, m));
    } catch (e) {
      logApiError("MushakTab.load", e);
      toast.error(errMsg(e, "Could not load register"));
    } finally {
      setLoading(false);
    }
  }, [period, register]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<GridColumn<Row>[]>(
    () =>
      COLUMNS[register].map((c, i) => ({
        id: c.id,
        header: c.header,
        align: c.money ? ("right" as const) : undefined,
        alwaysVisible: i === 1,
        value: (r: Row) => (c.money ? Number(r[c.id] ?? 0) : String(r[c.id] ?? "")),
        cell: (r: Row) => (c.money ? num(r[c.id] as string) : (r[c.id] ?? "—")),
      })),
    [register],
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className={labelClass}>Month</span>
          <input type="month" className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
        <button type="button" className={btnSecondary} onClick={() => void load()}>
          Refresh
        </button>
        {data ? (
          <p className="text-xs text-text-secondary">
            Totals — value <strong>{num(data.totals.taxable_value)}</strong> · VAT <strong>{num(data.totals.vat_amount)}</strong>
          </p>
        ) : null}
      </div>
      {data?.note ? <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs text-text-secondary">{data.note}</p> : null}
      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey={`bd.mushak_${register}`}
          exportName={`mushak-${register}-${period}`}
          columns={columns}
          rows={data?.rows ?? []}
          getRowId={(r) => String(r.bill_id ?? r.invoice_id)}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">Nothing recorded for this month.</p>}
        />
      </div>
    </>
  );
}
