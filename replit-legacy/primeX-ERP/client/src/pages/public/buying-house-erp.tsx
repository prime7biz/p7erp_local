import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Calendar,
  ClipboardList,
  Package,
  Users,
  Ship,
  FileText,
  ShieldCheck,
  BarChart3,
  Zap,
  Building2,
  Clock,
  FolderSearch,
  Truck,
  FileWarning,
  UserX,
} from "lucide-react";
import { useState } from "react";
import buyingHouseGlobal from "../../assets/images/buying-house-global.png";
import techPatternBg from "../../assets/images/tech-pattern-bg.png";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Prime7 ERP",
  url: "https://prime7erp.com",
  logo: "https://prime7erp.com/logo.png",
  sameAs: [],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "sales",
    availableLanguage: ["English", "Bengali"],
  },
};

const faqs = [
  {
    q: "What is a buying house ERP and why do I need one?",
    a: "A buying house ERP is specialized software designed for garment buying offices that act as intermediaries between international buyers and local factories. It centralizes T&A tracking, PO management, sample coordination, shipment monitoring, and commercial documentation — replacing scattered Excel files and manual follow-ups with a single integrated platform.",
  },
  {
    q: "How does Prime7 handle T&A (Time & Action) calendar management?",
    a: "Prime7 provides a visual T&A calendar with customizable milestone templates per buyer and product type. You can set target dates, track actual completion, receive automated alerts for upcoming and overdue tasks, and generate buyer-ready T&A status reports. The system supports bulk updates across multiple POs and automatic critical path calculation.",
  },
  {
    q: "Can I track POs across multiple factories and suppliers?",
    a: "Yes, Prime7 allows you to manage purchase orders across unlimited factories and suppliers. Each PO tracks order quantity, delivery dates, pricing, and status. You get a consolidated dashboard view showing all active POs by buyer, factory, or delivery date — with color-coded alerts for delayed or at-risk orders.",
  },
  {
    q: "How does sample management work in Prime7?",
    a: "The sample module tracks the entire sample lifecycle — from proto to fit, PP, size set, pre-production, and TOP samples. Each sample request records the type, submission date, buyer comments, approval status, and courier details. You can monitor approval cycles and identify bottlenecks causing delays in the critical path.",
  },
  {
    q: "Can Prime7 integrate with factory ERP systems?",
    a: "Prime7 supports data exchange with factory systems through structured import/export. Factories can update production progress, inspection results, and shipment details directly or via shared data templates. This eliminates the need for manual follow-up calls and WhatsApp-based status updates.",
  },
  {
    q: "How does Prime7 help with compliance and audit readiness?",
    a: "Prime7 maintains a complete digital trail of every order's lifecycle — from PO issuance to shipment. Compliance documents, test reports, inspection certificates, and audit records are stored centrally with version control. You can generate buyer-specific compliance reports and ensure every order meets social and quality audit requirements.",
  },
  {
    q: "What is the pricing for Prime7 Buying House ERP?",
    a: "Prime7 offers flexible pricing plans starting with a free trial. Our plans are designed for buying houses of all sizes — from small offices managing 50 POs/month to large operations handling 500+ POs across multiple buyers. Contact our sales team for a customized quote based on your team size and order volume.",
  },
  {
    q: "How do I get started with Prime7 for my buying house?",
    a: "Getting started is simple: sign up for a free trial, configure your buyer and factory master data, set up your T&A templates, and start entering POs. Our implementation team provides hands-on onboarding support, data migration from your existing Excel systems, and training for your merchandising team.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.a,
    },
  })),
};

const painPoints = [
  {
    icon: Clock,
    title: "Manual T&A Tracking",
    description: "Merchandisers spend hours updating Excel-based T&A calendars across dozens of orders, missing critical milestones and deadlines.",
  },
  {
    icon: FolderSearch,
    title: "PO Follow-up Chaos",
    description: "Purchase order status scattered across emails, WhatsApp, and spreadsheets. No single view of which POs are on track or delayed.",
  },
  {
    icon: Package,
    title: "Sample Management Delays",
    description: "Sample approvals stuck in email chains. No visibility into where each sample is in the approval cycle or why delays are occurring.",
  },
  {
    icon: Truck,
    title: "Shipment Milestone Tracking",
    description: "Shipment dates, booking confirmations, and vessel details tracked manually. Late shipments discovered too late to take corrective action.",
  },
  {
    icon: FileWarning,
    title: "LC Document Management",
    description: "Commercial documents like LCs, packing lists, and certificates scattered across folders. Missing documents cause shipment holds and bank discrepancies.",
  },
  {
    icon: UserX,
    title: "Compliance & Audit Gaps",
    description: "Buyer audit requirements, test reports, and compliance certificates managed informally. Failed audits result in order cancellations and lost business.",
  },
];

