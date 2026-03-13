import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Clock,
  Scissors,
  DollarSign,
  ShieldAlert,
  Unplug,
  ChevronRight,
  Factory,
  Target,
  BarChart3,
  BookOpen,
  Layers,
  ChevronDown,
} from "lucide-react";

const painPoints = [
  {
    icon: FileSpreadsheet,
    title: "Excel Chaos",
    pain: "Critical data scattered across hundreds of Excel files with no version control or audit trail.",
    solution: "Centralized cloud database with role-based access, full audit trail, and real-time collaboration.",
    before: "50+ Excel files per order, data entry errors, no single source of truth",
    after: "One platform, zero duplication, instant access from anywhere",
  },
  {
    icon: Clock,
    title: "LC Deadline Misses",
    pain: "Missing LC amendment deadlines, late document submissions, and penalty charges from banks.",
    solution: "Automated LC tracking with deadline alerts, document checklists, and amendment management.",
    before: "Manual deadline tracking, last-minute rushes, bank penalties",
    after: "Automated alerts 7/15/30 days before deadlines, zero penalties",
  },
  {
    icon: Scissors,
    title: "Fabric Wastage",
    pain: "No consumption tracking leads to 5-8% excess fabric wastage and inflated material costs.",
    solution: "BOM-based consumption matrix with real-time tracking against standards per size and color.",
    before: "5-8% wastage, no variance analysis, profit leakage",
    after: "Under 2% variance, real-time consumption vs standard tracking",
  },
  {
    icon: DollarSign,
    title: "Costing Errors",
    pain: "Inaccurate product costing leads to unprofitable orders and margin erosion.",
    solution: "Multi-level costing with material, labor, overhead, and commercial cost components.",
    before: "Guesswork costing, hidden costs discovered too late, margin surprises",
    after: "Accurate pre-production costing with BOM-based material costs",
  },
  {
    icon: ShieldAlert,
    title: "Compliance Gaps",
    pain: "Inconsistent quality records, missing inspection reports, and buyer audit failures.",
    solution: "Systematic QC workflow with templates, AQL sampling, and complete inspection records.",
    before: "Paper-based QC, missing records, failed buyer audits",
    after: "Digital QC trail, buyer-specific templates, audit-ready reports",
  },
  {
    icon: Unplug,
    title: "Disconnected Systems",
    pain: "Merchandising, production, accounts, and commercial teams working in silos.",
    solution: "Fully integrated ERP where every department shares real-time data on a single platform.",
    before: "5+ separate tools, manual data transfer, information delays",
    after: "One platform, instant cross-department visibility, zero data re-entry",
  },
];

const processSteps = [
  { label: "Buyer Inquiry", color: "bg-blue-500" },
  { label: "Costing", color: "bg-indigo-500" },
  { label: "Sample Dev", color: "bg-purple-500" },
  { label: "Order Confirm", color: "bg-pink-500" },
  { label: "Sourcing", color: "bg-red-500" },
  { label: "Production", color: "bg-orange-500" },
  { label: "QC & Inspection", color: "bg-yellow-500" },
  { label: "Shipment", color: "bg-emerald-500" },
  { label: "LC Realization", color: "bg-teal-500" },
];

const differentiators = [
  {
    icon: Factory,
    title: "Built for Garments",
    description: "Not a generic ERP adapted for garments — every feature is purpose-built for RMG workflows, from style-size-color matrices to cutting plans.",
  },
  {
    icon: DollarSign,
    title: "BDT Native",
    description: "Bangladeshi Taka as base currency with multi-currency support for USD, EUR, GBP. All reports in BDT by default.",
  },
  {
    icon: BookOpen,
    title: "Understands LC/Back-to-Back",
    description: "Full LC lifecycle from master LC to back-to-back for raw materials, with utilization tracking and bank exposure reports.",
  },
  {
    icon: Target,
    title: "TNA & Critical Path",
    description: "Time & Action calendar with milestone tracking, automated alerts, and critical path analysis to keep every order on track.",
  },
  {
    icon: Layers,
    title: "Consumption Matrix",
    description: "Size-color consumption matrix integrated with BOM, enabling precise fabric and trims requirement planning.",
  },
  {
    icon: BarChart3,
    title: "Tally-Style Accounting",
    description: "Familiar double-entry accounting with voucher workflows, group-wise reporting, and the speed accountants love.",
  },
];

