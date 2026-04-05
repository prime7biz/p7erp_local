import type { LegalDocument } from "./types";

/** Public SLA summary—binding credits and custom targets only where agreed in a signed enterprise contract. */
export const slaDocument: LegalDocument = {
  id: "service-level-agreement-public",
  version: "1.0.0",
  lastUpdated: "2026-04-04",
  title: "Service Level Agreement (Public Summary)",
  intro:
    "This page summarizes Prime7 ERP service level objectives for availability and support responsiveness. It is designed to set clear expectations for subscribers and procurement teams. Unless you have a separate signed agreement (for example, an enterprise order form or SLA exhibit) that expressly states otherwise, this summary does not create enforceable service credit rights or guaranteed outcomes beyond what is required by applicable law.",
  sections: [
    {
      id: "overview",
      title: "1. SLA Overview",
      blocks: [
        {
          kind: "p",
          text: "Prime7 ERP is provided as a multi-tenant cloud service. This SLA describes how we approach availability, maintenance, support responsiveness, and incident management. Specific modules, deployment options, or professional services may be addressed in separate documentation or contracts.",
        },
        {
          kind: "ul",
          items: [
            "Covered services: production access to the Prime7 ERP web application and APIs made generally available to paying subscribers under their subscription plan.",
            "Out of scope: beta or preview features (unless labeled otherwise), on-premises components, custom code not maintained by Prime7, third-party integrations operated by Customer, and free trials unless expressly included in writing.",
          ],
        },
      ],
    },
    {
      id: "availability",
      title: "2. Service Availability Commitment",
      blocks: [
        {
          kind: "p",
          text: "We design the platform for high availability and target 99.5% monthly uptime for the covered production service, measured as the percentage of minutes in a calendar month during which the core application is reachable and able to authenticate users under normal operating conditions.",
        },
        {
          kind: "callout",
          title: "Important",
          items: [
            "This target is an objective, not an absolute guarantee. It does not apply during excluded events listed in Section 7.",
            "Website marketing references to uptime are illustrative unless replicated in your signed contract.",
          ],
        },
        {
          kind: "h3",
          text: "Planned maintenance",
        },
        {
          kind: "p",
          text: "We may perform planned maintenance that temporarily affects availability. Where practicable, we will provide advance notice through in-product banners, email, or our support channels. Scheduled maintenance windows are generally excluded from uptime calculations unless your enterprise agreement states otherwise.",
        },
        {
          kind: "h3",
          text: "Force majeure and dependencies",
        },
        {
          kind: "p",
          text: "Events outside our reasonable control—including natural disasters, war, internet or DNS failures, denial-of-service attacks not reasonably preventable, actions of government, or widespread failure of public cloud or connectivity providers—are excluded from uptime commitments to the extent permitted by law.",
        },
      ],
    },
    {
      id: "support",
      title: "3. Support Response Targets",
      blocks: [
        {
          kind: "p",
          text: "Initial response targets below describe goals for our support team to acknowledge tickets during business coverage hours for your plan. They are not guarantees of resolution time. Resolution depends on complexity, reproduction, third parties, and Customer cooperation.",
        },
        {
          kind: "ul",
          items: [
            "Critical (production down, no workaround): target initial response within 4 business hours.",
            "High (major feature impaired, limited workaround): target initial response within 8 business hours.",
            "Medium (partial impairment or non-production): target initial response within 1 business day.",
            "Low (general questions, cosmetic issues): target initial response within 2 business days.",
          ],
        },
        {
          kind: "p",
          text: "Business hours and channels are described on our Support page. Enterprise plans may define expanded coverage or named contacts in a signed order form.",
        },
      ],
    },
    {
      id: "maintenance-windows",
      title: "4. Maintenance Windows",
      blocks: [
        {
          kind: "p",
          text: "Planned maintenance is typically scheduled during off-peak windows for our customer base and communicated in advance when feasible. Emergency maintenance may be performed without prior notice when required to address security, stability, or data integrity risks.",
        },
      ],
    },
    {
      id: "incidents",
      title: "5. Incident Handling",
      blocks: [
        {
          kind: "ul",
          items: [
            "Detection: automated monitoring, health checks, and customer reports.",
            "Communication: status updates through support tickets and, for widespread events, notices via email or in-product messaging where appropriate.",
            "Escalation: incidents are triaged and escalated internally based on severity and customer impact.",
            "Recovery: we work to restore service and validate stability; post-incident summaries may be provided for significant events when practical.",
          ],
        },
        {
          kind: "p",
          text: "Recovery time objectives are best-effort and depend on root cause; they are not contractual guarantees unless specified in a signed enterprise SLA exhibit.",
        },
      ],
    },
    {
      id: "customer",
      title: "6. Customer Responsibilities",
      blocks: [
        {
          kind: "ul",
          items: [
            "Maintain stable internet connectivity and compatible browsers/devices per our documentation.",
            "Protect credentials, enforce RBAC, and revoke access for departing users promptly.",
            "Provide accurate reproduction steps, logs, and timely responses when support requests information.",
            "Ensure integrations and customizations you operate do not degrade platform security or availability.",
          ],
        },
      ],
    },
    {
      id: "exclusions",
      title: "7. Exclusions",
      blocks: [
        {
          kind: "p",
          text: "The following are examples of circumstances that may fall outside standard availability and support commitments:",
        },
        {
          kind: "ul",
          items: [
            "Failures of ISPs, DNS, or Customer network equipment.",
            "Outages or defects in third-party services (including payment, email delivery, or AI model providers) outside Prime7's direct control.",
            "Misuse, misconfiguration, or overload caused by Customer or unauthorized parties.",
            "Unsupported customizations, unofficial plugins, or deprecated APIs.",
            "Security incidents originating from compromised Customer credentials or endpoints not managed by Prime7.",
            "Suspension for legal, non-payment, or acceptable-use reasons.",
          ],
        },
      ],
    },
    {
      id: "credits",
      title: "8. Service Credits Disclaimer",
      blocks: [
        {
          kind: "p",
          text: "Unless expressly provided in a signed enterprise contract, this public SLA does not entitle Customer to service credits, fee refunds, or liquidated damages for downtime or delayed support responses. If you require credit mechanics, please discuss an enterprise SLA exhibit with our sales team.",
        },
      ],
    },
    {
      id: "changes",
      title: "9. Limitation and Changes",
      blocks: [
        {
          kind: "p",
          text: "We may update this page to reflect operational improvements or clarifications. The “Last updated” date will change accordingly. If a provision in a signed agreement conflicts with this public summary, the signed agreement controls for that customer relationship.",
        },
      ],
    },
  ],
};
