import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type BondRegister, type BondRegisterRow } from "@/api/client";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { listPageTableCardClass } from "@/components/app/listPageLayout";
import { logApiError } from "@/utils/logApiError";
import { btnSecondary, errMsg, inputClass, labelClass, num } from "./shared";

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function BondRegisterTab() {
  const [filters, setFilters] = useState({ from_date: monthStart(), to_date: "", ud_no: "" });
  const [data, setData] = useState<BondRegister | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getBondRegister(filters));
    } catch (e) {
      logApiError("BondRegisterTab.load", e);
      toast.error(errMsg(e, "Could not load bond register"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<GridColumn<BondRegisterRow>[]>(
    () => [
      { id: "date", header: "Date", value: (r) => r.entry_date ?? "", cell: (r) => r.entry_date ?? "—" },
      { id: "reference", header: "Reference", alwaysVisible: true, value: (r) => r.reference_no ?? "", cell: (r) => r.reference_no ?? "—" },
      {
        id: "type",
        header: "Movement",
        value: (r) => r.entry_type,
        cell: (r) => (r.entry_type === "IMPORT" ? <span className="text-emerald-700">Import</span> : <span className="text-amber-700">Consumed / export</span>),
      },
      { id: "ud_no", header: "UD no.", value: (r) => r.ud_no ?? "", cell: (r) => r.ud_no ?? "—" },
      { id: "up_no", header: "UP no.", defaultHidden: true, value: (r) => r.up_no ?? "", cell: (r) => r.up_no ?? "—" },
      { id: "item", header: "Item", value: (r) => r.item_description ?? "", cell: (r) => r.item_description ?? "—" },
      { id: "in", header: "In qty", align: "right", value: (r) => Number(r.in_qty), cell: (r) => (Number(r.in_qty) ? num(r.in_qty, 4) : "") },
      { id: "out", header: "Out qty", align: "right", value: (r) => Number(r.out_qty), cell: (r) => (Number(r.out_qty) ? num(r.out_qty, 4) : "") },
      { id: "balance", header: "Item balance", align: "right", value: (r) => Number(r.balance_qty), cell: (r) => num(r.balance_qty, 4) },
      { id: "value", header: "Value (BDT)", align: "right", value: (r) => Number(r.value_bdt), cell: (r) => num(r.value_bdt) },
    ],
    [],
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className={labelClass}>From</span>
          <input type="date" className={inputClass} value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} />
        </label>
        <label>
          <span className={labelClass}>To</span>
          <input type="date" className={inputClass} value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} />
        </label>
        <label>
          <span className={labelClass}>UD no.</span>
          <input className={inputClass} value={filters.ud_no} placeholder="All" onChange={(e) => setFilters({ ...filters, ud_no: e.target.value })} />
        </label>
        <button type="button" className={btnSecondary} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {data ? (
        <p className="text-xs text-text-secondary">
          Opening balance (before {filters.from_date || "start"}): <strong>{num(data.opening_balance_qty, 4)}</strong> across{" "}
          {data.opening_items} item(s) · Closing balance: <strong>{num(data.closing_balance_qty, 4)}</strong>. Balances are per item; the totals mix units.
        </p>
      ) : null}
      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey="bd.bond_register"
          exportName="bond-register"
          columns={columns}
          rows={data?.rows ?? []}
          getRowId={(r) => r.id}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">No bond movements in this period.</p>}
        />
      </div>
    </>
  );
}
