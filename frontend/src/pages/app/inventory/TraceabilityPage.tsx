import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, Loader2, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { api, type CertificateType, type MaterialCertificate, type OrderTraceabilityReport } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { buildCsv } from "@/components/app/data-grid/exportRows";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { useConfirm } from "@/components/app/useConfirm";
import { listPageRootClass, listPageTableCardClass } from "@/components/app/listPageLayout";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";

const CERT_TYPES: { value: CertificateType; label: string }[] = [
  { value: "GOTS", label: "GOTS (organic textile)" },
  { value: "OCS", label: "OCS (organic content)" },
  { value: "GRS", label: "GRS (recycled)" },
  { value: "RCS", label: "RCS (recycled claim)" },
  { value: "OEKO_TEX_100", label: "OEKO-TEX Standard 100" },
  { value: "BCI", label: "BCI / Better Cotton" },
  { value: "FSC", label: "FSC (viscose / paper)" },
  { value: "OTHER", label: "Other" },
];
const certLabel = (t: string) => CERT_TYPES.find((c) => c.value === t)?.label.split(" (")[0] ?? t;

const STATUS_STYLE: Record<string, string> = {
  valid: "bg-status-success-subtle text-status-success-foreground",
  expiring: "bg-status-warning-subtle text-status-warning-foreground",
  expired: "bg-status-danger-subtle text-status-danger-foreground",
  not_yet_valid: "bg-status-neutral-subtle text-status-neutral-foreground",
};
const inputClass = "w-full rounded-lg border border-border-strong px-2.5 py-1.5 text-sm focus:border-brand-primary focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-text-secondary";

