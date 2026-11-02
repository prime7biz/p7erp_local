import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type UdBodyInput, type UdDetail, type UdEntitlementInput, type UdListItem, type UdStatus } from "@/api/client";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { useConfirm } from "@/components/app/useConfirm";
import { listPageTableCardClass } from "@/components/app/listPageLayout";
import { logApiError } from "@/utils/logApiError";
import { btnPrimary, btnSecondary, errMsg, inputClass, labelClass, num, UD_STATUS_BADGE } from "./shared";

const EMPTY_LINE: UdEntitlementInput = { item_description: "", uom: "", hs_code: "", entitled_qty: "", entitled_value_usd: "" };

function emptyForm(): UdBodyInput {
  return {
    ud_no: "",
    amendment_no: 0,
    ud_date: new Date().toISOString().slice(0, 10),
    issuer: "BGMEA",
    export_lc_no: "",
    buyer_name: "",
    export_value_usd: "",
    garment_qty: "",
    expiry_date: "",
    notes: "",
    entitlements: [{ ...EMPTY_LINE }],
  };
}

function formFromDetail(d: UdDetail): UdBodyInput {
  return {
    ud_no: d.ud_no,
    amendment_no: d.amendment_no,
    ud_date: d.ud_date ?? "",
    issuer: d.issuer,
    trade_case_id: d.trade_case_id,
    export_lc_no: d.export_lc_no ?? "",
    buyer_name: d.buyer_name ?? "",
    export_value_usd: d.export_value_usd ?? "",
    garment_qty: d.garment_qty ?? "",
    expiry_date: d.expiry_date ?? "",
    notes: d.notes ?? "",
    entitlements: d.entitlements.map((e) => ({
      id: e.id,
      item_description: e.item_description,
      uom: e.uom ?? "",
      hs_code: e.hs_code ?? "",
      entitled_qty: e.entitled_qty,
      entitled_value_usd: e.entitled_value_usd ?? "",
    })),
  };
}

function cleanBody(f: UdBodyInput): UdBodyInput {
  const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    ...f,
    ud_date: blank(f.ud_date),
    expiry_date: blank(f.expiry_date),
    export_lc_no: blank(f.export_lc_no),
    buyer_name: blank(f.buyer_name),
    export_value_usd: blank(f.export_value_usd),
    garment_qty: blank(f.garment_qty),
    notes: blank(f.notes),
    entitlements: f.entitlements
      .filter((e) => e.item_description.trim())
      .map((e) => ({
        ...e,
        item_description: e.item_description.trim(),
        uom: blank(e.uom),
        hs_code: blank(e.hs_code),
        entitled_qty: e.entitled_qty.trim() || "0",
        entitled_value_usd: blank(e.entitled_value_usd),
      })),
  };
}