const features = [
  {
    icon: Calendar,
    title: "T&A Calendar Management",
    description: "Visual timeline with milestone templates, automated alerts, critical path tracking, and buyer-ready T&A status reports across all active orders.",
  },
  {
    icon: ClipboardList,
    title: "PO Tracking & Follow-up",
    description: "Centralized PO dashboard with real-time status updates from factories. Track quantities, deliveries, pricing, and amendments in one place.",
  },
  {
    icon: Package,
    title: "Sample Management",
    description: "End-to-end sample tracking from proto to TOP. Monitor submission dates, buyer feedback, approval status, and courier details with full audit trail.",
  },
  {
    icon: Users,
    title: "Supplier Management",
    description: "Maintain a comprehensive supplier database with performance scorecards, capacity tracking, compliance status, and order history for informed sourcing decisions.",
  },
  {
    icon: Ship,
    title: "Shipment Milestones",
    description: "Track booking confirmations, vessel details, ETD/ETA, container loading, and delivery status. Automated alerts for approaching and missed shipment dates.",
  },
  {
    icon: FileText,
    title: "Commercial LC Management",
    description: "Manage master LCs, back-to-back LCs, amendments, and utilization tracking. Document checklists ensure complete and compliant submissions to banks.",
  },
  {
    icon: ShieldCheck,
    title: "Approval Workflows",
    description: "Configurable multi-level approval chains for POs, samples, shipments, and commercial documents. Digital sign-offs with complete approval history.",
  },
  {
    icon: BarChart3,
    title: "Compliance & Reporting",
    description: "Buyer-specific compliance tracking, audit management, and automated reporting. Generate T&A status, order pipeline, and performance analytics on demand.",
  },
];

const processSteps = [
  { label: "Buyer PO Received", color: "bg-blue-500" },
  { label: "Factory Allocation", color: "bg-indigo-500" },
  { label: "T&A Planning", color: "bg-purple-500" },
  { label: "Sample Coordination", color: "bg-pink-500" },
  { label: "Production Follow-up", color: "bg-red-500" },
  { label: "QC & Inspection", color: "bg-orange-500" },
  { label: "Shipment Booking", color: "bg-yellow-500" },
  { label: "LC Documentation", color: "bg-emerald-500" },
  { label: "Delivery & Closure", color: "bg-teal-500" },
];

