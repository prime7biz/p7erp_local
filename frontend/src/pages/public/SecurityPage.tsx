import { Link } from "react-router-dom";
import {
  Lock,
  ShieldCheck,
  FileSearch,
  Server,
  Database,
  Award,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const securityFeatures = [
  {
    icon: Lock,
    title: "Data Encryption",
    description:
      "All data is encrypted at rest using AES-256 and in transit using TLS 1.3. Your financial records, inventory data, and business information are protected with industry-standard encryption.",
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
      "Strict data separation between tenants at the database level. Your data is completely isolated from other organizations. Row-level security enforces tenant boundaries at every query.",
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

export function SecurityPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            Security & <span className="text-primary">Privacy</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            Enterprise-grade security and multi-tenant isolation so your data stays protected and compliant.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-10 text-center">Security Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((f, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className={`inline-flex rounded-lg p-3 ${f.color}`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Infrastructure</h3>
              <ul className="space-y-2">
                {infrastructure.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Privacy</h3>
              <ul className="space-y-2">
                {privacy.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 mb-6">Learn more about how we handle your data.</p>
          <Link
            to="/privacy"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-white font-medium hover:bg-primary/90"
          >
            Privacy Policy
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
