import { Link } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";

export function BlogPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-base to-surface-base py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight">
            Blog & <span className="text-brand-primary">Articles</span>
          </h1>
          <p className="mt-6 text-lg text-text-muted max-w-3xl mx-auto leading-relaxed">
            Industry insights, product updates, and best practices for garment manufacturing and buying house operations.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/features" className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Explore Features <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-semibold text-text-secondary hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary/5 transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-brand-primary/10 text-brand-primary mb-6">
            <BookOpen className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-semibold text-text-primary mb-4">Coming soon</h2>
          <p className="text-text-muted max-w-2xl mx-auto mb-8 leading-relaxed">
            We&apos;re preparing articles and guides to help you get the most out of Prime7 ERP. In the meantime, explore our product or get in touch.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/features"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
            >
              Explore Features
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-primary text-brand-primary px-6 py-3 font-semibold hover:bg-brand-primary/5 transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
