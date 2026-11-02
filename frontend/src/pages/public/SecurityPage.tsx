import { Link } from "react-router-dom";
import {
  Lock,
  ShieldCheck,
  FileSearch,
  Server,
  Database,
  Award,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

// Keep every statement here verifiable in the product or in /legal docs; no certifications we do not hold.
const securityFeatures = [
  {
    icon: Lock,
    title: "Encrypted connections & hashed passwords",
    description:
      "All traffic to Prime7 ERP uses HTTPS. Passwords are stored only as bcrypt hashes, never in plain text, and login checks take the same time whether or not an account exists.",
    color: "bg-brand-primary/10 text-brand-primary",
  },
  {
    icon: ShieldCheck,
    title: "Roles, permissions & approvals",
    description:
      "Each user has a role with module-level permissions. Vouchers, payroll runs and purchase documents move through approval steps that only managers or permitted roles can complete.",
    color: "bg-status-success-subtle text-status-success-foreground",
  },
  {
    icon: FileSearch,
    title: "Audit trail",
    description:
      "Key actions are recorded with who did what and when — including approvals, external portal access and AI tool use — so managers can review changes.",
    color: "bg-status-warning-subtle text-status-warning-foreground",
  },
  {
    icon: Server,
    title: "Company data isolation",
    description:
      "Every record belongs to one company account, and every query is filtered by that company. Automated tests check that one company cannot read another company's orders, vouchers, stock or staff.",
    color: "bg-status-info-subtle text-status-info-foreground",
  },
  {
    icon: Database,
    title: "Login protection",
    description:
      "Repeated failed logins lock the account temporarily. Customer and financier portal sessions can be revoked instantly, and password-reset links work only once.",
    color: "bg-status-danger-subtle text-status-danger-foreground",
  },
  {
    icon: Award,
    title: "Honest about compliance",
    description:
      "We do not claim ISO 27001 or SOC 2 certification. Our security program follows widely accepted practices; details are in our Security & Compliance document.",
    color: "bg-brand-primary/10 text-brand-primary",
  },
];

const infrastructure = [
  "Hosted on a dedicated cloud server, with traffic served through Cloudflare",
  "Target of 99.5% monthly uptime, as defined in our published SLA",
  "Application and database run in isolated containers with separate networks",
  "Updates are released as versioned builds with a documented rollback path",
];

const privacy = [
  "GDPR-aware privacy design, described in our Privacy Policy",
  "You own your data — export lists to Excel or CSV at any time",
  "A Data Processing Agreement is available",
  "No sharing of your business data with third parties for advertising",
];

export function SecurityPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight">
            Security & <span className="text-brand-primary">Privacy</span>
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            What we actually do to protect your company&apos;s data — no badges we have not earned.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/book-demo" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Book a demo <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-semibold text-text-primary hover:bg-surface-subtle transition-colors">
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-10 text-center">Security Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((f, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm hover:shadow-md hover:border-border-strong transition-all"
              >
                <div className={`inline-flex rounded-lg p-3 ${f.color}`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="mt-4 font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-surface-raised rounded-xl p-6 lg:p-8 border border-border">
              <h3 className="text-xl font-semibold text-text-primary mb-4">Infrastructure</h3>
              <ul className="space-y-2">
                {infrastructure.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-text-secondary">
                    <CheckCircle2 className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-surface-raised rounded-xl p-6 lg:p-8 border border-border">
              <h3 className="text-xl font-semibold text-text-primary mb-4">Privacy</h3>
              <ul className="space-y-2">
                {privacy.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-text-secondary">
                    <CheckCircle2 className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-text-secondary mb-6">Legal, privacy, and enterprise-ready trust documentation.</p>
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <Link
              to="/trust-center"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
            >
              Trust Center
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/legal/security-compliance"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-6 py-3 text-text-primary font-semibold hover:bg-surface-subtle transition-colors"
            >
              Security &amp; Compliance
            </Link>
            <Link
              to="/legal/privacy"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-6 py-3 text-text-primary font-semibold hover:bg-surface-subtle transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
