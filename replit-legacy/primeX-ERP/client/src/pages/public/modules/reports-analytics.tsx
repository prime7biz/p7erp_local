import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  Brain,
  FileSpreadsheet,
  PieChart,
  Clock,
  Download,
  ChevronDown,
  Zap,
  BookOpen,
  Package,
  Users,
  Scissors,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Dashboards",
    description: "Intelligent dashboards that surface key insights automatically. AI analyzes trends, highlights anomalies, and suggests actions based on your business data.",
  },
  {
    icon: FileSpreadsheet,
    title: "Trial Balance & Financial Statements",
    description: "Generate trial balance, profit & loss, and balance sheet at any date with comparative periods. Drill down from summary to individual vouchers.",
  },
  {
    icon: PieChart,
    title: "Aging Analysis",
    description: "AR and AP aging reports with 30/60/90/120+ day buckets. Track overdue receivables and payables per party with automated follow-up reminders.",
  },
  {
    icon: BarChart3,
    title: "Custom Report Builder",
    description: "Build custom reports with drag-and-drop fields, filters, and grouping. Save report templates for recurring use and schedule automatic generation.",
  },
  {
    icon: Clock,
    title: "Real-Time Analytics",
    description: "Live production output, inventory levels, order status, and financial KPIs. Role-based dashboards show each user the metrics they need most.",
  },
  {
    icon: Download,
    title: "Data Export & Sharing",
    description: "Export any report to Excel, PDF, or CSV. Schedule automated report delivery via email. Share dashboards with stakeholders through secure links.",
  },
];

const workflowSteps = [
  { step: "1", label: "Data Collection", detail: "Auto-aggregate from all modules", color: "bg-blue-500" },
  { step: "2", label: "Processing", detail: "Calculate KPIs and aggregations", color: "bg-indigo-500" },
  { step: "3", label: "AI Analysis", detail: "Detect trends and anomalies", color: "bg-purple-500" },
  { step: "4", label: "Visualization", detail: "Charts, tables, and dashboards", color: "bg-pink-500" },
  { step: "5", label: "Distribution", detail: "Email, export, and share", color: "bg-orange-500" },
  { step: "6", label: "Action", detail: "Insights drive decisions", color: "bg-emerald-500" },
];

const integrations = [
  { icon: BookOpen, label: "Accounting", link: "/modules/accounting" },
  { icon: Package, label: "Inventory", link: "/modules/inventory" },
  { icon: Scissors, label: "Production", link: "/modules/production" },
  { icon: Users, label: "HR & Payroll", link: "/modules/hr-payroll" },
];

const faqs = [
  {
    q: "What financial reports does Prime7 generate?",
    a: "Prime7 generates trial balance, profit & loss statement, balance sheet, cash flow statement, group summary, day book, ledger reports, and AR/AP aging analysis. All reports support date ranges, comparative periods, and multi-level drill-down.",
  },
  {
    q: "How does AI-powered analytics work?",
    a: "Prime7's AI engine continuously analyzes your business data to identify trends, anomalies, and opportunities. It surfaces insights like declining margins on specific buyers, inventory slow-movers, and production efficiency drops with actionable recommendations.",
  },
  {
    q: "Can I build custom reports?",
    a: "Yes. The custom report builder lets you select data fields, apply filters, set grouping and sorting, and choose visualization types. Save templates for recurring reports and schedule automatic generation.",
  },
  {
    q: "What export formats are supported?",
    a: "All reports can be exported to Excel (.xlsx), PDF, and CSV formats. You can also schedule automated report delivery via email on daily, weekly, or monthly schedules.",
  },
  {
    q: "Are dashboards role-based?",
    a: "Yes. Each role sees a customized dashboard. Factory managers see production KPIs, accountants see financial summaries, merchandisers see order status, and management sees overall business health indicators.",
  },
  {
    q: "Can I compare data across periods?",
    a: "Yes. Financial reports support comparative analysis across periods — month-over-month, quarter-over-quarter, and year-over-year. You can also compare actuals against budgets for variance analysis.",
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

export default function ReportsAnalyticsPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="ERP Reports & Analytics for Garment Industry | AI Dashboards | Prime7 ERP"
        description="AI-powered dashboards, financial statements, aging analysis & custom reports for garment manufacturers. Data-driven decision making with Prime7 ERP."
        canonical="https://prime7erp.com/modules/reports-analytics"
        keywords="ERP reporting software, AI analytics garments, financial reports ERP, custom report builder, business intelligence garment industry"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "Reports & Analytics", url: "https://prime7erp.com/modules/reports-analytics" },
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
              <BarChart3 className="w-4 h-4" />
              Reports & Analytics Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              AI-Powered Reports &
              <br />
              <span className="text-primary">Analytics for Garments</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Turn your ERP data into actionable insights. AI-powered dashboards, financial statements,
              and custom reports designed for garment manufacturing businesses.
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
              Comprehensive reporting and analytics to drive data-informed business decisions.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Analytics Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From raw data to actionable decisions — powered by AI.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Data From Every Module</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Reports pull data from accounting, inventory, production, and HR for a unified view.
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
              Analytics for <Link href="/garments-erp"><span className="text-primary hover:underline cursor-pointer">Garments ERP</span></Link> and{" "}
              <Link href="/buying-house-erp"><span className="text-primary hover:underline cursor-pointer">Buying House ERP</span></Link>.{" "}
              View <Link href="/pricing"><span className="text-primary hover:underline cursor-pointer">Pricing</span></Link> |{" "}
              <Link href="/resources"><span className="text-primary hover:underline cursor-pointer">Resources</span></Link>
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Common questions about Prime7's reporting and analytics.</p>
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
            Data-Driven Decisions
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Make Smarter Decisions with Data
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Stop guessing. Let AI-powered analytics reveal the insights hidden
            in your ERP data and guide your business decisions.
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
