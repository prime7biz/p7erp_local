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
  Package,
  BarChart3,
  Layers,
  ShieldCheck,
  Search,
  Warehouse,
  Droplets,
  Palette,
  ClipboardCheck,
  Scale,
  Ruler,
  Tag,
} from "lucide-react";
import { useState } from "react";

const productionFlow = [
  { label: "Yarn Receiving", color: "bg-blue-500", icon: Package },
  { label: "Warping/Sizing", color: "bg-indigo-500", icon: Layers },
  { label: "Weaving/Knitting", color: "bg-purple-500", icon: Factory },
  { label: "Dyeing", color: "bg-pink-500", icon: Droplets },
  { label: "Finishing", color: "bg-orange-500", icon: Palette },
  { label: "Inspection & Packing", color: "bg-emerald-500", icon: ClipboardCheck },
];

const traceabilityFeatures = [
  { icon: Search, title: "End-to-End Lot Tracking", description: "Trace every meter of fabric from yarn lot to finished roll. Know exactly which yarn batch went into which fabric lot for complete supply chain transparency." },
  { icon: ShieldCheck, title: "Quality Inspection Points", description: "Define inspection checkpoints at every production stage — greige inspection, dye lot approval, finishing quality, and final packing inspection with measurable parameters." },
  { icon: ClipboardCheck, title: "Lab Test Management", description: "Record and track lab test results for colorfastness, shrinkage, GSM, tensile strength, and other parameters with pass/fail criteria per buyer specification." },
  { icon: Scale, title: "Shade Matching & Approval", description: "Manage shade bands, lot-to-lot shade variation tracking, and buyer shade approval workflows to minimize shade-related rejections." },
  { icon: Tag, title: "Defect Classification", description: "Standardized defect coding with severity levels, Pareto analysis of defect types, and CAPA workflows for systematic quality improvement." },
  { icon: BarChart3, title: "Quality Analytics", description: "Real-time quality dashboards showing rejection rates, defect trends, and supplier quality scores to drive continuous improvement." },
];

const inventoryFeatures = [
  { icon: Package, title: "Fabric Roll Management", description: "Track individual fabric rolls with dimensions, weight, shade, and grade. Manage roll allocation to orders with automatic FIFO/LIFO selection." },
  { icon: Palette, title: "Shade & Lot Grouping", description: "Automatically group fabric rolls by shade band for consistent production. Track shade variation across dye lots and manage buyer shade approvals." },
  { icon: Warehouse, title: "Multi-Warehouse Control", description: "Manage greige stores, dyed fabric warehouses, finished goods stores, and reject areas with inter-warehouse transfers and location tracking." },
  { icon: Ruler, title: "Yarn Inventory", description: "Track yarn by count, lot, shade, and composition. Monitor consumption against production plans with automatic reorder point alerts." },
  { icon: Layers, title: "Consumption Tracking", description: "Real-time material consumption tracking against production standards. Identify waste and variance at each production stage for cost control." },
  { icon: BarChart3, title: "Stock Valuation", description: "Weighted average and FIFO valuation methods for yarn, greige, and finished fabric. Automated stock aging reports and slow-moving inventory alerts." },
];

const faqs = [
  { q: "What is a textile ERP system?", a: "A textile ERP system is enterprise resource planning software specifically designed for textile manufacturers. It handles yarn management, fabric production tracking, dyeing and finishing workflows, lot traceability, quality control, and inventory management with features tailored to the unique processes of textile manufacturing." },
  { q: "How does Prime7 handle fabric lot traceability?", a: "Prime7 assigns unique lot identifiers at every production stage — from incoming yarn lots through greige fabric, dye lots, and finished fabric rolls. Each lot carries its complete history including raw materials used, processing parameters, quality test results, and production dates, enabling full forward and backward traceability." },
  { q: "Can Prime7 manage dyeing and finishing processes?", a: "Yes. Prime7 tracks the complete dyeing workflow including recipe management, dye lot creation, shade matching, lab dip approvals, and finishing treatments. Each process is linked to quality parameters with real-time tracking of production status and material consumption." },
  { q: "Does Prime7 integrate with textile testing equipment?", a: "Prime7 provides a lab test management module where test results can be recorded manually or imported via data files. The system maintains buyer-specific quality standards and automatically flags results that fall outside acceptable ranges." },
  { q: "How does Prime7 handle yarn and fabric inventory?", a: "Prime7 manages yarn inventory by count, lot, shade, and composition with real-time stock levels and reorder alerts. Fabric inventory is tracked at the roll level with dimensions, weight, shade band, and grade information. Multi-warehouse support enables tracking across greige stores, processing areas, and finished goods warehouses." },
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

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Prime7 Textile ERP System",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web Browser",
  description: "Complete textile ERP system for yarn, fabric, dyeing & finishing management with lot traceability, quality control, and real-time inventory.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "BDT", description: "Free trial available" },
};

