import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  Factory,
  Zap,
  Target,
  DollarSign,
  Brain,
  Rocket,
} from "lucide-react";
import { useState } from "react";

const comparisonRows = [
  { feature: "Garment-Specific Modules", prime7: "full", sap: "partial", oracle: "partial", tally: "none", prime7Text: "Full native support", sapText: "Requires customization", oracleText: "Limited, needs add-ons", tallyText: "Not available" },
  { feature: "Style & BOM Management", prime7: "full", sap: "partial", oracle: "partial", tally: "none", prime7Text: "Built-in with size-color matrix", sapText: "Custom development needed", oracleText: "Third-party integration", tallyText: "Not available" },
  { feature: "AI-Powered Insights", prime7: "full", sap: "partial", oracle: "partial", tally: "none", prime7Text: "Included in all plans", sapText: "Premium add-on", oracleText: "Premium add-on", tallyText: "Not available" },
  { feature: "LC/Commercial Management", prime7: "full", sap: "full", oracle: "full", tally: "partial", prime7Text: "Full native support", sapText: "Available with modules", oracleText: "Available with modules", tallyText: "Basic" },
  { feature: "Multi-Currency", prime7: "full", sap: "full", oracle: "full", tally: "partial", prime7Text: "Full support", sapText: "Full support", oracleText: "Full support", tallyText: "Limited" },
  { feature: "Production Floor Tracking", prime7: "full", sap: "full", oracle: "full", tally: "none", prime7Text: "Real-time WIP tracking", sapText: "Available", oracleText: "Available", tallyText: "Not available" },
  { feature: "Implementation Time", prime7: "full", sap: "none", oracle: "partial", tally: "full", prime7Text: "2-4 weeks", sapText: "6-18 months", oracleText: "3-12 months", tallyText: "1-2 weeks" },
  { feature: "Starting Price", prime7: "full", sap: "none", oracle: "none", tally: "full", prime7Text: "BDT 15,000/mo", sapText: "Custom (high)", oracleText: "Custom (high)", tallyText: "BDT 2,000/mo" },
  { feature: "Best For", prime7: "info", sap: "info", oracle: "info", tally: "info", prime7Text: "Garment manufacturers", sapText: "Large enterprises", oracleText: "Mid-to-large enterprises", tallyText: "Small businesses/accounting" },
  { feature: "Cloud/On-Premise", prime7: "info", sap: "info", oracle: "info", tally: "info", prime7Text: "Cloud-native", sapText: "Both", oracleText: "Cloud", tallyText: "Desktop/Cloud" },
  { feature: "Support", prime7: "full", sap: "partial", oracle: "partial", tally: "partial", prime7Text: "Dedicated, local", sapText: "Tiered, global", oracleText: "Tiered, global", tallyText: "Local dealers" },
];

const differentiators = [
  { icon: Target, title: "Purpose-Built for Garment Industry", description: "Not adapted from generic ERP — every module is designed specifically for garment manufacturing workflows from day one." },
  { icon: DollarSign, title: "Affordable Pricing That Scales", description: "Start at BDT 15,000/mo with no hidden costs. Scale your plan as your factory grows without enterprise-level pricing barriers." },
  { icon: Brain, title: "AI Included at No Extra Cost", description: "Demand forecasting, production optimization, and smart recommendations are included in all plans — not locked behind premium add-ons." },
  { icon: Rocket, title: "Fast Implementation", description: "Go live in 2-4 weeks, not months. Our cloud-native platform requires no hardware installation and includes guided onboarding." },
];

const chooseSections = [
  { erp: "Prime7", color: "bg-primary/10 border-primary/30 text-primary", description: "You're a garment manufacturer or buying house wanting industry-specific features at affordable pricing." },
  { erp: "SAP", color: "bg-blue-50 border-blue-200 text-blue-700", description: "You're a large conglomerate needing a single ERP across multiple industries." },
  { erp: "Oracle", color: "bg-orange-50 border-orange-200 text-orange-700", description: "You're a mid-to-large enterprise with complex multi-subsidiary needs." },
  { erp: "Tally", color: "bg-gray-50 border-gray-200 text-gray-700", description: "You only need basic accounting without manufacturing features." },
];

