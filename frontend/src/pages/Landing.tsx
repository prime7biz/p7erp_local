import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Palette,
  FileText,
  Package,
  Factory,
  Calculator,
  Users,
  ShieldCheck,
  Brain,
  Landmark,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Lock,
  Shield,
  Server,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  BarChart3,
  Clock,
} from "lucide-react";
import {
  BeforeAfterSection,
  HeroEnhancedSection,
  InteractiveProcessFlowSection,
  LandingTrustHighlights,
  StickyCtaBar,
  TrustBadgesBar,
  WhatsAppFloatingButton,
} from "@/components/public/landing/LandingEnhancements";

const modules = [
  { icon: Palette, title: "Merchandising & Styles", description: "Manage style libraries, tech packs, BOMs, and buyer requirements in a centralized hub.", href: "/features" },
  { icon: FileText, title: "Order & Commercial", description: "Handle purchase orders, LC documentation, amendments, and commercial correspondence seamlessly.", href: "/features" },
  { icon: Package, title: "Inventory & Warehouse", description: "Real-time stock tracking, lot traceability, GRN processing, and multi-warehouse management.", href: "/features" },
  { icon: Factory, title: "Production & WIP", description: "Track cutting, sewing, finishing, and packing with real-time WIP visibility across lines.", href: "/features" },
  { icon: Calculator, title: "Accounting & Finance", description: "Double-entry bookkeeping, voucher management, financial statements, and tax compliance.", href: "/features" },
  { icon: Users, title: "HR & Payroll", description: "Employee records, attendance, leave management, and automated payroll with compliance.", href: "/features" },
  { icon: ShieldCheck, title: "Quality Management", description: "Inline, endline, and final inspections with AQL standards, CAPA tracking, and audit reports.", href: "/features" },
  { icon: Brain, title: "AI Analytics", description: "Demand forecasting, anomaly detection, smart recommendations powered by machine learning.", href: "/features" },
  { icon: Landmark, title: "Bank Reconciliation", description: "Automated bank statement matching, reconciliation reports, and cash flow monitoring.", href: "/features" },
];

