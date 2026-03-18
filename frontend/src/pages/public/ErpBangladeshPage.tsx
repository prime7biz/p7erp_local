import { Link } from "react-router-dom";
import { MapPin, Factory, ArrowRight } from "lucide-react";

export function ErpBangladeshPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight">
            ERP for <span className="text-brand-primary">Bangladesh</span>
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            Built for the heart of global garment manufacturing. Prime7 ERP is designed for Bangladesh&apos;s RMG sector — from Dhaka to Chittagong.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/garments-erp" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-semibold text-text-secondary hover:border-border-strong hover:text-brand-primary hover:bg-brand-primary/5 transition-colors">
              Garments ERP
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg bg-brand-primary/10 text-brand-primary px-3 py-1.5 text-sm font-medium mb-4">
                <MapPin className="h-4 w-4" />
                RMG focus
              </div>
              <h2 className="text-2xl font-semibold text-text-primary mb-4">Purpose-built for Bangladesh RMG</h2>
              <p className="text-text-secondary leading-relaxed mb-4">
                Garment manufacturers and buying houses in Bangladesh need ERP that speaks their language — from BDT and LC workflows to compliance and production tracking. Prime7 ERP delivers exactly that.
              </p>
              <p className="text-text-secondary leading-relaxed">
                Multi-tenant, cloud-first, and ready for your factory or buying house. Start with a free trial and scale as you grow.
              </p>
            </div>
            <div className="flex justify-center">
              <div className="w-48 h-48 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
                <Factory className="w-24 h-24 text-brand-primary" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-text-secondary mb-6">Explore our full garment manufacturing solution or start your free trial.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/garments-erp"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
            >
              Garments ERP
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-primary text-brand-primary px-6 py-3 font-semibold hover:bg-brand-primary/5 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
