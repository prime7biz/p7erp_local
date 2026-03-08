import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Minus,
  ChevronDown,
  Factory,
  Zap,
  Layers,
  Palette,
  Package,
  Calculator,
  Brain,
  ShieldCheck,
  Scissors,
  BarChart3,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";

const criteria = [
  { icon: Palette, title: "Style & BOM Management", description: "Manage styles with size-color matrices, multi-level BOMs, and consumption tracking per garment component." },
  { icon: Factory, title: "Production Tracking", description: "Real-time WIP visibility across cutting, sewing, finishing, and packing with line-level efficiency metrics." },
  { icon: Package, title: "Inventory Control", description: "Track fabric rolls, trims, and accessories with lot traceability, reorder alerts, and multi-warehouse support." },
  { icon: Calculator, title: "Integrated Accounting", description: "Double-entry accounting with voucher workflows, cost center tracking, and automated financial reporting." },
  { icon: Brain, title: "AI-Powered Insights", description: "Demand forecasting, anomaly detection, production optimization, and smart recommendations powered by AI." },
  { icon: ShieldCheck, title: "Quality Management", description: "Inline, endline, and final QC inspections with AQL sampling, defect classification, and CAPA workflows." },
];

const comparisonFeatures = [
  { feature: "Style-Size-Color Matrix", prime7: true, generic: false, spreadsheet: false },
  { feature: "BOM with Consumption Tracking", prime7: true, generic: false, spreadsheet: false },
  { feature: "Production WIP Tracking", prime7: true, generic: "partial", spreadsheet: false },
  { feature: "Integrated Accounting", prime7: true, generic: true, spreadsheet: false },
  { feature: "AI-Powered Analytics", prime7: true, generic: false, spreadsheet: false },
  { feature: "Quality Control Workflows", prime7: true, generic: "partial", spreadsheet: false },
  { feature: "LC/Commercial Management", prime7: true, generic: false, spreadsheet: false },
  { feature: "Multi-Currency Support", prime7: true, generic: true, spreadsheet: false },
  { feature: "TNA/Critical Path", prime7: true, generic: false, spreadsheet: "partial" },
  { feature: "Real-Time Dashboards", prime7: true, generic: true, spreadsheet: false },
];

const keyFeatures = [
  { icon: Palette, title: "Merchandising Hub", items: ["Style master with colorways & components", "Size scale management (S/M/L/XL or custom)", "Tech pack versioning", "Buyer-wise costing sheets"] },
  { icon: Scissors, title: "Production Control", items: ["Cutting plan generation", "Sewing line balancing", "Bundle tracking system", "IE/SMV efficiency metrics"] },
  { icon: Package, title: "Inventory & Warehouse", items: ["Real-time stock ledger", "Lot/batch traceability", "GRN with quality checks", "Multi-warehouse transfers"] },
  { icon: Calculator, title: "Financial Accounting", items: ["Tally-style voucher entry", "Trial Balance & P&L", "AR/AP aging reports", "Budget vs actual analysis"] },
  { icon: BarChart3, title: "Reporting & Analytics", items: ["Custom report builder", "Order profitability analysis", "Production efficiency reports", "AI-powered forecasting"] },
  { icon: Settings, title: "Operations & HR", items: ["HR & payroll management", "Attendance & leave tracking", "Approval workflows", "Role-based access control"] },
];

const faqs = [
  { q: "What is garment ERP software?", a: "Garment ERP software is an enterprise resource planning system specifically designed for clothing manufacturers. It integrates style management, production tracking, inventory control, accounting, and quality management into a single platform, addressing the unique needs of garment factories that generic ERPs cannot handle." },
  { q: "How is garment ERP different from generic ERP?", a: "Garment ERP includes industry-specific features like style-size-color matrices, BOM consumption tracking, TNA/critical path management, LC commercial workflows, and production stage tracking (cutting, sewing, finishing, packing) that generic ERPs lack entirely." },
  { q: "How much does garment ERP software cost?", a: "Prime7 garment ERP starts with a free trial and offers affordable plans in BDT designed for factories of all sizes. Unlike traditional ERPs that require large upfront investments, Prime7 is cloud-based with monthly subscriptions, eliminating hardware costs and lengthy implementation." },
  { q: "How long does it take to implement garment ERP software?", a: "With Prime7, you can be operational within 2-4 weeks. Our cloud-based platform requires no hardware installation, and our team provides guided onboarding with data migration support. Most factories start seeing productivity improvements within the first month." },
  { q: "Can garment ERP software handle multiple factories?", a: "Yes. Prime7 is a multi-tenant SaaS platform that supports multiple factories, warehouses, and business units. Each location can have its own users, inventory, and production lines while sharing a unified accounting and reporting system." },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Prime7 Garment ERP Software",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web Browser",
  description: "AI-powered ERP software for garment manufacturers with style management, production tracking, inventory control, and integrated accounting.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "BDT", description: "Free trial available" },
};

