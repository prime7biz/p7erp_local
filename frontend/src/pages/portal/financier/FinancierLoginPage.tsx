import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useExternalAuth } from "@/hooks/useExternalAuth";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function FinancierLoginPage() {
  const [companyCode, setCompanyCode] = useState(() => (localStorage.getItem("lastCompanyCode") || "").toUpperCase());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useExternalAuth("financier");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const code = companyCode.trim().toUpperCase();
    if (!code || !email.trim() || !password) {
      setError("Company code, email and password are required");
      return;
    }
    setLoading(true);
    try {
      await login({ company_code: code, email: email.trim(), password });
      localStorage.setItem("lastCompanyCode", code);
      navigate("/portal/financier", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-sm">
        <img src="/images/logo.svg" alt="Prime7 ERP" className="mx-auto h-10 w-auto mb-6" />
        <h1 className="text-xl font-semibold text-text-primary text-center">Financier confidence center</h1>
        <p className="text-sm text-text-muted text-center mt-1 mb-6">Read-only transparency for banks & partners.</p>
        {params.get("reason") === "session_expired" ? (
          <p className="mb-4 text-sm text-status-warning-foreground">Your session expired. Please sign in again.</p>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-muted">Company code</label>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Email</label>
            <input
              type="email"
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Password</label>
            <input
              type="password"
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-status-danger-foreground">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-text-muted">
          <Link to="/login" className="text-brand-primary hover:underline">
            Staff login
          </Link>
        </p>
      </div>
    </div>
  );
}
