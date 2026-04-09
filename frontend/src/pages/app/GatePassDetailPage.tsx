import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useMatch, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  api,
  type DeliveryChallanResponse,
  type EnhancedGatePassCreate,
  type EnhancedGatePassResponse,
  type InventoryDocumentPrintPayload,
  type InventoryGlPostingDetail,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { GlPostingsPanel } from "@/components/inventory/GlPostingsPanel";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { logApiError } from "@/utils/logApiError";

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "RELEASED"];

function verifyUrl(verificationId: string | null | undefined) {
  if (!verificationId) return "";
  const o = typeof window !== "undefined" ? window.location.origin : "";
  return `${o}/api/v1/inventory/documents/verify/${encodeURIComponent(verificationId)}`;
}

export function GatePassDetailPage() {
  const navigate = useNavigate();
  const { gatePassId } = useParams<{ gatePassId: string }>();
  const isNew = Boolean(useMatch({ path: "/app/inventory/enhanced-gate-passes/new", end: true }));
  const idNum = gatePassId && gatePassId !== "new" ? Number(gatePassId) : NaN;

  const [challans, setChallans] = useState<DeliveryChallanResponse[]>([]);
  const [row, setRow] = useState<EnhancedGatePassResponse | null>(null);
  const [postings, setPostings] = useState<InventoryGlPostingDetail[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [copyCount, setCopyCount] = useState(1);
  const [template, setTemplate] = useState<"standard" | "compact" | "audit">("standard");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EnhancedGatePassCreate>({
    challan_id: null,
    purpose: "",
    destination: "",
    vehicle_no: "",
    notes: "",
    status: "DRAFT",
  });

  const loadChallans = useCallback(async () => {
    const d = await api.listDeliveryChallans();
    setChallans(d);
  }, []);

  const loadDetail = useCallback(async () => {
    if (isNew || !Number.isFinite(idNum) || idNum <= 0) return;
    setLoading(true);
    setError("");
    try {
      const [g, po] = await Promise.all([
        api.getEnhancedGatePass(idNum),
        api.getGatePassGlPostings(idNum).catch(() => [] as InventoryGlPostingDetail[]),
      ]);
      setRow(g);
      setPostings(po);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gate pass");
    } finally {
      setLoading(false);
    }
  }, [idNum, isNew]);

  useEffect(() => {
    void loadChallans();
  }, [loadChallans]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function openPrint() {
    if (!row) return;
    try {
      setPrintData(await api.getGatePassPrintData(row.id));
      setPrintOpen(true);
    } catch (e) {
      logApiError("GatePassDetailPage.print", e);
      setError((e as Error).message);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.purpose.trim()) {
      setError("Purpose is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.createEnhancedGatePass(form);
      navigate(`/app/inventory/enhanced-gate-passes/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  if (isNew) {
    return (
      <div className="min-w-0 space-y-6 touch-manipulation">
        <AppPageHeader
          title="New gate pass"
          description="Yard / security release with optional challan link."
          actions={
            <Link
              to="/app/inventory/enhanced-gate-passes"
              className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              Back to list
            </Link>
          }
        />
        {error ? (
          <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
            {error}
          </div>
        ) : null}
        <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
          <label className="block text-xs font-semibold text-text-secondary">
            Linked challan (optional)
            <select
              className="mt-1 w-full min-h-[44px] rounded-lg border border-border px-3 py-3 text-base sm:text-sm"
              value={form.challan_id ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, challan_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">None</option>
              {challans.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.challan_code} — {c.customer_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-text-secondary">
            Purpose *
            <input
              className="mt-1 w-full min-h-[44px] rounded-lg border border-border px-3 py-3 text-base sm:text-sm"
              value={form.purpose}
              onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
              required
            />
          </label>
          <label className="block text-xs font-semibold text-text-secondary">
            Destination
            <input
              className="mt-1 w-full min-h-[44px] rounded-lg border border-border px-3 py-3 text-base sm:text-sm"
              value={form.destination ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-semibold text-text-secondary">
            Vehicle
            <input
              className="mt-1 w-full min-h-[44px] rounded-lg border border-border px-3 py-3 text-base sm:text-sm"
              value={form.vehicle_no ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, vehicle_no: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-semibold text-text-secondary">
            Notes
            <input
              className="mt-1 w-full min-h-[44px] rounded-lg border border-border px-3 py-3 text-base sm:text-sm"
              value={form.notes ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] w-full rounded-lg bg-brand-primary px-4 py-3 text-base font-semibold text-brand-primary-foreground sm:text-sm"
          >
            {saving ? "Saving…" : "Create gate pass"}
          </button>
        </form>
      </div>
    );
  }

  if (loading || !row) {
    return <div className="p-6 text-sm text-text-muted">{error || "Loading…"}</div>;
  }

  const vUrl = verifyUrl(row.verification_id);

  return (
    <div className="min-w-0 space-y-6">
      <AppPageHeader
        title={row.gate_pass_code}
        description={`${row.status} · ${row.purpose}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void openPrint()}
              className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground"
            >
              Print
            </button>
            <Link
              to="/app/inventory/enhanced-gate-passes"
              className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              Back
            </Link>
          </div>
        }
      />

      {row.verification_id && vUrl ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-raised p-4">
          <QRCodeSVG value={vUrl} size={96} level="M" />
          <div>
            <p className="text-sm font-semibold">Verified gate pass</p>
            <p className="text-xs text-text-muted">{row.verification_id}</p>
          </div>
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
          <p className="text-text-muted">Destination</p>
          <p className="font-medium">{row.destination ?? "—"}</p>
          <p className="mt-2 text-text-muted">Vehicle</p>
          <p>{row.vehicle_no ?? "—"}</p>
          <p className="mt-2 text-text-muted">Guard acknowledged</p>
          <p>{row.guard_acknowledged ? "Yes" : "No"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="mb-2 text-sm font-semibold">Workflow</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={(row.status || "").toUpperCase() === s}
                className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-subtle disabled:opacity-40"
                onClick={async () => {
                  try {
                    const u = await api.updateEnhancedGatePassStatus(row.id, { status: s });
                    setRow(u);
                    setPostings(await api.getGatePassGlPostings(row.id));
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs"
            onClick={async () => {
              try {
                const u = await api.updateEnhancedGatePassStatus(row.id, {
                  guard_acknowledged: !row.guard_acknowledged,
                });
                setRow(u);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Toggle guard acknowledgement
          </button>
        </div>
      </div>

      <GlPostingsPanel postings={postings} />

      {printOpen && printData ? (
        <PrintPreviewModal
          open={printOpen}
          title={`Print — ${row.gate_pass_code}`}
          onClose={() => {
            setPrintOpen(false);
            setPrintData(null);
          }}
          copyCount={copyCount}
          onCopyCountChange={setCopyCount}
          template={template}
          onTemplateChange={setTemplate}
        >
          <InventoryDocumentPrintSheets data={printData} copyCount={copyCount} template={template} />
        </PrintPreviewModal>
      ) : null}
    </div>
  );
}
