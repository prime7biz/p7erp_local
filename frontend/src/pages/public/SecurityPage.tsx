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
    color: "bg-brand-primary/10 text-brand-primary",
  },
  {
    icon: ShieldCheck,
    title: "Access Control",
    description:
      "Role-Based Access Control (RBAC) with multi-level approval workflows. Define granular permissions per user, department, and module. Multi-factor authentication available for all accounts.",
    color: "bg-status-success-subtle text-status-success-foreground",
  },
  {
    icon: FileSearch,
    title: "Audit Logging",
    description:
      "Complete audit trail for every action — who changed what, when, and why. Immutable logs ensure compliance and accountability across vouchers, inventory movements, and system configurations.",
    color: "bg-status-warning-subtle text-status-warning-foreground",
  },
  {
    icon: Server,
    title: "Multi-Tenant Isolation",
    description:
      "Strict data separation between tenants at the database level. Your data is completely isolated from other organizations. Row-level security enforces tenant boundaries at every query.",
    color: "bg-status-info-subtle text-status-info-foreground",
  },
  {
    icon: Database,
    title: "Backup & Recovery",
    description:
      "Automated daily backups with point-in-time recovery capability. Backups are stored in geographically separate locations. Recovery time objective (RTO) of under 4 hours for critical data.",
    color: "bg-status-danger-subtle text-status-danger-foreground",
  },
  {
    icon: Award,
    title: "Compliance",
    description:
      "Built to meet industry security standards and best practices. Regular security audits, vulnerability assessments, and penetration testing ensure ongoing compliance and protection.",
    color: "bg-brand-primary/10 text-brand-primary",
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
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight">
            Security & <span className="text-brand-primary">Privacy</span>
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            Enterprise-grade security and multi-tenant isolation so your data stays protected and compliant.
          </p>
          <div className="mt-8">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-10 text-center">Security Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((f, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm hover:shadow-md hover:border-border-strong transition-all"
              >
                <div className={`inline-flex rounded-lg p-3 ${f.color}`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="mt-4 font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-surface-raised rounded-xl p-6 lg:p-8 border border-border">
              <h3 className="text-xl font-semibold text-text-primary mb-4">Infrastructure</h3>
              <ul className="space-y-2">
                {infrastructure.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-text-secondary">
                    <CheckCircle2 className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-surface-raised rounded-xl p-6 lg:p-8 border border-border">
              <h3 className="text-xl font-semibold text-text-primary mb-4">Privacy</h3>
              <ul className="space-y-2">
                {privacy.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-text-secondary">
                    <CheckCircle2 className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-text-secondary mb-6">Learn more about how we handle your data.</p>
          <Link
            to="/privacy"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
          >
            Privacy Policy
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
