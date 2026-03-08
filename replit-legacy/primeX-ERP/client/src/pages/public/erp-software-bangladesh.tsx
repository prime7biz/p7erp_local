import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Cloud,
  DollarSign,
  BookOpen,
  Users,
  Brain,
  Smartphone,
  Factory,
  Building2,
  Warehouse,
  ShoppingCart,
  Settings,
  ChevronDown,
  Globe,
  Zap,
  Shield,
  BarChart3,
  Package,
  FileText,
  Calculator,
  ClipboardList,
  Truck,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import techPatternBg from "../../assets/images/tech-pattern-bg.png";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Prime7 ERP",
  url: "https://prime7erp.com",
  logo: "https://prime7erp.com/logo.png",
  description: "Prime7 is the best cloud ERP software in Bangladesh. Built for local businesses with multi-currency support, VAT-ready accounting, HR payroll, and AI-powered insights.",
  address: {
    "@type": "PostalAddress",
    addressCountry: "BD",
  },
  sameAs: [],
};

const valueProps = [
  {
    icon: Cloud,
    title: "100% Cloud-First",
    description: "No expensive hardware, no on-premise servers. Access your entire ERP from any browser, anywhere. Automatic updates, daily backups, and enterprise-grade uptime — all included.",
  },
  {
    icon: DollarSign,
    title: "Multi-Currency with BDT Base",
    description: "Bangladeshi Taka as your base currency with seamless support for USD, EUR, GBP, and 50+ currencies. Real-time exchange rate updates and automatic conversion for international trade.",
  },
  {
    icon: BookOpen,
    title: "Tally-Style Accounting",
    description: "Familiar double-entry accounting interface inspired by Tally. Voucher-based workflows, group-wise reporting, and keyboard-driven speed that your accountants already know and love.",
  },
  {
    icon: Users,
    title: "HR & Payroll for BD Labor Law",
    description: "Compliant with Bangladesh Labour Act 2006. Manage attendance, leave, overtime, gratuity, provident fund, and monthly salary processing with statutory deductions built in.",
  },
  {
    icon: Brain,
    title: "AI-Powered Insights",
    description: "Built-in AI assistant analyzes your business data to surface actionable insights — demand forecasting, cash flow predictions, inventory optimization, and anomaly detection.",
  },
  {
    icon: Smartphone,
    title: "Mobile-Ready Access",
    description: "Fully responsive design works on any device. Approve purchase orders on the go, check stock levels from the factory floor, or review reports from anywhere in the world.",
  },
];

const industries = [
  {
    icon: Factory,
    title: "Garment Manufacturing",
    description: "End-to-end RMG workflow from buyer inquiry to LC realization. Style-size-color matrices, BOM, cutting plans, and production tracking.",
    link: "/garments-erp",
  },
  {
    icon: Building2,
    title: "Buying Houses",
    description: "Manage multiple buyers, coordinate with factories, track samples, and handle commercial documentation all in one place.",
    link: "/buying-house-erp",
  },
  {
    icon: Warehouse,
    title: "Textile Mills",
    description: "Yarn inventory, dyeing processes, fabric production tracking, and quality control with lot traceability across the supply chain.",
    link: "/features",
  },
  {
    icon: ShoppingCart,
    title: "Trading Companies",
    description: "Import/export management, multi-currency invoicing, inventory across warehouses, and comprehensive financial reporting.",
    link: "/features",
  },
  {
    icon: Settings,
    title: "General Manufacturing",
    description: "Bill of Materials, work orders, production planning, raw material consumption tracking, and finished goods inventory management.",
    link: "/features",
  },
];

const featureModules = [
  { icon: BarChart3, title: "Financial Accounting", description: "Double-entry ledger, trial balance, P&L, balance sheet" },
  { icon: Package, title: "Inventory Management", description: "Multi-warehouse stock, lot tracking, stock valuation" },
  { icon: FileText, title: "Purchase & Procurement", description: "Purchase orders, GRN, vendor management, approvals" },
  { icon: Calculator, title: "Sales & Invoicing", description: "Quotations, sales orders, invoicing, AR tracking" },
  { icon: Users, title: "HR & Payroll", description: "Employee records, attendance, leave, salary processing" },
  { icon: ClipboardList, title: "Production Planning", description: "Work orders, BOM, cutting, sewing, finishing" },
  { icon: Truck, title: "Supply Chain", description: "Delivery challans, gate passes, logistics tracking" },
  { icon: Brain, title: "AI Assistant", description: "Smart insights, demand forecasting, anomaly alerts" },
];

