import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type ProformaVerifyResponse } from "@/api/client";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VerifyProformaPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ProformaVerifyResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token.trim()) {
      setResult({ valid: false, message: "Missing token." });
      setLoading(false);
      return;
    }
    api
      .verifyProformaToken(token)
      .then((data) => {
        setResult(data);
        setError("");
      })
      .catch((e) => {
        setResult(null);
        setError(e instanceof Error ? e.message : "Verification failed.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-6">
        <p className="text-slate-600">Verifying proforma invoice…</p>
      </div>
    );
  }

  const invalid = !result?.valid || error;

  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {invalid ? (
          <>
            <h1 className="text-lg font-bold text-red-700">Invalid or expired token</h1>
            <p className="mt-2 text-sm text-slate-600">
              {error || result?.message || "This link is invalid or has expired. Please request a new verification link."}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-emerald-700">Proforma invoice verified</h1>
            <p className="mt-2 text-sm text-slate-700">
              This proforma invoice was issued by <strong>{result?.company_name ?? "—"}</strong>.
            </p>
            <ul className="mt-4 space-y-1 text-sm text-slate-700">
              <li><span className="font-medium">Reference:</span> {result?.reference ?? "—"}</li>
              <li><span className="font-medium">Date:</span> {formatDate(result?.invoice_date)}</li>
              <li><span className="font-medium">Amount:</span> {formatMoney(result?.amount ?? undefined)} {result?.currency ?? ""}</li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
