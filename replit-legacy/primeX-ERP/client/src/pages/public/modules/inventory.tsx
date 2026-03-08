import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Package,
  BarChart3,
  Warehouse,
  ScanBarcode,
  AlertTriangle,
  FileCheck,
  ChevronDown,
  Zap,
  Layers,
  RefreshCw,
  ArrowLeftRight,
  ClipboardCheck,
} from "lucide-react";
import { useState } from "react";

const features = [
  {
    icon: BarChart3,
    title: "Real-Time Stock Ledger",
    description: "Live stock balances updated with every transaction. View current stock by item, warehouse, lot, and batch with full movement history.",
  },
  {
    icon: Layers,
    title: "Weighted Average Valuation",
    description: "Automatic weighted average cost calculation on every receipt. Accurate COGS and inventory valuation for financial reporting.",
  },
  {
    icon: ScanBarcode,
    title: "Lot & Batch Traceability",
    description: "Track every item from receipt to consumption with lot numbers, batch codes, and supplier references. Full forward and backward traceability.",
  },
  {
    icon: AlertTriangle,
    title: "Min-Max Reorder Alerts",
    description: "Set minimum and maximum stock levels per item per warehouse. Automatic reorder alerts when stock falls below minimum thresholds.",
  },
  {
    icon: Warehouse,
    title: "Multi-Warehouse Management",
    description: "Manage stock across multiple warehouses, floors, and locations. Inter-warehouse transfers with full audit trail and approval workflow.",
  },
  {
    icon: FileCheck,
    title: "Gate Pass System",
    description: "Control material movement in and out of factory with digital gate passes. Returnable and non-returnable tracking with security checkpoints.",
  },
];

const workflowSteps = [
  { step: "1", label: "Goods Receipt", detail: "GRN against PO with quality check", color: "bg-blue-500" },
  { step: "2", label: "Stock Update", detail: "Auto-update ledger and valuation", color: "bg-indigo-500" },
  { step: "3", label: "Storage", detail: "Assign to warehouse and location", color: "bg-purple-500" },
  { step: "4", label: "Issue / Transfer", detail: "Production issue or warehouse transfer", color: "bg-pink-500" },
  { step: "5", label: "Consumption", detail: "Track against BOM standards", color: "bg-orange-500" },
  { step: "6", label: "Reconciliation", detail: "Physical count and adjustment", color: "bg-emerald-500" },
];

const integrations = [
  { icon: Package, label: "Merchandising", link: "/modules/merchandising" },
  { icon: RefreshCw, label: "Production", link: "/modules/production" },
  { icon: ArrowLeftRight, label: "Accounting", link: "/modules/accounting" },
  { icon: ClipboardCheck, label: "Quality Management", link: "/modules/quality-management" },
];

const faqs = [
  {
    q: "How does Prime7 calculate inventory valuation?",
    a: "Prime7 uses the weighted average cost method. Each time goods are received, the system recalculates the average cost per unit. This ensures accurate COGS and inventory values in your financial statements.",
  },
  {
    q: "Can I manage multiple warehouses and locations?",
    a: "Yes. Prime7 supports unlimited warehouses with location-level tracking (floor, rack, bin). You can transfer stock between warehouses with approval workflows and full audit trail.",
  },
  {
    q: "How does lot traceability work?",
    a: "Every incoming batch receives a unique lot number linked to the supplier, PO, and GRN. As materials are issued to production, the lot number follows through cutting, sewing, and finishing for complete traceability.",
  },
  {
    q: "Does Prime7 support barcode/QR scanning?",
    a: "Yes. Prime7 supports barcode and QR code scanning for stock receipts, issues, transfers, and physical inventory counts, making warehouse operations faster and more accurate.",
  },
  {
    q: "How do min-max reorder points work?",
    a: "You set minimum and maximum stock levels per item per warehouse. When stock drops below minimum, the system generates reorder alerts. Purchase orders can be auto-generated based on reorder quantities.",
  },
  {
    q: "Can I do physical inventory counts in Prime7?",
    a: "Yes. Prime7 supports full physical inventory with count sheets, variance analysis, and adjustment posting. You can do cycle counts by category, warehouse, or item group with automatic valuation adjustments.",
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

export default function InventoryPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Inventory Management Software for Garment Factories | Prime7 ERP"
        description="Real-time stock tracking, weighted average valuation, lot traceability & multi-warehouse management for garment and textile manufacturers."
        canonical="https://prime7erp.com/modules/inventory"
        keywords="garment inventory management, stock ledger software, warehouse management ERP, lot traceability garments, inventory valuation software"
        jsonLd={faqJsonLd}
        breadcrumbs={[
          { name: "Home", url: "https://prime7erp.com/" },
          { name: "Modules", url: "https://prime7erp.com/features" },
          { name: "Inventory", url: "https://prime7erp.com/modules/inventory" },
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
              <Package className="w-4 h-4" />
              Inventory Module
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Inventory Management for
              <br />
              <span className="text-primary">Garment Factories</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Real-time visibility into every roll of fabric, trim, and accessory. From goods receipt to
              production consumption — track it all with weighted average valuation and full traceability.
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
              Complete inventory control designed for fabric, trims, and garment industry materials.
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Inventory Workflow</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              End-to-end material flow from receipt to consumption reconciliation.
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
              Inventory data flows seamlessly across merchandising, production, accounting, and quality.
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
              See how it works in <Link href="/garments-erp"><span className="text-primary hover:underline cursor-pointer">Garments ERP</span></Link> and{" "}
              <Link href="/buying-house-erp"><span className="text-primary hover:underline cursor-pointer">Buying House ERP</span></Link>.{" "}
              Check <Link href="/pricing"><span className="text-primary hover:underline cursor-pointer">Pricing</span></Link> for details.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Common questions about Prime7's inventory module.</p>
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
            Full Inventory Control
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Take Control of Your Inventory Today
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Eliminate stock discrepancies, reduce wastage, and gain real-time visibility
            into every material in your factory.
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
