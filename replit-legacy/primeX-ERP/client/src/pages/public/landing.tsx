import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
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
  Play,
  CheckCircle2,
  XCircle,
  Lock,
  Shield,
  Server,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  Zap,
  BarChart3,
  Clock,
} from "lucide-react";
import { useState, useEffect } from "react";
import heroDashboard from "../../assets/images/hero-dashboard.png";
import heroFactory from "@assets/hero-futuristic-wide.png";

import aiBrain from "@assets/ai-brain-orange.png";
import techPatternBg from "../../assets/images/tech-pattern-bg.png";

const jsonLdSchemas = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Prime7 ERP",
    url: "https://prime7erp.com",
    logo: "https://prime7erp.com/logo.png",
    description:
      "AI-driven cloud ERP for garment manufacturers and buying houses worldwide.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: "info@prime7erp.com",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Prime7 ERP",
    url: "https://prime7erp.com",
    telephone: "+880 1892-787220",
    email: "info@prime7erp.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Gulshan-2",
      addressLocality: "Dhaka",
      postalCode: "1212",
      addressCountry: "BD",
    },
    areaServed: ["Bangladesh", "South Asia", "Global"],
    description: "AI-driven cloud ERP for garment manufacturers and buying houses worldwide.",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Prime7 ERP",
    applicationCategory: ["BusinessApplication", "ERP", "Apparel Management Software"],
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free trial available. Plans starting from $149/month.",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "127",
      bestRating: "5",
      worstRating: "1",
    },
    description:
      "AI-powered cloud ERP solution for garment manufacturing, merchandising, production tracking, inventory management, LC processing, and accounting.",
    keywords:
      "garments ERP, RMG ERP software, garment manufacturing ERP, buying house management software, clothing industry ERP, apparel ERP",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Prime7 ERP?",
        acceptedAnswer: { "@type": "Answer", text: "Prime7 ERP is an AI-powered cloud ERP system designed specifically for garment manufacturers and buying houses. It covers merchandising, production, inventory, LC management, accounting, and HR in one unified platform." },
      },
      {
        "@type": "Question",
        name: "How long does it take to implement Prime7 ERP?",
        acceptedAnswer: { "@type": "Answer", text: "Most factories are up and running within 2-4 weeks. Our team handles data migration, training, and configuration. You can start with core modules and add more as needed." },
      },
      {
        "@type": "Question",
        name: "Is Prime7 ERP suitable for small garment factories?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. Prime7 offers flexible plans starting from our Starter package for factories with up to 10 users. The system scales as your business grows." },
      },
      {
        "@type": "Question",
        name: "Does Prime7 support multi-currency and LC management?",
        acceptedAnswer: { "@type": "Answer", text: "Absolutely. Prime7 has built-in multi-currency support and comprehensive Letter of Credit management including back-to-back LC, amendments, utilization tracking, and document management." },
      },
      {
        "@type": "Question",
        name: "Can I try Prime7 ERP before purchasing?",
        acceptedAnswer: { "@type": "Answer", text: "Yes, we offer a 14-day free trial with full access to all features. No credit card required." },
      },
    ],
  },
];