const faqs = [
  {
    q: "Why do garment factories need a specialized ERP?",
    a: "Generic ERPs lack garment-specific features like style management, BOM with size-color matrices, consumption tracking, TNA planning, and LC management. A garment-specific ERP like P7 handles these natively.",
  },
  {
    q: "How does P7 handle style and BOM management?",
    a: "P7 uses styles as master entities with components, colorways, and size scales. BOMs are linked to styles with automatic consumption calculation across size-color breakdowns.",
  },
  {
    q: "Can P7 track production across cutting, sewing, and finishing?",
    a: "Yes. P7 provides real-time WIP tracking across all production stages — cutting, sewing, finishing, and packing — with line-level visibility and efficiency metrics.",
  },
  {
    q: "Does P7 integrate with buyer portals?",
    a: "P7 can export data in formats compatible with major buyer portals and supports standard EDI integrations for order and shipment data exchange.",
  },
];

export function GarmentsErpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Factory className="w-4 h-4" />
              Purpose-Built for Garment Manufacturers
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              The Only ERP Built Specifically for
              <br />
              <span className="text-primary">Garment Manufacturers</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              From buyer inquiry to LC realization — P7 ERP understands your factory&apos;s unique challenges.
              Built by garment industry professionals for garment manufacturers and buying houses.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3 text-base font-medium text-white hover:bg-primary/90">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/features" className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-8 py-3 text-base font-medium text-gray-700 hover:bg-gray-50">
                Explore All Features
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Industry Pain Points */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <AlertTriangle className="w-4 h-4" />
              Common Challenges
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Challenges Every RMG Factory Faces
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              If any of these sound familiar, you&apos;re not alone — and P7 was built to solve each one.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {painPoints.map((point) => (
              <div key={point.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-50 text-red-500 rounded-lg mb-4">
                  <point.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{point.title}</h3>
                <p className="text-gray-600 text-sm">{point.pain}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How P7 Solves Each */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <CheckCircle2 className="w-4 h-4" />
              The P7 Solution
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How P7 Solves Each Challenge
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              See the before and after for every pain point in your factory operations.
            </p>
          </div>
          <div className="space-y-6">
            {painPoints.map((point, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid md:grid-cols-12 gap-0">
                  <div className="md:col-span-4 p-6 border-b md:border-b-0 md:border-r border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                        <point.icon className="w-4 h-4" />
                      </div>
                      <h3 className="font-semibold text-gray-900">{point.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600">{point.solution}</p>
                  </div>
                  <div className="md:col-span-4 p-6 bg-red-50/30 border-b md:border-b-0 md:border-r border-gray-100">
                    <div className="flex items-center gap-2 text-red-600 text-xs font-medium mb-2">
                      <XCircle className="w-3.5 h-3.5" /> BEFORE
                    </div>
                    <p className="text-sm text-gray-700">{point.before}</p>
                  </div>
                  <div className="md:col-span-4 p-6 bg-emerald-50/30">
                    <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium mb-2">
                      <CheckCircle2 className="w-3.5 h-3.5" /> AFTER
                    </div>
                    <p className="text-sm text-gray-700">{point.after}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Flow */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Complete Order Lifecycle
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              P7 covers every step from the first buyer inquiry to final LC realization.
            </p>
          </div>
          <div className="relative">
            <div className="hidden lg:flex items-center justify-between relative">
              <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 z-0" />
              {processSteps.map((step, i) => (
                <div key={step.label} className="relative z-10 flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-bold shadow-lg`}>
                    {i + 1}
                  </div>
                  <p className="mt-3 text-xs font-medium text-gray-700 text-center max-w-[80px]">{step.label}</p>
                </div>
              ))}
            </div>
            <div className="lg:hidden space-y-3">
              {processSteps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{step.label}</p>
                    {i < processSteps.length - 1 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Key Differentiators */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-primary/5 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why P7 vs Generic ERPs
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Generic ERPs force garment manufacturers to adapt their processes. P7 adapts to you.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {differentiators.map((diff) => (
              <div key={diff.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                  <diff.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{diff.title}</h3>
                <p className="text-gray-600 text-sm">{diff.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Common questions about P7 ERP for garment manufacturers.</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
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
      <section className="py-16 lg:py-24 bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to Transform Your Factory?</h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Join garment manufacturers who run their operations on P7 ERP. Start your free trial today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-primary px-8 py-3 font-medium hover:bg-gray-50">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white text-white px-8 py-3 font-medium hover:bg-white/10">
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
