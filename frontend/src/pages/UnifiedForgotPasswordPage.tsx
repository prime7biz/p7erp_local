import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { externalRequestPasswordReset } from "@/api/externalClient";
import { AlertCircle, ArrowLeft, Building2, Mail, CheckCircle } from "lucide-react";

type PortalRole = "staff" | "admin" | "customer" | "financier";

export function UnifiedForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const roleParam = (searchParams.get("role") || "").toLowerCase();

  const [companyCode, setCompanyCode] = useState(() => (localStorage.getItem("lastCompanyCode") || "").toUpperCase());
  const [loginRole, setLoginRole] = useState<PortalRole>("staff");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (roleParam === "customer" || roleParam === "financier" || roleParam === "admin") {
      setLoginRole(roleParam as PortalRole);
    }
  }, [roleParam]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const code = companyCode.trim().toUpperCase();
    const em = email.trim();
    if (!code || !em) {
      setError("Company code and email are required");
      return;
    }
    setLoading(true);
    try {
      if (loginRole === "customer" || loginRole === "financier") {
        await externalRequestPasswordReset({
          company_code: code,
          email: em,
          principal_type: loginRole,
        });
      } else {
        await api.forgotPassword({ company_code: code, email: em });
      }
      localStorage.setItem("lastCompanyCode", code);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <img src="/images/auth-bg-login.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-surface-inverse/85 via-surface-inverse/70 to-brand-primary/30" />
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16 w-full">
          <img src="/images/logo-white.svg" alt="Prime7 ERP" className="h-24 w-auto mb-6" />
          <h1 className="text-2xl xl:text-3xl font-bold text-text-inverse">Reset your password</h1>
          <p className="text-text-inverse/80 mt-3 max-w-sm">
            Choose how you sign in, then enter company code and email. If an account matches, we will email you a reset link.
          </p>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-surface-subtle to-surface-raised">
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="text-center lg:text-left">
            <img src="/images/logo.png" alt="Prime7 ERP" className="h-10 w-auto mx-auto lg:mx-0 mb-3" />
            <h2 className="text-xl font-bold text-text-primary">Forgot password</h2>
            <p className="text-sm text-text-secondary mt-1">We will send instructions to your email</p>
          </div>

          {done ? (
            <div className="rounded-lg border border-status-success/25 bg-status-success-subtle px-4 py-4 text-sm text-text-primary flex gap-3">
              <CheckCircle className="h-5 w-5 shrink-0 text-status-success" />
              <div>
                <p className="font-medium">Check your inbox</p>
                <p className="mt-1 text-text-secondary">
                  If an account exists for this email, password reset instructions have been sent. The link expires after a short time.
                </p>
                <Link to="/login" className="inline-block mt-3 text-brand-primary font-medium hover:underline">
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="fpCompany" className="text-text-secondary text-sm font-medium">
                  Company code
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                  <input
                    id="fpCompany"
                    type="text"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-border bg-surface-raised font-mono uppercase focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="fpRole" className="text-text-secondary text-sm font-medium">
                  Login as
                </label>
                <select
                  id="fpRole"
                  className="w-full px-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none text-sm"
                  value={loginRole}
                  onChange={(e) => setLoginRole(e.target.value as PortalRole)}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Tenant admin</option>
                  <option value="customer">Customer portal</option>
                  <option value="financier">Financier portal</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="fpEmail" className="text-text-secondary text-sm font-medium">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                  <input
                    id="fpEmail"
                    type="email"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-md bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground font-medium disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <Link
            to="/login"
            className="text-sm text-text-muted hover:text-brand-primary inline-flex items-center gap-1.5 justify-center w-full"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
