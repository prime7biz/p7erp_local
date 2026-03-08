import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  FileText,
  RefreshCw,
  ClipboardCheck,
  ArrowLeftRight,
  Bell,
  DollarSign,
  ChevronDown,
  Zap,
  BookOpen,
  Globe,
  Package,
  BarChart3,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: FileText,
    title: "LC Lifecycle Management",
    description: "Manage the complete Letter of Credit lifecycle from opening to realization. Track LC value, shipment date, expiry, and utilization in real-time.",
  },
  {
    icon: RefreshCw,
    title: "Amendment Tracking",
    description: "Track every LC amendment with version history. Record value changes, date extensions, and terms modifications with full audit trail.",
  },
  {
    icon: ClipboardCheck,
    title: "Document Checklist",
    description: "Buyer and bank-specific document checklists. Track submission status of commercial invoice, packing list, B/L, certificate of origin, and more.",
  },
  {
    icon: ArrowLeftRight,
    title: "Back-to-Back LC",
    description: "Link master export LCs to back-to-back import LCs for raw materials. Track utilization and margin requirements across linked LCs.",
  },
  {
    icon: Bell,
    title: "Deadline Alerts",
    description: "Automated alerts for LC expiry, shipment dates, document submission deadlines, and amendment deadlines at 7, 15, and 30 days before due.",
  },
  {
    icon: DollarSign,
    title: "Bank Charges Tracking",
    description: "Record and track all LC-related bank charges including opening charges, amendment fees, discrepancy charges, and realization costs.",
  },
];

const workflowSteps = [
  { step: "1", label: "LC Opening", detail: "Receive and record master LC details", color: "bg-blue-500" },
  { step: "2", label: "Back-to-Back", detail: "Open import LC against master LC", color: "bg-indigo-500" },
  { step: "3", label: "Amendments", detail: "Track value and date amendments", color: "bg-purple-500" },
  { step: "4", label: "Shipment", detail: "Ship goods within LC timeline", color: "bg-pink-500" },
  { step: "5", label: "Document Submit", detail: "Submit export documents to bank", color: "bg-orange-500" },
  { step: "6", label: "Realization", detail: "Track payment and close LC", color: "bg-emerald-500" },
];

const integrations = [
  { icon: BookOpen, label: "Accounting", link: "/modules/accounting" },
  { icon: Globe, label: "Merchandising", link: "/modules/merchandising" },
  { icon: Package, label: "Inventory", link: "/modules/inventory" },
  { icon: BarChart3, label: "Reports & Analytics", link: "/modules/reports-analytics" },
];

const faqs = [
  {
    q: "How does Prime7 manage the LC lifecycle?",
    a: "Prime7 tracks every stage of an LC from opening to realization. You record LC details, amendments, shipments, document submissions, and payment receipts. The system maintains a complete timeline with all changes.",
  },
  {
    q: "Can I link export LCs to back-to-back import LCs?",
    a: "Yes. Prime7 supports master-to-back-to-back LC linking. You can see how much of your master LC is utilized by back-to-back LCs, track margin requirements, and manage linked payment schedules.",
  },
  {
    q: "How do deadline alerts work?",
    a: "The system sends automated alerts at configurable intervals before key deadlines — LC expiry, last shipment date, document submission deadline, and amendment expiry. Alerts appear in-app and can be sent via email.",
  },
  {
    q: "Does Prime7 track bank charges?",
    a: "Yes. Every LC-related charge is recorded — opening commission, amendment fees, acceptance charges, discrepancy penalties, and realization charges. These feed into your accounting module for accurate cost tracking.",
  },
  {
    q: "Can I manage document checklists per buyer?",
    a: "Yes. Each buyer can have a custom document checklist. When preparing export documents, the system shows which documents are required, which are prepared, and which are pending submission.",
  },
  {
    q: "How does LC processing integrate with accounting?",
    a: "LC transactions automatically create accounting entries — LC opening creates contingent liability, amendments update values, and realization posts the final payment entry. Bank charges are posted to the appropriate ledger accounts.",
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

export default function LcProcessingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="LC Processing Software for Garment Export | Letter of Credit Management | Prime7 ERP"
        description="Manage export LCs, back-to-back LCs, amendments & document checklists. Purpose-built LC processing for garment manufacturers and exporters."
        canonical="https://prime7erp.com/modules/lc-processing"
        keywords="LC processing software, letter of credit management, back-to-back LC software, garment export LC, document checklist ERP"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "LC Processing", url: "https://prime7erp.com/modules/lc-processing" },
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
              <FileText className="w-4 h-4" />
              LC Processing Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Letter of Credit Management for
              <br />
              <span className="text-primary">Garment Exporters</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Never miss an LC deadline again. Manage export LCs, back-to-back LCs, amendments,
              and document submissions with automated alerts and full lifecycle tracking.
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
              Complete LC management built for the garment export industry.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">LC Processing Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From LC opening to realization — every step tracked and managed.
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
              LC data flows into accounting, merchandising, and analytics automatically.
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
              Essential for <Link href="/garments-erp"><span className="text-primary hover:underline cursor-pointer">Garments ERP</span></Link> and{" "}
              <Link href="/buying-house-erp"><span className="text-primary hover:underline cursor-pointer">Buying House ERP</span></Link>.{" "}
              Learn more in <Link href="/resources"><span className="text-primary hover:underline cursor-pointer">Resources</span></Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Common questions about Prime7's LC processing module.</p>
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
            Zero Missed Deadlines
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Never Miss an LC Deadline Again
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Automate your LC tracking, reduce bank penalties, and ensure timely
            document submissions with Prime7's LC processing module.
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