const faqs = [
  { q: "What is P7 ERP?", a: "P7 ERP is an AI-powered cloud ERP system designed specifically for garment manufacturers and buying houses. It covers merchandising, production, inventory, LC management, accounting, and HR in one unified platform." },
  { q: "How long does it take to implement P7 ERP?", a: "Most factories are up and running within 2-4 weeks. Our team handles data migration, training, and configuration. You can start with core modules and add more as needed." },
  { q: "Is P7 ERP suitable for small garment factories?", a: "Yes. P7 offers flexible plans for factories of all sizes. The system scales as your business grows." },
  { q: "Does P7 support multi-currency and LC management?", a: "Absolutely. P7 has built-in multi-currency support and comprehensive Letter of Credit management including back-to-back LC, amendments, utilization tracking, and document management." },
  { q: "Can I try P7 ERP before purchasing?", a: "Yes, we offer a free trial with full access to core features. No credit card required." },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-gray-50 transition-colors sm:px-6 sm:py-5"
      >
        <span className="font-semibold text-gray-900 pr-4">{q}</span>
        <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 text-gray-600 leading-relaxed sm:px-6 sm:pb-5 sm:pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

function GradientDivider() {
  return <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />;
}

const btnPrimary =
  "inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-primary/90 transition-colors";
const btnOutline =
  "inline-flex items-center justify-center rounded-xl border border-white/30 bg-transparent px-6 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors";

export function Landing() {
  const [showBdBanner, setShowBdBanner] = useState(true);

  useEffect(() => {
    document.title = "P7 ERP | AI-Powered Garment, RMG & Apparel ERP Software";

    const dismissed = sessionStorage.getItem("bd_banner_dismissed");
    if (dismissed === "1") setShowBdBanner(false);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <StickyCtaBar />
      <WhatsAppFloatingButton />

      {/* Optional BD banner - same as reference */}
      {showBdBanner && (
        <div className="bg-gradient-to-r from-orange-600 to-orange-800 text-white py-2.5 px-4 text-center text-sm relative">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 flex-wrap">
            <span>🇧🇩 Browsing from Bangladesh?</span>
            <Link to="/features" className="underline font-semibold hover:text-orange-200">
              View Bangladesh-specific ERP features →
            </Link>
            <button
              type="button"
              onClick={() => {
                setShowBdBanner(false);
                sessionStorage.setItem("bd_banner_dismissed", "1");
              }}
              className="text-white/70 hover:text-white sm:absolute sm:right-3 sm:top-1/2 sm:-translate-y-1/2"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <HeroEnhancedSection />
      <TrustBadgesBar />
      <BeforeAfterSection />

      {/* Demo Video placeholder */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">See P7 ERP in Action</h2>
          <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
            Watch a quick walkthrough of how garment manufacturers manage their entire operation — from order to shipment — in one platform.
          </p>
          <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video shadow-2xl border border-gray-200">
            <video className="w-full h-full object-contain" controls playsInline poster="">
              <source src="/demo-intro.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      {/* Problem-Solution */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Why Garment Factories Choose P7</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              We understand the unique challenges of the garment industry and built solutions that address them head-on.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}>
              <h3 className="text-xl font-bold text-red-600 mb-6 flex items-center gap-2">
                <XCircle className="h-6 w-6" />
                The Challenges RMG Manufacturers Face
              </h3>
              <div className="space-y-5">
                {[
                  { title: "Disconnected Excel Spreadsheets", desc: "Critical data scattered across dozens of files with no single source of truth." },
                  { title: "LC Deadline Misses", desc: "Missed shipment dates and LC expiry leading to financial penalties and buyer dissatisfaction." },
                  { title: "Costing Errors", desc: "Manual cost calculations resulting in underquoting, margin erosion, and lost profits." },
                  { title: "Compliance Gaps", desc: "Difficulty maintaining audit trails for buyer audits, social compliance, and regulatory requirements." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4 p-4 rounded-xl bg-red-50 border border-red-100">
                    <div className="shrink-0 mt-0.5">
                      <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-red-500" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{item.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ delay: 0.1 }}>
              <h3 className="text-xl font-bold text-orange-600 mb-6 flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6" />
                How P7 Solves Them
              </h3>
              <div className="space-y-5">
                {[
                  { title: "Unified Platform", desc: "All departments — merchandising, production, inventory, accounts — connected in one cloud system." },
                  { title: "TNA Alerts & Tracking", desc: "Automated Time & Action calendar with real-time alerts so you never miss a critical deadline.", link: "/features" },
                  { title: "AI-Powered Costing", desc: "Intelligent cost estimation using historical data, material prices, and production benchmarks.", link: "/features" },
                  { title: "Complete Audit Trails", desc: "Every action logged with timestamps, user tracking, and full compliance documentation." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4 p-4 rounded-xl bg-orange-50 border border-orange-100">
                    <div className="shrink-0 mt-0.5">
                      <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-orange-600" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {item.link ? (
                          <Link to={item.link} className="text-primary hover:underline">{item.title}</Link>
                        ) : (
                          item.title
                        )}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <GradientDivider />

      {/* Core Modules Grid */}
      <section className="relative py-14 sm:py-20 bg-gray-50 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-20 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Everything You Need, All in One Place</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              9 integrated modules covering every aspect of garment manufacturing and export operations.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((mod) => (
              <Link key={mod.title} to={mod.href}>
                <div className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:shadow-gray-200/50 transition-all duration-300 hover:-translate-y-1 group cursor-pointer h-full">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                    <mod.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{mod.title}</h3>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed">{mod.description}</p>
                  <span className="inline-flex items-center gap-1 mt-3 text-sm text-primary font-medium group-hover:underline">
                    Learn more <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-12 text-center">
            <p className="text-sm text-gray-500 mb-4">Learn more from our resources</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/features" className="text-sm text-primary hover:underline">What is Garment ERP? →</Link>
              <Link to="/features" className="text-sm text-primary hover:underline">5 Signs You Need ERP →</Link>
              <Link to="/features" className="text-sm text-primary hover:underline">AI in Apparel Industry →</Link>
            </div>
          </div>
        </div>
      </section>

      <GradientDivider />

      <InteractiveProcessFlowSection />

      <LandingTrustHighlights />

      <GradientDivider />

      {/* AI Highlights */}
      <section className="relative py-14 sm:py-20 bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950 text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{ backgroundImage: "url(/images/tech-pattern.png)", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute top-10 left-[10%] w-2 h-2 bg-orange-400/40 rounded-full pointer-events-none animate-pulse" />
        <div className="absolute top-[30%] right-[8%] w-2.5 h-2.5 bg-amber-400/40 rounded-full pointer-events-none animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-500/20 rounded-full px-4 py-1.5 mb-6">
                <Brain className="h-4 w-4 text-orange-400" />
                <span className="text-sm text-orange-300 font-medium">Artificial Intelligence</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold">AI That Understands Your Business</h2>
              <p className="mt-4 text-lg text-gray-400 max-w-xl">
                Leverage machine learning trained on garment industry data to make smarter, faster decisions.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-64 h-64 sm:w-80 sm:h-80">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-full blur-2xl pointer-events-none" />
                <img src="/images/ai-brain.png" alt="AI analytics" width={512} height={512} className="relative w-full h-full object-contain drop-shadow-2xl" loading="lazy" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: TrendingUp, title: "Demand Forecasting", description: "Predict material needs based on historical order patterns, seasonal trends, and buyer behavior to optimize procurement." },
              { icon: AlertTriangle, title: "Anomaly Detection", description: "Automatically flag unusual transactions, cost overruns, and production bottlenecks before they impact your bottom line." },
              { icon: Lightbulb, title: "Smart Recommendations", description: "Get actionable suggestions to optimize inventory levels, production scheduling, and cash flow management." },
            ].map((item) => (
              <div key={item.title} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center mb-6 shadow-lg">
                  <item.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider />

      {/* Security */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Enterprise-Grade Security</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Your business data is protected with industry-leading security measures at every layer.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Lock, title: "Encrypted Data", desc: "AES-256 encryption at rest and TLS 1.3 in transit for all data." },
              { icon: Shield, title: "Role-Based Access", desc: "Granular permissions ensure users only see what they need." },
              { icon: BarChart3, title: "Audit Logging", desc: "Every action tracked with timestamps for full accountability." },
              { icon: Server, title: "Multi-Tenant Isolation", desc: "Complete data separation between organizations guaranteed." },
            ].map((item) => (
              <div key={item.title} className="text-center p-6 rounded-2xl bg-gray-50 border border-gray-100">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">{item.title}</h4>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="py-14 sm:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Choose the plan that fits your factory size. No hidden fees, no long-term contracts required.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: "Starter", price: "BDT 15,000", period: "/mo", users: "Up to 10 users", features: ["Core ERP modules", "Merchandising & orders", "Basic inventory", "Email support"], highlighted: false },
              { name: "Growth", price: "BDT 35,000", period: "/mo", users: "Up to 50 users", features: ["All Starter features", "AI analytics & forecasting", "Production tracking", "Priority support"], highlighted: true },
              { name: "Enterprise", price: "Custom", period: "", users: "Unlimited users", features: ["All Growth features", "Custom integrations", "Dedicated account manager", "On-site training"], highlighted: false },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border ${plan.highlighted ? "bg-primary text-white border-primary shadow-xl shadow-primary/20 relative" : "bg-white border-gray-200"}`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white text-xs font-bold px-4 py-1 rounded-full">Most Popular</div>
                )}
                <h3 className={`text-lg font-semibold ${plan.highlighted ? "text-white" : "text-gray-900"}`}>{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold ${plan.highlighted ? "text-white" : "text-gray-900"}`}>{plan.price}</span>
                  {plan.period && <span className={`text-sm ${plan.highlighted ? "text-blue-200" : "text-gray-500"}`}>{plan.period}</span>}
                </div>
                <p className={`mt-2 text-sm ${plan.highlighted ? "text-white/70" : "text-gray-500"}`}>{plan.users}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 ${plan.highlighted ? "text-white/70" : "text-primary"}`} />
                      <span className={plan.highlighted ? "text-white/90" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/pricing"
                  className={`block w-full mt-8 rounded-xl text-center font-medium py-3 ${plan.highlighted ? "bg-white text-primary hover:bg-gray-50" : "bg-primary text-white hover:bg-primary/90"}`}
                >
                  {plan.name === "Enterprise" ? "Contact Sales" : "Get Started"}
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-5 py-2.5 text-gray-700 font-medium hover:bg-gray-50">
              View Full Pricing
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Frequently Asked Questions</h2>
            <p className="mt-4 text-lg text-gray-500">Common questions from garment manufacturers considering P7 ERP.</p>
          </div>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Explore More */}
      <section className="py-10 sm:py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Explore More</h2>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <Link to="/garments-erp" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors shadow-sm">
              Garments ERP <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/buying-house-erp" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors shadow-sm">
              Buying House ERP <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/features" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors shadow-sm">
              All Features <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/features" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors shadow-sm">
              Blog & Resources <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-14 sm:py-20 bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950 overflow-hidden">
        <img src="/images/hero-factory.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.12] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-gray-900/80 pointer-events-none" />
        <div className="absolute top-10 -left-32 w-80 h-80 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            Ready to Transform Your Garment Business?
          </h2>
          <p className="mt-6 text-lg text-gray-300 max-w-2xl mx-auto">
            Join hundreds of garment manufacturers worldwide who have streamlined their operations with P7 ERP.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup" className={`${btnPrimary} px-8 py-4 bg-primary shadow-xl shadow-primary/30`}>
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link to="/contact" className={btnOutline}>
              Talk to Sales
            </Link>
          </div>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 text-sm text-gray-400 sm:flex-row sm:gap-8">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-orange-400" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              <span>Setup in minutes</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