const faqs = [
  { q: "How does Prime7 ERP compare to SAP for garment manufacturers?", a: "While SAP is a powerful enterprise ERP, it requires significant customization and investment to handle garment-specific workflows like style-size-color matrices, BOM consumption tracking, and production floor management. Prime7 offers all these features natively at a fraction of the cost, with implementation in weeks instead of months." },
  { q: "Is Tally enough for a garment factory?", a: "Tally is excellent for basic accounting but lacks manufacturing features essential for garment factories — such as production tracking, BOM management, quality control, and LC/commercial document handling. If your factory needs more than bookkeeping, you'll need a purpose-built garment ERP like Prime7." },
  { q: "Why is Prime7 more affordable than SAP and Oracle?", a: "Prime7 is cloud-native SaaS built specifically for garment manufacturers, eliminating the need for expensive on-premise hardware, lengthy implementation consultants, and custom development. Our focused approach means you pay only for what garment factories actually need." },
  { q: "Can I migrate from Tally or SAP to Prime7 ERP?", a: "Yes. Prime7 offers guided migration support including data import from Tally, SAP, and Oracle. Our team helps transfer your chart of accounts, inventory data, customer records, and historical transactions. Most migrations complete within 1-2 weeks with minimal disruption." },
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

function StatusIcon({ status }: { status: string }) {
  if (status === "full") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (status === "partial") return <MinusCircle className="w-5 h-5 text-amber-500" />;
  if (status === "none") return <XCircle className="w-5 h-5 text-red-400" />;
  return null;
}

export default function ErpComparisonPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Prime7 ERP vs SAP vs Oracle vs Tally | ERP Comparison 2026"
        description="Compare Prime7 ERP with SAP, Oracle, and Tally. See features, pricing, and fit for garment manufacturers. Find the right ERP for your factory."
        canonical="https://prime7erp.com/erp-comparison"
        keywords="ERP comparison, Prime7 vs SAP, garment ERP comparison, Tally vs ERP, Oracle vs Prime7, best ERP for garment factory"
        jsonLd={[faqJsonLd]}
        breadcrumbs={[{ name: "Home", url: "https://prime7erp.com/" }, { name: "ERP Comparison", url: "https://prime7erp.com/erp-comparison" }]}
      />

      <div className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">ERP Comparison</span>
          </div>
        </div>
      </div>

      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Factory className="w-4 h-4" />
              ERP Comparison 2026
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Find the Right ERP for Your
              <br />
              <span className="text-primary">Garment Factory</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              An honest, side-by-side comparison of the top ERP systems for garment manufacturers
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/app/register">
                <Button size="lg" className="gap-2 text-base px-8">
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                  Talk to Sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Feature-by-Feature Comparison
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              See how Prime7 ERP stacks up against SAP, Oracle NetSuite, and Tally Prime for garment manufacturing.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-5 py-4 text-sm font-semibold text-gray-900 min-w-[180px]">Feature</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-primary bg-primary/5 min-w-[150px]">Prime7 ERP</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-gray-600 min-w-[150px]">SAP S/4HANA</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-gray-600 min-w-[150px]">Oracle NetSuite</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-gray-600 min-w-[150px]">Tally Prime</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, i) => (
                    <tr key={row.feature} className={i % 2 === 0 ? "bg-gray-50/50" : ""}>
                      <td className="px-5 py-3.5 text-sm text-gray-700 font-medium">{row.feature}</td>
                      <td className="px-4 py-3.5 bg-primary/5">
                        <div className="flex flex-col items-center gap-1">
                          <StatusIcon status={row.prime7} />
                          <span className="text-xs text-gray-600 text-center">{row.prime7Text}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-center gap-1">
                          <StatusIcon status={row.sap} />
                          <span className="text-xs text-gray-500 text-center">{row.sapText}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-center gap-1">
                          <StatusIcon status={row.oracle} />
                          <span className="text-xs text-gray-500 text-center">{row.oracleText}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-center gap-1">
                          <StatusIcon status={row.tally} />
                          <span className="text-xs text-gray-500 text-center">{row.tallyText}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Garment Manufacturers Choose Prime7
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Four key reasons garment factories prefer Prime7 over traditional enterprise ERP systems.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {differentiators.map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              When to Choose Each ERP
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Every ERP has its strengths. Here's a quick guide to help you decide.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {chooseSections.map((item) => (
              <div key={item.erp} className={`rounded-xl border-2 p-6 ${item.color}`}>
                <h3 className="text-lg font-bold mb-2">Choose {item.erp} if:</h3>
                <p className="text-sm opacity-90">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600">
              Common questions about choosing the right ERP for garment manufacturing.
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

      <section className="py-12 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 mb-4">Explore Related Pages</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/features"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">All Features</span></Link>
            <Link href="/garments-erp"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">Garments ERP Solutions</span></Link>
            <Link href="/pricing"><span className="inline-block px-4 py-2 bg-primary/5 text-primary text-sm font-medium rounded-full hover:bg-primary/10 transition-colors cursor-pointer">Pricing Plans</span></Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-blue-300 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            See It In Action
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to See Prime7 in Action?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join garment manufacturers who have switched to Prime7 ERP.
            Start your free trial today — no credit card required.
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
