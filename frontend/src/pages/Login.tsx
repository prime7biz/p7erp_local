import { useState, type FormEvent } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { api, setAuth } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import {
  User,
  Lock,
  AlertCircle,
  ArrowLeft,
  Building2,
  ShoppingBag,
  Factory,
  DollarSign,
  Brain,
  Info,
} from "lucide-react";

/** Only allow same-origin relative paths for post-login redirect (open redirect guard). */
function safeInternalPath(raw: string | null): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  return t;
}

const features = [
  { icon: ShoppingBag, label: "Merchandising" },
  { icon: Factory, label: "Production" },
  { icon: DollarSign, label: "Finance" },
  { icon: Brain, label: "AI-Powered" },
];

const stats = [
  { value: "500+", label: "Styles Managed" },
  { value: "99.9%", label: "Uptime" },
  { value: "50+", label: "Companies Trust Us" },
];

export function Login() {
  const [searchParams] = useSearchParams();
  const sessionReason = searchParams.get("reason");
  const [companyCode, setCompanyCode] = useState(() => (localStorage.getItem("lastCompanyCode") || "").toUpperCase());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refetch } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const code = companyCode.trim().toUpperCase();
    if (!code || !username.trim() || !password) {
      setError("Company code, username and password are required");
      return;
    }
    setLoading(true);
    try {
      const res = await api.login({
        company_code: code,
        username: username.trim(),
        password,
      });
      localStorage.setItem("lastCompanyCode", code);
      const tid = res.tenant_id ?? (Number.isFinite(Number(code)) ? Number(code) : 0);
      setAuth(res.access_token, tid);
      await refetch();
      const next = safeInternalPath(searchParams.get("next"));
      navigate(next && next.startsWith("/app") ? next : "/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel - branded background */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <img src="/images/auth-bg-login.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-surface-inverse/85 via-surface-inverse/70 to-brand-primary/30" />
        <div className="absolute top-[15%] left-[10%] w-64 h-64 bg-brand-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[20%] right-[15%] w-48 h-48 bg-brand-primary/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col justify-center items-start px-12 xl:px-20 w-full">
          <img src="/images/logo-white.svg" alt="Prime7 ERP" className="h-28 xl:h-32 w-auto mb-8 drop-shadow-2xl" role="img" />
          <h1 className="text-3xl xl:text-4xl font-bold text-text-inverse leading-tight mb-3">
            Complete ERP for<br />
            <span className="text-brand-primary">Garment Manufacturers</span>
          </h1>
          <p className="text-text-inverse/80 text-base xl:text-lg mb-10 max-w-md leading-relaxed">
            Streamline your entire garment manufacturing workflow — from inquiry to shipment — with AI-powered insights.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-12 w-full max-w-sm">
            {features.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/10"
              >
                <f.icon className="h-5 w-5 text-brand-primary flex-shrink-0" />
                <span className="text-text-inverse/90 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-text-inverse">{s.value}</div>
                <div className="text-xs text-text-inverse/70 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col">
        <div className="lg:hidden bg-gradient-to-r from-brand-primary to-brand-primary/90 px-6 py-5 flex items-center justify-center gap-3">
          <img src="/images/logo-white.svg" alt="Prime7 ERP" className="h-10 w-auto" />
          <span className="text-text-inverse font-semibold text-lg">Prime7 ERP</span>
        </div>
        <div className="flex-1 flex items-center justify-center relative px-6 py-10 bg-gradient-to-b from-surface-subtle to-surface-raised min-h-[60vh]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(249,115,22,0.06),transparent)] pointer-events-none" aria-hidden="true" />
          <div className="w-full max-w-md space-y-6 relative z-10">
            <div className="text-center lg:text-left">
              <img src="/images/logo.png" alt="Prime7 ERP" className="h-12 w-auto mx-auto lg:mx-0 mb-4" />
              <h2 className="text-2xl font-bold text-text-primary">Welcome Back</h2>
              <p className="text-sm text-text-secondary mt-1">Sign in to your company account</p>
              <p className="text-xs text-text-muted mt-1">Fields marked with ** are mandatory.</p>
            </div>

            {sessionReason === "session_expired" && (
              <div className="flex items-start gap-2 rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-4 py-3 text-sm text-text-primary">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-brand-primary" />
                <span>Your session expired. Please sign in again to continue.</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="companyCode" className="text-text-secondary text-sm font-medium">Company Code **</label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                  <input
                    id="companyCode"
                    type="text"
                    placeholder="e.g. PRIME1357"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-border bg-surface-raised font-mono uppercase focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="username" className="text-text-secondary text-sm font-medium">Username **</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                  <input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-text-secondary text-sm font-medium">Password **</label>
                  <Link to="/forgot-password" className="text-xs text-brand-primary hover:text-brand-primary/80 font-medium">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                  <input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-border bg-surface-raised focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-md bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground font-medium text-base disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="text-center text-sm text-text-muted">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="text-brand-primary hover:text-brand-primary/80 font-medium">
                Register your company
              </Link>
            </div>

              <div className="text-center pt-2 space-y-2">
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-text-muted max-w-sm mx-auto">
                <Link to="/legal/terms" className="hover:text-brand-primary transition-colors">
                  Terms
                </Link>
                <Link to="/legal/privacy" className="hover:text-brand-primary transition-colors">
                  Privacy
                </Link>
                <Link to="/legal/dpa" className="hover:text-brand-primary transition-colors">
                  DPA
                </Link>
                <Link to="/legal/ai-disclaimer" className="hover:text-brand-primary transition-colors">
                  AI
                </Link>
                <Link to="/legal/sla" className="hover:text-brand-primary transition-colors">
                  SLA
                </Link>
                <Link to="/legal/security-compliance" className="hover:text-brand-primary transition-colors">
                  Security
                </Link>
                <Link to="/trust-center" className="hover:text-brand-primary transition-colors">
                  Trust
                </Link>
              </div>
              <Link
                to="/"
                className="text-sm text-text-muted hover:text-brand-primary transition-colors inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Website
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
