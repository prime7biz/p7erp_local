import type { TrustCenterContent } from "./types";

export const trustCenterContent: TrustCenterContent = {
  id: "trust-center",
  version: "1.0.0",
  lastUpdated: "2026-04-04",
  heroTitle: "Trust Center",
  heroSubtitle:
    "How Prime7 ERP protects your data, respects privacy, and operates a reliable cloud ERP platform for manufacturers and buying houses—so your teams can focus on production, finance, and growth.",
  pillars: [
    {
      id: "security",
      title: "Security",
      description:
        "Defense in depth: encryption, access controls, monitoring, and secure engineering practices designed to protect confidentiality and integrity.",
    },
    {
      id: "privacy",
      title: "Privacy",
      description:
        "Transparent processing, no sale of your business data, and DPA-backed processor terms for personal data you entrust to the platform.",
    },
    {
      id: "availability",
      title: "Availability",
      description:
        "Engineered for uptime with clear maintenance practices and a public SLA summary—custom targets and credits only where agreed in writing.",
    },
    {
      id: "compliance",
      title: "Compliance",
      description:
        "Built with reference to recognized security and privacy principles; enterprise customers can align reviews with questionnaires and contractual exhibits.",
    },
    {
      id: "ai",
      title: "AI responsibility",
      description:
        "AI-assisted features are advisory; outputs require human validation and do not autonomously post financial transactions.",
    },
    {
      id: "ownership",
      title: "Your data",
      description:
        "Your organization retains ownership of Customer Data; we process it to operate and improve the Service as described in our agreements.",
    },
  ],
  quickFacts: [
    "Multi-tenant logical isolation between customer organizations",
    "Encryption in transit (TLS) for customer-facing access",
    "Role-based access controls inside each tenant",
    "Backups and recovery procedures for operational resilience",
    "AI outputs are advisory only—not final business or legal decisions",
    "We do not sell customer business data to brokers",
  ],
  operationalBullets: [
    "Incident communication through support channels and, when appropriate, broader customer notice for widespread events",
    "Planned maintenance communicated in advance when practicable",
    "Support tiers with documented response targets (goals unless upgraded contractually)",
    "Change management through controlled releases and monitoring",
  ],
  faqs: [
    {
      id: "own",
      question: "Who owns our ERP data?",
      answer:
        "Your organization retains ownership of Customer Data. Prime7 processes it to provide the Service under our Terms, Privacy Policy, and (where applicable) DPA.",
    },
    {
      id: "sell",
      question: "Does Prime7 sell our data?",
      answer:
        "No. We do not sell your business data to data brokers. We use subprocessors (such as hosting and email delivery) under contractual obligations to support the Service.",
    },
    {
      id: "isolate",
      question: "How is tenant data isolated?",
      answer:
        "Each customer operates in a logically segregated tenant. Application and database controls are designed to prevent one tenant's users from accessing another tenant's data.",
    },
    {
      id: "backup",
      question: "How are backups handled?",
      answer:
        "We maintain backups and recovery procedures aligned with our infrastructure. Specific recovery objectives may be discussed for enterprise agreements.",
    },
    {
      id: "ai",
      question: "Is AI output final for finance or compliance?",
      answer:
        "No. AI features are advisory. Your team must review and validate outputs. The platform does not autonomously post accounting or inventory transactions without explicit user actions.",
    },
    {
      id: "enterprise",
      question: "Can we request additional contractual terms?",
      answer:
        "Yes. Enterprise customers often require custom DPA schedules, security questionnaires, or SLA exhibits. Contact sales or support to start a review.",
    },
  ],
};
