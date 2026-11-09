import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";

import { api, type PackingListCreate, type PackingListRow, type ShipmentContainerRow, type ShipmentCreate, type ShipmentRow, type TradeCaseRow } from "@/api/client";
import { AutofillReviewPanel } from "@/components/ai-extract/AutofillReviewPanel";
import { ExtractionAlertsBanner } from "@/components/ai-extract/ExtractionAlertsBanner";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import { useCommercialDocExtraction } from "@/hooks/useCommercialDocExtraction";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import type { ConflictResolutionChoice, FieldApplyState } from "@/types/extraction";
import { buildShippingFieldApplyStates } from "@/utils/extractionHelpers";
import { logApiError } from "@/utils/logApiError";
import { EmptyState } from "@/components/ui/EmptyState";
import { todayLocalISO } from "@/lib/dates";
import { saveBlob } from "@/lib/fileSave";

const EMPTY_FORM: ShipmentCreate = {
  trade_case_id: 0,
  reference: "",
  status: "PLANNED",
  carrier: "",
  booking_ref: "",
  bl_awb: "",
  etd: "",
  eta: "",
  origin_port: "",
  dest_port: "",
  notes: "",
};

export function LogisticsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const preselectedTradeCaseId = Number(params.get("trade_case_id") || 0);
  const preselectedOrderId = Number(params.get("order_id") || 0);
  const preselectedChallanId = Number(params.get("delivery_challan_id") || 0);
  const activeTab = (params.get("tab") || (preselectedOrderId || preselectedChallanId ? "packing" : "shipments")).toLowerCase();
  const setTab = (tab: "shipments" | "packing") => {
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    setParams(next, { replace: true });
  };

  const [items, setItems] = useState<ShipmentRow[]>([]);
  const [tradeCases, setTradeCases] = useState<TradeCaseRow[]>([]);
  const [form, setForm] = useState<ShipmentCreate>({
    ...EMPTY_FORM,
    trade_case_id: preselectedTradeCaseId || 0,
  });
  const [filterTradeCaseId, setFilterTradeCaseId] = useState<number | undefined>(
    preselectedTradeCaseId || undefined
  );
  const [filterStatus, setFilterStatus] = useState("");
  const [etdFrom, setEtdFrom] = useState("");
  const [etdTo, setEtdTo] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [packingLists, setPackingLists] = useState<PackingListRow[]>([]);
  const [containers, setContainers] = useState<ShipmentContainerRow[]>([]);
  const [packForm, setPackForm] = useState<PackingListCreate>({
    order_id: preselectedOrderId || null,
    delivery_challan_id: preselectedChallanId || null,
    shipment_id: null,
    total_cartons: 0,
    status: "DRAFT",
  });
  const [containerForm, setContainerForm] = useState({
    shipment_id: 0,
    container_number: "",
    container_type: "40HC",
    seal_number: "",
    loading_status: "EMPTY",
  });
  const [packSaving, setPackSaving] = useState(false);
  const shippingExtract = useCommercialDocExtraction("shipping");
  const [shippingReviewRows, setShippingReviewRows] = useState<FieldApplyState[]>([]);
  const lastShippingResponseRef = useRef<typeof shippingExtract.response>(null);
  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    setError("");
    try {
      const [shipments, cases, packs, conts] = await Promise.all([
        api.listShipments({
          trade_case_id: filterTradeCaseId,
          status: filterStatus || undefined,
        }),
        api.listTradeCases({ limit: 500 }),
        api.listPackingLists({
          order_id: preselectedOrderId || undefined,
          limit: 100,
        }),
        api.listShipmentContainers({ limit: 100 }),
      ]);
      if (!latest.isCurrent(token)) return;
      setItems(shipments);
      setTradeCases(cases);
      setPackingLists(packs);
      setContainers(conts);
    } catch (e) {
      logApiError("LogisticsPage.load", e);
      if (!latest.isCurrent(token)) return;
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load logistics data");
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, filterTradeCaseId, filterStatus, preselectedOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const response = shippingExtract.response;
    if (response === lastShippingResponseRef.current) return;
    lastShippingResponseRef.current = response;
    if (!response) {
      setShippingReviewRows([]);
      return;
    }
    const current: Record<string, string> = {
      reference: form.reference ?? "",
      carrier: form.carrier ?? "",
      booking_ref: form.booking_ref ?? "",
      bl_awb: form.bl_awb ?? "",
      etd: form.etd ?? "",
      eta: form.eta ?? "",
      origin_port: form.origin_port ?? "",
      dest_port: form.dest_port ?? "",
      notes: form.notes ?? "",
    };
    setShippingReviewRows(buildShippingFieldApplyStates(response, current));
    const status = response.suggested_status;
    if (status) {
      setForm((prev) => ({ ...prev, status: status as ShipmentCreate["status"] }));
    }
    const matchId = response.matched_shipment_id;
    if (matchId) {
      const matched = items.find((s) => s.id === matchId);
      if (matched) {
        setEditingId(matched.id);
        setForm({
          trade_case_id: matched.trade_case_id,
          reference: matched.reference,
          status: (status as ShipmentCreate["status"]) || matched.status || "IN_TRANSIT",
          carrier: matched.carrier || "",
          booking_ref: matched.booking_ref || "",
          bl_awb: matched.bl_awb || "",
          etd: matched.etd || "",
          eta: matched.eta || "",
          origin_port: matched.origin_port || "",
          dest_port: matched.dest_port || "",
          notes: matched.notes || "",
        });
      }
    }
  }, [shippingExtract.response, form, items]);

  const applyShippingField = (fieldKey: string) => {
    const row = shippingReviewRows.find((r) => r.fieldKey === fieldKey);
    if (!row || row.skipped) return;
    if (row.hasConflict && row.conflictResolution !== "use_extracted" && row.conflictResolution !== "merge") return;
    setForm((prev) => {
      const next = { ...prev };
      if (fieldKey === "reference") next.reference = row.extractedValue;
      else if (fieldKey === "carrier") next.carrier = row.extractedValue;
      else if (fieldKey === "booking_ref") next.booking_ref = row.extractedValue;
      else if (fieldKey === "bl_awb") next.bl_awb = row.extractedValue;
      else if (fieldKey === "etd") next.etd = row.extractedValue;
      else if (fieldKey === "eta") next.eta = row.extractedValue;
      else if (fieldKey === "origin_port") next.origin_port = row.extractedValue;
      else if (fieldKey === "dest_port") next.dest_port = row.extractedValue;
      else if (fieldKey === "notes" || fieldKey === "container_number") {
        const noteLine =
          fieldKey === "container_number" ? `Container: ${row.extractedValue}` : row.extractedValue;
        next.notes = fieldKey === "notes" ? row.extractedValue : [prev.notes, noteLine].filter(Boolean).join("\n");
      }
      return next;
    });
    setShippingReviewRows((prev) => prev.map((r) => (r.fieldKey === fieldKey ? { ...r, applied: true } : r)));
  };

  const filteredItems = useMemo(() => {
    if (!etdFrom && !etdTo) return items;
    return items.filter((s) => {
      const etd = s.etd ? new Date(s.etd).getTime() : null;
      if (!etd) return !etdFrom && !etdTo;
      const from = etdFrom ? new Date(etdFrom).setHours(0, 0, 0, 0) : null;
      const to = etdTo ? new Date(etdTo).setHours(23, 59, 59, 999) : null;
      if (from != null && etd < from) return false;
      if (to != null && etd > to) return false;
      return true;
    });
  }, [items, etdFrom, etdTo]);

  const exportCsv = useCallback(() => {
    const headers = ["Reference", "Trade Case", "Status", "Carrier", "Booking Ref", "BL/AWB", "ETD", "ETA"];
    const escape = (s: string | number | null | undefined) => {
      const t = String(s ?? "");
      return t.includes(",") || t.includes('"') || t.includes("\n") ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const rows = filteredItems.map((r) =>
      [
        r.reference,
        r.trade_case_id,
        r.status,
        r.carrier ?? "",
        r.booking_ref ?? "",
        r.bl_awb ?? "",
        r.etd ? new Date(r.etd).toLocaleDateString() : "",
        r.eta ? new Date(r.eta).toLocaleDateString() : "",
      ].map(escape).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    void saveBlob(blob, `shipments-${todayLocalISO()}.csv`);
  }, [filteredItems]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.trade_case_id || !form.reference.trim()) {
      setError("Trade case and shipment reference are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await api.updateShipment(editingId, {
          reference: form.reference.trim(),
          status: form.status,
          carrier: form.carrier,
          booking_ref: form.booking_ref,
          bl_awb: form.bl_awb,
          etd: form.etd,
          eta: form.eta,
          origin_port: form.origin_port,
          dest_port: form.dest_port,
          notes: form.notes,
        });
      } else {
        await api.createShipment({
          ...form,
          reference: form.reference.trim(),
        });
      }
      setForm({
        ...EMPTY_FORM,
        trade_case_id: preselectedTradeCaseId || 0,
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save shipment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Logistics</h1>
          <p className="text-sm text-text-muted">
            Shipment booking, BL/AWB tracking, and ETA monitoring linked with trade cases.
          </p>
        </div>
        <Link
          to="/app/trade/cases"
          className="inline-flex items-center rounded-xl border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
        >
          Trade Cases
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>
      )}

      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("shipments")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "shipments"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-text-muted hover:text-text-secondary"
          }`}
        >
          Shipments
        </button>
        <button
          type="button"
          onClick={() => setTab("packing")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "packing"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-text-muted hover:text-text-secondary"
          }`}
        >
          Packing Lists
        </button>
      </div>

      {activeTab === "shipments" ? (
      <>
      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border bg-surface-subtle px-5 py-3">
          <h2 className="text-base font-semibold text-text-primary">{editingId ? "Update Shipment" : "Create Shipment"}</h2>
        </div>
        <div className="space-y-4 border-b border-border p-5">
          <FileImportCard
            title="Extract from shipping document"
            subtitle="Upload BL, AWB, or packing list (PDF/image). Review fields before saving — nothing is auto-saved."
            status={shippingExtract.status}
            error={shippingExtract.error}
            onExtract={(file) => {
              void shippingExtract.extract(file).catch((e) => logApiError("LogisticsPage.shippingExtract", e));
            }}
            onClear={() => {
              shippingExtract.clear();
              setShippingReviewRows([]);
            }}
          />
          {shippingExtract.response ? (
            <ExtractionAlertsBanner
              alerts={shippingExtract.response.alerts}
              matchHint={
                shippingExtract.response.match_hint ||
                (shippingExtract.response.matched_shipment_reference
                  ? `Linked candidate: ${shippingExtract.response.matched_shipment_reference}`
                  : null)
              }
              suggestedStatus={shippingExtract.response.suggested_status}
            />
          ) : null}
          {shippingReviewRows.length > 0 ? (
            <AutofillReviewPanel
              title="Review shipping extracted fields"
              fields={shippingReviewRows}
              onApply={applyShippingField}
              onApplyAllHigh={() => {
                shippingReviewRows
                  .filter((r) => r.confidenceLevel === "high" && !r.applied && !r.skipped && !r.hasConflict)
                  .forEach((r) => applyShippingField(r.fieldKey));
              }}
              onSkip={(k) =>
                setShippingReviewRows((prev) => prev.map((r) => (r.fieldKey === k ? { ...r, skipped: true } : r)))
              }
              onResolveConflict={(k, choice: ConflictResolutionChoice) =>
                setShippingReviewRows((prev) =>
                  prev.map((r) => (r.fieldKey === k ? { ...r, conflictResolution: choice } : r)),
                )
              }
            />
          ) : null}
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Trade Case *</label>
            <select
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.trade_case_id || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, trade_case_id: Number(e.target.value || 0) }))}
              required
            >
              <option value="">Select trade case</option>
              {tradeCases.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.reference} ({tc.direction})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Reference *</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.reference}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="SHIP-2026-001"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Status</label>
            <select
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.status || "PLANNED"}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="PLANNED">PLANNED</option>
              <option value="BOOKED">BOOKED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="ARRIVED">ARRIVED</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Carrier</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.carrier || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, carrier: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Booking Ref</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.booking_ref || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, booking_ref: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">BL/AWB</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.bl_awb || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, bl_awb: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">ETD</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.etd || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, etd: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">ETA</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.eta || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, eta: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Origin Port</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.origin_port || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, origin_port: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Destination Port</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.dest_port || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, dest_port: e.target.value }))}
            />
          </div>
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Notes</label>
            <textarea
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.notes || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="md:col-span-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update Shipment" : "Create Shipment"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm({
                    ...EMPTY_FORM,
                    trade_case_id: preselectedTradeCaseId || 0,
                  });
                }}
                className="rounded-xl border border-border-strong bg-surface-raised px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2">
          <select
            value={filterTradeCaseId ?? ""}
            onChange={(e) => setFilterTradeCaseId(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm"
          >
            <option value="">All trade cases</option>
            {tradeCases.map((tc) => (
              <option key={tc.id} value={tc.id}>
                {tc.reference}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="PLANNED">PLANNED</option>
            <option value="BOOKED">BOOKED</option>
            <option value="IN_TRANSIT">IN_TRANSIT</option>
            <option value="ARRIVED">ARRIVED</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
          <input
            type="date"
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            value={etdFrom}
            onChange={(e) => setEtdFrom(e.target.value)}
            title="ETD from"
          />
          <span className="text-text-muted">–</span>
          <input
            type="date"
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            value={etdTo}
            onChange={(e) => setEtdTo(e.target.value)}
            title="ETD to"
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredItems.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-text-muted">Loading shipments...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-sm text-text-muted">No shipments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Trade Case</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Carrier</th>
                  <th className="px-4 py-3">Booking Ref</th>
                  <th className="px-4 py-3">BL/AWB</th>
                  <th className="px-4 py-3">ETD</th>
                  <th className="px-4 py-3">ETA</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredItems.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{row.reference}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/app/trade/cases/${row.trade_case_id}`} className="text-brand-primary hover:underline">
                        #{row.trade_case_id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{row.status}</td>
                    <td className="px-4 py-2.5">{row.carrier || "—"}</td>
                    <td className="px-4 py-2.5">{row.booking_ref || "—"}</td>
                    <td className="px-4 py-2.5">{row.bl_awb || "—"}</td>
                    <td className="px-4 py-2.5">{row.etd ? new Date(row.etd).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2.5">{row.eta ? new Date(row.eta).toLocaleDateString() : "—"}</td>
                    <td className="relative px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Actions
                      </button>
                      {openActionsId === row.id && (
                        <div className="absolute right-4 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                          <Link
                            to={`/app/trade/cases/${row.trade_case_id}`}
                            onClick={() => setOpenActionsId(null)}
                            className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            View trade case
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId(null);
                              setEditingId(row.id);
                              setForm({
                                trade_case_id: row.trade_case_id,
                                reference: row.reference,
                                status: row.status,
                                carrier: row.carrier || "",
                                booking_ref: row.booking_ref || "",
                                bl_awb: row.bl_awb || "",
                                etd: row.etd || "",
                                eta: row.eta || "",
                                origin_port: row.origin_port || "",
                                dest_port: row.dest_port || "",
                                notes: row.notes || "",
                              });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Edit shipment
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      ) : null}

      {activeTab === "packing" ? (
      <>
      <section className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Packing lists</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Create packing list headers (carton/weight totals). Line-level size/color packing comes later.
            {preselectedOrderId ? ` Prefill order #${preselectedOrderId}.` : ""}
            {preselectedChallanId ? ` Prefill challan #${preselectedChallanId}.` : ""}
          </p>
        </div>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPackSaving(true);
            setError("");
            try {
              const created = await api.createPackingList({
                ...packForm,
                order_id: packForm.order_id || preselectedOrderId || null,
                delivery_challan_id: packForm.delivery_challan_id || preselectedChallanId || null,
                shipment_id: packForm.shipment_id || null,
                total_cartons: Number(packForm.total_cartons || 0),
              });
              setPackForm({
                order_id: preselectedOrderId || null,
                delivery_challan_id: preselectedChallanId || null,
                shipment_id: null,
                total_cartons: 0,
                status: "DRAFT",
              });
              await load();
              if (created?.id) {
                navigate(`/app/logistics/packing-lists/${created.id}`);
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : "Packing list create failed");
            } finally {
              setPackSaving(false);
            }
          }}
        >
          <label className="text-xs space-y-1">
            <span>Order ID</span>
            <input
              type="number"
              value={packForm.order_id ?? ""}
              onChange={(e) =>
                setPackForm((p) => ({ ...p, order_id: e.target.value ? Number(e.target.value) : null }))
              }
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span>Shipment</span>
            <select
              value={packForm.shipment_id ?? ""}
              onChange={(e) =>
                setPackForm((p) => ({ ...p, shipment_id: e.target.value ? Number(e.target.value) : null }))
              }
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
            >
              <option value="">Optional…</option>
              {items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.reference}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span>Total cartons</span>
            <input
              type="number"
              min={0}
              value={packForm.total_cartons ?? 0}
              onChange={(e) => setPackForm((p) => ({ ...p, total_cartons: Number(e.target.value) || 0 }))}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={packSaving}
              className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {packSaving ? "Saving…" : "Create packing list"}
            </button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="py-1.5 pr-3">Number</th>
                <th className="py-1.5 pr-3">Shipment</th>
                <th className="py-1.5 pr-3">Order</th>
                <th className="py-1.5 pr-3">Cartons</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3">Date</th>
                <th className="py-1.5">Open</th>
              </tr>
            </thead>
            <tbody>
              {packingLists.map((p) => (
                <tr key={p.id} className="border-b border-border-subtle/60">
                  <td className="py-1.5 pr-3 font-medium">{p.packing_list_number}</td>
                  <td className="py-1.5 pr-3">{p.shipment_reference || p.shipment_id || "—"}</td>
                  <td className="py-1.5 pr-3">{p.order_code || p.order_id || "—"}</td>
                  <td className="py-1.5 pr-3">{p.total_cartons}</td>
                  <td className="py-1.5 pr-3">{p.status}</td>
                  <td className="py-1.5 pr-3">{p.packing_date ?? "—"}</td>
                  <td className="py-1.5">
                    <Link
                      to={`/app/logistics/packing-lists/${p.id}`}
                      className="text-xs font-medium text-accent-secondary hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {!packingLists.length ? (
                <tr>
                  <td colSpan={7} className="py-4">
                    <EmptyState
                      headline="No packing lists yet"
                      description="Create a packing list header above to track cartons and weights."
                      className="border-0 bg-transparent py-6 shadow-none"
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Containers</h2>
          <p className="text-xs text-text-muted mt-0.5">Track container numbers and loading status per shipment.</p>
        </div>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!containerForm.shipment_id || !containerForm.container_number.trim()) {
              setError("Shipment and container number are required");
              return;
            }
            setPackSaving(true);
            setError("");
            try {
              await api.createShipmentContainer({
                shipment_id: containerForm.shipment_id,
                container_number: containerForm.container_number.trim(),
                container_type: containerForm.container_type || null,
                seal_number: containerForm.seal_number || null,
                loading_status: containerForm.loading_status,
              });
              setContainerForm((p) => ({ ...p, container_number: "", seal_number: "" }));
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Container create failed");
            } finally {
              setPackSaving(false);
            }
          }}
        >
          <label className="text-xs space-y-1">
            <span>Shipment</span>
            <select
              value={containerForm.shipment_id || ""}
              onChange={(e) =>
                setContainerForm((p) => ({ ...p, shipment_id: Number(e.target.value) || 0 }))
              }
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              required
            >
              <option value="">Select…</option>
              {items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.reference}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span>Container #</span>
            <input
              value={containerForm.container_number}
              onChange={(e) => setContainerForm((p) => ({ ...p, container_number: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="text-xs space-y-1">
            <span>Type</span>
            <input
              value={containerForm.container_type}
              onChange={(e) => setContainerForm((p) => ({ ...p, container_type: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span>Loading status</span>
            <select
              value={containerForm.loading_status}
              onChange={(e) => setContainerForm((p) => ({ ...p, loading_status: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
            >
              {["EMPTY", "LOADING", "LOADED", "CLOSED"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={packSaving}
              className="rounded-lg border border-brand-primary/40 bg-brand-subtle px-3 py-2 text-sm font-semibold text-brand-primary disabled:opacity-60"
            >
              Add container
            </button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="py-1.5 pr-3">Container</th>
                <th className="py-1.5 pr-3">Shipment</th>
                <th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id} className="border-b border-border-subtle/60">
                  <td className="py-1.5 pr-3 font-medium">{c.container_number}</td>
                  <td className="py-1.5 pr-3">{c.shipment_id}</td>
                  <td className="py-1.5 pr-3">{c.container_type ?? "—"}</td>
                  <td className="py-1.5">{c.loading_status}</td>
                </tr>
              ))}
              {!containers.length ? (
                <tr>
                  <td colSpan={4} className="py-3 text-text-muted">
                    No containers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      </>
      ) : null}
    </div>
  );
}
