import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CheckCircle2, Loader2, MonitorPlay, Send, Timer } from "lucide-react";
import { submitLead } from "@/api/publicLeads";
import { trackEvent } from "@/lib/analytics";

const BUSINESS_TYPES = [
  { value: "manufacturer", label: "Garment manufacturer / factory" },
  { value: "buying_house", label: "Buying house / sourcing office" },
  { value: "both", label: "Both (factory + buying office)" },
];

const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1000", "1000+"];

const MODULES = [
  "Merchandising (inquiry → quotation → order)",
  "Inventory & purchasing",
  "Production & planning",
  "Export / LC & commercial",
  "Accounts & finance",
  "HR & payroll",
];

const SLOTS = ["Sunday–Thursday morning", "Sunday–Thursday afternoon", "Saturday", "Any time — call me to fix it"];

const inputClass =
  "w-full rounded-lg border border-border px-4 py-3 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";

export function BookDemoPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    businessType: "",
    companySize: "",
    slot: SLOTS[0],
    notes: "",
    website: "",
  });
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const toggleModule = (m: string) => setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) return;
    setLoading(true);
    setError("");
    const businessLabel = BUSINESS_TYPES.find((b) => b.value === form.businessType)?.label ?? "Not specified";
    const message = [
      "DEMO REQUEST",
      `Business type: ${businessLabel}`,
      `Preferred time: ${form.slot}`,
      `Interested in: ${modules.length ? modules.join("; ") : "Not specified"}`,
      form.notes.trim() ? `Notes: ${form.notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await submitLead({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        company: form.company.trim(),
        company_size: form.companySize || null,
        message,
        website: form.website || null,
      });
      trackEvent("demo_request_submitted", {
        business_type: form.businessType || undefined,
        company_size: form.companySize || undefined,
        modules: modules.length,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send your request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-16 lg:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <h1 className="text-4xl font-bold leading-tight text-text-primary sm:text-5xl">
            Book a <span className="text-brand-primary">live demo</span>
          </h1>
          <p className="mt-5 text-lg text-text-secondary">
            A product specialist walks you through Prime7 ERP using a sample garment company — your order flow, your
            documents, your questions.
          </p>
          <ul className="mt-8 space-y-4 text-text-secondary">
            <li className="flex gap-3">
              <Timer className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
              <span>
                <strong className="text-text-primary">45 minutes</strong> over Google Meet, Zoom or at your office in Dhaka.
              </span>
            </li>
            <li className="flex gap-3">
              <MonitorPlay className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
              <span>We show only the modules you tick, from inquiry and costing to LC, stock, payroll and accounts.</span>
            </li>
            <li className="flex gap-3">
              <CalendarCheck className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
              <span>We confirm a time with you within one working day (Sunday–Thursday, Bangladesh time).</span>
            </li>
          </ul>
          <p className="mt-8 text-sm text-text-muted">
            Prefer to explore on your own?{" "}
            <Link to="/signup" onClick={() => trackEvent("signup_started", { from: "book_demo" })} className="font-medium text-brand-primary hover:underline">
              Start a free trial
            </Link>
            .
          </p>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-xl border border-brand-primary/20 bg-surface-raised p-6 shadow-sm sm:p-8">
            {submitted ? (
              <div className="py-12 text-center" role="status">
                <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-status-success" aria-hidden />
                <h2 className="text-xl font-semibold text-text-primary">Request received</h2>
                <p className="mx-auto mt-2 max-w-md text-text-secondary">
                  Thank you, {form.name.split(" ")[0]}. We will contact you at {form.email} within one working day to confirm the demo time.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="bd-name" className="mb-1 block text-sm font-medium text-text-secondary">Full name *</label>
                    <input id="bd-name" required value={form.name} onChange={set("name")} className={inputClass} autoComplete="name" />
                  </div>
                  <div>
                    <label htmlFor="bd-email" className="mb-1 block text-sm font-medium text-text-secondary">Work email *</label>
                    <input id="bd-email" type="email" required value={form.email} onChange={set("email")} className={inputClass} autoComplete="email" />
                  </div>
                  <div>
                    <label htmlFor="bd-company" className="mb-1 block text-sm font-medium text-text-secondary">Company *</label>
                    <input id="bd-company" required value={form.company} onChange={set("company")} className={inputClass} autoComplete="organization" />
                  </div>
                  <div>
                    <label htmlFor="bd-phone" className="mb-1 block text-sm font-medium text-text-secondary">Phone / WhatsApp</label>
                    <input id="bd-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+880 1XXX-XXXXXX" className={inputClass} autoComplete="tel" />
                  </div>
                  <div>
                    <label htmlFor="bd-type" className="mb-1 block text-sm font-medium text-text-secondary">Business type</label>
                    <select id="bd-type" value={form.businessType} onChange={set("businessType")} className={`${inputClass} bg-surface-raised`}>
                      <option value="">Select…</option>
                      {BUSINESS_TYPES.map((b) => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="bd-size" className="mb-1 block text-sm font-medium text-text-secondary">Employees</label>
                    <select id="bd-size" value={form.companySize} onChange={set("companySize")} className={`${inputClass} bg-surface-raised`}>
                      <option value="">Select…</option>
                      {COMPANY_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-text-secondary">What should we show you?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MODULES.map((m) => (
                      <label key={m} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle">
                        <input type="checkbox" className="mt-0.5" checked={modules.includes(m)} onChange={() => toggleModule(m)} />
                        {m}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="bd-slot" className="mb-1 block text-sm font-medium text-text-secondary">Preferred time</label>
                  <select id="bd-slot" value={form.slot} onChange={set("slot")} className={`${inputClass} bg-surface-raised`}>
                    {SLOTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bd-notes" className="mb-1 block text-sm font-medium text-text-secondary">Anything specific? (optional)</label>
                  <textarea
                    id="bd-notes"
                    rows={3}
                    value={form.notes}
                    onChange={set("notes")}
                    placeholder="e.g. We run 12 sewing lines and export to EU buyers through BTB LCs."
                    className={`${inputClass} resize-none`}
                  />
                </div>
                {/* Honeypot: hidden from people and screen readers; bots fill it. */}
                <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                {error ? (
                  <p role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary py-3 font-semibold text-brand-primary-foreground transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  {loading ? "Sending…" : "Request my demo"}
                </button>
                <p className="text-xs text-text-muted">
                  We use these details only to arrange your demo. See our{" "}
                  <Link to="/legal/privacy" className="underline">Privacy Policy</Link>.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
