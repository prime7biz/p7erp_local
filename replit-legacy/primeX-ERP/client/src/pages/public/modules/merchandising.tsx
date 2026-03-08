import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Palette,
  Grid3X3,
  ClipboardList,
  CalendarClock,
  Users,
  Layers,
  ChevronDown,
  Zap,
  CheckCircle2,
  Package,
  FileText,
  Link2,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: Palette,
    title: "Style Master Management",
    description: "Create and manage complete style records with tech packs, images, specifications, and buyer requirements in a centralized style library.",
  },
  {
    icon: Grid3X3,
    title: "Size-Color Matrix",
    description: "Define size scales, colorways, and quantity breakdowns per size-color combination. Auto-calculate totals and generate order matrices.",
  },
  {
    icon: ClipboardList,
    title: "BOM Management",
    description: "Build multi-level Bills of Material with fabric, trims, and accessories. Link to consumption matrices for precise material planning.",
  },
  {
    icon: Package,
    title: "Sample Development",
    description: "Track sample lifecycle from proto to sealing. Manage sample requests, approvals, courier details, and buyer feedback in one place.",
  },
  {
    icon: CalendarClock,
    title: "T&A Calendar",
    description: "Time & Action planning with milestone tracking, automated deadline alerts, and critical path analysis for every order.",
  },
  {
    icon: Users,
    title: "Buyer Requirement Tracking",
    description: "Capture buyer-specific requirements including packing instructions, labeling specs, compliance standards, and shipping marks.",
  },
];

const workflowSteps = [
  { step: "1", label: "Style Creation", detail: "Define style with specs and tech pack", color: "bg-blue-500" },
  { step: "2", label: "BOM Setup", detail: "Build material requirements per style", color: "bg-indigo-500" },
  { step: "3", label: "Sample Dev", detail: "Track proto to sealing samples", color: "bg-purple-500" },
  { step: "4", label: "Costing", detail: "Calculate CMT and FOB pricing", color: "bg-pink-500" },
  { step: "5", label: "Order Confirm", detail: "Finalize quantities and delivery", color: "bg-orange-500" },
  { step: "6", label: "T&A Planning", detail: "Set milestones and deadlines", color: "bg-emerald-500" },
];

const integrations = [
  { icon: Layers, label: "Production Planning", link: "/modules/production" },
  { icon: Package, label: "Inventory Management", link: "/modules/inventory" },
  { icon: FileText, label: "LC Processing", link: "/modules/lc-processing" },
  { icon: Link2, label: "Quality Management", link: "/modules/quality-management" },
];

const faqs = [
  {
    q: "How does Prime7 handle size-color matrix management?",
    a: "Prime7 provides a visual size-color matrix builder where you define size scales and colorways per style. Quantities are entered per cell and auto-totaled. The matrix flows through to BOM calculations, consumption planning, and production orders.",
  },
  {
    q: "Can I manage multiple buyers with different requirements?",
    a: "Yes. Each buyer has a dedicated profile with their specific requirements including packing methods, labeling standards, compliance needs, and shipping instructions. These are automatically applied when creating orders for that buyer.",
  },
  {
    q: "How does sample tracking work in Prime7?",
    a: "The sample module tracks every stage from proto samples through fit, PP, and sealing samples. Each sample has status tracking, courier integration, buyer comments, and approval workflows with full audit trail.",
  },
  {
    q: "Does the T&A calendar support automated alerts?",
    a: "Yes. The Time & Action calendar sends automated alerts at configurable intervals (7, 15, 30 days) before milestone deadlines. It highlights critical path items and shows real-time progress against plan.",
  },
  {
    q: "How does BOM connect to consumption planning?",
    a: "BOMs in Prime7 link directly to consumption matrices. When you define material requirements per size-color, the system auto-calculates total requirements with waste percentages, enabling precise purchase planning.",
  },
  {
    q: "Can I generate costing sheets from the merchandising module?",
    a: "Yes. Prime7 auto-generates costing sheets from BOM data, adding CMT costs, commercial charges, and margins. You can create multiple costing versions and compare them before finalizing buyer quotes.",
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

export default function MerchandisingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Merchandising Software for Garment Industry | Prime7 ERP"
        description="Manage styles, BOMs, samples & T&A calendars in one platform. Purpose-built merchandising module for garment manufacturers and buying houses."
        canonical="https://prime7erp.com/modules/merchandising"
        keywords="garment merchandising software, style management ERP, BOM management garments, T&A calendar software, sample tracking system"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "Merchandising", url: "https://prime7erp.com/modules/merchandising" },
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
              <Palette className="w-4 h-4" />
              Merchandising Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Merchandising Software for
              <br />
              <span className="text-primary">Garment Industry</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Stop juggling Excel files for styles, BOMs, and samples. Prime7's merchandising module
              centralizes your entire product development lifecycle from inquiry to production handover.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Key Features
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Everything a merchandiser needs to manage styles, materials, and timelines efficiently.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Merchandising Workflow
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              A streamlined workflow from style creation to production handover.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Integrated With Other Modules
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Merchandising data flows seamlessly into production, inventory, and commercial modules.
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
              Also integrates with <Link href="/garments-erp"><span className="text-primary hover:underline cursor-pointer">Garments ERP</span></Link>,{" "}
              <Link href="/buying-house-erp"><span className="text-primary hover:underline cursor-pointer">Buying House ERP</span></Link>, and{" "}
              <Link href="/resources"><span className="text-primary hover:underline cursor-pointer">more modules</span></Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600">
              Common questions about Prime7's merchandising module.
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

      <section className="py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-blue-300 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Streamline Your Merchandising
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Merchandising Workflow?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join garment manufacturers who have eliminated Excel chaos and streamlined their
            product development with Prime7 ERP.
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
