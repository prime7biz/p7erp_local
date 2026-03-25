import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ProductionCuttingPage() {
  const [markers, setMarkers] = useState<Array<{ id: number; marker_code: string; status: string }>>([]);
  const [markerCode, setMarkerCode] = useState("");
  const [orderId, setOrderId] = useState("");
  const [layMarkerId, setLayMarkerId] = useState("");
  const [layCode, setLayCode] = useState("LAY-1");
  const [layPlanId, setLayPlanId] = useState("");
  const [ticketCode, setTicketCode] = useState("CT-1");
  const [cutTicketId, setCutTicketId] = useState("");
  const [scan, setScan] = useState("");
  const [lookup, setLookup] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listMarkerPlans();
      setMarkers(res.items ?? []);
    } catch (e) {
      logApiError(e, "ProductionCuttingPage.load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createMarker = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createMarkerPlan({
        marker_code: markerCode.trim(),
        order_id: orderId ? Number(orderId) : null,
      });
      setMarkerCode("");
      await load();
    } catch (e) {
      logApiError(e, "ProductionCuttingPage.createMarker");
    }
  };

  const createLay = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      const res = await api.createLayPlan({
        marker_plan_id: Number(layMarkerId),
        lay_code: layCode.trim(),
      });
      setLayPlanId(String(res.id));
    } catch (e) {
      logApiError(e, "ProductionCuttingPage.createLay");
    }
  };

  const createTicket = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!layPlanId.trim()) return;
    try {
      const res = await api.createCutTicket({
        lay_plan_id: Number(layPlanId),
        ticket_code: ticketCode.trim(),
      });
      setCutTicketId(String(res.id));
    } catch (e) {
      logApiError(e, "ProductionCuttingPage.createTicket");
    }
  };

  const genBundles = async () => {
    if (!cutTicketId) return;
    try {
      await api.generateCuttingBundles(Number(cutTicketId), [{ size: "M", qty_in_bundle: 25, bundle_count: 2 }]);
    } catch (e) {
      logApiError(e, "ProductionCuttingPage.genBundles");
    }
  };

  const downloadPdf = async () => {
    if (!cutTicketId) return;
    try {
      const blob = await api.downloadCuttingBundlePdf(Number(cutTicketId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bundles-${cutTicketId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logApiError(e, "ProductionCuttingPage.downloadPdf");
    }
  };

  const doLookup = async () => {
    if (!scan.trim()) return;
    try {
      const res = await api.lookupCuttingBundle(scan.trim());
      setLookup(res);
    } catch (e) {
      logApiError(e, "ProductionCuttingPage.lookup");
      setLookup(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Cutting pipeline</h1>
        <p className="text-sm text-text-secondary">Marker → lay plan → cut ticket → bundles & barcode PDF.</p>
      </div>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
        <h2 className="text-sm font-medium">Marker plans</h2>
        <form onSubmit={createMarker} className="flex flex-wrap gap-2 items-end">
          <input className="rounded-md border px-2 py-1" placeholder="Marker code" value={markerCode} onChange={(e) => setMarkerCode(e.target.value)} required />
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
            Create
          </button>
        </form>
        <ul className="text-sm text-text-secondary list-disc pl-5">
          {markers.map((m) => (
            <li key={m.id}>
              {m.marker_code} — {m.status} (id {m.id})
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
        <h2 className="text-sm font-medium">Lay plan</h2>
        <form onSubmit={createLay} className="flex flex-wrap gap-2 items-end">
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Marker plan ID" value={layMarkerId} onChange={(e) => setLayMarkerId(e.target.value)} />
          <input className="rounded-md border px-2 py-1" placeholder="Lay code" value={layCode} onChange={(e) => setLayCode(e.target.value)} />
          <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">
            Create lay
          </button>
        </form>
        {layPlanId ? <p className="text-xs">Last lay plan id: {layPlanId}</p> : null}
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
        <h2 className="text-sm font-medium">Cut ticket</h2>
        <form onSubmit={createTicket} className="flex flex-wrap gap-2 items-end">
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Lay plan ID" value={layPlanId} onChange={(e) => setLayPlanId(e.target.value)} />
          <input className="rounded-md border px-2 py-1" placeholder="Ticket code" value={ticketCode} onChange={(e) => setTicketCode(e.target.value)} />
          <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">
            Create ticket
          </button>
        </form>
        <div className="flex flex-wrap gap-2 items-center">
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Cut ticket ID" value={cutTicketId} onChange={(e) => setCutTicketId(e.target.value)} />
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void genBundles()}>
            Generate bundles
          </button>
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void downloadPdf()}>
            Download barcode PDF
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
        <h2 className="text-sm font-medium">Bundle scan</h2>
        <div className="flex flex-wrap gap-2">
          <input className="rounded-md border px-2 py-1 flex-1 min-w-[200px]" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Barcode" />
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void doLookup()}>
            Lookup
          </button>
        </div>
        {lookup ? <pre className="text-xs bg-surface-subtle p-2 rounded-md overflow-x-auto">{JSON.stringify(lookup, null, 2)}</pre> : null}
      </section>
    </div>
  );
}
