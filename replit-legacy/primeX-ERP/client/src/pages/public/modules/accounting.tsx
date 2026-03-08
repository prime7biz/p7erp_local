import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BookOpen,
  Globe,
  Users,
  FileText,
  Target,
  Lock,
  ChevronDown,
  Zap,
  Calculator,
  Receipt,
  ArrowLeftRight,
  BarChart3,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: BookOpen,
    title: "Tally-Style Double Entry",
    description: "Familiar voucher-based interface inspired by Tally. Create payment, receipt, journal, contra, sales, and purchase vouchers with speed and accuracy.",
  },
  {
    icon: Globe,
    title: "Multi-Currency Support",
    description: "Handle transactions in USD, EUR, GBP, BDT, and any currency. Automatic exchange rate conversion with realized and unrealized gain/loss tracking.",
  },
  {
    icon: Users,
    title: "Party Master & Ledgers",
    description: "Comprehensive party management with customer and supplier ledgers. Track outstanding balances, credit limits, and payment history per party.",
  },
  {
    icon: Receipt,
    title: "Bill-Wise Tracking",
    description: "Match payments against specific invoices with bill-wise tracking. View outstanding bills, aging analysis, and payment allocation at a glance.",
  },
  {
    icon: Target,
    title: "Cost Center & Job Costing",
    description: "Allocate expenses to cost centers, departments, or specific orders. Track profitability per job, style, or buyer with detailed cost breakdowns.",
  },
  {
    icon: Lock,
    title: "Period Locks & Voucher Lifecycle",
    description: "Lock accounting periods to prevent backdated entries. Full voucher lifecycle with draft, pending approval, approved, and posted states.",
  },
];

const workflowSteps = [
  { step: "1", label: "Voucher Entry", detail: "Create vouchers with narration and references", color: "bg-blue-500" },
  { step: "2", label: "Approval", detail: "Multi-level approval workflow", color: "bg-indigo-500" },
  { step: "3", label: "Posting", detail: "Auto-post to ledgers and journals", color: "bg-purple-500" },
  { step: "4", label: "Reconciliation", detail: "Bank and party reconciliation", color: "bg-pink-500" },
  { step: "5", label: "Reporting", detail: "Trial balance, P&L, balance sheet", color: "bg-orange-500" },
  { step: "6", label: "Period Close", detail: "Lock period and carry forward", color: "bg-emerald-500" },
];

const integrations = [
  { icon: Calculator, label: "Reports & Analytics", link: "/modules/reports-analytics" },
  { icon: FileText, label: "LC Processing", link: "/modules/lc-processing" },
  { icon: ArrowLeftRight, label: "Inventory", link: "/modules/inventory" },
  { icon: BarChart3, label: "HR & Payroll", link: "/modules/hr-payroll" },
];

const faqs = [
  {
    q: "How is Prime7 accounting similar to Tally?",
    a: "Prime7 uses the same voucher-based approach as Tally — payment, receipt, journal, contra, sales, and purchase vouchers. The interface is designed for speed with keyboard shortcuts and familiar group-wise reporting like Tally.",
  },
  {
    q: "How does multi-currency accounting work?",
    a: "You can create vouchers in any currency. The system maintains exchange rates and auto-converts to your base currency (BDT). Realized gains/losses are posted automatically when payments are received in foreign currency.",
  },
  {
    q: "Can I track bills against specific invoices?",
    a: "Yes. Bill-wise tracking lets you allocate payments to specific invoices. The system shows outstanding bills per party with aging analysis (30/60/90/120+ days) and supports partial payment matching.",
  },
  {
    q: "How do period locks work?",
    a: "You can lock accounting periods to prevent any voucher creation or modification in closed periods. Only authorized users can unlock periods temporarily. This ensures data integrity for audited periods.",
  },
  {
    q: "Does Prime7 support cost center accounting?",
    a: "Yes. You can define cost centers by department, project, or order. Every voucher line can be allocated to cost centers. Reports show profitability and expense analysis per cost center.",
  },
  {
    q: "What financial reports are available?",
    a: "Prime7 generates trial balance, profit & loss, balance sheet, cash flow, group summary, day book, ledger reports, and AR/AP aging. All reports support date ranges, comparative periods, and export to Excel/PDF.",
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

export default function AccountingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Accounting Software for Garment Industry | Tally-Style ERP | Prime7"
        description="Double-entry accounting with multi-currency, bill-wise tracking & cost center job costing. Tally-inspired interface built for garment manufacturers."
        canonical="https://prime7erp.com/modules/accounting"
        keywords="garment accounting software, Tally-style ERP, multi-currency accounting, cost center job costing, voucher management system"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "Accounting", url: "https://prime7erp.com/modules/accounting" },
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
              <BookOpen className="w-4 h-4" />
              Accounting Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Tally-Style Accounting for
              <br />
              <span className="text-primary">Garment Industry</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Familiar double-entry voucher interface with multi-currency support, bill-wise tracking,
              and cost center job costing — purpose-built for garment and textile businesses.
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
              Professional accounting tools designed for the speed and accuracy garment businesses demand.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Accounting Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From voucher entry to period close — a complete accounting lifecycle.
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
              Accounting posts automatically from inventory, production, LC, and payroll transactions.
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
              Explore <Link href="/garments-erp"><span className="text-primary hover:underline cursor-pointer">Garments ERP</span></Link>,{" "}
              <Link href="/buying-house-erp"><span className="text-primary hover:underline cursor-pointer">Buying House ERP</span></Link>,{" "}
              and <Link href="/resources"><span className="text-primary hover:underline cursor-pointer">Resources</span></Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Common questions about Prime7's accounting module.</p>
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
            Professional Accounting
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Accounting That Understands Garments
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Move beyond generic accounting software. Prime7 handles LC accounting, multi-currency,
            and job costing the way garment businesses need it.
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
