import { Link } from "react-router-dom";
import { Scale, ArrowRight, CheckCircle2 } from "lucide-react";

const points = [
  "Built for garment manufacturers and buying houses, not generic business",
  "AI-powered insights and automation from day one",
  "Transparent pricing with no hidden fees",
  "Fast setup — from sign-up to go-live in days, not months",
  "Multi-tenant cloud with enterprise-grade security",
];

export function ErpComparisonPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight">
            Why <span className="text-brand-primary">Prime7 ERP</span>?
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            See how a purpose-built garment ERP compares. Simple, transparent, and designed for the way you work.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-semibold text-text-secondary hover:border-border-strong hover:text-brand-primary hover:bg-brand-primary/5 transition-colors">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
              <Scale className="w-8 h-8 text-brand-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-8 text-center">What sets us apart</h2>
          <ul className="max-w-2xl mx-auto space-y-4">
            {points.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-text-secondary">
                <CheckCircle2 className="w-6 h-6 text-brand-primary flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-text-secondary mb-6">Compare plans or explore all features.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
            >
              View Pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-primary text-brand-primary px-6 py-3 font-semibold hover:bg-brand-primary/5 transition-colors"
            >
              All Features
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