const modules = [
  {
    icon: Palette,
    title: "Merchandising & Styles",
    description:
      "Manage style libraries, tech packs, BOMs, and buyer requirements in a centralized hub.",
    href: "/modules/merchandising",
  },
  {
    icon: FileText,
    title: "Order & Commercial",
    description:
      "Handle purchase orders, LC documentation, amendments, and commercial correspondence seamlessly.",
    href: "/modules/lc-processing",
  },
  {
    icon: Package,
    title: "Inventory & Warehouse",
    description:
      "Real-time stock tracking, lot traceability, GRN processing, and multi-warehouse management.",
    href: "/modules/inventory",
  },
  {
    icon: Factory,
    title: "Production & WIP",
    description:
      "Track cutting, sewing, finishing, and packing with real-time WIP visibility across lines.",
    href: "/modules/production",
  },
  {
    icon: Calculator,
    title: "Accounting & Finance",
    description:
      "Double-entry bookkeeping, voucher management, financial statements, and tax compliance.",
    href: "/modules/accounting",
  },
  {
    icon: Users,
    title: "HR & Payroll",
    description:
      "Employee records, attendance, leave management, and automated payroll with compliance.",
    href: "/modules/hr-payroll",
  },
  {
    icon: ShieldCheck,
    title: "Quality Management",
    description:
      "Inline, endline, and final inspections with AQL standards, CAPA tracking, and audit reports.",
    href: "/modules/quality-management",
  },
  {
    icon: Brain,
    title: "AI Analytics",
    description:
      "Demand forecasting, anomaly detection, smart recommendations powered by machine learning.",
    href: "/modules/reports-analytics",
  },
  {
    icon: Landmark,
    title: "Bank Reconciliation",
    description:
      "Automated bank statement matching, reconciliation reports, and cash flow monitoring.",
    href: "/modules/accounting",
  },
];

const workflowSteps = [
  { step: 1, title: "Inquiry & Costing" },
  { step: 2, title: "Sample Development" },
  { step: 3, title: "Order Confirmation" },
  { step: 4, title: "Production Planning" },
  { step: 5, title: "Quality Control" },
  { step: 6, title: "Shipment & LC" },
];

