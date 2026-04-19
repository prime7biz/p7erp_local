import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Printer, Send, Save } from "lucide-react";
import {
  api,
  type VendorResponse,
  type MasterContractRow,
  type ProformaInvoiceCreate,
  type OrderResponse,
  type CustomerResponse,
  type BankAccountResponse,
  type PurchaseOrderResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const INCOTERMS_OPTIONS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CIP", "DAP", "DPU", "DDP"] as const;
const PAYMENT_TERM_OPTIONS = [
  "LC",
  "TT in Advance",
  "TT 30 days",
  "TT 60 days",
  "CAD",
  "DP",
  "DA",
  "Other",
] as const;
const CURRENCY_OPTIONS = ["USD", "EUR", "BDT", "GBP", "JPY", "CNY", "INR"] as const;
const DOCUMENTS_OPTIONS = [
  "Commercial Invoice",
  "Packing List",
  "Bill of Lading",
  "REX",
  "Beneficiary Certificate",
  "Certificate of Origin",
] as const;

type FormState = ProformaInvoiceCreate & {
  terms_and_conditions: string[];
};

const defaultForm = (): FormState => ({
  order_ids: [],
  direction: "EXPORT",
  vendor_id: undefined,
  master_contract_id: undefined,
  purchase_order_id: undefined,
  reference: "",
  status: "DRAFT",
  invoice_date: "",
  amount: undefined,
  buyer_name: "",
  buyer_address: "",
  buyer_bank_details: "",
  consignee_name: "",
  consignee_address: "",
  notify_party_name: "",
  notify_party_address: "",
  beneficiary_name: "",
  beneficiary_address: "",
  terms_of_shipping: "",
  terms_of_payment: "",
  shipping_country: "",
  destination_port_or_airport: "",
  shipment_port: "",
  documents_to_provide: [],
  terms_and_conditions: [""],
  currency: "USD",
  shipper_bank_account_id: undefined,
  shipper_bank_account_number: "",
  shipper_bank_branch: "",
  shipper_bank_name: "",
  shipper_bank_account_name: "",
  shipper_bank_address: "",
  shipper_bank_swift: "",
});

export function ProformaInvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = id != null && id !== "new";
  const numericId = isEdit ? Number(id) : 0;

  const [form, setForm] = useState<FormState>(defaultForm);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountResponse[]>([]);
  const [vendors, setVendors] = useState<VendorResponse[]>([]);
  const [masterContracts, setMasterContracts] = useState<MasterContractRow[]>([]);
  const [issuedBlockedOrderIds, setIssuedBlockedOrderIds] = useState<number[]>([]);
  const [vendorPurchaseOrders, setVendorPurchaseOrders] = useState<PurchaseOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const selectedOrders = useMemo(
    () => orders.filter((o) => form.order_ids.includes(o.id)),
    [orders, form.order_ids]
  );

  const blockedOrderSet = useMemo(() => new Set(issuedBlockedOrderIds), [issuedBlockedOrderIds]);

  const ordersForExportPicker = useMemo(() => {
    if (form.direction !== "EXPORT") return orders;
    return orders.filter(
      (o) => !blockedOrderSet.has(o.id) || form.order_ids.includes(o.id)
    );
  }, [orders, form.direction, form.order_ids, blockedOrderSet]);

  const importFlowIncomplete =
    form.direction === "IMPORT" &&
    (!form.vendor_id || !form.master_contract_id || !form.purchase_order_id);
  const exportFlowIncomplete = form.direction === "EXPORT" && form.order_ids.length === 0;
  const saveIssueBlocked = importFlowIncomplete || exportFlowIncomplete;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [ordersList, customersList, banksList, vendorsList, masterContractsList, blockedExport] =
          await Promise.all([
          api.listOrders({ limit: 500, offset: 0 }),
          api.listCustomers(),
          api.listBankAccounts().catch((e) => {
            logApiError("ProformaInvoiceFormPage.listBankAccounts", e);
            return [];
          }),
          api.listVendors().catch((e) => {
            logApiError("ProformaInvoiceFormPage.listVendors", e);
            return [];
          }),
          api.listMasterContracts().catch((e) => {
            logApiError("ProformaInvoiceFormPage.listMasterContracts", e);
            return [];
          }),
          api.getIssuedExportProformaOrderIds().catch((e) => {
            logApiError("ProformaInvoiceFormPage.getIssuedExportProformaOrderIds", e);
            return { order_ids: [] as number[] };
          }),
        ]);
        setIssuedBlockedOrderIds(blockedExport.order_ids ?? []);
        setOrders(ordersList);
        setCustomers(customersList);
        setBankAccounts(banksList);
        setVendors(vendorsList as VendorResponse[]);
        setMasterContracts(masterContractsList as MasterContractRow[]);
        if (isEdit && Number.isFinite(numericId)) {
          const pi = await api.getProformaInvoice(numericId);
          const orderIds = (pi.order_ids ?? (pi.order_id != null ? [pi.order_id] : [])) as number[];
          setForm({
            order_ids: orderIds,
            direction: (pi.direction as "EXPORT" | "IMPORT") ?? "EXPORT",
            vendor_id: (pi.vendor_id as number | undefined) ?? undefined,
            master_contract_id: (pi.master_contract_id as number | undefined) ?? undefined,
            purchase_order_id: (pi.purchase_order_id as number | undefined) ?? undefined,
            reference: pi.reference ?? "",
            status: (pi.status as FormState["status"]) ?? "DRAFT",
            invoice_date: pi.invoice_date ?? "",
            amount: pi.amount ?? undefined,
            buyer_name: pi.buyer_name ?? "",
            buyer_address: pi.buyer_address ?? "",
            buyer_bank_details: pi.buyer_bank_details ?? "",
            consignee_name: pi.consignee_name ?? "",
            consignee_address: pi.consignee_address ?? "",
            notify_party_name: pi.notify_party_name ?? "",
            notify_party_address: pi.notify_party_address ?? "",
            beneficiary_name: pi.beneficiary_name ?? "",
            beneficiary_address: pi.beneficiary_address ?? "",
            terms_of_shipping: pi.terms_of_shipping ?? "",
            terms_of_payment: pi.terms_of_payment ?? "",
            shipping_country: pi.shipping_country ?? "",
            destination_port_or_airport: pi.destination_port_or_airport ?? "",
            shipment_port: pi.shipment_port ?? "",
            documents_to_provide: pi.documents_to_provide ?? [],
            terms_and_conditions: Array.isArray(pi.terms_and_conditions) && pi.terms_and_conditions.length > 0
              ? pi.terms_and_conditions
              : [""],
            currency: pi.currency ?? "USD",
            shipper_bank_account_id: pi.shipper_bank_account_id ?? undefined,
            shipper_bank_account_number: "",
            shipper_bank_branch: "",
            shipper_bank_name: "",
            shipper_bank_account_name: "",
            shipper_bank_address: "",
            shipper_bank_swift: "",
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load form data");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [isEdit, numericId]);

  useEffect(() => {
    if (form.direction !== "IMPORT" || !form.vendor_id) {
      setVendorPurchaseOrders([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const rows = await api.listPurchaseOrders({
          vendor_id: form.vendor_id ?? undefined,
          exclude_po_linked_to_proforma: 1,
          exclude_linked_to_proforma_invoice_id:
            isEdit && numericId > 0 ? numericId : undefined,
        });
        if (!cancelled) setVendorPurchaseOrders(rows);
      } catch (e) {
        logApiError("ProformaInvoiceFormPage.listPurchaseOrders", e);
        if (!cancelled) setVendorPurchaseOrders([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [form.direction, form.vendor_id, isEdit, numericId]);

  const toggleOrder = (orderId: number) => {
    setForm((prev) => ({
      ...prev,
      order_ids: prev.order_ids.includes(orderId)
        ? prev.order_ids.filter((x) => x !== orderId)
        : [...prev.order_ids, orderId],
    }));
  };

  const setTermsAndCondition = (index: number, value: string) => {
    setForm((prev) => {
      const next = [...prev.terms_and_conditions];
      next[index] = value;
      return { ...prev, terms_and_conditions: next };
    });
  };
  const addTerm = () => {
    setForm((prev) => ({ ...prev, terms_and_conditions: [...prev.terms_and_conditions, ""] }));
  };
  const removeTerm = (index: number) => {
    setForm((prev) => ({
      ...prev,
      terms_and_conditions: prev.terms_and_conditions.filter((_, i) => i !== index),
    }));
  };

  const toggleDocument = (doc: string) => {
    setForm((prev) => {
      const list = prev.documents_to_provide ?? [];
      const next = list.includes(doc) ? list.filter((d) => d !== doc) : [...list, doc];
      return { ...prev, documents_to_provide: next };
    });
  };

  const fillShipperFromBank = (accountId: number) => {
    const acc = bankAccounts.find((a) => a.id === accountId);
    if (!acc) return;
    setForm((prev) => ({
      ...prev,
      shipper_bank_account_id: accountId,
      shipper_bank_account_number: acc.account_number ?? "",
      shipper_bank_branch: acc.branch_name ?? "",
      shipper_bank_name: acc.bank_name ?? "",
      shipper_bank_account_name: acc.account_name ?? "",
      shipper_bank_address: "",
      shipper_bank_swift: acc.swift_code ?? "",
    }));
  };

  const buildPayload = (): ProformaInvoiceCreate => {
    const terms = (form.terms_and_conditions ?? []).filter((t) => t.trim() !== "");
    const base: ProformaInvoiceCreate = {
      order_ids: form.order_ids,
      direction: form.direction,
      reference: form.reference || undefined,
      status: form.status || undefined,
      invoice_date: form.invoice_date || undefined,
      amount: form.amount,
      buyer_name: form.buyer_name || undefined,
      buyer_address: form.buyer_address || undefined,
      buyer_bank_details: form.buyer_bank_details || undefined,
      consignee_name: form.consignee_name || undefined,
      consignee_address: form.consignee_address || undefined,
      notify_party_name: form.notify_party_name || undefined,
      notify_party_address: form.notify_party_address || undefined,
      beneficiary_name: form.beneficiary_name || undefined,
      beneficiary_address: form.beneficiary_address || undefined,
      terms_of_shipping: form.terms_of_shipping || undefined,
      terms_of_payment: form.terms_of_payment || undefined,
      shipping_country: form.shipping_country || undefined,
      destination_port_or_airport: form.destination_port_or_airport || undefined,
      shipment_port: form.shipment_port || undefined,
      documents_to_provide: form.documents_to_provide?.length ? form.documents_to_provide : undefined,
      terms_and_conditions: terms.length ? terms : undefined,
      currency: form.currency || undefined,
      shipper_bank_account_id: form.shipper_bank_account_id,
      shipper_bank_account_number: form.shipper_bank_account_number || undefined,
      shipper_bank_branch: form.shipper_bank_branch || undefined,
      shipper_bank_name: form.shipper_bank_name || undefined,
      shipper_bank_account_name: form.shipper_bank_account_name || undefined,
      shipper_bank_address: form.shipper_bank_address || undefined,
      shipper_bank_swift: form.shipper_bank_swift || undefined,
    };
    if (form.direction === "EXPORT") {
      return {
        ...base,
        vendor_id: null,
        master_contract_id: null,
        purchase_order_id: null,
      };
    }
    return {
      ...base,
      vendor_id: form.vendor_id ?? null,
      master_contract_id: form.master_contract_id ?? null,
      purchase_order_id: form.purchase_order_id ?? null,
    };
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.direction === "EXPORT" && form.order_ids.length === 0) {
      setError("Select at least one order.");
      return;
    }
    if (form.direction === "IMPORT") {
      if (!form.vendor_id) {
        setError("Select vendor for import proforma.");
        return;
      }
      if (!form.master_contract_id) {
        setError("Select master contract / LC for import proforma.");
        return;
      }
      if (!form.purchase_order_id) {
        setError("Select a purchase order for import proforma.");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const body = buildPayload();
      if (isEdit) {
        await api.updateProformaInvoice(numericId, body);
        navigate("/app/commercial/proforma-invoices");
      } else {
        const created = await api.createProformaInvoice(body);
        navigate(`/app/commercial/proforma-invoices/${created.id}/edit`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async () => {
    if (!isEdit) return;
    if (form.direction === "EXPORT" && form.order_ids.length === 0) {
      setError("Select at least one order.");
      return;
    }
    if (form.direction === "IMPORT") {
      if (!form.vendor_id) {
        setError("Select vendor for import proforma.");
        return;
      }
      if (!form.master_contract_id) {
        setError("Select master contract / LC for import proforma.");
        return;
      }
      if (!form.purchase_order_id) {
        setError("Select a purchase order for import proforma.");
        return;
      }
    }
    setIssuing(true);
    setError("");
    try {
      await api.updateProformaInvoice(numericId, buildPayload());
      await api.finalizeProformaInvoice(numericId);
      navigate("/app/commercial/proforma-invoices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Issue failed");
    } finally {
      setIssuing(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/20";
  const labelClass = "mb-1.5 block text-sm font-medium text-text-secondary";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface-raised py-16 text-text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-indigo-600" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-text-primary">
            <FileText className="h-7 w-7 text-brand-primary" aria-hidden />
            {isEdit ? "Edit Proforma Invoice" : "Create Proforma Invoice"}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {isEdit ? "Update details, save as draft, or issue. Use Print to open the printable template." : "Select orders and fill commercial details."}
          </p>
        </div>
        <Link
          to="/app/commercial/proforma-invoices"
          className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to list
        </Link>
        {isEdit && numericId > 0 ? (
          <Link
            to={`/app/commercial/master-contracts?proforma_invoice_id=${numericId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-2 text-sm font-medium text-status-info-foreground hover:bg-status-info-subtle/80"
          >
            Create Master Contract
          </Link>
        ) : null}
      </header>

      {error && (
        <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <form onSubmit={handleSaveDraft} className="space-y-8">
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Flow linkage</h2>
            <p className="mt-0.5 text-xs text-text-muted">Define whether this PI is export (our PI) or import (vendor PI).</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass}>Direction</label>
              <select
                value={form.direction ?? "EXPORT"}
                onChange={(e) => {
                  const next = e.target.value as "EXPORT" | "IMPORT";
                  setForm((prev) => ({
                    ...prev,
                    direction: next,
                    order_ids: next === "IMPORT" ? [] : prev.order_ids,
                    master_contract_id: next === "EXPORT" ? undefined : prev.master_contract_id,
                    vendor_id: next === "EXPORT" ? undefined : prev.vendor_id,
                    purchase_order_id: next === "EXPORT" ? undefined : prev.purchase_order_id,
                  }));
                }}
                className={inputClass}
              >
                <option value="EXPORT">EXPORT (Our PI to customer)</option>
                <option value="IMPORT">IMPORT (Vendor PI to us)</option>
              </select>
            </div>
            {form.direction === "IMPORT" ? (
              <>
                <div>
                  <label className={labelClass}>Master Contract / LC (required)</label>
                  <select
                    value={form.master_contract_id ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        master_contract_id: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className={inputClass}
                    required
                  >
                    <option value="">Select master contract</option>
                    {masterContracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.reference || `#${c.id}`} ({c.contract_type || "—"})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Vendor (required)</label>
                  <select
                    value={form.vendor_id ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        vendor_id: e.target.value ? Number(e.target.value) : undefined,
                        purchase_order_id: undefined,
                      }))
                    }
                    className={inputClass}
                    required
                  >
                    <option value="">Select vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vendor_code} - {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Purchase order (required)</label>
                  <select
                    value={form.purchase_order_id ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        purchase_order_id: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className={inputClass}
                    disabled={!form.vendor_id}
                    required
                  >
                    <option value="">
                      {form.vendor_id ? "Select purchase order" : "Select vendor first"}
                    </option>
                    {vendorPurchaseOrders.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.po_code}
                        {po.source_order_id != null ? ` (order #${po.source_order_id})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <p className="md:col-span-3 rounded-lg border border-border-subtle bg-surface-subtle/50 px-3 py-2 text-xs text-text-muted">
                Customer PI does not use a master contract here; link LC or sales contract after the buyer responds.
              </p>
            )}
          </div>
        </section>

        {/* Orders (mandatory) */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Orders ({form.direction === "IMPORT" ? "optional" : "required"})</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {form.direction === "IMPORT"
                ? "For vendor PI this can stay empty, or link related orders if available."
                : "Select at least one order. Orders already on an issued customer PI are hidden unless selected on this draft."}
            </p>
          </div>
          <div className="p-5">
            <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border-subtle bg-surface-subtle/50 p-3">
              {(form.direction === "EXPORT" ? ordersForExportPicker : orders).map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 hover:bg-surface-raised">
                  <input
                    type="checkbox"
                    checked={form.order_ids.includes(o.id)}
                    onChange={() => toggleOrder(o.id)}
                    className="h-4 w-4 rounded border-border-strong text-brand-primary focus:ring-focus-ring"
                  />
                  <span className="text-sm text-text-secondary">
                    {o.order_code} — {customerMap.get(o.customer_id)?.name ?? `#${o.customer_id}`} — Qty: {o.quantity ?? "—"} — Delivery: {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "—"}
                  </span>
                </label>
              ))}
            </div>
            {selectedOrders.length > 0 && (
              <div className="mt-4 rounded-lg border border-border bg-surface-subtle p-4">
                <div className="mb-2 text-sm font-medium text-text-secondary">Selected ({selectedOrders.length})</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
                  {selectedOrders.map((o) => (
                    <li key={o.id}>
                      {o.order_code} — {customerMap.get(o.customer_id)?.name ?? `#${o.customer_id}`} — {o.quantity ?? "—"} pcs — {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "—"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Buyer */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Buyer</h2>
            <p className="mt-0.5 text-xs text-text-muted">Buyer / importer details.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={form.buyer_name ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, buyer_name: e.target.value }))}
                className={inputClass}
                placeholder="Buyer company name"
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <textarea
                value={form.buyer_address ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, buyer_address: e.target.value }))}
                rows={2}
                className={inputClass}
                placeholder="Full address"
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Bank details (optional)</label>
              <textarea
                value={form.buyer_bank_details ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, buyer_bank_details: e.target.value }))}
                rows={3}
                className={inputClass}
                placeholder="Bank name, account, etc."
              />
            </div>
          </div>
        </section>

        {/* Consignee & Notify party — two columns */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
            <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
              <h2 className="text-base font-semibold text-text-primary">Consignee</h2>
              <p className="mt-0.5 text-xs text-text-muted">Consignee details.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={form.consignee_name ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, consignee_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <textarea
                  value={form.consignee_address ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, consignee_address: e.target.value }))}
                  rows={2}
                  className={inputClass}
                />
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
            <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
              <h2 className="text-base font-semibold text-text-primary">Notify party</h2>
              <p className="mt-0.5 text-xs text-text-muted">Notify party details.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={form.notify_party_name ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, notify_party_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <textarea
                  value={form.notify_party_address ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, notify_party_address: e.target.value }))}
                  rows={2}
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Beneficiary / Shipper */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Beneficiary / Shipper</h2>
            <p className="mt-0.5 text-xs text-text-muted">Beneficiary or shipper details.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <div>
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={form.beneficiary_name ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, beneficiary_name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <textarea
                value={form.beneficiary_address ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, beneficiary_address: e.target.value }))}
                rows={2}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Shipping terms & Invoice details */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Shipping terms &amp; ports</h2>
            <p className="mt-0.5 text-xs text-text-muted">Incoterms, payment, ports.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelClass}>Terms of shipping (INCOTERMS)</label>
              <select
                value={form.terms_of_shipping ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, terms_of_shipping: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select</option>
                {INCOTERMS_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Terms of payment</label>
              <select
                value={form.terms_of_payment ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, terms_of_payment: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select</option>
                {PAYMENT_TERM_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select
                value={form.currency ?? "USD"}
                onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                className={inputClass}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Shipping country</label>
              <input
                type="text"
                value={form.shipping_country ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, shipping_country: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Destination port / airport</label>
              <input
                type="text"
                value={form.destination_port_or_airport ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, destination_port_or_airport: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Shipment port</label>
              <input
                type="text"
                value={form.shipment_port ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, shipment_port: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Invoice details */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Invoice details</h2>
            <p className="mt-0.5 text-xs text-text-muted">Reference, date, and amount.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
            <div>
              <label className={labelClass}>Reference</label>
              <input
                type="text"
                value={form.reference ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
                className={inputClass}
                placeholder="e.g. PI-2024-001"
              />
            </div>
            <div>
              <label className={labelClass}>Invoice date</label>
              <input
                type="date"
                value={form.invoice_date ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, invoice_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Amount</label>
              <input
                type="number"
                step="any"
                value={form.amount ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Documents to be provided */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Documents to be provided</h2>
            <p className="mt-0.5 text-xs text-text-muted">Check all documents that will be supplied.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 p-5">
            {DOCUMENTS_OPTIONS.map((doc) => (
              <label key={doc} className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={(form.documents_to_provide ?? []).includes(doc)}
                  onChange={() => toggleDocument(doc)}
                  className="h-4 w-4 rounded border-border-strong text-brand-primary focus:ring-focus-ring"
                />
                <span className="text-sm text-text-secondary">{doc}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Terms and conditions */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Terms and conditions</h2>
            <p className="mt-0.5 text-xs text-text-muted">Add one or more terms.</p>
          </div>
          <div className="space-y-3 p-5">
            {(form.terms_and_conditions ?? [""]).map((term, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={term}
                  onChange={(e) => setTermsAndCondition(index, e.target.value)}
                  className={`flex-1 ${inputClass}`}
                  placeholder="Term or condition"
                />
                <button
                  type="button"
                  onClick={() => removeTerm(index)}
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addTerm}
              className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
            >
              Add term
            </button>
          </div>
        </section>

        {/* Shipper bank */}
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
            <h2 className="text-base font-semibold text-text-primary">Shipper bank</h2>
            <p className="mt-0.5 text-xs text-text-muted">Bank details for payment.</p>
          </div>
          <div className="p-5">
            {bankAccounts.length > 0 && (
              <div className="mb-4">
                <label className={labelClass}>Fill from saved account (optional)</label>
                <select
                  value={form.shipper_bank_account_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined;
                    if (v != null) fillShipperFromBank(v);
                  }}
                  className={`max-w-md ${inputClass}`}
                >
                  <option value="">— Select bank account —</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_name} — {a.bank_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Account number</label>
                <input
                  type="text"
                  value={form.shipper_bank_account_number ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipper_bank_account_number: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Branch</label>
                <input
                  type="text"
                  value={form.shipper_bank_branch ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipper_bank_branch: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Bank name</label>
                <input
                  type="text"
                  value={form.shipper_bank_name ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipper_bank_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Account name</label>
                <input
                  type="text"
                  value={form.shipper_bank_account_name ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipper_bank_account_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Bank address</label>
                <input
                  type="text"
                  value={form.shipper_bank_address ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipper_bank_address: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>SWIFT</label>
                <input
                  type="text"
                  value={form.shipper_bank_swift ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipper_bank_swift: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-subtle/50 px-5 py-4">
          <button
            type="submit"
            disabled={saving || saveIssueBlocked}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow-sm hover:bg-brand-primary/90 disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : "Save as Draft"}
          </button>
          {isEdit && (
            <>
              <button
                type="button"
                onClick={handleIssue}
                disabled={issuing || saveIssueBlocked}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-status-success bg-status-success-subtle px-5 py-2.5 text-sm font-semibold text-status-success-foreground hover:bg-status-success-subtle disabled:opacity-70"
              >
                <Send className="h-4 w-4" aria-hidden />
                {issuing ? "Issuing…" : "Issue"}
              </button>
              <Link
                to={`/app/commercial/proforma-invoices/${numericId}/print`}
                className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-5 py-2.5 text-sm font-semibold text-text-secondary shadow-sm hover:bg-surface-subtle"
              >
                <Printer className="h-4 w-4" aria-hidden />
                Print
              </Link>
            </>
          )}
          <Link
            to="/app/commercial/proforma-invoices"
            className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
