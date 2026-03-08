import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Scissors,
  Activity,
  PackageCheck,
  ClipboardList,
  TrendingUp,
  Timer,
  ChevronDown,
  Zap,
  Layers,
  Package,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: Scissors,
    title: "Cutting Management",
    description: "Plan and execute cutting orders with marker planning, lay details, and size-wise cut quantities. Track fabric consumption against BOM standards.",
  },
  {
    icon: Activity,
    title: "Sewing Line Tracking",
    description: "Monitor sewing line output in real-time. Track hourly production, operator efficiency, and line balancing with SMV-based performance metrics.",
  },
  {
    icon: PackageCheck,
    title: "Finishing & Packing",
    description: "Manage finishing operations including washing, ironing, and packing. Generate carton lists with buyer-specific packing ratios and assortments.",
  },
  {
    icon: Timer,
    title: "WIP Tracking",
    description: "Real-time Work-in-Progress tracking across cutting, sewing, and finishing. Know exactly where every piece is in your production pipeline.",
  },
  {
    icon: TrendingUp,
    title: "Line Efficiency & SMV",
    description: "Calculate line efficiency using Standard Minute Value (SMV). Track operator performance, identify bottlenecks, and optimize line balancing.",
  },
  {
    icon: ClipboardList,
    title: "Production Orders & Consumption",
    description: "Create production orders from confirmed sales orders. Track material consumption against planned quantities with variance analysis.",
  },
];

const workflowSteps = [
  { step: "1", label: "Production Order", detail: "Create from confirmed sales order", color: "bg-blue-500" },
  { step: "2", label: "Material Issue", detail: "Issue fabric and trims to floor", color: "bg-indigo-500" },
  { step: "3", label: "Cutting", detail: "Execute cutting with lay planning", color: "bg-purple-500" },
  { step: "4", label: "Sewing", detail: "Line-wise production tracking", color: "bg-pink-500" },
  { step: "5", label: "Finishing", detail: "Washing, ironing, quality check", color: "bg-orange-500" },
  { step: "6", label: "Packing", detail: "Carton packing and shipment prep", color: "bg-emerald-500" },
];

const integrations = [
  { icon: Layers, label: "Merchandising", link: "/modules/merchandising" },
  { icon: Package, label: "Inventory", link: "/modules/inventory" },
  { icon: ShieldCheck, label: "Quality Management", link: "/modules/quality-management" },
  { icon: BarChart3, label: "Reports & Analytics", link: "/modules/reports-analytics" },
];

const faqs = [
  {
    q: "How does Prime7 track production across cutting, sewing, and finishing?",
    a: "Prime7 provides stage-wise production tracking. Each piece moves through cutting (with lay and marker data), sewing (with line and operator tracking), and finishing (with washing and packing details). WIP is updated in real-time.",
  },
  {
    q: "Can I track line efficiency and operator performance?",
    a: "Yes. Prime7 calculates line efficiency using SMV (Standard Minute Value). You can track hourly output per line, operator performance, and identify bottlenecks. Historical data helps optimize future line balancing.",
  },
  {
    q: "How does consumption tracking work in production?",
    a: "When materials are issued to the production floor, consumption is tracked against BOM standards. The system calculates variance per size-color and alerts when consumption exceeds planned quantities.",
  },
  {
    q: "Can I manage multiple production lines?",
    a: "Yes. Prime7 supports unlimited production lines. Each line can be assigned specific orders, and you can monitor output, efficiency, and WIP per line from a centralized dashboard.",
  },
  {
    q: "Does Prime7 support subcontracting?",
    a: "Yes. You can create subcontract orders for processes like washing, embroidery, or printing. Track material sent to subcontractors, received quantities, and quality inspection on return.",
  },
  {
    q: "How does the cutting module handle marker planning?",
    a: "The cutting module supports marker planning with lay details including number of plies, marker length, and fabric utilization percentage. Cut quantities are recorded per size and reconciled against the order.",
  },
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

export default function ProductionPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Garment Production Management Software | Cutting Sewing Finishing | Prime7 ERP"
        description="Track cutting, sewing & finishing with real-time WIP, line efficiency & consumption tracking. Production management for garment factories."
        canonical="https://prime7erp.com/modules/production"
        keywords="garment production software, cutting management ERP, sewing line tracking, WIP tracking garments, production efficiency software"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "Production", url: "https://prime7erp.com/modules/production" },
        ]}
      />

      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Scissors className="w-4 h-4" />
              Production Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Production Management for
              <br />
              <span className="text-primary">Garment Factories</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              From cutting floor to packing — track every piece in real-time. Monitor line efficiency,
              WIP, and consumption with purpose-built production management tools.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/contact">
                <Button size="lg" className="gap-2 text-base px-8">
                  Book a Demo <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/app/register">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Key Features</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Complete production floor management from cutting to shipment-ready packing.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Production Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              End-to-end production lifecycle managed in one platform.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflowSteps.map((s) => (
              <div key={s.step} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <div className={`w-10 h-10 rounded-full ${s.color} text-white flex items-center justify-center text-sm font-bold mb-4`}>
                  {s.step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{s.label}</h3>
                <p className="text-sm text-gray-600">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Integrated With Other Modules</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Production connects directly to merchandising, inventory, quality, and analytics.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {integrations.map((int) => (
              <Link key={int.label} href={int.link}>
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-center cursor-pointer">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-3 mx-auto">
                    <int.icon className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-gray-900">{int.label}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Part of <Link href="/garments-erp"><span className="text-primary hover:underline cursor-pointer">Garments ERP</span></Link> and{" "}
              <Link href="/buying-house-erp"><span className="text-primary hover:underline cursor-pointer">Buying House ERP</span></Link>.{" "}
              View <Link href="/pricing"><span className="text-primary hover:underline cursor-pointer">Pricing</span></Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Common questions about Prime7's production module.</p>
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
                  <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-blue-300 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Optimize Your Production
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Maximize Your Factory Output
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Gain real-time visibility into every production line. Reduce WIP,
            improve efficiency, and meet delivery deadlines consistently.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app/register">
              <Button size="lg" className="gap-2 text-base px-8">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="gap-2 text-base px-8 text-white border-white hover:bg-white/10 bg-transparent">
                Book a Demo
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-gray-400">
            Already have an account? <Link href="/app/login"><span className="text-primary hover:underline cursor-pointer">Login here</span></Link>
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