const faqs = [
  {
    q: "What is Prime7 ERP?",
    a: "Prime7 ERP is an AI-powered cloud ERP system designed specifically for garment manufacturers and buying houses. It covers merchandising, production, inventory, LC management, accounting, and HR in one unified platform.",
  },
  {
    q: "How long does it take to implement Prime7 ERP?",
    a: "Most factories are up and running within 2-4 weeks. Our team handles data migration, training, and configuration. You can start with core modules and add more as needed.",
  },
  {
    q: "Is Prime7 ERP suitable for small garment factories?",
    a: "Yes. Prime7 offers flexible plans starting from our Starter package for factories with up to 10 users. The system scales as your business grows.",
  },
  {
    q: "Does Prime7 support multi-currency and LC management?",
    a: "Absolutely. Prime7 has built-in multi-currency support and comprehensive Letter of Credit management including back-to-back LC, amendments, utilization tracking, and document management.",
  },
  {
    q: "Can I try Prime7 ERP before purchasing?",
    a: "Yes, we offer a 14-day free trial with full access to all features. No credit card required.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 pr-4">{q}</span>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

function GradientDivider() {
  return (
    <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
  );
}

export default function LandingPage() {
  const [showBdBanner, setShowBdBanner] = useState(false);

  useEffect(() => {
    fetch('/api/geo/detect')
      .then(res => res.json())
      .then(data => {
        if (data.country === 'BD') {
          const dismissed = sessionStorage.getItem('bd_banner_dismissed');
          if (!dismissed) setShowBdBanner(true);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <PublicLayout>
      {showBdBanner && (
        <div className="bg-gradient-to-r from-orange-600 to-orange-800 text-white py-2.5 px-4 text-center text-sm relative">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 flex-wrap">
            <span>🇧🇩 Browsing from Bangladesh?</span>
            <Link href="/erp-software-bangladesh">
              <span className="underline font-semibold hover:text-orange-200 cursor-pointer">
                View Bangladesh-specific ERP features →
              </span>
            </Link>
            <button
              onClick={() => { setShowBdBanner(false); sessionStorage.setItem('bd_banner_dismissed', '1'); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <SEOHead
        title="Prime7 ERP | AI-Powered Garment, RMG & Apparel ERP Software"
        description="Cloud ERP for garment manufacturers & buying houses. AI-powered merchandising, production planning, inventory, LC management, Tally-style accounting, WIP tracking & reports. Free trial."
        canonical="https://prime7erp.com/"
        keywords="garments ERP, RMG ERP software, apparel ERP software, garment manufacturing ERP, buying house management software, clothing industry ERP, cloud ERP garments, multi-tenant ERP"
        jsonLd={jsonLdSchemas}
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}]}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[hsl(24,90%,15%)] via-[hsl(24,85%,25%)] to-[hsl(20,80%,12%)]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTRWMjhIMjR2MmgxMnptMC00VjI0SDI0djJoMTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        <div className="absolute top-20 -left-40 w-80 h-80 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 -right-32 w-96 h-96 bg-orange-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-1/3 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[15%] left-[10%] w-1.5 h-1.5 bg-orange-200/50 rounded-full animate-pulse" />
          <div className="absolute top-[40%] right-[25%] w-1.5 h-1.5 bg-orange-200/40 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
          <div className="absolute top-[70%] left-[60%] w-1 h-1 bg-amber-200/50 rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />
        </div>
        <img src={heroFactory} alt="AI-powered garment manufacturing factory" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover opacity-[0.18] pointer-events-none mix-blend-luminosity" loading="eager" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-28">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-8">
              <Zap className="h-4 w-4 text-yellow-300" />
              <span className="text-sm text-white/90 font-medium">
                AI-Powered Cloud ERP for Garment Industry
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
              The Only ERP Built Specifically for{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(35,100%,80%)] to-[hsl(24,95%,70%)]">
                Garment Manufacturers
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-white/80 max-w-3xl mx-auto leading-relaxed">
              Manage merchandising, production, inventory, LC processing, and
              accounting in one unified platform. Purpose-built for garment
              manufacturers and buying houses.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/app/register">
                <Button
                  size="lg"
                  className="bg-primary text-white hover:bg-primary/90 font-semibold px-8 py-6 text-base shadow-xl shadow-black/20 rounded-xl"
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 font-semibold px-8 py-6 text-base rounded-xl bg-transparent"
                >
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
            {[
              { value: "500+", label: "Styles Managed" },
              { value: "99.9%", label: "Uptime" },
              { value: "$50M+", label: "Processed" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-5 border border-white/10"
              >
                <div className="text-3xl font-bold text-white">
                  {stat.value}
                </div>
                <div className="text-sm text-orange-200 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Trusted By Section */}
      <section className="py-12 bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-gray-500 uppercase tracking-widest">
            Trusted by garment manufacturers across the world
          </p>
          <div className="mt-6 flex items-center justify-center">
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
            <div className="mx-4 h-2 w-2 rounded-full bg-primary/30" />
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
          </div>
        </div>
      </section>

      {/* 1-Minute Demo Video */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">See Prime7 ERP in Action</h2>
          <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">Watch a quick walkthrough of how garment manufacturers manage their entire operation — from order to shipment — in one platform.</p>
          <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video shadow-2xl border border-gray-200">
            <video
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              poster=""
            >
              <source src="/demo-intro.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between pointer-events-none">
              <div>
                <p className="text-white font-semibold text-lg drop-shadow-lg">Prime7 ERP — AI-Powered Garment Manufacturing</p>
                <p className="text-white/70 text-sm drop-shadow-lg">From inquiry to shipment, all in one platform</p>
              </div>
              <Link href="/contact">
                <Button className="pointer-events-auto bg-primary hover:bg-primary/90 text-white font-medium shadow-lg">
                  Book a Live Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem-Solution Section */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Why Garment Factories Choose Prime7
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              We understand the unique challenges of the garment industry
              and built solutions that address them head-on.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
            <div>
              <h3 className="text-xl font-bold text-red-600 mb-6 flex items-center gap-2">
                <XCircle className="h-6 w-6" />
                The Challenges RMG Manufacturers Face
              </h3>
              <div className="space-y-5">
                {[
                  {
                    title: "Disconnected Excel Spreadsheets",
                    desc: "Critical data scattered across dozens of files with no single source of truth.",
                  },
                  {
                    title: "LC Deadline Misses",
                    desc: "Missed shipment dates and LC expiry leading to financial penalties and buyer dissatisfaction.",
                  },
                  {
                    title: "Costing Errors",
                    desc: "Manual cost calculations resulting in underquoting, margin erosion, and lost profits.",
                  },
                  {
                    title: "Compliance Gaps",
                    desc: "Difficulty maintaining audit trails for buyer audits, social compliance, and regulatory requirements.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-4 p-4 rounded-xl bg-red-50 border border-red-100"
                  >
                    <div className="shrink-0 mt-0.5">
                      <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-red-500" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {item.title}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-orange-600 mb-6 flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6" />
                How Prime7 Solves Them
              </h3>
              <div className="space-y-5">
                {[
                  {
                    title: "Unified Platform",
                    desc: "All departments — merchandising, production, inventory, accounts — connected in one cloud system.",
                  },
                  {
                    title: "TNA Alerts & Tracking",
                    desc: "Automated Time & Action calendar with real-time alerts so you never miss a critical deadline.",
                    link: "/features",
                  },
                  {
                    title: "AI-Powered Costing",
                    desc: "Intelligent cost estimation using historical data, material prices, and production benchmarks.",
                    link: "/features",
                  },
                  {
                    title: "Complete Audit Trails",
                    desc: "Every action logged with timestamps, user tracking, and full compliance documentation.",
                  },
                ].map((item: { title: string; desc: string; link?: string }) => (
                  <div
                    key={item.title}
                    className="flex gap-4 p-4 rounded-xl bg-orange-50 border border-orange-100"
                  >
                    <div className="shrink-0 mt-0.5">
                      <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-orange-600" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {item.link ? (
                          <Link href={item.link}><span className="text-primary hover:underline cursor-pointer">{item.title}</span></Link>
                        ) : (
                          item.title
                        )}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <GradientDivider />

      {/* Core Modules Grid */}
      <section className="relative py-14 sm:py-20 bg-gray-50 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-20 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Everything You Need, All in One Place
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              9 integrated modules covering every aspect of garment
              manufacturing and export operations.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((mod) => (
              <Link key={mod.title} href={mod.href}>
                <div className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:shadow-gray-200/50 transition-all duration-300 hover:-translate-y-1 group cursor-pointer h-full">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                    <mod.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {mod.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                    {mod.description}
                  </p>
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
              <Link href="/resources/what-is-erp-garment-manufacturing"><span className="text-sm text-primary hover:underline cursor-pointer">What is Garment ERP? →</span></Link>
              <Link href="/resources/signs-factory-needs-erp"><span className="text-sm text-primary hover:underline cursor-pointer">5 Signs You Need ERP →</span></Link>
              <Link href="/resources/ai-transforming-apparel-industry"><span className="text-sm text-primary hover:underline cursor-pointer">AI in Apparel Industry →</span></Link>
            </div>
          </div>
        </div>
      </section>

      <GradientDivider />

      {/* Workflow Steps */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              From Order to Shipment in 6 Steps
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              A streamlined workflow that takes you from buyer inquiry to final
              shipment with full visibility at every stage.
            </p>
          </div>

          {/* Desktop timeline */}
          <div className="hidden lg:block relative">
            <div className="absolute top-8 left-[8%] right-[8%] h-0.5 bg-gradient-to-r from-orange-200 via-primary/40 to-amber-200" />
            <div className="grid grid-cols-6 gap-4">
              {workflowSteps.map((ws) => (
                <div key={ws.step} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 h-16 w-16 rounded-full bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/25">
                    {ws.step}
                  </div>
                  <h4 className="mt-4 font-semibold text-gray-900 text-sm">
                    {ws.title}
                  </h4>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile timeline */}
          <div className="lg:hidden space-y-4">
            {workflowSteps.map((ws, i) => (
              <div key={ws.step} className="flex items-center gap-4">
                <div className="relative flex flex-col items-center">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center text-white font-bold shadow-md">
                    {ws.step}
                  </div>
                  {i < workflowSteps.length - 1 && (
                    <div className="w-0.5 h-6 bg-primary/20 mt-1" />
                  )}
                </div>
                <h4 className="font-semibold text-gray-900">{ws.title}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider />

      {/* AI Highlights */}
      <section className="relative py-14 sm:py-20 bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950 text-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{ backgroundImage: `url(${techPatternBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
        <div className="absolute top-10 left-[10%] w-2 h-2 bg-orange-400/40 rounded-full pointer-events-none animate-pulse" />
        <div className="absolute top-[30%] right-[8%] w-2.5 h-2.5 bg-amber-400/40 rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-[20%] left-[15%] w-2 h-2 bg-orange-500/30 rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[60%] right-[20%] w-1.5 h-1.5 bg-amber-500/30 rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-[40%] left-[50%] w-2 h-2 bg-orange-400/25 rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-500/20 rounded-full px-4 py-1.5 mb-6">
                <Brain className="h-4 w-4 text-orange-400" />
                <span className="text-sm text-orange-300 font-medium">
                  Artificial Intelligence
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold">
                AI That Understands Your Business
              </h2>
              <p className="mt-4 text-lg text-gray-400 max-w-xl">
                Leverage machine learning trained on garment industry data to make
                smarter, faster decisions.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-64 h-64 sm:w-80 sm:h-80">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-full blur-2xl pointer-events-none" />
                <img
                  src={aiBrain}
                  alt="AI neural network visualization powering Prime7 ERP analytics"
                  width={512}
                  height={512}
                  loading="lazy"
                  className="relative w-full h-full object-contain drop-shadow-2xl animate-[float_6s_ease-in-out_infinite]"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: TrendingUp,
                title: "Demand Forecasting",
                description:
                  "Predict material needs based on historical order patterns, seasonal trends, and buyer behavior to optimize procurement.",
                color: "from-orange-500 to-amber-500",
              },
              {
                icon: AlertTriangle,
                title: "Anomaly Detection",
                description:
                  "Automatically flag unusual transactions, cost overruns, and production bottlenecks before they impact your bottom line.",
                color: "from-amber-500 to-orange-500",
              },
              {
                icon: Lightbulb,
                title: "Smart Recommendations",
                description:
                  "Get actionable suggestions to optimize inventory levels, production scheduling, and cash flow management.",
                color: "from-amber-500 to-yellow-500",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300"
              >
                <div
                  className={`h-14 w-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-6 shadow-lg`}
                >
                  <item.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider />

      {/* Security Section */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Enterprise-Grade Security
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Your business data is protected with industry-leading security
              measures at every layer.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: Lock,
                title: "Encrypted Data",
                desc: "AES-256 encryption at rest and TLS 1.3 in transit for all data.",
              },
              {
                icon: Shield,
                title: "Role-Based Access",
                desc: "Granular permissions ensure users only see what they need.",
              },
              {
                icon: BarChart3,
                title: "Audit Logging",
                desc: "Every action tracked with timestamps for full accountability.",
              },
              {
                icon: Server,
                title: "Multi-Tenant Isolation",
                desc: "Complete data separation between organizations guaranteed.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="text-center p-6 rounded-2xl bg-gray-50 border border-gray-100"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">
                  {item.title}
                </h4>
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
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Choose the plan that fits your factory size. No hidden fees, no
              long-term contracts required.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "Starter",
                price: "BDT 15,000",
                period: "/mo",
                users: "Up to 10 users",
                features: [
                  "Core ERP modules",
                  "Merchandising & orders",
                  "Basic inventory",
                  "Email support",
                ],
                highlighted: false,
              },
              {
                name: "Growth",
                price: "BDT 35,000",
                period: "/mo",
                users: "Up to 50 users",
                features: [
                  "All Starter features",
                  "AI analytics & forecasting",
                  "Production tracking",
                  "Priority support",
                ],
                highlighted: true,
              },
              {
                name: "Enterprise",
                price: "Custom",
                period: "",
                users: "Unlimited users",
                features: [
                  "All Growth features",
                  "Custom integrations",
                  "Dedicated account manager",
                  "On-site training",
                ],
                highlighted: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border ${
                  plan.highlighted
                    ? "bg-primary text-white border-primary shadow-xl shadow-primary/20 relative"
                    : "bg-white border-gray-200"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3
                  className={`text-lg font-semibold ${plan.highlighted ? "text-white" : "text-gray-900"}`}
                >
                  {plan.name}
                </h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span
                    className={`text-4xl font-extrabold ${plan.highlighted ? "text-white" : "text-gray-900"}`}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span
                      className={`text-sm ${plan.highlighted ? "text-blue-200" : "text-gray-500"}`}
                    >
                      {plan.period}
                    </span>
                  )}
                </div>
                <p
                  className={`mt-2 text-sm ${plan.highlighted ? "text-white/70" : "text-gray-500"}`}
                >
                  {plan.users}
                </p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <CheckCircle2
                        className={`h-4 w-4 shrink-0 ${plan.highlighted ? "text-white/70" : "text-accent"}`}
                      />
                      <span
                        className={
                          plan.highlighted ? "text-white/90" : "text-gray-600"
                        }
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href="/pricing">
                  <Button
                    className={`w-full mt-8 rounded-xl ${
                      plan.highlighted
                        ? "bg-white text-primary hover:bg-gray-50"
                        : "bg-primary text-white hover:bg-primary/90"
                    }`}
                  >
                    {plan.name === "Enterprise"
                      ? "Contact Sales"
                      : "Get Started"}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/pricing">
              <Button
                variant="outline"
                className="rounded-xl border-gray-300 text-gray-700"
              >
                View Full Pricing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Common questions from garment manufacturers considering Prime7
              ERP.
            </p>
          </div>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Explore More</h2>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <Link href="/garments-erp">
              <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors cursor-pointer shadow-sm">
                Garments ERP
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
            <Link href="/buying-house-erp">
              <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors cursor-pointer shadow-sm">
                Buying House ERP
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
            <Link href="/features">
              <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors cursor-pointer shadow-sm">
                All Features
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
            <Link href="/resources">
              <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors cursor-pointer shadow-sm">
                Blog & Resources
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
            <Link href="/modules/crm-support">
              <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors cursor-pointer shadow-sm">
                CRM & Support
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-14 sm:py-20 bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950 overflow-hidden">
        <img src={heroFactory} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.12] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-gray-900/80 pointer-events-none" />
        <div className="absolute top-10 -left-32 w-80 h-80 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-[15%] right-[12%] w-2 h-2 bg-orange-400/40 rounded-full pointer-events-none animate-pulse" />
        <div className="absolute bottom-[25%] left-[8%] w-2.5 h-2.5 bg-amber-400/30 rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '1.2s' }} />
        <div className="absolute top-[40%] left-[20%] w-1.5 h-1.5 bg-orange-300/25 rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '0.8s' }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            Ready to Transform Your Garment Business?
          </h2>
          <p className="mt-6 text-lg text-gray-300 max-w-2xl mx-auto">
            Join hundreds of garment manufacturers worldwide who have
            streamlined their operations with Prime7 ERP.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/app/register">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-6 text-base rounded-xl shadow-xl shadow-primary/30"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="border-gray-600 text-gray-200 hover:bg-white/10 font-semibold px-8 py-6 text-base rounded-xl bg-transparent"
              >
                Talk to Sales
              </Button>
            </Link>
          </div>
          <div className="mt-10 flex items-center justify-center gap-8 text-sm text-gray-400">
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
    </PublicLayout>
  );
}