export default function TextileErpSystemPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Textile ERP System | Complete Fabric & Yarn Management | Prime7"
        description="Prime7 Textile ERP manages yarn, fabric, dyeing & finishing with lot traceability, quality control, and real-time inventory. Built for textile manufacturers."
        canonical="https://prime7erp.com/textile-erp-system"
        keywords="textile ERP system, textile manufacturing software, fabric management ERP, textile industry ERP"
        jsonLd={[faqJsonLd, productJsonLd]}
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "Textile ERP System", url: "https://prime7erp.com/textile-erp-system"}]}
      />

      {/* Breadcrumb */}
      <div className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Textile ERP System</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute bottom-10 left-20 w-80 h-80 bg-blue-400 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Factory className="w-4 h-4" />
              Built for Textile Manufacturers
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              ERP System Designed for
              <br />
              <span className="text-primary">Textile Manufacturers</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              From yarn receiving to finished fabric — manage your entire textile production with
              lot traceability, shade management, quality control, and real-time inventory tracking.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/app/register">
                <Button size="lg" className="gap-2 text-base px-8">
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/features">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                  Explore All Features
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Production Flow */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              From Yarn to Finished Fabric
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Prime7 tracks your textile production through every transformation stage with complete lot traceability.
            </p>
          </div>
          {/* Desktop flow */}
          <div className="hidden lg:flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 z-0" />
            {productionFlow.map((stage) => (
              <div key={stage.label} className="relative z-10 flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full ${stage.color} text-white flex items-center justify-center shadow-lg`}>
                  <stage.icon className="w-7 h-7" />
                </div>
                <p className="mt-3 text-sm font-medium text-gray-700 text-center max-w-[110px]">{stage.label}</p>
              </div>
            ))}
          </div>
          {/* Mobile flow */}
          <div className="lg:hidden space-y-3">
            {productionFlow.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full ${stage.color} text-white flex items-center justify-center flex-shrink-0`}>
                  <stage.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800">{stage.label}</p>
                  {i < productionFlow.length - 1 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lot Traceability & Quality */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <ShieldCheck className="w-4 h-4" />
              Quality First
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Lot Traceability & Quality Control
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Complete traceability from yarn to finished fabric with quality checkpoints at every stage.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {traceabilityFeatures.map((feat) => (
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

      {/* Inventory & Warehouse */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <Warehouse className="w-4 h-4" />
              Inventory Management
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Inventory & Warehouse Management
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Track fabric rolls, yarn stock, and finished goods with shade grouping, real-time valuations, and multi-warehouse control.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {inventoryFeatures.map((feat) => (
              <div key={feat.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                    <feat.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{feat.title}</h3>
                </div>
                <p className="text-gray-600 text-sm">{feat.description}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/features">
              <Button variant="outline" className="gap-2">
                Explore All Modules <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600">
              Common questions about textile ERP systems and how Prime7 can help.
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
      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 mb-4">Explore Related Pages</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/garments-erp"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">Garments ERP Solutions</span></Link>
            <Link href="/features"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">All Features</span></Link>
            <Link href="/resources/consumption-control-garments"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">Consumption Control in Garments →</span></Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-blue-300 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Purpose-Built for Textiles
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Modernize Your Textile Operations
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Replace fragmented systems with a unified textile ERP that handles everything from
            yarn procurement to finished fabric shipment. Start your free trial today.
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
