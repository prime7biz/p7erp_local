import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calculator,
  Package,
  Factory,
  Palette,
  FileText,
  Users,
  ShieldCheck,
  Brain,
  Landmark,
  ArrowRight,
  CheckCircle2,
  Layers,
  Zap,
  BarChart3,
  Globe,
  RefreshCw,
  ChevronDown,
} from "lucide-react";

const modules = [
  {
    icon: Calculator,
    title: "Accounting & Finance",
    color: "bg-primary/10 text-primary",
    description: "Tally-inspired double-entry accounting built for garment industry workflows.",
    features: [
      "Chart of Accounts with hierarchical groups",
      "Voucher lifecycle: Draft → Approved → Posted",
      "Multi-currency support with BDT as base currency",
      "Trial Balance, Profit & Loss, Balance Sheet",
      "AR/AP aging reports with party-wise breakdowns",
      "Accounting period locks for financial control",
    ],
  },
  {
    icon: Package,
    title: "Inventory Management",
    color: "bg-emerald-50 text-emerald-600",
    description: "Real-time visibility into every yard of fabric, cone of yarn, and carton of trims.",
    features: [
      "Real-time stock ledger with running balances",
      "Goods Received Notes (GRN) with quality checks",
      "Delivery challans with multi-warehouse support",
      "Lot/batch traceability from yarn to shipment",
      "Stock adjustments with approval workflows",
      "Multi-warehouse transfer management",
    ],
  },
  {
    icon: Factory,
    title: "Production & WIP",
    color: "bg-orange-50 text-orange-600",
    description: "Track every stage from yarn receiving to packed cartons with real-time WIP visibility.",
    features: [
      "Production orders linked to sales orders",
      "Material consumption tracking vs BOM standards",
      "Cutting, sewing, finishing & packing modules",
      "IE/SMV efficiency tracking per operation",
      "Bundle tracking and line balancing tools",
    ],
  },
  {
    icon: Palette,
    title: "Merchandising",
    color: "bg-purple-50 text-purple-600",
    description: "Centralized style management from buyer inquiry to shipment with full BOM control.",
    features: [
      "Style master with components & colorways",
      "BOM lifecycle: Draft → Approved → Locked",
      "Sample development tracking (Proto/Fit/PP/TOP)",
      "Buyer-wise costing sheets with margin analysis",
      "TNA/critical path management per order",
    ],
  },
  {
    icon: FileText,
    title: "Commercial & LC",
    color: "bg-cyan-50 text-cyan-600",
    description: "End-to-end LC management designed for export/import workflows.",
    features: [
      "Master LC management with full document set",
      "Back-to-back LC for raw material import",
      "Amendment management with version history",
      "Shipment workflow from booking to BL release",
      "Utilization tracking against LC values",
    ],
  },
  {
    icon: Users,
    title: "HR & Payroll",
    color: "bg-pink-50 text-pink-600",
    description: "Complete workforce management from hiring to payslips, built for factory environments.",
    features: [
      "Employee master with full profile management",
      "Automated payroll runs with tax calculations",
      "Attendance tracking with shift management",
      "Leave management with approval workflows",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Quality Management",
    color: "bg-red-50 text-red-600",
    description: "Ensure every shipment meets buyer standards with systematic QC workflows.",
    features: [
      "Inline, endline & final inspection workflows",
      "Lab testing management with results tracking",
      "CAPA lifecycle: Identify → Correct → Verify",
      "Returns management with root cause analysis",
    ],
  },
  {
    icon: Brain,
    title: "AI & Analytics",
    color: "bg-violet-50 text-violet-600",
    description: "AI-powered insights that help you make smarter decisions across your business.",
    features: [
      "Demand forecasting based on historical data",
      "Anomaly detection in costs and inventory",
      "Smart recommendations for reorder quantities",
      "Style-level profitability analysis",
    ],
  },
  {
    icon: Landmark,
    title: "Banking & Reconciliation",
    color: "bg-amber-50 text-amber-600",
    description: "Streamline bank transactions and reconciliation with automated matching.",
    features: [
      "Multi-bank account management",
      "Bank statement import (CSV/Excel/MT940)",
      "Auto-matching with configurable rules",
      "Payment runs for batch vendor payments",
    ],
  },
];

const moduleImages: Record<number, { src: string; alt: string }> = {
  0: { src: "/images/finance-analytics.png", alt: "Finance Analytics Dashboard" },
  1: { src: "/images/inventory-visual.png", alt: "Inventory Management Visualization" },
  2: { src: "/images/production-visual.png", alt: "Production Automation Visualization" },
  7: { src: "/images/ai-brain-features.png", alt: "AI Neural Network Visualization" },
};

const featureFaqs = [
  { q: "What modules are included in P7 ERP?", a: "P7 includes Merchandising, Order & Commercial, Inventory, Production & WIP, Financial Accounting, HR & Payroll, Quality Management, and AI Analytics — all integrated in one platform." },
  { q: "Does P7 ERP include AI features?", a: "Yes. P7 uses AI for demand forecasting, inventory optimization, cost prediction, and smart recommendations across modules." },
  { q: "Can P7 handle multiple warehouses?", a: "Yes. P7 supports multi-warehouse management with real-time stock tracking, lot traceability, and inter-warehouse transfers." },
  { q: "Does P7 support approval workflows?", a: "Yes. P7 has configurable multi-level approval workflows for purchase orders, vouchers, production orders, and other documents with amount-based routing and segregation of duties." },
];

function ModuleVisual({ mod, index }: { mod: typeof modules[0]; index: number }) {
  const imageData = moduleImages[index];
  if (imageData) {
    return (
      <div className="relative rounded-2xl overflow-hidden shadow-xl border border-gray-200">
        <img src={imageData.src} alt={imageData.alt} width={1200} height={800} className="w-full h-auto" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      </div>
    );
  }
  return (
    <div className={`relative rounded-2xl p-8 lg:p-12 ${mod.color.split(" ")[0]} border border-gray-100 overflow-hidden`}>
      <div className="absolute inset-0 border-2 border-transparent bg-gradient-to-br from-blue-200/30 via-transparent to-blue-300/20 rounded-2xl pointer-events-none" />
      <mod.icon className="w-20 h-20 mx-auto mb-6 opacity-20 relative" />
      <div className="grid grid-cols-2 gap-4 relative">
        {mod.features.slice(0, 4).map((feature) => (
          <div key={feature} className="bg-white/80 rounded-lg p-3 text-center">
            <p className="text-xs font-medium text-gray-700">{feature.split(",")[0]}</p>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/40 to-transparent pointer-events-none rounded-b-2xl" />
    </div>
  );
}

export function FeaturesPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28">
        <div className="absolute top-10 -right-20 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-16 w-64 h-64 bg-blue-300/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,0.06) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Layers className="w-4 h-4" />
            9 Integrated Modules
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Everything You Need to Run
            <br />
            <span className="text-primary">Your Garment Business</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            From buyer inquiry to LC realization, P7 ERP covers every aspect of garment manufacturing
            and export operations with deeply integrated modules.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3 text-base font-medium text-white hover:bg-primary/90">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-8 py-3 text-base font-medium text-gray-700 hover:bg-gray-50">
              Request a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Module Quick Nav */}
      <section className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex overflow-x-auto gap-1 py-3 scrollbar-hide">
            {modules.map((mod) => (
              <a
                key={mod.title}
                href={`#${mod.title.toLowerCase().replace(/[^a-z]/g, "-")}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-gray-600 hover:bg-primary/5 hover:text-primary whitespace-nowrap transition-colors"
              >
                <mod.icon className="w-3.5 h-3.5" />
                {mod.title.split(" ")[0]}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Module Detail Sections */}
      {modules.map((mod, index) => (
        <div key={mod.title}>
          {index > 0 && (
            <div className="h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
          )}
          <section
            id={mod.title.toLowerCase().replace(/[^a-z]/g, "-")}
            className={`py-16 lg:py-24 ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className={`grid lg:grid-cols-2 gap-12 items-center ${index % 2 === 1 ? "lg:grid-flow-dense" : ""}`}>
                <div className={index % 2 === 1 ? "lg:col-start-2" : ""}>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${mod.color} text-sm font-medium mb-4`}>
                    <mod.icon className="w-4 h-4" />
                    Module {index + 1} of 9
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{mod.title}</h2>
                  <p className="text-lg text-gray-600 mb-8">{mod.description}</p>
                  <ul className="space-y-3">
                    {mod.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={index % 2 === 1 ? "lg:col-start-1" : ""}>
                  <ModuleVisual mod={mod} index={index} />
                </div>
              </div>
            </div>
          </section>
        </div>
      ))}

      {/* Integration Highlights */}
      <section className="relative overflow-hidden py-16 lg:py-24 bg-gradient-to-br from-primary/5 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <RefreshCw className="w-4 h-4" />
            Unified Platform
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Seamlessly Connected</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-12">
            Every module in P7 shares a single source of truth. When merchandising creates a BOM,
            inventory knows what to order. When production consumes material, accounting records the cost.
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <Globe className="w-10 h-10 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Single Source of Truth</h3>
              <p className="text-gray-600 text-sm">One database, one login, one platform.</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <Zap className="w-10 h-10 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Automatic Workflows</h3>
              <p className="text-gray-600 text-sm">GRN updates stock and triggers accounting entries.</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <BarChart3 className="w-10 h-10 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Cross-Module Analytics</h3>
              <p className="text-gray-600 text-sm">AI insights across production, inventory, and finance.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Common questions about P7 ERP features and capabilities.</p>
          </div>
          <div className="space-y-3">
            {featureFaqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 pr-4">{faq.q}</span>
                  <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-gray-600 leading-relaxed border-t border-gray-100 pt-4">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-16 lg:py-24 bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">See It in Action</h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Experience how P7 ERP can transform your garment manufacturing operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-primary px-8 py-3 text-base font-medium hover:bg-gray-50">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white text-white px-8 py-3 text-base font-medium hover:bg-white/10">
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
