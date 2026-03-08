import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Users,
  Clock,
  CalendarDays,
  Calculator,
  FileText,
  Wallet,
  ChevronDown,
  Zap,
  BookOpen,
  BarChart3,
  ShieldCheck,
  BadgeCheck,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: Users,
    title: "Employee Master",
    description: "Comprehensive employee records with personal details, documents, designations, departments, and employment history. Digital personnel files for every worker.",
  },
  {
    icon: Clock,
    title: "Attendance Management",
    description: "Track daily attendance with shift management, overtime calculation, and late/early tracking. Integrate with biometric devices for automated attendance capture.",
  },
  {
    icon: CalendarDays,
    title: "Leave Management",
    description: "Configure leave types, accrual rules, and carry-forward policies. Employee self-service for leave applications with multi-level approval workflows.",
  },
  {
    icon: Calculator,
    title: "Salary Structures & Payroll",
    description: "Define flexible salary structures with basic, allowances, deductions, and overtime. Run monthly payroll with automatic tax and statutory deduction calculations.",
  },
  {
    icon: FileText,
    title: "Payslips & Advances",
    description: "Generate digital payslips with detailed breakdowns. Manage salary advances, loans, and installment deductions with automatic payroll integration.",
  },
  {
    icon: BadgeCheck,
    title: "Compliance Reports",
    description: "Generate statutory compliance reports for labor laws. Track PF, ESI, and tax deductions with period-wise summaries for regulatory submissions.",
  },
];

const workflowSteps = [
  { step: "1", label: "Employee Onboarding", detail: "Create employee record and assign structure", color: "bg-blue-500" },
  { step: "2", label: "Attendance", detail: "Daily attendance capture and review", color: "bg-indigo-500" },
  { step: "3", label: "Leave Processing", detail: "Apply, approve, and track leaves", color: "bg-purple-500" },
  { step: "4", label: "Payroll Run", detail: "Calculate salary with all components", color: "bg-pink-500" },
  { step: "5", label: "Payslip Generation", detail: "Generate and distribute payslips", color: "bg-orange-500" },
  { step: "6", label: "Bank Transfer", detail: "Process salary payments to bank", color: "bg-emerald-500" },
];

const integrations = [
  { icon: BookOpen, label: "Accounting", link: "/modules/accounting" },
  { icon: BarChart3, label: "Reports & Analytics", link: "/modules/reports-analytics" },
  { icon: ShieldCheck, label: "Quality Management", link: "/modules/quality-management" },
  { icon: Wallet, label: "Production", link: "/modules/production" },
];

const faqs = [
  {
    q: "How does Prime7 handle payroll for garment factory workers?",
    a: "Prime7 supports both salaried and piece-rate workers common in garment factories. You can define salary structures with basic pay, attendance and overtime allowances, and production-based incentives. Monthly payroll runs calculate all components automatically.",
  },
  {
    q: "Can I track attendance with biometric devices?",
    a: "Yes. Prime7 integrates with common biometric attendance devices. Attendance data is imported automatically, with support for multiple shifts, overtime rules, and grace periods for late arrivals.",
  },
  {
    q: "How does leave management work?",
    a: "Configure leave types (casual, sick, annual, maternity) with accrual rules, maximum balances, and carry-forward policies. Employees can apply for leave, and managers approve through a multi-level workflow with automatic balance updates.",
  },
  {
    q: "Does Prime7 generate statutory compliance reports?",
    a: "Yes. Prime7 generates reports required for labor law compliance including PF contributions, tax deductions, and statutory returns. Reports are formatted per regulatory requirements for easy submission.",
  },
  {
    q: "Can I manage salary advances and loans?",
    a: "Yes. Record salary advances and employee loans with repayment schedules. Installment deductions are automatically applied during monthly payroll runs until the balance is cleared.",
  },
  {
    q: "How does payroll integrate with accounting?",
    a: "When payroll is finalized, Prime7 automatically creates accounting entries for salary expense, statutory liabilities, and bank payments. Cost allocation to departments and cost centers is handled automatically.",
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

export default function HrPayrollPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="HR & Payroll Software for Garment Industry | Attendance & Salary | Prime7 ERP"
        description="Employee management, attendance tracking, leave management & payroll processing for garment factories. Compliance-ready HR & payroll module."
        canonical="https://prime7erp.com/modules/hr-payroll"
        keywords="garment factory HR software, payroll management ERP, attendance tracking garments, leave management system, employee payroll software"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "HR & Payroll", url: "https://prime7erp.com/modules/hr-payroll" },
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
              <Users className="w-4 h-4" />
              HR & Payroll Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              HR & Payroll Software for
              <br />
              <span className="text-primary">Garment Factories</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Manage your workforce efficiently — from employee onboarding to monthly payroll.
              Built for garment factories with support for shift workers, overtime, and piece-rate calculations.
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
              Complete HR and payroll management tailored for the garment manufacturing workforce.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">HR & Payroll Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From hiring to salary disbursement — an integrated HR lifecycle.
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
              Payroll posts to accounting. Attendance links to production efficiency tracking.
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
            <p className="text-lg text-gray-600">Common questions about Prime7's HR & payroll module.</p>
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
            Simplify Your HR
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Streamline HR & Payroll Operations
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Manage thousands of employees with ease. From attendance to payslips,
            Prime7 automates your entire HR workflow.
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
