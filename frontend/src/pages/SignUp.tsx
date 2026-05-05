import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setAuth } from "@/api/client";
import type { TenantType } from "@/api/client";
import { PasswordFieldInput } from "@/components/auth/PasswordFieldInput";
import {
  User,
  Mail,
  ArrowLeft,
  Building2,
  Factory,
  BarChart3,
  Shield,
  Cpu,
  CheckCircle,
  Copy,
  Phone,
  FileCheck,
} from "lucide-react";
import { CURRENT_LEGAL_ACCEPTANCE_VERSION } from "@/data/legal/acceptance";

const legalDocumentLinks = [
  { to: "/legal/terms", label: "Terms" },
  { to: "/legal/privacy", label: "Privacy" },
  { to: "/legal/dpa", label: "DPA" },
  { to: "/legal/ai-disclaimer", label: "AI disclaimer" },
  { to: "/legal/sla", label: "SLA" },
  { to: "/legal/security-compliance", label: "Security" },
  { to: "/trust-center", label: "Trust Center" },
] as const;

export function SignUp() {
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [businessType, setBusinessType] = useState<TenantType>("both");
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<{ companyCode: string } | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!companyName.trim() || !email.trim() || !password) {
      setError("Company name, email and password are required");
      return;
    }
    if (!phone.trim() || phone.trim().length < 5) {
      setError("Please enter a valid phone number");
      return;
    }
    if (!acceptedLegalTerms) {
      setError("You must accept the legal terms, privacy policy, and related notices to register");
      return;
    }
    setLoading(true);
    try {
      const tenant = await api.createTenant({
        name: companyName.trim(),
        tenant_type: businessType,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      });
      await api.register({
        tenant_id: tenant.id,
        email: email.trim(),
        password,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        accepted_legal_terms: acceptedLegalTerms,
        legal_acceptance_version: CURRENT_LEGAL_ACCEPTANCE_VERSION,
      });
      const res = await api.login({
        tenant_id: tenant.id,
        email: email.trim(),
        password,
        login_as: "admin",
      });
      setAuth(res.access_token, res.tenant_id ?? tenant.id);
      setSuccessData({ companyCode: tenant.company_code ?? String(tenant.id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const copyCompanyCode = () => {
    if (successData?.companyCode) {
      navigator.clipboard.writeText(successData.companyCode);
    }
  };

  const goToApp = () => navigate("/app", { replace: true });

  if (successData) {
    return (
      <div className="min-h-screen flex">
        <div className="hidden lg:flex lg:w-[55%] relative flex-col items-center justify-center p-12 overflow-hidden">
          <img src="/images/auth-bg-register.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-surface-inverse/80 via-surface-inverse/60 to-primary/25" />
          <div className="absolute top-1/4 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
          <div className="relative z-10 text-center max-w-md">
            <img src="/images/logo-white.svg" alt="Prime7 ERP" className="mx-auto h-28 xl:h-32 w-auto mb-8 drop-shadow-2xl" role="img" />
            <h2 className="text-3xl font-bold text-white mb-4">Welcome to Prime7 ERP</h2>
            <p className="text-white/80 text-lg mb-10">Complete garment manufacturing solution for modern businesses</p>
            <div className="grid grid-cols-2 gap-4 text-left">
              {[
                { icon: Factory, label: "Production" },
                { icon: BarChart3, label: "Finance" },
                { icon: Shield, label: "Merchandising" },
                { icon: Cpu, label: "AI Insights" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 text-white/80">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Icon className="h-4 w-4" /></div>
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center relative p-6 bg-gradient-to-b from-surface-subtle to-surface-raised min-h-[60vh]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_70%_20%,rgba(249,115,22,0.06),transparent)] pointer-events-none" aria-hidden="true" />
          <div className="w-full max-w-md space-y-6 relative z-10">
            <div className="text-center mb-6">
              <img src="/images/logo.png" alt="Prime7 ERP" className="mx-auto h-14 w-auto mb-2" />
            </div>
            <div className="bg-white rounded-xl shadow-lg border border-border-subtle p-8">
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 bg-status-success-subtle rounded-full flex items-center justify-center mb-3">
                  <CheckCircle className="h-6 w-6 text-status-success-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-text-primary">Registration Successful!</h2>
                <p className="text-sm text-text-muted mt-1">Your company has been registered</p>
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center mb-4">
                <p className="text-sm text-text-secondary mb-2">Your Company Code</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-bold font-mono text-primary tracking-wider">{successData.companyCode}</span>
                  <button type="button" onClick={copyCompanyCode} className="p-1 rounded hover:bg-surface-subtle">
                    <Copy className="h-4 w-4 text-text-muted" />
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-2">Save this code — you&apos;ll need it to log in</p>
              </div>
              <p className="text-xs text-text-secondary text-center mb-4">
                When outbound email (SMTP) is configured on the server, a confirmation message is sent to{" "}
                <span className="font-medium text-text-primary">{email}</span> with your company code and a sign-in link.
              </p>
              <button
                type="button"
                onClick={goToApp}
                className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium"
              >
                Go to App
              </button>
            </div>
            <div className="text-center">
              <Link to="/" className="text-sm text-text-muted hover:text-primary transition-colors inline-flex items-center gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Website
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[55%] relative flex-col items-center justify-center p-12 overflow-hidden">
        <img src="/images/auth-bg-register.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-surface-inverse/80 via-surface-inverse/60 to-primary/25" />
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="relative z-10 text-center max-w-md">
          <img src="/images/logo-white.svg" alt="Prime7 ERP" className="mx-auto h-28 xl:h-32 w-auto mb-8 drop-shadow-2xl" role="img" />
          <h1 className="text-3xl font-bold text-white mb-4">Start Your Journey</h1>
          <p className="text-white/80 text-lg mb-10">Register your company and unlock the full power of garment manufacturing ERP</p>
          <div className="grid grid-cols-2 gap-4 text-left">
            {[
              { icon: Factory, label: "Production" },
              { icon: BarChart3, label: "Finance" },
              { icon: Shield, label: "Merchandising" },
              { icon: Cpu, label: "AI Insights" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-white/80">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Icon className="h-4 w-4" /></div>
                <span className="text-sm">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-8 mt-10">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">500+</div>
              <div className="text-xs text-white/60">Styles Managed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">99.9%</div>
              <div className="text-xs text-white/60">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">24/7</div>
              <div className="text-xs text-white/60">Support</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative p-4 lg:p-6 overflow-y-auto bg-gradient-to-b from-surface-subtle to-surface-raised min-h-[60vh]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_70%_20%,rgba(249,115,22,0.05),transparent)] pointer-events-none" aria-hidden="true" />
        <div className="w-full max-w-lg space-y-4 py-6 relative z-10">
          <div className="text-center mb-4">
            <img src="/images/logo.png" alt="Prime7 ERP" className="mx-auto h-12 w-auto mb-2" />
            <p className="text-text-muted text-xs">Garment Manufacturing ERP</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-border-subtle p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Register Your Company</h2>
              <p className="text-sm text-text-muted mt-1">Create an account to get started</p>
              <p className="text-xs text-text-muted mt-1">Fields marked with ** are mandatory.</p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Account Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-text-secondary">Company Name **</label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                      <input
                        id="companyName"
                        type="text"
                        placeholder="Your Company Ltd."
                        className="w-full pl-10 pr-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-text-secondary">First Name</label>
                      <input
                        id="firstName"
                        type="text"
                        placeholder="John"
                        className="mt-1 w-full px-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium text-text-secondary">Last Name</label>
                      <input
                        id="lastName"
                        type="text"
                        placeholder="Doe"
                        className="mt-1 w-full px-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email **</label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                      <input
                        id="email"
                        type="email"
                        placeholder="john@company.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-text-secondary">Password **</label>
                    <PasswordFieldInput
                      id="password"
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                      placeholder="Min 8 characters"
                      required
                      minLength={8}
                      wrapperClassName="mt-1"
                      inputClassName="w-full py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border-subtle pt-4">
                <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Company Details
                </h3>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-text-secondary">Phone **</label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                      <input
                        id="phone"
                        type="tel"
                        placeholder="+880 1XXX-XXXXXX"
                        className="w-full pl-10 pr-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="address" className="block text-sm font-medium text-text-secondary">Address</label>
                    <input
                      id="address"
                      type="text"
                      placeholder="Company address"
                      className="mt-1 w-full px-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="country" className="block text-sm font-medium text-text-secondary">Country</label>
                      <select
                        id="country"
                        className="mt-1 w-full px-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      >
                        <option value="">Select country</option>
                        <option value="BD">Bangladesh</option>
                        <option value="IN">India</option>
                        <option value="CN">China</option>
                        <option value="VN">Vietnam</option>
                        <option value="PK">Pakistan</option>
                        <option value="LK">Sri Lanka</option>
                        <option value="MM">Myanmar</option>
                        <option value="KH">Cambodia</option>
                        <option value="TR">Turkey</option>
                        <option value="US">United States</option>
                        <option value="GB">United Kingdom</option>
                        <option value="DE">Germany</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="businessType" className="block text-sm font-medium text-text-secondary">Business Type</label>
                      <select
                        id="businessType"
                        className="mt-1 w-full px-4 py-2.5 rounded-md border border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        value={businessType}
                        onChange={(e) => setBusinessType(e.target.value as TenantType)}
                      >
                        <option value="manufacturer">Manufacturer</option>
                        <option value="buying_house">Buying House</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface-subtle/80 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Legal acceptance required</p>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                      Review these documents before creating the tenant admin account. Your acceptance is recorded for
                      compliance and onboarding audit purposes.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {legalDocumentLinks.map((doc) => (
                    <Link
                      key={doc.to}
                      to={doc.to}
                      className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-text-secondary hover:border-primary/30 hover:text-primary transition-colors"
                    >
                      {doc.label}
                    </Link>
                  ))}
                </div>

                <label
                  htmlFor="acceptedLegalTerms"
                  className="flex items-start gap-3 rounded-lg border border-border bg-white px-4 py-3"
                >
                  <input
                    id="acceptedLegalTerms"
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
                    checked={acceptedLegalTerms}
                    onChange={(e) => setAcceptedLegalTerms(e.target.checked)}
                    required
                  />
                  <span className="text-xs text-text-muted leading-relaxed">
                    I confirm that I have read and accept the Prime7 ERP legal and trust documents linked above,
                    including the Terms of Service, Privacy Policy, DPA, AI Usage Disclaimer, SLA, and Security &amp;
                    Compliance information.
                  </span>
                </label>

                <p className="text-[11px] text-text-muted">
                  Acceptance version: <span className="font-mono">{CURRENT_LEGAL_ACCEPTANCE_VERSION}</span>
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !acceptedLegalTerms}
                className="w-full py-3 rounded-md bg-primary hover:bg-primary/90 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
              >
                {loading ? "Creating Account..." : "Register Company"}
              </button>
            </form>

            <div className="text-center text-sm text-text-muted mt-4">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:text-primary/80 font-medium">
                Sign in
              </Link>
            </div>
          </div>

          <div className="text-center">
            <Link to="/" className="text-sm text-text-muted hover:text-primary transition-colors inline-flex items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Website
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
