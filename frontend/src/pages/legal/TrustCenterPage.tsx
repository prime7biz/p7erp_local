import { Link } from "react-router-dom";
import {
  Shield,
  Lock,
  Activity,
  FileCheck,
  Brain,
  Database,
  ArrowRight,
  Mail,
  MessageCircle,
} from "lucide-react";
import { trustCenterContent } from "@/data/legal/trustCenter";
import { ALL_TRUST_LEGAL_LINKS } from "@/data/legal/resourceLinks";
import { formatLegalDate } from "@/data/legal/formatLegalDate";
import { StatusCard } from "@/components/legal/StatusCard";
import { TrustBadge } from "@/components/legal/TrustBadge";
import { LegalResourceLinkCard } from "@/components/legal/LegalResourceLinkCard";

const pillarIcons = [Shield, Lock, Activity, FileCheck, Brain, Database] as const;

export function TrustCenterPage() {
  const { heroTitle, heroSubtitle, pillars, quickFacts, operationalBullets, faqs, version, lastUpdated } =
    trustCenterContent;

  return (
    <div className="bg-surface-raised">
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-surface-inverse via-surface-inverse to-brand-primary/25 text-text-inverse">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_0%,rgba(249,115,22,0.15),transparent)] pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <TrustBadge variant="inverse">Security · Privacy · Reliability</TrustBadge>
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">{heroTitle}</h1>
          <p className="mt-4 text-lg text-text-inverse/85 max-w-2xl leading-relaxed">{heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow-lg shadow-brand-primary/25 hover:bg-brand-primary/90 transition-colors"
            >
              Talk to sales
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/support"
              className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-text-inverse hover:bg-white/15 transition-colors"
            >
              Support
            </Link>
          </div>
          <p className="mt-8 text-xs text-text-inverse/60">
            Hub version {version} · Last updated {formatLegalDate(lastUpdated)}
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <h2 className="text-2xl font-bold text-text-primary text-center mb-2">Trust pillars</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-10 text-sm sm:text-base">
          How we think about protecting your organization across the full ERP lifecycle.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {pillars.map((p, i) => {
            const Icon = pillarIcons[i] ?? Shield;
            return (
              <StatusCard key={p.id} title={p.title} icon={Icon}>
                <p>{p.description}</p>
              </StatusCard>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-surface-subtle/80 py-14 lg:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-text-primary mb-6">Quick facts</h2>
          <div className="flex flex-wrap gap-2">
            {quickFacts.map((fact) => (
              <TrustBadge key={fact} variant="muted">
                {fact}
              </TrustBadge>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <h2 className="text-2xl font-bold text-text-primary mb-2">Policies and documents</h2>
        <p className="text-text-secondary mb-8 max-w-2xl text-sm sm:text-base">
          Official legal and trust pages for procurement, IT review, and leadership sign-off.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL_TRUST_LEGAL_LINKS.map((r) => (
            <LegalResourceLinkCard key={r.to} to={r.to} title={r.label} description={r.description} />
          ))}
        </div>
        <p className="mt-6 text-sm text-text-secondary">
          For a narrative overview of security controls, see{" "}
          <Link to="/legal/security-compliance" className="text-brand-primary font-medium hover:underline">
            Security &amp; Compliance
          </Link>
          . For product marketing security highlights, see{" "}
          <Link to="/security" className="text-brand-primary font-medium hover:underline">
            Security
          </Link>
          .
        </p>
      </section>

      <section className="border-t border-border bg-surface-raised py-14 lg:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-text-primary mb-6">Operational transparency</h2>
          <ul className="space-y-3 max-w-3xl">
            {operationalBullets.map((b) => (
              <li key={b} className="flex gap-3 text-text-secondary text-sm sm:text-base">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <h2 className="text-2xl font-bold text-text-primary mb-8">Frequently asked questions</h2>
        <dl className="space-y-8 max-w-3xl">
          {faqs.map((f) => (
            <div key={f.id} className="border-b border-border pb-8 last:border-0 last:pb-0">
              <dt className="text-base font-semibold text-text-primary">{f.question}</dt>
              <dd className="mt-2 text-sm sm:text-base text-text-secondary leading-relaxed">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-border bg-gradient-to-b from-brand-primary/5 to-surface-raised py-14 lg:py-16 print-avoid-break">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-text-primary mb-3">Need a deeper review?</h2>
          <p className="text-text-secondary mb-8 max-w-xl mx-auto">
            Request enterprise onboarding, a DPA, security questionnaire support, or a conversation with our team.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors"
            >
              <Mail className="h-4 w-4" aria-hidden />
              Contact sales
            </Link>
            <Link
              to="/support"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-6 py-3 text-sm font-semibold text-text-primary hover:bg-surface-subtle transition-colors"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Open support
            </Link>
            <a
              href="mailto:security@prime7erp.com?subject=Prime7%20ERP%20security%20review"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-raised px-6 py-3 text-sm font-semibold text-text-primary hover:bg-surface-subtle transition-colors"
            >
              Email security
            </a>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 pb-10">
        <Link to="/" className="text-sm text-brand-primary hover:underline inline-flex items-center gap-1">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
