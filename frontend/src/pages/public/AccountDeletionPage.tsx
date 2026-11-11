import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, UserX } from "lucide-react";
import { submitLead } from "@/api/publicLeads";
import { buildDeletionMessage } from "./accountDeletion";

const input = "w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 focus:border-brand-primary focus:ring-2 focus:ring-focus-ring outline-none";

/**
 * Public page where a Prime7 ERP user asks for their account to be deleted (required by Google Play
 * for apps that let people sign up). Sends the request through the website contact form.
 */
export function AccountDeletionPage() {
  const [form, setForm] = useState({ name: "", email: "", companyCode: "", details: "", website: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setLoading(true);
    setError("");
    try {
      await submitLead({
        name: form.name,
        email: form.email,
        company: form.companyCode || null,
        message: buildDeletionMessage(form.companyCode, form.details),
        website: form.website || null,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send your request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10">
        <UserX className="h-6 w-6 text-brand-primary" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-text-primary">Delete your Prime7 ERP account</h1>
      <p className="mt-3 text-text-secondary">
        This page is for people who use Prime7 ERP, including the Android app, and want their own login account deleted.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-relaxed text-text-secondary">
        <h2 className="text-base font-semibold text-text-primary">How it works</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Send the form below with the email address you sign in with.</li>
          <li>We confirm by email that the request really comes from you, and agree the details with your company&apos;s administrator.</li>
          <li>We delete or deactivate your login and personal profile, and tell you when it is done.</li>
        </ol>
        <h2 className="pt-2 text-base font-semibold text-text-primary">What is kept</h2>
        <p>
          Business records your company must keep by law (for example vouchers, payroll and audit history) belong to your
          company and stay with it. Details are in our{" "}
          <Link to="/legal/privacy" className="font-medium text-brand-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          Company administrators can also deactivate a user straight away in <strong>Settings → User Mgmt</strong>. To close a
          whole company account, write to{" "}
          <a href="mailto:support@prime7erp.com" className="font-medium text-brand-primary hover:underline">
            support@prime7erp.com
          </a>
          .
        </p>
      </section>

      {done ? (
        <div role="status" className="mt-8 flex items-start gap-3 rounded-xl border border-status-success/30 bg-status-success-subtle p-4 text-status-success-foreground">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>Request received. We will contact you at the email address you entered.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-xl border border-border bg-surface-raised p-5 sm:p-6">
          <div>
            <label htmlFor="del-name" className="text-sm font-medium text-text-secondary">Full name **</label>
            <input id="del-name" name="name" required maxLength={200} value={form.name} onChange={onChange} className={`mt-1 ${input}`} />
          </div>
          <div>
            <label htmlFor="del-email" className="text-sm font-medium text-text-secondary">Email you sign in with **</label>
            <input id="del-email" name="email" type="email" required autoComplete="email" value={form.email} onChange={onChange} className={`mt-1 ${input}`} />
          </div>
          <div>
            <label htmlFor="del-company" className="text-sm font-medium text-text-secondary">Company code</label>
            <input id="del-company" name="companyCode" maxLength={64} value={form.companyCode} onChange={onChange} className={`mt-1 ${input} font-mono uppercase`} />
          </div>
          <div>
            <label htmlFor="del-details" className="text-sm font-medium text-text-secondary">Anything else we should know</label>
            <textarea id="del-details" name="details" rows={3} maxLength={2000} value={form.details} onChange={onChange} className={`mt-1 ${input}`} />
          </div>
          <div className="hidden" aria-hidden="true">
            <label htmlFor="del-website">Website</label>
            <input id="del-website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={onChange} />
          </div>
          {error ? <p className="text-sm text-status-danger-foreground">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-primary px-5 font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Send deletion request
          </button>
        </form>
      )}
    </div>
  );
}
