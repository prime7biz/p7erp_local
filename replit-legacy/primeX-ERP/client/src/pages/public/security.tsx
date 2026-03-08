import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  Lock,
  ShieldCheck,
  FileSearch,
  Server,
  Database,
  Award,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Globe,
} from "lucide-react";

const securityFeatures = [
  {
    icon: Lock,
    title: "Data Encryption",
    description:
      "All data is encrypted at rest using AES-256 encryption and in transit using TLS 1.3. Your financial records, inventory data, and business information are protected with military-grade encryption standards.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: ShieldCheck,
    title: "Access Control",
    description:
      "Role-Based Access Control (RBAC) with multi-level approval workflows. Define granular permissions per user, department, and module. Multi-factor authentication available for all accounts.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: FileSearch,
    title: "Audit Logging",
    description:
      "Complete audit trail for every action — who changed what, when, and why. Immutable logs ensure compliance and accountability across vouchers, inventory movements, and system configurations.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: Server,
    title: "Multi-Tenant Isolation",
    description:
      "Strict data separation between tenants at the database level. Your data is completely isolated from other organizations. Row-level security policies enforce tenant boundaries at every query.",
    color: "bg-purple-50 text-purple-600",
  },
  {
    icon: Database,
    title: "Backup & Recovery",
    description:
      "Automated daily backups with point-in-time recovery capability. Backups are stored in geographically separate locations. Recovery time objective (RTO) of under 4 hours for critical data.",
    color: "bg-red-50 text-red-600",
  },
  {
    icon: Award,
    title: "Compliance",
    description:
      "Built to meet industry security standards and best practices. Regular security audits, vulnerability assessments, and penetration testing ensure ongoing compliance and protection.",
    color: "bg-cyan-50 text-cyan-600",
  },
];

const infrastructure = [
  "Cloud-hosted on enterprise-grade infrastructure with auto-scaling",
  "99.9% uptime SLA with real-time monitoring and alerting",
  "Geographic redundancy with automatic failover capabilities",
  "DDoS protection and web application firewall (WAF)",
  "Regular security patches and zero-downtime deployments",
  "24/7 infrastructure monitoring by dedicated DevOps team",
];

const privacy = [
  "GDPR-aware data handling practices and privacy controls",
  "You own your data — full data portability and export rights",
  "Right to export all your data in standard formats at any time",
  "Data processing agreements available for enterprise customers",
  "No data sharing with third parties without explicit consent",
  "Data residency options to meet local regulatory requirements",
];

export default function SecurityPage() {
  return (
    <PublicLayout>
      <SEOHead
        title="Security & Data Protection | Enterprise-Grade | Prime7 ERP"
        description="Enterprise-grade ERP security: AES-256 encryption, multi-tenant isolation, RBAC & audit logs. Keep your garment business data safe & compliant."
        canonical="https://prime7erp.com/security"
        keywords="ERP security, data protection, garment ERP security, cloud ERP security Bangladesh"
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "Security", url: "https://prime7erp.com/security"}]}
      />

      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
            Enterprise-Grade Security{" "}
            <span className="text-primary">for Your Business</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Your financial data, production records, and business intelligence deserve the highest
            level of protection. Prime7 ERP is built with security at its core.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Security Features
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Multiple layers of security protect every aspect of your data and operations.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((feature) => (
              <div
                key={feature.title}
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
              >
                <div className={`inline-flex p-3 rounded-lg ${feature.color} mb-4`}>
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Cloud className="h-4 w-4" />
                Infrastructure
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Built for Reliability
              </h2>
              <ul className="space-y-4">
                {infrastructure.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-4">
                <Globe className="h-4 w-4" />
                Data Privacy
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Your Data, Your Control
              </h2>
              <ul className="space-y-4">
                {privacy.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-primary text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-blue-200" />
          <h2 className="text-3xl sm:text-4xl font-bold">Your Data is Safe With Us</h2>
          <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
            We take security seriously so you can focus on what matters most — running your garment
            manufacturing business. Have questions about our security practices?
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact">
              <Button size="lg" variant="secondary" className="gap-2">
                Contact Security Team <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/app/register">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 gap-2 bg-transparent"
              >
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