export function TraceabilityPage() {
  const { me } = useAuth();
  const enabled = me?.feature_flags?.traceability_enabled === true;
  const [tab, setTab] = useState<"certificates" | "report">("report");

  if (!enabled) {
    return (
      <div className={listPageRootClass}>
        <AppPageHeader title="Certificates & order traceability" />
        <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          Traceability is turned off for this company. An admin can enable it in{" "}
          <Link to="/app/settings/config" className="font-medium text-brand-primary hover:underline">Settings → Configuration</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Certificates & order traceability"
        description="Keep supplier and material certificates current, and show buyers which fabric lots, suppliers and certificates went into each order."
      />
      <div role="tablist" className="flex gap-1 border-b border-border print:hidden">
        {(
          [
            ["report", "Order traceability"],
            ["certificates", "Certificates"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "report" ? <OrderReport /> : <Certificates />}
    </div>
  );
}

/* ------------------------------------------------------------------ order report */

function OrderReport() {
  const [orders, setOrders] = useState<{ id: number; label: string }[]>([]);
  const [orderId, setOrderId] = useState("");
  const [report, setReport] = useState<OrderTraceabilityReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .listOrdersPaginated({ page: 1, page_size: 200 })
      .then((r) => setOrders(r.items.map((o) => ({ id: o.id, label: `${o.order_code}${o.customer_name ? ` · ${o.customer_name}` : ""}` }))))
      .catch((e) => logApiError("TraceabilityPage.orders", e));
  }, []);

  useEffect(() => {
    if (!orderId) {
      setReport(null);
      return;
    }
    setLoading(true);
    api
      .getOrderTraceability(Number(orderId))
      .then(setReport)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load the report"))
      .finally(() => setLoading(false));
  }, [orderId]);

  const exportCsv = () => {
    if (!report) return;
    type Row = OrderTraceabilityReport["fabric_lots"][number];
    const csv = buildCsv<Row>(
      [
        { id: "order", header: "Order", cell: () => null, value: () => report.order_code },
        { id: "ticket", header: "Cut ticket", cell: () => null, value: (r) => r.cut_ticket_code },
        { id: "lot", header: "Fabric lot", cell: () => null, value: (r) => r.batch_number },
        { id: "rolls", header: "Rolls", cell: () => null, value: (r) => r.roll_numbers ?? "" },
        { id: "material", header: "Material", cell: () => null, value: (r) => r.item_name ?? "" },
        { id: "qty", header: "Qty used", cell: () => null, value: (r) => r.qty_used ?? "" },
        { id: "supplier", header: "Supplier", cell: () => null, value: (r) => r.supplier_name ?? "" },
        { id: "grn", header: "Goods receipt", cell: () => null, value: (r) => r.grn_code ?? "" },
        { id: "received", header: "Received", cell: () => null, value: (r) => r.received_date ?? "" },
        {
          id: "certs",
          header: "Certificates (status on receipt)",
          cell: () => null,
          value: (r) => r.certificates.map((c) => `${certLabel(c.cert_type)} ${c.certificate_number} (${c.status_on_receipt})`).join("; "),
        },
      ],
      report.fabric_lots,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `traceability-${report.order_code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="w-80 max-w-full">
          <label className={labelClass} htmlFor="tr-order">Order</label>
          <select id="tr-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inputClass}>
            <option value="">Select an order…</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        {report ? (
          <>
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle">
              <Download className="h-4 w-4" aria-hidden /> Export CSV for buyer
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle">
              <Printer className="h-4 w-4" aria-hidden /> Print
            </button>
          </>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-text-muted"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden />Loading…</p> : null}
      {report && !loading ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <h2 className="text-base font-semibold text-text-primary">
              {report.order_code} {report.style_ref ? `· ${report.style_ref}` : ""}
            </h2>
            <p className="text-sm text-text-secondary">Buyer: {report.customer_name ?? "—"}</p>
          </div>

          {report.gaps.length ? (
            <div className="rounded-xl border border-status-warning/40 bg-status-warning-subtle p-4" role="status">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-status-warning-foreground">
                <AlertTriangle className="h-4 w-4" aria-hidden /> {report.gaps.length} gap(s) to fix before sending to the buyer
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-status-warning-foreground">
                {report.gaps.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-status-success/40 bg-status-success-subtle p-3 text-sm text-status-success-foreground">
              Every cut ticket has fabric lots recorded and every lot has a certificate valid on its receipt date.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
            <table className="min-w-full text-sm">
              <caption className="px-4 pt-3 text-left text-sm font-semibold text-text-primary">Fabric → cut ticket</caption>
              <thead className="text-xs uppercase text-text-muted">
                <tr>
                  {["Cut ticket", "Fabric lot / rolls", "Material", "Supplier · goods receipt", "Certificates on receipt date"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.fabric_lots.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-text-muted">No fabric lots recorded on this order's cut tickets yet.</td></tr>
                ) : (
                  report.fabric_lots.map((l) => (
                    <tr key={l.id} className="border-t border-border-subtle align-top">
                      <td className="px-4 py-2 font-medium text-text-primary">{l.cut_ticket_code}</td>
                      <td className="px-4 py-2">{l.batch_number}{l.roll_numbers ? <div className="text-xs text-text-muted">Rolls {l.roll_numbers}</div> : null}</td>
                      <td className="px-4 py-2">{l.item_name ?? "—"}{l.qty_used ? <div className="text-xs text-text-muted">Used {Number(l.qty_used).toLocaleString()}</div> : null}</td>
                      <td className="px-4 py-2">{l.supplier_name ?? "—"}<div className="text-xs text-text-muted">{l.grn_code ?? "no goods receipt"} {l.received_date ? `· ${l.received_date}` : ""}</div></td>
                      <td className="px-4 py-2">
                        {l.certificates.length === 0 ? (
                          <span className="text-xs text-status-danger-foreground">None on record</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {l.certificates.map((c) => (
                              <li key={`${c.cert_type}-${c.certificate_number}`} className="text-xs">
                                <span className={`mr-1 rounded-full px-1.5 py-0.5 font-semibold ${STATUS_STYLE[c.status_on_receipt] ?? ""}`}>{c.status_on_receipt}</span>
                                {certLabel(c.cert_type)} {c.certificate_number}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <h3 className="text-sm font-semibold text-text-primary">Cut tickets & bundles</h3>
              <ul className="mt-2 space-y-1 text-sm text-text-secondary">
                {report.cut_tickets.length === 0 ? <li className="text-text-muted">None yet.</li> : null}
                {report.cut_tickets.map((t) => (
                  <li key={t.id}>
                    <span className="font-medium text-text-primary">{t.ticket_code}</span> · {t.bundle_count} bundles · {t.bundle_pcs.toLocaleString()} pcs
                    {t.cut_date ? ` · cut ${t.cut_date}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <h3 className="text-sm font-semibold text-text-primary">Packing lists</h3>
              <ul className="mt-2 space-y-1 text-sm text-text-secondary">
                {report.packing_lists.length === 0 ? <li className="text-text-muted">None yet.</li> : null}
                {report.packing_lists.map((p) => (
                  <li key={p.packing_list_number}>
                    <span className="font-medium text-text-primary">{p.packing_list_number}</span> · {p.total_cartons} cartons · {p.status}
                    {p.packing_date ? ` · ${p.packing_date}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ certificates */

function Certificates() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<MaterialCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [vendors, setVendors] = useState<{ id: number; name: string }[]>([]);
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const empty = { id: 0, cert_type: "GOTS" as CertificateType, certificate_number: "", issuer: "", vendor_id: "", item_id: "", valid_from: "", valid_until: "" };
  const [form, setForm] = useState(empty);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listMaterialCertificates());
    } catch (e) {
      logApiError("TraceabilityPage.certs", e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    Promise.all([api.listVendorsPaginated({ is_active: true, page: 1, page_size: 500 }), api.listInventoryItemsPaginated({ page: 1, page_size: 500 })])
      .then(([v, i]) => {
        setVendors(v.items.map((x) => ({ id: x.id, name: x.name })));
        setItems(i.items.map((x) => ({ id: x.id, name: x.name })));
      })
      .catch((e) => logApiError("TraceabilityPage.options", e));
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveMaterialCertificate(
        {
          cert_type: form.cert_type,
          certificate_number: form.certificate_number,
          issuer: form.issuer || null,
          vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
          item_id: form.item_id ? Number(form.item_id) : null,
          valid_from: form.valid_from || null,
          valid_until: form.valid_until || null,
        },
        form.id || undefined,
      );
      toast.success(form.id ? "Certificate updated" : "Certificate added");
      setForm(empty);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the certificate");
    }
  };

  const columns = useMemo<GridColumn<MaterialCertificate>[]>(
    () => [
      { id: "type", header: "Type", value: (c) => certLabel(c.cert_type), cell: (c) => certLabel(c.cert_type) },
      { id: "number", header: "Certificate no.", alwaysVisible: true, value: (c) => c.certificate_number, cell: (c) => <span className="font-medium text-text-primary">{c.certificate_number}</span> },
      { id: "issuer", header: "Issued by", value: (c) => c.issuer ?? "", cell: (c) => c.issuer ?? "—" },
      { id: "supplier", header: "Supplier", value: (c) => c.vendor_name ?? "", cell: (c) => c.vendor_name ?? "Any supplier" },
      { id: "material", header: "Material", value: (c) => c.item_name ?? "", cell: (c) => c.item_name ?? "All materials" },
      { id: "until", header: "Valid until", value: (c) => c.valid_until ?? "", cell: (c) => c.valid_until ?? "—" },
      {
        id: "status",
        header: "Status",
        value: (c) => c.status,
        cell: (c) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>{c.status.replace(/_/g, " ")}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        alwaysVisible: true,
        noExport: true,
        enableSorting: false,
        cell: (c) => (
          <RowActionsMenu
            rowId={c.id}
            openId={openId}
            onOpenChange={setOpenId}
            items={[
              {
                key: "edit",
                label: "Edit",
                onClick: () =>
                  setForm({
                    id: c.id,
                    cert_type: c.cert_type,
                    certificate_number: c.certificate_number,
                    issuer: c.issuer ?? "",
                    vendor_id: c.vendor_id ? String(c.vendor_id) : "",
                    item_id: c.item_id ? String(c.item_id) : "",
                    valid_from: c.valid_from ?? "",
                    valid_until: c.valid_until ?? "",
                  }),
              },
              {
                key: "delete",
                label: "Delete",
                danger: true,
                onClick: async () => {
                  if (!(await confirm({ title: `Delete certificate ${c.certificate_number}?`, danger: true, confirmLabel: "Delete" }))) return;
                  await api.deleteMaterialCertificate(c.id).catch((e) => toast.error(e instanceof Error ? e.message : "Delete failed"));
                  await load();
                },
              },
            ]}
          />
        ),
      },
    ],
    [confirm, load, openId],
  );

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="space-y-4">
      <form onSubmit={save} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="text-sm font-semibold text-text-primary sm:col-span-2 lg:col-span-4">{form.id ? "Edit certificate" : "Add a certificate"}</h2>
        <div>
          <label className={labelClass} htmlFor="mc-type">Type</label>
          <select id="mc-type" value={form.cert_type} onChange={set("cert_type")} className={inputClass}>
            {CERT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="mc-number">Certificate number *</label>
          <input id="mc-number" required maxLength={100} value={form.certificate_number} onChange={set("certificate_number")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="mc-issuer">Issued by (certification body)</label>
          <input id="mc-issuer" maxLength={160} value={form.issuer} onChange={set("issuer")} placeholder="e.g. Control Union" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="mc-supplier">Supplier holding it</label>
          <select id="mc-supplier" value={form.vendor_id} onChange={set("vendor_id")} className={inputClass}>
            <option value="">—</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="mc-item">Material it covers</label>
          <select id="mc-item" value={form.item_id} onChange={set("item_id")} className={inputClass}>
            <option value="">—</option>
            {items.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="mc-from">Valid from</label>
          <input id="mc-from" type="date" value={form.valid_from} onChange={set("valid_from")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="mc-until">Valid until</label>
          <input id="mc-until" type="date" value={form.valid_until} onChange={set("valid_until")} className={inputClass} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90">
            <Plus className="h-4 w-4" aria-hidden /> {form.id ? "Save" : "Add"}
          </button>
          {form.id ? (
            <button type="button" onClick={() => setForm(empty)} className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey="traceability.certificates"
          exportName="certificates"
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">No certificates recorded yet.</p>}
        />
      </div>
    </section>
  );
}
