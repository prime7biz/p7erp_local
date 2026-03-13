import { useEffect, useState } from "react";
import { api } from "@/api/client";

export function MerchPipelinePage() {
  const [data, setData] = useState<{ inquiries: number; quotations: number; orders: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMerchPipeline().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load pipeline"));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Order Pipeline</h1>
        <p className="text-sm text-gray-500 mt-0.5">High-level merchandising flow snapshot.</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Inquiries</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{data?.inquiries ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Quotations</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{data?.quotations ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Orders</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{data?.orders ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}
