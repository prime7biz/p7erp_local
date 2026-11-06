import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api, type CutTicketFabricLot } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { useLatestRequest } from "@/hooks/useLatestRequest";

/** Record which received fabric lots and rolls a cut ticket used (traceability). */
export function CutTicketFabricLots({ cutTicketId }: { cutTicketId: number }) {
  const [links, setLinks] = useState<CutTicketFabricLot[]>([]);
  const [options, setOptions] = useState<{ id: number; batch_number: string; item_name: string | null; grn_code: string | null }[]>([]);
  const [search, setSearch] = useState("");
  const [lotId, setLotId] = useState("");
  const [qty, setQty] = useState("");
  const [rolls, setRolls] = useState("");

  const load = useCallback(async () => {
    try {
      setLinks(await api.listCutTicketFabricLots(cutTicketId));
    } catch (e) {
      logApiError("CutTicketFabricLots.load", e);
      setLinks([]);
    }
  }, [cutTicketId]);
  useEffect(() => {
    void load();
  }, [load]);

  const optionsRequest = useLatestRequest();
  useEffect(() => {
    const t = window.setTimeout(() => {
      const token = optionsRequest.begin();
      api
        .listFabricLotOptions(search.trim() || undefined)
        .then((rows) => {
          if (optionsRequest.isCurrent(token)) setOptions(rows);
        })
        .catch((e) => logApiError("CutTicketFabricLots.options", e));
    }, 250);
    return () => window.clearTimeout(t);
  }, [optionsRequest, search]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotId) return;
    try {
      await api.addCutTicketFabricLot(cutTicketId, { stock_batch_id: Number(lotId), qty_used: qty || null, roll_numbers: rolls.trim() || null });
      setLotId("");
      setQty("");
      setRolls("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the lot");
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border-subtle p-3">
      <h3 className="text-sm font-medium">Fabric lots used by cut ticket {cutTicketId}</h3>
      <ul className="space-y-1 text-sm">
        {links.length === 0 ? <li className="text-text-muted">None recorded yet.</li> : null}
        {links.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2">
            <span>
              <span className="font-medium">{l.batch_number}</span> · {l.item_name ?? "—"}
              {l.qty_used ? ` · ${Number(l.qty_used).toLocaleString()} used` : ""}
              {l.roll_numbers ? ` · rolls ${l.roll_numbers}` : ""}
              <span className="text-text-muted"> · {l.supplier_name ?? "unknown supplier"} {l.grn_code ? `(${l.grn_code})` : ""}</span>
            </span>
            <button
              type="button"
              aria-label={`Remove lot ${l.batch_number}`}
              onClick={async () => {
                await api.removeCutTicketFabricLot(cutTicketId, l.id).catch((e) => toast.error(e instanceof Error ? e.message : "Remove failed"));
                await load();
              }}
              className="rounded p-1 text-text-muted hover:text-status-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <input className="w-36 rounded-md border px-2 py-1 text-sm" placeholder="Search lot / fabric" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search fabric lots" />
        <select className="min-w-[14rem] rounded-md border px-2 py-1 text-sm" value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Fabric lot" required>
          <option value="">Select lot…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.batch_number} · {o.item_name ?? ""} {o.grn_code ? `(${o.grn_code})` : ""}
            </option>
          ))}
        </select>
        <input className="w-24 rounded-md border px-2 py-1 text-sm" type="number" min={0} step="0.01" placeholder="Qty used" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity used" />
        <input className="w-40 rounded-md border px-2 py-1 text-sm" placeholder="Roll numbers" maxLength={500} value={rolls} onChange={(e) => setRolls(e.target.value)} aria-label="Roll numbers" />
        <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">Add lot</button>
      </form>
      {options.length === 0 && !search.trim() ? (
        <p className="text-xs text-text-muted">
          No received fabric lots yet. Lots are created when goods are received with <strong>Enable batch tracking</strong> on (Settings →
          Configuration) and batch tracking ticked on the fabric item.
        </p>
      ) : null}
    </div>
  );
}