const faqs = [
  {
    q: "What is cloud ERP software and why does my Bangladesh business need it?",
    a: "Cloud ERP (Enterprise Resource Planning) is a business management software hosted on the internet instead of local servers. For Bangladesh businesses, it means no upfront hardware investment, automatic updates, and access from any location. With frequent power and connectivity challenges, cloud ERP with offline capabilities ensures your business data is always safe, backed up, and accessible when you need it.",
  },
  {
    q: "Why is Prime7 the best ERP software for businesses in Bangladesh?",
    a: "Prime7 is purpose-built for the Bangladesh market. It features BDT as the base currency, Tally-style accounting that local accountants are familiar with, HR & payroll modules compliant with Bangladesh Labour Act, and industry-specific features for garments, textiles, and trading companies. Unlike generic international ERPs, Prime7 understands local business workflows, banking practices, and regulatory requirements.",
  },
  {
    q: "What is the pricing of Prime7 ERP in Bangladesh? Can I pay in BDT?",
    a: "Prime7 offers flexible pricing plans starting from affordable monthly subscriptions suitable for small and medium businesses. Yes, you can pay in BDT via local bank transfer, bKash, or online payment. We also offer annual plans with significant discounts. Visit our pricing page for detailed plan comparisons and features included in each tier.",
  },
  {
    q: "Is my business data secure with a cloud ERP?",
    a: "Absolutely. Prime7 uses enterprise-grade security including SSL encryption, daily automated backups, role-based access control, and audit trails for every transaction. Your data is hosted on globally distributed servers with 99.9% uptime guarantee. We follow international security standards and your data is never shared with third parties.",
  },
  {
    q: "Can I migrate my data from Tally or Excel to Prime7?",
    a: "Yes, Prime7 provides a smooth migration path from Tally, Excel, or any existing system. Our team assists with Chart of Accounts migration, opening balance import, customer/vendor master data transfer, and inventory data migration. Most implementations complete the data migration within 1-2 weeks depending on data volume.",
  },
  {
    q: "How long does it take to implement Prime7 ERP?",
    a: "A typical implementation takes 2-4 weeks for small businesses and 4-8 weeks for larger organizations. This includes initial setup, data migration, user training, and go-live support. Prime7's cloud architecture means there's no hardware installation — you can start using core modules within the first day of signup.",
  },
  {
    q: "Is support available in Bangla? What are the support hours?",
    a: "Yes, Prime7 provides full support in both Bangla and English. Our support team is available via phone, email, and live chat during Bangladesh business hours (9 AM - 9 PM BST). We also offer priority support with dedicated account managers for enterprise plans. Our knowledge base and video tutorials are available in Bangla.",
  },
  {
    q: "Can I try Prime7 ERP for free before purchasing?",
    a: "Yes, Prime7 offers a free trial with access to all core modules. No credit card required to start. During the trial, you can explore accounting, inventory, HR, and all other modules with sample data or your own data. Our onboarding team will guide you through the setup to ensure you get the most out of your trial period.",
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

export default function ErpSoftwareBangladeshPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <SEOHead
        title="Best ERP Software in Bangladesh - Cloud ERP Solution | Prime7"
        description="Prime7 is the best cloud ERP software in Bangladesh. Built for local businesses with multi-currency support, VAT-ready accounting, HR payroll, and AI-powered insights. Works globally."
        canonical="https://prime7erp.com/erp-software-bangladesh"
        keywords="best erp software in bangladesh, erp software bangladesh, cloud erp bangladesh, erp software price in bangladesh, erp solution bangladesh, hr payroll software bangladesh"
        jsonLd={[organizationSchema, faqSchema]}
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "ERP Software Bangladesh", url: "https://prime7erp.com/erp-software-bangladesh"}]}
      />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#1E293B] via-[#1E293B]/95 to-primary/90 py-20 lg:py-28 overflow-hidden">
        <div className="absolute top-10 -left-20 w-80 h-80 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 -right-32 w-72 h-72 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-[12%] left-[8%] w-2 h-2 bg-primary/30 rounded-full animate-pulse pointer-events-none" />
        <div className="absolute bottom-[25%] left-[18%] w-1 h-1 bg-accent/30 rounded-full animate-pulse pointer-events-none" />
        <div className="absolute bottom-[10%] right-[8%] w-1.5 h-1.5 bg-white/20 rounded-full animate-pulse pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/15 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-6">
              <Globe className="w-4 h-4" />
              Built for Bangladesh, Works Globally
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Best Cloud ERP Software for
              <br />
              <span className="text-accent">Bangladesh Businesses</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Prime7 ERP is designed for Bangladesh's unique business landscape — BDT-native accounting,
              local labor law compliance, and Tally-style workflows. Trusted by garment factories,
              buying houses, and trading companies across the country and beyond.
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

      {/* Why Bangladesh Businesses Choose Prime7 */}
      <section className="relative py-16 lg:py-24 bg-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #F97316 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <CheckCircle2 className="w-4 h-4" />
              Why Prime7
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Bangladesh Businesses Choose Prime7
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Built from the ground up for local businesses, with the flexibility to scale globally.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {valueProps.map((prop, i) => (
              <div key={prop.title}>
                <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                    <prop.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{prop.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{prop.description}</p>
                </div>
                {i < valueProps.length - 1 && i % 3 === 2 && (
                  <div className="h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent mt-6 col-span-full" />
                )}
              </div>
            ))}
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent mt-10" />
        </div>
      </section>

      {/* Industry Coverage */}
      <section className="relative py-16 lg:py-24 bg-gray-50 overflow-hidden">
        <div className="absolute top-20 -left-40 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-72 h-72 bg-indigo-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Industries We Serve in Bangladesh
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From garment manufacturing to general trading, Prime7 adapts to your industry's unique workflows.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {industries.map((ind) => (
              <Link key={ind.title} href={ind.link}>
                <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer h-full">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg mb-4">
                    <ind.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{ind.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{ind.description}</p>
                  <span className="inline-flex items-center gap-1 text-primary text-sm font-medium mt-3">
                    Learn more <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              All the Modules Your Business Needs
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              A comprehensive suite of integrated modules designed to run every aspect of your business.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featureModules.map((mod) => (
              <div key={mod.title} className="flex items-start gap-4 bg-gray-50 rounded-xl p-5 hover:bg-primary/5 transition-colors">
                <div className="flex-shrink-0 w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                  <mod.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{mod.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{mod.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/features">
              <Button variant="outline" className="gap-2">
                Explore All Features <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Built for Bangladesh, Ready for the World */}
      <section className="relative py-16 lg:py-24 bg-gradient-to-br from-[#1E293B] to-[#1E293B]/90 text-white overflow-hidden">
        <img src={techPatternBg} alt="Tech Pattern Background Design" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover opacity-[0.05] pointer-events-none" loading="lazy" />
        <div className="absolute top-10 -left-20 w-72 h-72 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-[10%] left-[5%] w-2 h-2 bg-primary/30 rounded-full animate-pulse pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Built for Bangladesh, Ready for the World
              </h2>
              <p className="text-gray-300 text-lg mb-6 leading-relaxed">
                While Prime7 is optimized for Bangladesh businesses, our multi-currency engine, flexible
                chart of accounts, and cloud infrastructure make it ready for global operations. Whether
                you're trading with partners in Europe, sourcing from China, or exporting to North America
                — Prime7 handles it seamlessly.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Multi-currency transactions with real-time exchange rates",
                  "International invoicing in any currency",
                  "Multi-language support for global teams",
                  "Cloud access from any country, any device",
                  "Compliance-ready for multiple jurisdictions",
                  "VAT-ready accounting (upcoming on roadmap)",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-gray-200">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/pricing">
                  <Button size="lg" className="gap-2 bg-primary text-white hover:bg-primary/90">
                    View Pricing <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/garments-erp">
                  <Button size="lg" variant="outline" className="gap-2 text-white border-white hover:bg-white/10 bg-transparent">
                    Garments ERP
                  </Button>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
                <div className="text-3xl font-bold mb-1">50+</div>
                <p className="text-blue-200 text-sm">Currencies Supported</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
                <div className="text-3xl font-bold mb-1">99.9%</div>
                <p className="text-blue-200 text-sm">Uptime Guarantee</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
                <div className="text-3xl font-bold mb-1">24/7</div>
                <p className="text-blue-200 text-sm">Cloud Availability</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
                <div className="text-3xl font-bold mb-1">256-bit</div>
                <p className="text-blue-200 text-sm">SSL Encryption</p>
              </div>
            </div>
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
              Everything you need to know about ERP software for your Bangladesh business.
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

      {/* CTA */}
      <section className="relative py-16 lg:py-24 bg-gradient-to-br from-gray-900 to-gray-800 overflow-hidden">
        <div className="absolute top-10 -left-20 w-72 h-72 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 w-56 h-56 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-[15%] left-[12%] w-1.5 h-1.5 bg-primary/30 rounded-full animate-pulse pointer-events-none" />
        <div className="absolute bottom-[20%] right-[15%] w-2 h-2 bg-accent/25 rounded-full animate-pulse pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-primary/80 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Transform Your Business Today
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Modernize Your Business Operations?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join hundreds of Bangladesh businesses already using Prime7 ERP to streamline their
            accounting, inventory, HR, and production workflows. Start your free trial today — no
            credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
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
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            <Link href="/garments-erp" className="hover:text-white transition-colors">Garments ERP</Link>
            <Link href="/buying-house-erp" className="hover:text-white transition-colors">Buying House ERP</Link>
            <Link href="/features" className="hover:text-white transition-colors">All Features</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact Us</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
