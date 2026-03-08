import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Factory,
  Zap,
  Scissors,
  Package,
  BarChart3,
  Brain,
  Clock,
  Eye,
  Target,
  TrendingUp,
  AlertTriangle,
  Gauge,
  Layers,
  Users,
} from "lucide-react";
import { useState } from "react";

const productionStages = [
  { label: "Order Received", color: "bg-blue-500", icon: Package },
  { label: "Cutting", color: "bg-indigo-500", icon: Scissors },
  { label: "Sewing", color: "bg-purple-500", icon: Factory },
  { label: "Finishing", color: "bg-pink-500", icon: Target },
  { label: "Packing", color: "bg-orange-500", icon: Layers },
  { label: "Shipment", color: "bg-emerald-500", icon: TrendingUp },
];

const dashboardFeatures = [
  { icon: Eye, title: "Real-Time WIP Visibility", description: "See exactly how many pieces are at each production stage — cutting, sewing, finishing, and packing — updated in real time." },
  { icon: Gauge, title: "Line Efficiency Metrics", description: "Track SMV, actual output vs target, and efficiency percentage for every sewing line and operator." },
  { icon: BarChart3, title: "Order Progress Tracking", description: "Monitor each order's progress against delivery deadlines with color-coded status indicators and completion percentages." },
  { icon: AlertTriangle, title: "Bottleneck Detection", description: "Automatically identify production bottlenecks where WIP is building up, enabling quick intervention before delays cascade." },
  { icon: Clock, title: "Delivery Countdown", description: "See days remaining until shipment for every active order, with risk alerts when production pace falls behind schedule." },
  { icon: Users, title: "Operator Performance", description: "Track individual operator efficiency, skill matrices, and output quality to optimize line balancing and training." },
];

const aiFeatures = [
  { title: "Smart Scheduling", description: "AI analyzes order priorities, line capacity, and operator skills to generate optimized production schedules that maximize throughput." },
  { title: "Delay Prediction", description: "Machine learning models predict potential delays based on historical patterns, current WIP flow, and external factors like material availability." },
  { title: "Quality Prediction", description: "AI identifies patterns in defect data to predict quality issues before they occur, enabling preventive action at the source." },
  { title: "Capacity Optimization", description: "Intelligent capacity planning that balances workload across lines and shifts, minimizing overtime while meeting delivery deadlines." },
];

const faqs = [
  { q: "What is apparel production management software?", a: "Apparel production management software tracks and optimizes every stage of garment manufacturing — from cutting through sewing, finishing, and packing. It provides real-time WIP visibility, efficiency metrics, quality tracking, and delivery management in a single integrated platform." },
  { q: "How does Prime7 track production in real time?", a: "Prime7 uses a stage-based production tracking system where operators record output at each workstation. This feeds into real-time dashboards showing WIP counts, line efficiency, hourly output trends, and order completion percentages. Supervisors can monitor all lines from a single screen." },
  { q: "Can Prime7 handle multiple production lines and shifts?", a: "Yes. Prime7 supports unlimited production lines, multiple shifts, and complex factory layouts. Each line can be configured with its own targets, operators, and capacity settings. Cross-line transfers and shared operations are fully supported." },
  { q: "How does AI improve production efficiency?", a: "Prime7's AI engine analyzes historical production data to optimize scheduling, predict delays, identify quality patterns, and balance workload across lines. Factories using AI-powered scheduling typically see 10-15% improvements in line efficiency within the first 3 months." },
  { q: "Does Prime7 integrate production with inventory and accounting?", a: "Absolutely. When production consumes fabric or trims, inventory is automatically updated. Finished goods are added to stock. Production costs flow into accounting for accurate order-level profitability analysis. Everything is connected in real time." },
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

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Prime7 Apparel Production Management",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web Browser",
  description: "Real-time apparel production management with WIP tracking, efficiency metrics, AI scheduling, and integrated quality control.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "BDT", description: "Free trial available" },
};

export default function ApparelProductionManagementPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Apparel Production Management Software | Prime7 ERP"
        description="Streamline apparel production with Prime7. Real-time tracking from cutting to packing, WIP visibility, efficiency metrics & AI-powered scheduling. Start free trial."
        canonical="https://prime7erp.com/apparel-production-management"
        keywords="apparel production management, garment production tracking, clothing production software, manufacturing execution system apparel"
        jsonLd={[faqJsonLd, serviceJsonLd]}
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "Apparel Production Management", url: "https://prime7erp.com/apparel-production-management"}]}
      />

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Apparel Production Management</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 right-20 w-80 h-80 bg-primary rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Factory className="w-4 h-4" />
              End-to-End Production Control
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Complete Apparel
              <br />
              <span className="text-primary">Production Management</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Get end-to-end visibility into your garment production floor. Track every piece from
              cutting to packing with real-time WIP dashboards, efficiency metrics, and AI-powered scheduling.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/app/register">
                <Button size="lg" className="gap-2 text-base px-8">
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/features">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                  See All Features
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Production Stages */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Production Stages We Cover
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Prime7 tracks your garments through every production stage with real-time updates and complete traceability.
            </p>
          </div>
          {/* Desktop flow */}
          <div className="hidden lg:flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 z-0" />
            {productionStages.map((stage, i) => (
              <div key={stage.label} className="relative z-10 flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full ${stage.color} text-white flex items-center justify-center shadow-lg`}>
                  <stage.icon className="w-7 h-7" />
                </div>
                <p className="mt-3 text-sm font-medium text-gray-700 text-center max-w-[100px]">{stage.label}</p>
              </div>
            ))}
          </div>
          {/* Mobile flow */}
          <div className="lg:hidden space-y-3">
            {productionStages.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full ${stage.color} text-white flex items-center justify-center flex-shrink-0`}>
                  <stage.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800">{stage.label}</p>
                  {i < productionStages.length - 1 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Real-Time Dashboard */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <BarChart3 className="w-4 h-4" />
              Real-Time Visibility
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Real-Time Production Dashboard
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              One screen to monitor your entire production floor. Track WIP, efficiency, quality, and delivery status across all lines.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardFeatures.map((feat) => (
              <div key={feat.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                  <feat.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feat.title}</h3>
                <p className="text-gray-600 text-sm">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI-Powered Production Intelligence */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-primary/5 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <Brain className="w-4 h-4" />
              AI-Powered
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              AI-Powered Production Intelligence
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Let AI optimize your production scheduling, predict delays before they happen, and identify opportunities for efficiency gains.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {aiFeatures.map((feat) => (
              <div key={feat.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                    <Brain className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{feat.title}</h3>
                </div>
                <p className="text-gray-600 text-sm">{feat.description}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/pricing">
              <Button variant="outline" className="gap-2">
                View Pricing Plans <ArrowRight className="w-4 h-4" />
              </Button>
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
              Common questions about apparel production management with Prime7.
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

      {/* Related Pages */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 mb-4">Explore Related Pages</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/garments-erp"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">Garments ERP Solutions</span></Link>
            <Link href="/features"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">All Features</span></Link>
            <Link href="/resources/wip-costing-rmg"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">WIP Costing for RMG →</span></Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-blue-300 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Boost Production Efficiency
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Take Control of Your Production Floor
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Stop managing production with spreadsheets and whiteboards. Get real-time visibility,
            AI-powered insights, and complete traceability with Prime7 ERP.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app/register">
              <Button size="lg" className="gap-2 text-base px-8">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="gap-2 text-base px-8 text-white border-white hover:bg-white/10 bg-transparent">
                Talk to Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
