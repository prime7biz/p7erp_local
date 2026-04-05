import type { LegalDocument } from "./types";

/**
 * Security & compliance narrative—no false certification claims.
 * Describes practices and alignment language only.
 */
export const securityComplianceDocument: LegalDocument = {
  id: "security-compliance",
  version: "1.0.0",
  lastUpdated: "2026-04-04",
  title: "Security & Compliance",
  intro:
    "Prime7 ERP is built for organizations that entrust us with operational and business data. This page describes, at a high level, how we approach security, privacy-by-design, and operational resilience. It is not an exhaustive security white paper, and it does not replace a signed contract, data processing agreement, or customized security questionnaire responses for enterprise procurement.",
  sections: [
    {
      id: "overview",
      title: "A. Security Overview",
      blocks: [
        {
          kind: "p",
          text: "We are committed to protecting the confidentiality, integrity, and availability of Customer Data processed in the Service. Security is implemented through layered technical controls, access policies, secure development practices, and vendor management—scaled to the risk profile of a cloud ERP platform.",
        },
      ],
    },
    {
      id: "encryption",
      title: "B.1 Data encryption",
      blocks: [
        {
          kind: "h3",
          text: "Encryption in transit",
        },
        {
          kind: "p",
          text: "Customer-facing interfaces are designed to use modern TLS for data in transit between browsers or client applications and our services, consistent with industry practice.",
        },
        {
          kind: "h3",
          text: "Encryption at rest",
        },
        {
          kind: "p",
          text: "We use platform-level encryption at rest for primary databases and backups where supported by our infrastructure providers, combined with access controls and key management practices appropriate to our architecture.",
        },
      ],
    },
    {
      id: "access",
      title: "B.2 Access control",
      blocks: [
        {
          kind: "ul",
          items: [
            "Role-based access within the application so tenants can align permissions with job duties.",
            "Least-privilege principles for operational access by Prime7 personnel, limited to legitimate engineering and support needs.",
            "Logical tenant separation so one customer's data is not exposed to another customer's users through the application layer.",
          ],
        },
      ],
    },
    {
      id: "auth",
      title: "B.3 Authentication and account security",
      blocks: [
        {
          kind: "p",
          text: "The Service supports password-based authentication with session management appropriate to a web ERP. Where multi-factor authentication (MFA) or single sign-on (SSO) is offered or planned for your plan, it will be described in product documentation; until then, Customers should enforce strong password policies and credential hygiene organizationally.",
        },
      ],
    },
    {
      id: "infrastructure",
      title: "B.4 Infrastructure and hosting security",
      blocks: [
        {
          kind: "p",
          text: "We host on reputable cloud or VPS providers with network security controls, patching responsibilities shared per the provider model, and segmentation designed to reduce exposure. Exact providers and regions may vary by deployment and may be summarized under NDA for enterprise customers.",
        },
      ],
    },
    {
      id: "monitoring",
      title: "B.5 Monitoring and logging",
      blocks: [
        {
          kind: "ul",
          items: [
            "Operational monitoring and alerting for service health.",
            "Audit-style logs for security-relevant and support-relevant events where implemented in product and infrastructure layers.",
            "Retention periods aligned with operational need, security investigations, and legal obligations.",
          ],
        },
      ],
    },
    {
      id: "sdlc",
      title: "B.6 Secure development practices",
      blocks: [
        {
          kind: "ul",
          items: [
            "Change control for production releases.",
            "Testing practices appropriate to a continuous delivery environment.",
            "Patching and dependency updates on a risk-prioritized basis.",
          ],
        },
      ],
    },
    {
      id: "isolation",
      title: "B.7 Data isolation",
      blocks: [
        {
          kind: "p",
          text: "Prime7 ERP is a multi-tenant system. Customer Data is associated with a tenant identifier and protected by application and database controls intended to prevent unauthorized cross-tenant access. Customers must not attempt to bypass these controls.",
        },
      ],
    },
    {
      id: "compliance-positioning",
      title: "C. Compliance positioning",
      blocks: [
        {
          kind: "p",
          text: "We do not claim formal certification (such as ISO 27001) unless and until we publish an audited attestation. Our program is designed with reference to widely accepted principles—including ISO/IEC 27001-style themes such as risk management, access control, and supplier relationships—and GDPR-aware privacy design for processor scenarios.",
        },
        {
          kind: "p",
          text: "Alignment language does not mean we meet every control in a given framework; enterprise customers may request additional due diligence or contractual commitments subject to review.",
        },
      ],
    },
    {
      id: "privacy-handling",
      title: "D. Privacy and data handling",
      blocks: [
        {
          kind: "ul",
          items: [
            "Customer retains ownership of its business data; we process it to deliver the Service as described in our Terms and Privacy Policy.",
            "We do not sell Customer Data to data brokers.",
            "Subprocessors are used for hosting, communications, observability, payments, and similar functions under appropriate agreements.",
            "A Data Processing Agreement (DPA) is available for controller/processor relationships.",
          ],
        },
      ],
    },
    {
      id: "bc",
      title: "E. Business continuity",
      blocks: [
        {
          kind: "p",
          text: "We maintain backups and recovery procedures intended to support restoration in the event of data corruption or infrastructure failure. Recovery point and recovery time outcomes depend on architecture and incident specifics and are subject to contractual commitments only where expressly agreed in writing.",
        },
      ],
    },
    {
      id: "disclosure",
      title: "F. Responsible disclosure",
      blocks: [
        {
          kind: "p",
          text: "If you believe you have found a security vulnerability in Prime7 ERP, please report it to security@prime7erp.com with sufficient detail to reproduce the issue. Do not perform testing that could harm availability or access data belonging to others. We appreciate coordinated disclosure and will work with researchers in good faith.",
        },
      ],
    },
    {
      id: "disclaimer",
      title: "G. Important disclaimer",
      blocks: [
        {
          kind: "p",
          text: "This page describes current practices at a high level and may be updated. It does not create warranties beyond those in your agreement, and specific security commitments apply only where expressly stated in a signed contract or order form.",
        },
      ],
    },
  ],
};
