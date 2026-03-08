import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ShieldCheck,
  ClipboardList,
  FlaskConical,
  RefreshCw,
  Ban,
  Bug,
  ChevronDown,
  Zap,
  Scissors,
  Package,
  BarChart3,
  Users,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: ClipboardList,
    title: "QC Templates",
    description: "Create buyer-specific and product-specific QC templates with configurable checkpoints, acceptable ranges, and grading criteria for consistent inspections.",
  },
  {
    icon: ShieldCheck,
    title: "AQL Inspection",
    description: "Built-in AQL (Acceptable Quality Level) sampling plans. Auto-calculate sample sizes based on lot quantity and inspection level with pass/fail determination.",
  },
  {
    icon: FlaskConical,
    title: "Lab Test Management",
    description: "Track fabric and garment lab tests including shrinkage, color fastness, GSM, and tensile strength. Record test results and link to buyer compliance requirements.",
  },
  {
    icon: RefreshCw,
    title: "CAPA Workflow",
    description: "Corrective and Preventive Action (CAPA) workflow for quality issues. Track root cause analysis, corrective actions, verification, and effectiveness review.",
  },
  {
    icon: Ban,
    title: "Hold & Release Management",
    description: "Place defective lots on quality hold. Manage rework, re-inspection, and release decisions with approval workflows and full traceability.",
  },
  {
    icon: Bug,
    title: "Defect Tracking & Buyer Compliance",
    description: "Log defects by type, severity, and location. Track defect trends across styles and lines. Ensure buyer compliance standards are met with audit-ready documentation.",
  },
];

const workflowSteps = [
  { step: "1", label: "Inline Inspection", detail: "Real-time checks during production", color: "bg-blue-500" },
  { step: "2", label: "Endline QC", detail: "AQL-based sampling at line end", color: "bg-indigo-500" },
  { step: "3", label: "Lab Testing", detail: "Fabric and garment lab tests", color: "bg-purple-500" },
  { step: "4", label: "Final Inspection", detail: "Pre-shipment inspection per AQL", color: "bg-pink-500" },
  { step: "5", label: "CAPA", detail: "Root cause and corrective actions", color: "bg-orange-500" },
  { step: "6", label: "Release", detail: "Quality clearance for shipment", color: "bg-emerald-500" },
];

const integrations = [
  { icon: Scissors, label: "Production", link: "/modules/production" },
  { icon: Package, label: "Inventory", link: "/modules/inventory" },
  { icon: BarChart3, label: "Reports & Analytics", link: "/modules/reports-analytics" },
  { icon: Users, label: "CRM & Support", link: "/modules/crm-support" },
];

const faqs = [
  {
    q: "How does AQL inspection work in Prime7?",
    a: "Prime7 has built-in AQL tables (Level I, II, III). Enter your lot size and inspection level, and the system auto-calculates sample size and accept/reject numbers. Record inspection results and the system determines pass/fail.",
  },
  {
    q: "Can I create buyer-specific QC templates?",
    a: "Yes. Each buyer can have custom QC templates with specific checkpoints, acceptable ranges, and grading criteria. Templates can be assigned to styles so the right criteria are applied automatically during inspection.",
  },
  {
    q: "How does the CAPA workflow function?",
    a: "When a quality issue is identified, a CAPA record is created with the problem description. It follows a workflow: root cause analysis, corrective action plan, implementation, verification, and effectiveness review — all with assigned owners and deadlines.",
  },
  {
    q: "Can I track defect trends over time?",
    a: "Yes. Prime7 logs every defect with type, severity, and location. Dashboard analytics show defect trends by style, line, operator, and time period, helping you identify systemic issues and improve quality.",
  },
  {
    q: "How does quality hold and release work?",
    a: "When defective goods are found, you can place the lot on quality hold, which prevents it from being shipped. After rework or re-inspection, authorized users can release the lot with documented justification.",
  },
  {
    q: "Does Prime7 support buyer compliance audits?",
    a: "Yes. Prime7 maintains all inspection records, lab test results, CAPA records, and defect logs in a structured format. This documentation is readily available for buyer audits and compliance reviews.",
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

export default function QualityManagementPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Quality Management Software for Garment Industry | AQL Inspection | Prime7 ERP"
        description="QC templates, AQL inspection, lab tests & CAPA workflows for garment quality control. Ensure buyer compliance with digital quality management."
        canonical="https://prime7erp.com/modules/quality-management"
        keywords="garment quality management software, AQL inspection system, QC template ERP, CAPA workflow, defect tracking garments"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "Quality Management", url: "https://prime7erp.com/modules/quality-management" },
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
              <ShieldCheck className="w-4 h-4" />
              Quality Management Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Quality Management for
              <br />
              <span className="text-primary">Garment Manufacturing</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Digital quality control from inline inspection to final audit. AQL-based sampling,
              buyer-specific templates, and CAPA workflows to ensure every shipment meets standards.
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
              Comprehensive quality control tools designed for garment and textile manufacturing.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Quality Control Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From inline inspection to shipment release — every quality checkpoint covered.
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
              Quality data connects directly to production, inventory, and reporting systems.
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
              Part of <Link href="/garments-erp"><span className="text-primary hover:underline cursor-pointer">Garments ERP</span></Link>.{" "}
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
            <p className="text-lg text-gray-600">Common questions about Prime7's quality management module.</p>
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
            Quality First
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ship Quality, Every Time
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Reduce rejections, pass buyer audits, and build a reputation for quality
            with Prime7's digital quality management system.
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
