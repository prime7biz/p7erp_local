import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/context/AdminAuthContext";

export function LoginPage() {
  const { token, login } = useAdminAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(u, p);
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-100 via-white to-indigo-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">P7 ERP</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Platform admin</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage tenants and platform settings.</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50"
        >
          {err && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-100">{err}</div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">Username</label>
              <input
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={u}
                onChange={(e) => setU(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">Password</label>
              <input
                type="password"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={p}
                onChange={(e) => setP(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