export default function BuyingHouseErpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Buying House ERP Software | Merchandising & T&A | Prime7"
        description="Purpose-built ERP for buying houses. Manage T&A, PO tracking, sample coordination, shipment milestones & LC documentation. Start free trial now."
        canonical="https://prime7erp.com/buying-house-erp"
        keywords="buying house erp software bangladesh, garments buying house software, merchandising software garments, tna software garments, po tracking software garments, sample management software garments"
        jsonLd={[organizationSchema, faqSchema]}
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "Buying House ERP", url: "https://prime7erp.com/buying-house-erp"}]}
      />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#1E293B] via-[#1E293B]/95 to-primary/90 py-20 lg:py-28 overflow-hidden">
        <div className="absolute top-10 -left-20 w-80 h-80 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 -right-32 w-72 h-72 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-[15%] left-[10%] w-2 h-2 bg-primary/30 rounded-full animate-pulse pointer-events-none" />
        <div className="absolute top-[60%] right-[25%] w-2 h-2 bg-accent/25 rounded-full animate-pulse pointer-events-none" />
        <div className="absolute bottom-[15%] right-[10%] w-1.5 h-1.5 bg-white/20 rounded-full animate-pulse pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/15 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Building2 className="w-4 h-4" />
              Built for Garment Buying Houses
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Streamline Your Buying House with
              <br />
              <span className="text-accent">Purpose-Built ERP Software</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              From PO receipt to shipment delivery — manage T&A calendars, track orders across multiple factories,
              coordinate samples, and handle LC documentation in one integrated platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/app/register">
                <Button size="lg" className="gap-2 text-base px-8 bg-primary text-white hover:bg-primary/90">
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8 text-white border-white hover:bg-white/10 bg-transparent">
                  Request Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Global Buying House Operations Image Section */}
      <section className="relative py-16 lg:py-24 bg-gray-900 overflow-hidden">
        <div className="absolute top-10 -right-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -left-20 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Global Buying House Operations
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Manage international trade operations across multiple countries, buyers, and factories from a single platform.
            </p>
          </div>
          <div className="relative rounded-2xl overflow-hidden shadow-xl max-w-5xl mx-auto">
            <img src={buyingHouseGlobal} alt="Global Buying House Operations Diagram" width={1200} height={800} className="w-full h-auto" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="relative py-16 lg:py-24 bg-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #F97316 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <AlertTriangle className="w-4 h-4" />
              Common Buying House Challenges
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Challenges Every Buying House Faces
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              If your merchandising team is drowning in spreadsheets and WhatsApp follow-ups, Prime7 was built to solve exactly these problems.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {painPoints.map((point) => (
              <div key={point.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-50 text-red-500 rounded-lg mb-4">
                  <point.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{point.title}</h3>
                <p className="text-gray-600 text-sm">{point.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="relative py-16 lg:py-24 bg-gray-50 overflow-hidden">
        <div className="absolute top-20 -left-40 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-72 h-72 bg-indigo-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <CheckCircle2 className="w-4 h-4" />
              Comprehensive Feature Set
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything Your Buying House Needs
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Purpose-built modules for every aspect of buying house operations — from order receipt to shipment closure.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Workflow */}
      <section className="relative py-16 lg:py-24 bg-white overflow-hidden">
        <div className="absolute top-10 -right-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -left-20 w-56 h-56 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Buying House Order Lifecycle
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Prime7 covers the complete buying house workflow — from receiving buyer POs to final delivery and closure.
            </p>
          </div>
          <div className="relative">
            <div className="hidden lg:flex items-center justify-between relative">
              <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-teal-500 -translate-y-1/2 z-0 rounded-full" />
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

      {/* Cross-links */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-primary/5 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Part of the Complete Prime7 Platform
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Prime7 Buying House ERP works seamlessly with our factory ERP modules for end-to-end supply chain visibility.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href="/garments-erp">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Garments Factory ERP</h3>
                <p className="text-gray-600 text-sm mb-3">Complete ERP for garment manufacturers — production planning, cutting, sewing, finishing, and quality control.</p>
                <span className="text-primary text-sm font-medium inline-flex items-center gap-1">Learn More <ArrowRight className="w-3.5 h-3.5" /></span>
              </div>
            </Link>
            <Link href="/features">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">All Features</h3>
                <p className="text-gray-600 text-sm mb-3">Explore the complete feature set including accounting, inventory, HR, and AI-powered insights across all modules.</p>
                <span className="text-primary text-sm font-medium inline-flex items-center gap-1">Explore Features <ArrowRight className="w-3.5 h-3.5" /></span>
              </div>
            </Link>
            <Link href="/pricing">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Pricing Plans</h3>
                <p className="text-gray-600 text-sm mb-3">Flexible plans for buying houses of all sizes — from small offices to large multi-buyer operations.</p>
                <span className="text-primary text-sm font-medium inline-flex items-center gap-1">View Pricing <ArrowRight className="w-3.5 h-3.5" /></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600">
              Common questions from buying houses considering Prime7 ERP.
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
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

      {/* CTA */}
      <section className="relative py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800 overflow-hidden">
        <img src={techPatternBg} alt="Tech Pattern Background Design" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover opacity-[0.05] pointer-events-none" loading="lazy" />
        <div className="absolute top-10 -left-20 w-72 h-72 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-primary/80 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Trusted by Leading Buying Houses
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Buying House Operations?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Stop chasing factories on WhatsApp. Get real-time visibility into every order, every milestone,
            and every document — all from one platform built specifically for buying houses.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app/register">
              <Button size="lg" className="gap-2 text-base px-8">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="gap-2 text-base px-8 text-white border-white hover:bg-white/10 bg-transparent">
                Request Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