export function UdRegisterTab() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<UdListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; form: UdBodyInput } | null>(null);
  const [viewing, setViewing] = useState<UdDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listUds();
      setRows(res.items);
    } catch (e) {
      logApiError("UdRegisterTab.load", e);
      toast.error(errMsg(e, "Could not load UDs"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (id: number) => {
    try {
      setEditing(null);
      setViewing(await api.getUd(id));
    } catch (e) {
      toast.error(errMsg(e, "Could not open UD"));
    }
  }, []);

  const openEdit = useCallback(async (id: number) => {
    try {
      const d = await api.getUd(id);
      setViewing(null);
      setEditing({ id, form: formFromDetail(d) });
    } catch (e) {
      toast.error(errMsg(e, "Could not open UD"));
    }
  }, []);

  const changeStatus = useCallback(
    async (id: number, status: UdStatus) => {
      try {
        const d = await api.setUdStatus(id, status);
        toast.success(`UD ${d.ud_no} is now ${d.status}`);
        if (viewing?.id === id) setViewing(d);
        await load();
      } catch (e) {
        toast.error(errMsg(e, "Could not change status"));
      }
    },
    [load, viewing],
  );

  const columns = useMemo<GridColumn<UdListItem>[]>(
    () => [
      {
        id: "ud_no",
        header: "UD no.",
        alwaysVisible: true,
        value: (r) => r.ud_no,
        cell: (r) => (
          <button type="button" className="font-medium text-brand-primary hover:underline" onClick={() => void openDetail(r.id)}>
            {r.ud_no}
            {r.amendment_no ? <span className="ml-1 text-xs text-text-muted">(amd {r.amendment_no})</span> : null}
          </button>
        ),
      },
      { id: "issuer", header: "Issuer", value: (r) => r.issuer, cell: (r) => r.issuer },
      { id: "ud_date", header: "UD date", value: (r) => r.ud_date ?? "", cell: (r) => r.ud_date ?? "—" },
      { id: "export_lc_no", header: "Export LC / contract", value: (r) => r.export_lc_no ?? "", cell: (r) => r.export_lc_no ?? "—" },
      { id: "buyer", header: "Buyer", value: (r) => r.buyer_name ?? "", cell: (r) => r.buyer_name ?? "—" },
      {
        id: "export_value_usd",
        header: "Export value (USD)",
        align: "right",
        value: (r) => Number(r.export_value_usd ?? 0),
        cell: (r) => num(r.export_value_usd),
      },
      { id: "lines", header: "Import lines", align: "right", value: (r) => r.entitlement_count, cell: (r) => r.entitlement_count },
      {
        id: "expiry",
        header: "Expiry",
        value: (r) => r.expiry_date ?? "",
        cell: (r) => {
          if (!r.expiry_date) return "—";
          const soon = r.status !== "CLOSED" && r.days_to_expiry !== null && r.days_to_expiry <= 30;
          return (
            <span className={soon ? "font-medium text-amber-700" : ""}>
              {r.expiry_date}
              {soon ? ` (${r.days_to_expiry! < 0 ? "expired" : `${r.days_to_expiry}d`})` : ""}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        value: (r) => r.status,
        cell: (r) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${UD_STATUS_BADGE[r.status] ?? ""}`}>{r.status}</span>,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        noExport: true,
        enableSorting: false,
        cell: (r) => {
          const items: RowActionItem[] = [{ key: "view", label: "View utilization", onClick: () => void openDetail(r.id) }];
          if (r.status === "DRAFT") {
            items.push({ key: "edit", label: "Edit", onClick: () => void openEdit(r.id) });
            items.push({ key: "approve", label: "Approve", onClick: () => void changeStatus(r.id, "APPROVED") });
            items.push({
              key: "delete",
              label: "Delete",
              danger: true,
              onClick: async () => {
                const ok = await confirm({ title: `Delete UD ${r.ud_no}?`, description: "This cannot be undone.", confirmLabel: "Delete", danger: true });
                if (!ok) return;
                try {
                  await api.deleteUd(r.id);
                  toast.success("UD deleted");
                  if (viewing?.id === r.id) setViewing(null);
                  await load();
                } catch (e) {
                  toast.error(errMsg(e, "Could not delete UD"));
                }
              },
            });
          }
          if (r.status === "APPROVED") {
            items.push({ key: "draft", label: "Back to draft", onClick: () => void changeStatus(r.id, "DRAFT") });
            items.push({ key: "close", label: "Close UD", onClick: () => void changeStatus(r.id, "CLOSED") });
          }
          return <RowActionsMenu rowId={r.id} openId={openId} onOpenChange={setOpenId} items={items} />;
        },
      },
    ],
    [changeStatus, confirm, load, openDetail, openEdit, openId, viewing],
  );

  const save = async () => {
    if (!editing) return;
    const body = cleanBody(editing.form);
    if (!body.ud_no.trim()) {
      toast.error("UD number is required");
      return;
    }
    setSaving(true);
    try {
      const d = editing.id ? await api.updateUd(editing.id, body) : await api.createUd(body);
      toast.success(editing.id ? "UD updated" : "UD created");
      setEditing(null);
      setViewing(d);
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Could not save UD"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            setViewing(null);
            setEditing({ id: null, form: emptyForm() });
          }}
        >
          <Plus className="h-4 w-4" /> New UD
        </button>
      </div>

      {editing ? (
        <UdEditor
          form={editing.form}
          isNew={editing.id === null}
          saving={saving}
          onChange={(form) => setEditing({ ...editing, form })}
          onCancel={() => setEditing(null)}
          onSave={() => void save()}
        />
      ) : null}

      {viewing ? <UdDetailPanel detail={viewing} onClose={() => setViewing(null)} onChanged={(d) => { setViewing(d); void load(); }} /> : null}

      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey="bd.ud_register"
          exportName="ud-register"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">No UDs yet. Click “New UD” to record one.</p>}
        />
      </div>
    </>
  );
}

function UdEditor({
  form,
  isNew,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  form: UdBodyInput;
  isNew: boolean;
  saving: boolean;
  onChange: (f: UdBodyInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (k: keyof UdBodyInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [k]: k === "amendment_no" ? Number(e.target.value) || 0 : e.target.value });
  const setLine = (idx: number, k: keyof UdEntitlementInput, v: string) =>
    onChange({ ...form, entitlements: form.entitlements.map((l, i) => (i === idx ? { ...l, [k]: v } : l)) });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-4">
      <h2 className="text-sm font-semibold text-text-primary">{isNew ? "New UD" : `Edit UD ${form.ud_no}`}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className={labelClass}>UD number *</span>
          <input className={inputClass} value={form.ud_no} onChange={set("ud_no")} maxLength={64} />
        </label>
        <label>
          <span className={labelClass}>Amendment no.</span>
          <input type="number" min={0} className={inputClass} value={form.amendment_no ?? 0} onChange={set("amendment_no")} />
        </label>
        <label>
          <span className={labelClass}>Issuer</span>
          <select className={inputClass} value={form.issuer} onChange={set("issuer")}>
            {["BGMEA", "BKMEA", "BEPZA", "OTHER"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>UD date</span>
          <input type="date" className={inputClass} value={form.ud_date ?? ""} onChange={set("ud_date")} />
        </label>
        <label>
          <span className={labelClass}>Export LC / contract no.</span>
          <input className={inputClass} value={form.export_lc_no ?? ""} onChange={set("export_lc_no")} maxLength={64} />
        </label>
        <label>
          <span className={labelClass}>Buyer</span>
          <input className={inputClass} value={form.buyer_name ?? ""} onChange={set("buyer_name")} maxLength={255} />
        </label>
        <label>
          <span className={labelClass}>Export value (USD)</span>
          <input inputMode="decimal" className={inputClass} value={form.export_value_usd ?? ""} onChange={set("export_value_usd")} />
        </label>
        <label>
          <span className={labelClass}>Expiry date</span>
          <input type="date" className={inputClass} value={form.expiry_date ?? ""} onChange={set("expiry_date")} />
        </label>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Permitted imports</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-secondary">
                <th className="py-1 pr-2">Item description *</th>
                <th className="py-1 pr-2">HS code</th>
                <th className="py-1 pr-2">UOM</th>
                <th className="py-1 pr-2 text-right">Entitled qty</th>
                <th className="py-1 pr-2 text-right">Value (USD)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.entitlements.map((l, i) => (
                <tr key={l.id ?? `new-${i}`}>
                  <td className="py-1 pr-2">
                    <input className={inputClass} value={l.item_description} onChange={(e) => setLine(i, "item_description", e.target.value)} />
                  </td>
                  <td className="w-28 py-1 pr-2">
                    <input className={inputClass} value={l.hs_code ?? ""} onChange={(e) => setLine(i, "hs_code", e.target.value)} maxLength={16} />
                  </td>
                  <td className="w-24 py-1 pr-2">
                    <input className={inputClass} value={l.uom ?? ""} onChange={(e) => setLine(i, "uom", e.target.value)} maxLength={16} />
                  </td>
                  <td className="w-32 py-1 pr-2">
                    <input inputMode="decimal" className={`${inputClass} text-right`} value={l.entitled_qty} onChange={(e) => setLine(i, "entitled_qty", e.target.value)} />
                  </td>
                  <td className="w-32 py-1 pr-2">
                    <input inputMode="decimal" className={`${inputClass} text-right`} value={l.entitled_value_usd ?? ""} onChange={(e) => setLine(i, "entitled_value_usd", e.target.value)} />
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      aria-label="Remove line"
                      className="rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-600"
                      onClick={() => onChange({ ...form, entitlements: form.entitlements.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="mt-2 text-xs font-medium text-brand-primary hover:underline"
          onClick={() => onChange({ ...form, entitlements: [...form.entitlements, { ...EMPTY_LINE }] })}
        >
          + Add import line
        </button>
      </div>

      <label className="block">
        <span className={labelClass}>Notes</span>
        <textarea className={inputClass} rows={2} value={form.notes ?? ""} onChange={set("notes")} />
      </label>

      <div className="flex gap-2">
        <button type="button" className={btnPrimary} disabled={saving} onClick={onSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save UD
        </button>
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function UdDetailPanel({ detail, onClose, onChanged }: { detail: UdDetail; onClose: () => void; onChanged: (d: UdDetail) => void }) {
  const [entry, setEntry] = useState({ entitlementId: "", type: "IMPORT" as "IMPORT" | "EXPORT", reference: "", qty: "", value: "", date: "" });
  const [busy, setBusy] = useState(false);
  const canRecord = detail.status !== "CLOSED" && detail.entitlements.length > 0;

  const record = async () => {
    if (!entry.entitlementId || !entry.reference.trim() || !entry.qty.trim()) {
      toast.error("Choose an import line and enter a reference and quantity");
      return;
    }
    setBusy(true);
    try {
      await api.createBondEntry({
        reference_no: entry.reference.trim(),
        entry_type: entry.type,
        ud_entitlement_id: Number(entry.entitlementId),
        quantity: entry.qty.trim(),
        value_bdt: entry.value.trim() || null,
        entry_date: entry.date || null,
      });
      toast.success(entry.type === "IMPORT" ? "Import recorded" : "Consumption recorded");
      setEntry((s) => ({ ...s, reference: "", qty: "", value: "" }));
      onChanged(await api.getUd(detail.id));
    } catch (e) {
      toast.error(errMsg(e, "Could not record bond entry"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            UD {detail.ud_no}
            {detail.amendment_no ? ` (amendment ${detail.amendment_no})` : ""} ·{" "}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${UD_STATUS_BADGE[detail.status] ?? ""}`}>{detail.status}</span>
          </h2>
          <p className="text-xs text-text-secondary">
            {detail.issuer} · LC {detail.export_lc_no ?? "—"} · Buyer {detail.buyer_name ?? "—"} · Expiry {detail.expiry_date ?? "—"}
          </p>
        </div>
        <button type="button" className={btnSecondary} onClick={onClose}>
          Close
        </button>
      </div>

      {detail.utilization.warnings.length ? (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {detail.utilization.warnings.map((w, i) => (
            <li key={`${w.kind}-${i}`}>⚠ {w.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-secondary">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">UOM</th>
              <th className="py-2 pr-3 text-right">Entitled</th>
              <th className="py-2 pr-3 text-right">Imported</th>
              <th className="py-2 pr-3 text-right">Consumed</th>
              <th className="py-2 pr-3 text-right">In bond</th>
              <th className="py-2 pr-3 text-right">Remaining entitlement</th>
              <th className="py-2 pr-3 text-right">Used</th>
            </tr>
          </thead>
          <tbody>
            {detail.utilization.lines.map((l) => {
              const over = (l.utilization_pct ?? 0) > 100;
              return (
                <tr key={l.entitlement_id} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    {l.item_description}
                    {l.hs_code ? <span className="ml-1 text-xs text-text-muted">HS {l.hs_code}</span> : null}
                  </td>
                  <td className="py-2 pr-3">{l.uom ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(l.entitled_qty, 4)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(l.imported_qty, 4)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(l.consumed_qty, 4)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(l.in_bond_qty, 4)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${Number(l.remaining_entitlement_qty) < 0 ? "font-semibold text-red-600" : ""}`}>
                    {num(l.remaining_entitlement_qty, 4)}
                  </td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${over ? "font-semibold text-red-600" : ""}`}>
                    {l.utilization_pct === null ? "—" : `${l.utilization_pct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {detail.utilization.lines.length === 0 ? <p className="py-3 text-sm text-text-muted">No permitted import lines yet.</p> : null}
      </div>

      {canRecord ? (
        <div className="rounded-lg border border-border p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Record bond movement</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <label className="lg:col-span-2">
              <span className={labelClass}>Import line</span>
              <select className={inputClass} value={entry.entitlementId} onChange={(e) => setEntry({ ...entry, entitlementId: e.target.value })}>
                <option value="">Choose…</option>
                {detail.entitlements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.item_description}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Movement</span>
              <select className={inputClass} value={entry.type} onChange={(e) => setEntry({ ...entry, type: e.target.value as "IMPORT" | "EXPORT" })}>
                <option value="IMPORT">Import into bond</option>
                <option value="EXPORT">Consumed / exported</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Reference (B/E, invoice…)</span>
              <input className={inputClass} value={entry.reference} onChange={(e) => setEntry({ ...entry, reference: e.target.value })} maxLength={64} />
            </label>
            <label>
              <span className={labelClass}>Quantity</span>
              <input inputMode="decimal" className={inputClass} value={entry.qty} onChange={(e) => setEntry({ ...entry, qty: e.target.value })} />
            </label>
            <label>
              <span className={labelClass}>Value (BDT)</span>
              <input inputMode="decimal" className={inputClass} value={entry.value} onChange={(e) => setEntry({ ...entry, value: e.target.value })} />
            </label>
            <label>
              <span className={labelClass}>Date</span>
              <input type="date" className={inputClass} value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
            </label>
          </div>
          <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => void record()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record
          </button>
        </div>
      ) : null}
    </section>
  );
}
