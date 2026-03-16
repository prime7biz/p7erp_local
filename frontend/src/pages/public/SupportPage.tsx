import { Link } from "react-router-dom";
import { Headphones, Mail, MessageCircle, ArrowRight } from "lucide-react";

export function SupportPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-primary/5 via-white to-white py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            <span className="text-primary">Support</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Get help with Prime7 ERP — demos, onboarding, and technical support for your team.
          </p>
          <div className="mt-8">
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white hover:bg-primary/90 transition-colors">
              Contact Support <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Link
              to="/contact"
              className="flex items-start gap-4 rounded-xl border border-gray-200 p-6 hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Contact us</h2>
                <p className="text-sm text-gray-600">Send a message for general inquiries, demos, or partnership.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary ml-auto flex-shrink-0 mt-1" />
            </Link>
            <Link
              to="/contact#support"
              className="flex items-start gap-4 rounded-xl border border-gray-200 p-6 hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Technical support</h2>
                <p className="text-sm text-gray-600">Existing customers: get help with your account or implementation.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary ml-auto flex-shrink-0 mt-1" />
            </Link>
          </div>
          <div className="mt-12 text-center">
            <p className="text-gray-600 mb-4">Prefer to talk? We&apos;re here to help.</p>
            <a
              href="mailto:support@prime7erp.com"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <Headphones className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">support@prime7erp.com</span>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-white font-semibold hover:bg-primary/90 transition-colors"
          >
            Go to Contact
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
