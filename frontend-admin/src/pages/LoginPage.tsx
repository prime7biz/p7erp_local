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
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Platform admin login</h1>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div>
          <label className="block text-xs text-slate-600">Username</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
