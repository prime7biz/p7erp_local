import { Link } from "react-router-dom";
import { Headphones, Mail, MessageCircle, ArrowRight } from "lucide-react";

export function SupportPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight">
            <span className="text-brand-primary">Support</span>
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            Get help with Prime7 ERP — demos, onboarding, and technical support for your team.
          </p>
          <div className="mt-8">
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Contact Support <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Link
              to="/contact"
              className="flex items-start gap-4 rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                <Mail className="w-6 h-6 text-brand-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary mb-1">Contact us</h2>
                <p className="text-sm text-text-secondary">Send a message for general inquiries, demos, or partnership.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-brand-primary ml-auto flex-shrink-0 mt-1" />
            </Link>
            <Link
              to="/contact#support"
              className="flex items-start gap-4 rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-6 h-6 text-brand-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary mb-1">Technical support</h2>
                <p className="text-sm text-text-secondary">Existing customers: get help with your account or implementation.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-brand-primary ml-auto flex-shrink-0 mt-1" />
            </Link>
          </div>
          <div className="mt-12 text-center">
            <p className="text-text-secondary mb-4">Prefer to talk? We&apos;re here to help.</p>
            <a
              href="mailto:support@prime7erp.com"
              className="inline-flex items-center gap-2 rounded-lg bg-surface-subtle px-4 py-2 text-text-secondary hover:bg-brand-primary/5 hover:text-brand-primary transition-colors"
            >
              <Headphones className="w-5 h-5 text-brand-primary" />
              <span className="text-sm font-medium">support@prime7erp.com</span>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
          >
            Go to Contact
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
