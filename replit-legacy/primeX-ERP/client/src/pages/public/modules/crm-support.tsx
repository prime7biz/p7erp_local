import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Handshake,
  Target,
  MessageSquare,
  FileText,
  HeadphonesIcon,
  History,
  ChevronDown,
  Zap,
  Palette,
  BookOpen,
  BarChart3,
  Users,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: Handshake,
    title: "Customer Relationship Management",
    description: "Maintain detailed buyer profiles with contact information, preferences, compliance requirements, and complete transaction history for stronger relationships.",
  },
  {
    icon: Target,
    title: "Lead & Inquiry Tracking",
    description: "Capture leads from multiple channels. Track inquiry status through qualification, sampling, negotiation, and conversion stages with follow-up reminders.",
  },
  {
    icon: MessageSquare,
    title: "Inquiry Management",
    description: "Manage buyer inquiries with style details, quantity requirements, target prices, and delivery timelines. Convert qualified inquiries to quotations seamlessly.",
  },
  {
    icon: FileText,
    title: "Quotation Management",
    description: "Create detailed quotations with cost breakdowns, terms, and validity periods. Track quotation versions, buyer feedback, and conversion rates.",
  },
  {
    icon: HeadphonesIcon,
    title: "Support Ticket System",
    description: "Manage post-delivery support with ticket tracking. Log quality complaints, delivery issues, and buyer requests with priority levels and resolution tracking.",
  },
  {
    icon: History,
    title: "Communication History",
    description: "Maintain complete communication logs per buyer — emails, meetings, calls, and notes. Never lose context on any customer interaction or decision.",
  },
];

const workflowSteps = [
  { step: "1", label: "Lead Capture", detail: "Record new buyer inquiry", color: "bg-blue-500" },
  { step: "2", label: "Qualification", detail: "Assess feasibility and requirements", color: "bg-indigo-500" },
  { step: "3", label: "Quotation", detail: "Prepare and send pricing", color: "bg-purple-500" },
  { step: "4", label: "Negotiation", detail: "Track revisions and feedback", color: "bg-pink-500" },
  { step: "5", label: "Order Conversion", detail: "Convert to confirmed order", color: "bg-orange-500" },
  { step: "6", label: "Support", detail: "Post-delivery support and follow-up", color: "bg-emerald-500" },
];

const integrations = [
  { icon: Palette, label: "Merchandising", link: "/modules/merchandising" },
  { icon: BookOpen, label: "Accounting", link: "/modules/accounting" },
  { icon: BarChart3, label: "Reports & Analytics", link: "/modules/reports-analytics" },
  { icon: Users, label: "HR & Payroll", link: "/modules/hr-payroll" },
];

const faqs = [
  {
    q: "How does Prime7 CRM differ from generic CRM software?",
    a: "Prime7's CRM is built specifically for garment and textile businesses. It understands buyer-supplier relationships in manufacturing, supports style-based inquiries, integrates with BOM and costing, and tracks the complete order lifecycle from inquiry to delivery.",
  },
  {
    q: "Can I track the complete history of a buyer relationship?",
    a: "Yes. Prime7 maintains a comprehensive buyer profile with all inquiries, quotations, orders, shipments, payments, quality records, and communication logs. This gives your merchandising team complete context for every interaction.",
  },
  {
    q: "How does inquiry-to-order conversion work?",
    a: "When a buyer sends an inquiry, you record it with style details and requirements. As you develop samples and pricing, the inquiry progresses through stages. Once approved, it converts to a quotation and then to a confirmed order — all linked and traceable.",
  },
  {
    q: "Does Prime7 support quotation versioning?",
    a: "Yes. You can create multiple versions of a quotation as negotiations progress. Each version tracks changes in pricing, quantities, and terms. The system shows conversion rates and helps identify winning strategies.",
  },
  {
    q: "How does the support ticket system work?",
    a: "After delivery, any buyer complaints or requests are logged as support tickets with priority and category. Tickets are assigned to responsible teams, tracked through resolution, and linked to the original order for complete traceability.",
  },
  {
    q: "Can I see analytics on my buyer relationships?",
    a: "Yes. The CRM dashboard shows key metrics like inquiry-to-order conversion rates, top buyers by revenue, average order values, lead response times, and buyer satisfaction trends. This data helps optimize your sales efforts.",
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

export default function CrmSupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="CRM & Support Software for Garment Industry | Buyer Management | Prime7 ERP"
        description="Manage buyer relationships, track inquiries, create quotations & handle support tickets. CRM built for garment manufacturers and buying houses."
        canonical="https://prime7erp.com/modules/crm-support"
        keywords="garment CRM software, buyer management ERP, inquiry tracking garments, quotation management system, customer support ERP"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "CRM & Support", url: "https://prime7erp.com/modules/crm-support" },
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
              <Handshake className="w-4 h-4" />
              CRM & Support Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              CRM & Support for
              <br />
              <span className="text-primary">Garment Industry</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Build stronger buyer relationships with integrated CRM. Track inquiries, manage quotations,
              and provide post-delivery support — all connected to your ERP data.
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
              End-to-end customer relationship and support management for garment businesses.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">CRM Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From first contact to ongoing support — manage the complete buyer journey.
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
              CRM data connects to merchandising, accounting, and analytics for a 360° view.
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
            <p className="text-lg text-gray-600">Common questions about Prime7's CRM & support module.</p>
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
            Stronger Relationships
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Build Lasting Buyer Relationships
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            From first inquiry to repeat orders — manage every buyer touchpoint
            with Prime7's integrated CRM and support system.
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
