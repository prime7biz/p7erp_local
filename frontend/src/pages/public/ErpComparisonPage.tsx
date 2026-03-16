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
      <section className="relative bg-gradient-to-br from-primary/5 via-white to-white py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            Why <span className="text-primary">Prime7 ERP</span>?
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            See how a purpose-built garment ERP compares. Simple, transparent, and designed for the way you work.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white hover:bg-primary/90 transition-colors">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Scale className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">What sets us apart</h2>
          <ul className="max-w-2xl mx-auto space-y-4">
            {points.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-gray-700">
                <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 mb-6">Compare plans or explore all features.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-white font-semibold hover:bg-primary/90 transition-colors"
            >
              View Pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center gap-2 rounded-lg border border-primary text-primary px-6 py-3 font-semibold hover:bg-primary/5 transition-colors"
            >
              All Features
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
