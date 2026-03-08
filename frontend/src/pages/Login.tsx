import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setAuth } from "@/api/client";
import { User, Lock, AlertCircle, ArrowLeft, Building2, ShoppingBag, Factory, DollarSign, Brain } from "lucide-react";

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
  const [companyCode, setCompanyCode] = useState(() => (localStorage.getItem("lastCompanyCode") || "").toUpperCase());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
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
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel - same as reference */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <img src="/images/hero-bg.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-orange-950/50" />
        <div className="absolute top-[15%] left-[10%] w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[20%] right-[15%] w-48 h-48 bg-orange-400/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col justify-center items-start px-12 xl:px-20 w-full">
          <img src="/images/logo-white.png" alt="P7 ERP" className="h-28 xl:h-32 w-auto mb-8 drop-shadow-2xl" />
          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-3">
            Complete ERP for<br />
            <span className="text-orange-400">Garment Manufacturers</span>
          </h1>
          <p className="text-white/80 text-base xl:text-lg mb-10 max-w-md leading-relaxed">
            Streamline your entire garment manufacturing workflow — from inquiry to shipment — with AI-powered insights.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-12 w-full max-w-sm">
            {features.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/10"
              >
                <f.icon className="h-5 w-5 text-orange-400 flex-shrink-0" />
                <span className="text-white/90 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-white/70 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form (reference UI) */}
      <div className="flex-1 flex flex-col">
        <div className="lg:hidden bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-5 flex items-center gap-3">
          <img src="/images/logo-white.png" alt="P7 ERP" className="h-11 w-auto" />
          <span className="text-white font-semibold text-lg">P7 ERP</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-[hsl(220,14%,96%)] px-6 py-10">
          <div className="w-full max-w-md space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
              <p className="text-sm text-gray-500 mt-1">Sign in to your company account</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="companyCode" className="text-gray-700 text-sm font-medium">Company Code</label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="companyCode"
                    type="text"
                    placeholder="e.g. PRIME1357"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-gray-200 bg-white font-mono uppercase focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="username" className="text-gray-700 text-sm font-medium">Username</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-gray-700 text-sm font-medium">Password</label>
                  <Link to="#" className="text-xs text-primary hover:text-primary/80 font-medium">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-3 h-11 rounded-md border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-md bg-primary hover:bg-primary/90 text-white font-medium text-base disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="text-center text-sm text-gray-500">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="text-primary hover:text-primary/80 font-medium">
                Register your company
              </Link>
            </div>

            <div className="text-center pt-2">
              <Link
                to="/"
                className="text-sm text-gray-400 hover:text-primary transition-colors inline-flex items-center gap-1.5"
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
