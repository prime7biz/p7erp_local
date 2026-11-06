import { useCallback, useEffect, useState } from "react";
import { api, type GstReturnPayload } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { downloadCsv } from "@/lib/reportExport";
import { logApiError } from "@/utils/logApiError";
import { useLatestRequest } from "@/hooks/useLatestRequest";

type Tab = "gstr1" | "gstr2" | "gstr3b" | "itc";

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, "0")}`,
  };
}

export function GstReturnsPage() {
  const now = new Date();
  const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [tab, setTab] = useState<Tab>("gstr1");
  const [ym, setYm] = useState(defaultYm);
  const [data, setData] = useState<GstReturnPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    const { from, to } = monthBounds(ym);
    setLoading(true);
    setError("");
    try {
      const range = { from_date: from, to_date: to };
      const res =
        tab === "gstr1"
          ? await api.getGstr1(range)
          : tab === "gstr2"
            ? await api.getGstr2(range)
            : tab === "gstr3b"
              ? await api.getGstr3b(range)
              : await api.getGstItcSummary(range);
      if (!latest.isCurrent(token)) return;
      setData(res);
    } catch (e) {
      logApiError("GstReturnsPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
      setData(null);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, tab, ym]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportJson() {
    const { from, to } = monthBounds(ym);
    try {
      const payload = await api.exportGstr1({ from_date: from, to_date: to, format: "json" });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gstr1_${ym}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logApiError("GstReturnsPage.exportJson", e);
      setError((e as Error).message);
    }
  }

  function exportCsv() {
    const supplies = (data?.supplies || data?.lines || []) as Record<string, unknown>[];
    if (!supplies.length) return;
    const keys = Object.keys(supplies[0]!);
    const lines = [
      keys.join(","),
      ...supplies.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")),
    ];
    downloadCsv(lines.join("\n"), `gst_${tab}_${ym}`);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "gstr1", label: "GSTR-1" },
    { id: "gstr2", label: "GSTR-2" },
    { id: "gstr3b", label: "GSTR-3B" },
    { id: "itc", label: "ITC Summary" },
  ];

  const rows = (data?.supplies || data?.lines || []) as Record<string, unknown>[];
  const validations = (data?.validations as string[] | undefined) || [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="GST Returns"
        description="Outward (GSTR-1), inward (GSTR-2), summary (GSTR-3B), and ITC from posted voucher tax lines."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void exportJson()}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Export GSTR-1 JSON
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Export Excel (CSV)
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          Period (month)
          <input
            type="month"
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === t.id ? "bg-blue-600 text-white" : "border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {validations.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {validations.map((v) => (
            <div key={v}>{v}</div>
          ))}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {data?.summary || tab === "gstr3b" ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(
            (tab === "gstr3b"
              ? {
                  outward_tax: data?.outward_tax,
                  inward_itc: data?.inward_itc,
                  net_tax_payable: data?.net_tax_payable,
                }
              : (data?.summary as Record<string, unknown>) || {}) as Record<string, unknown>,
          ).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">{k.replace(/_/g, " ")}</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{String(v ?? "—")}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tab !== "gstr3b" ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Tax</th>
                <th className="px-3 py-2">HSN</th>
                <th className="px-3 py-2 text-right">Taxable</th>
                <th className="px-3 py-2 text-right">Tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap">{String(r.voucher_date ?? "—")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(r.voucher_number ?? r.voucher_id ?? "")}</td>
                  <td className="px-3 py-2">
                    {String(r.tax_type ?? "")} {r.tax_rate != null ? `${r.tax_rate}%` : ""}
                  </td>
                  <td className="px-3 py-2">{String(r.hsn_code ?? "—")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{String(r.taxable_amount ?? "—")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{String(r.tax_amount ?? "—")}</td>
                </tr>
              ))}
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No tax lines in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