function ComparisonIcon({ value }: { value: boolean | string }) {
  if (value === true) return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (value === "partial") return <Minus className="w-5 h-5 text-amber-500" />;
  return <XCircle className="w-5 h-5 text-red-400" />;
}

export default function GarmentErpSoftwarePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Best Garment ERP Software 2026 | Prime7 - AI-Powered Solution"
        description="Looking for garment ERP software? Prime7 is the #1 AI-powered ERP for clothing manufacturers. Manage styles, production, inventory & accounting. Free trial available."
        canonical="https://prime7erp.com/garment-erp-software"
        keywords="garment ERP software, clothing manufacturing ERP, apparel ERP system, garment factory software"
        jsonLd={[faqJsonLd, productJsonLd]}
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "Garment ERP Software", url: "https://prime7erp.com/garment-erp-software"}]}
      />

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Garment ERP Software</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Factory className="w-4 h-4" />
              #1 AI-Powered Garment ERP
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              The #1 ERP Software Built for
              <br />
              <span className="text-primary">Garment Manufacturers</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Manage the complete garment lifecycle from style creation to shipment.
              Prime7 integrates merchandising, production, inventory, accounting, and quality
              into one AI-powered platform built specifically for clothing manufacturers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/app/register">
                <Button size="lg" className="gap-2 text-base px-8">
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/features">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                  Explore All Features
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What Makes Great Garment ERP */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              What Makes Great Garment ERP Software?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Not all ERP systems are created equal. Here are the 6 essential criteria that garment manufacturers should evaluate.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {criteria.map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How Prime7 Compares
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              See why garment manufacturers choose Prime7 over generic ERP systems and spreadsheets.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Feature</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-primary bg-primary/5">Prime7 ERP</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Generic ERP</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Spreadsheets</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((row, i) => (
                    <tr key={row.feature} className={i % 2 === 0 ? "bg-gray-50/50" : ""}>
                      <td className="px-6 py-3.5 text-sm text-gray-700 font-medium">{row.feature}</td>
                      <td className="px-6 py-3.5 bg-primary/5"><div className="flex justify-center"><ComparisonIcon value={row.prime7} /></div></td>
                      <td className="px-6 py-3.5"><div className="flex justify-center"><ComparisonIcon value={row.generic} /></div></td>
                      <td className="px-6 py-3.5"><div className="flex justify-center"><ComparisonIcon value={row.spreadsheet} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Grid */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Key Features for Garment Manufacturers
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Every module is designed with the garment industry in mind. No workarounds, no customization needed.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {keyFeatures.map((group) => (
              <div key={group.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                    <group.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{group.title}</h3>
                </div>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/features">
              <Button variant="outline" className="gap-2">
                View All Features <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600">
              Common questions about choosing the right garment ERP software.
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 pr-4">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Pages */}
      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 mb-4">Explore Related Pages</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/features"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">All Features</span></Link>
            <Link href="/garments-erp"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">Garments ERP Solutions</span></Link>
            <Link href="/resources/what-is-erp-garment-manufacturing"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">What is Garment ERP? →</span></Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-blue-300 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Start Your Digital Transformation
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Garment Factory?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join hundreds of garment manufacturers who have switched to Prime7 ERP.
            Start your free trial today — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app/register">
              <Button size="lg" className="gap-2 text-base px-8">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="gap-2 text-base px-8 text-white border-white hover:bg-white/10 bg-transparent">
                Talk to Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
