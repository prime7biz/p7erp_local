import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecordBreadcrumb } from "@/components/shell/recordBreadcrumb";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type BillsAgingResponse,
  type Customer360SectionBlock,
  type Customer360SectionKey,
  type CustomerContactCreate,
  type CustomerContactResponse,
  type CustomerContactUpdate,
  type CustomerHealthResponse,
  type CustomerRelatedResponse,
  type CustomerResponse,
  type CustomerTimelineEvent,
} from "@/api/client";
import { CustomerAiInsights } from "@/components/customers/CustomerAiInsights";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LinkedRecordsSection, type LinkedRecordRow } from "@/components/app/LinkedRecordsSection";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";
import { isMenuPermissionAllowed } from "@/components/shell/sidebarNavUtils";
import { useAuth } from "@/context/AuthContext";
import { useCustomerAi } from "@/hooks/useCustomerAi";
import { PartyLedgerSummaryCard } from "@/pages/app/finance/party-ledger/PartyLedgerSummaryCard";
import { logApiError } from "@/utils/logApiError";
import { safeHref } from "@/utils/safeUrl";
import { Building2, Mail, MapPin, Pencil, Phone, UserRound } from "lucide-react";

type WorkspaceTab =
  | "overview"
  | "merch"
  | "commercial"
  | "operations"
  | "finance"
  | "contacts"
  | "portal"
  | "activity";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "merch", label: "Merch" },
  { id: "commercial", label: "Commercial" },
  { id: "operations", label: "Operations" },
  { id: "finance", label: "Finance" },
  { id: "contacts", label: "Contacts" },
  { id: "portal", label: "Portal" },
  { id: "activity", label: "Activity" },
];

const TAB_TO_SECTION: Partial<Record<WorkspaceTab, Customer360SectionKey>> = {
  overview: "summary",
  merch: "merch",
  commercial: "commercial",
  operations: "operations",
  finance: "finance",
  contacts: "contacts",
  portal: "portal",
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

function isAllowedSection(block: Customer360SectionBlock | undefined): block is Record<string, unknown> & { allowed: true } {
  return Boolean(block && (block as { allowed?: boolean }).allowed === true);
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function rowLabel(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v);
  }
  return row.id != null ? `#${row.id}` : "—";
}

function toLinkedRows(
  rows: Record<string, unknown>[],
  codeKeys: string[],
  href: (id: number) => string,
): LinkedRecordRow[] {
  const out: LinkedRecordRow[] = [];
  for (const r of rows) {
    const id = Number(r.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({
      id,
      label: rowLabel(r, codeKeys),
      sub: r.status != null ? String(r.status) : undefined,
      to: href(id),
    });
  }
  return out;
}

function NoAccess() {
  return <p className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-text-muted">No access</p>;
}

function SectionLoading() {
  return <p className="text-sm text-text-muted">Loading…</p>;
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
      {message}
    </div>
  );
}

const emptyContactForm = (): CustomerContactCreate => ({
  name: "",
  designation: "",
  department: "",
  email: "",
  phone: "",
  whatsapp: "",
  is_primary: false,
  is_active: true,
  notes: "",
});

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { me, hasPermission } = useAuth();
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  useRecordBreadcrumb(customer?.name);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recvAging, setRecvAging] = useState<BillsAgingResponse | null>(null);
  const [related, setRelated] = useState<CustomerRelatedResponse | null>(null);
  const [health, setHealth] = useState<CustomerHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const tabParam = (searchParams.get("tab") || "overview").toLowerCase();
  const activeTab: WorkspaceTab = TABS.some((t) => t.id === tabParam) ? (tabParam as WorkspaceTab) : "overview";

  const [sectionCache, setSectionCache] = useState<Partial<Record<Customer360SectionKey, Customer360SectionBlock>>>({});
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState("");
  const [timeline, setTimeline] = useState<CustomerTimelineEvent[] | null>(null);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");

  const [contacts, setContacts] = useState<CustomerContactResponse[]>([]);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContactResponse | null>(null);
  const [contactForm, setContactForm] = useState<CustomerContactCreate>(emptyContactForm);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);

  const customerAi = useCustomerAi();
  const canViewFinance = useMemo(
    () =>
      isMenuPermissionAllowed(
        "finance.access",
        me?.feature_flags,
        hasPermission,
        me?.authority_classes_enabled === true,
      ),
    [me?.feature_flags, me?.authority_classes_enabled, hasPermission],
  );

  const setTab = useCallback(
    (next: WorkspaceTab) => {
      const nextParams = new URLSearchParams(searchParams);
      if (next === "overview") nextParams.delete("tab");
      else nextParams.set("tab", next);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError("Invalid customer id.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const item = await api.getCustomer(Number(id));
        setCustomer(item);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load customer");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  useEffect(() => {
    setRecvAging(null);
    setRelated(null);
    setHealth(null);
    setSectionCache({});
    setTimeline(null);
    setContacts([]);
  }, [id]);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;

    if (canViewFinance && customer.name) {
      api
        .getBillsAging({ bill_type: "RECEIVABLE", customer_id: customer.id })
        .then((d) => {
          if (!cancelled) setRecvAging(d);
        })
        .catch((e) => {
          logApiError("CustomerDetailPage.getBillsAging", e);
          if (!cancelled) setRecvAging(null);
        });
    } else if (!cancelled) {
      setRecvAging(null);
    }

    setHealthLoading(true);
    api
      .getCustomerRelated(customer.id, 25)
      .then((d) => {
        if (!cancelled) setRelated(d);
      })
      .catch((e) => {
        logApiError("CustomerDetailPage.getCustomerRelated", e);
        if (!cancelled) setRelated(null);
      });

    api
      .getCustomerHealth(customer.id)
      .then((d) => {
        if (!cancelled) setHealth(d);
      })
      .catch((e) => {
        logApiError("CustomerDetailPage.getCustomerHealth", e);
        if (!cancelled) setHealth(null);
      })
      .finally(() => {
        if (!cancelled) setHealthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer, canViewFinance]);

  // Lazy-load 360 section when tab opens
  useEffect(() => {
    if (!customer) return;
    const sectionKey = TAB_TO_SECTION[activeTab];
    if (!sectionKey) return;
    if (sectionCache[sectionKey]) return;

    let cancelled = false;
    setSectionLoading(true);
    setSectionError("");
    void api
      .getCustomer360(customer.id, { sections: [sectionKey], limit: 25 })
      .then((payload) => {
        if (cancelled) return;
        const block = payload.sections?.[sectionKey];
        if (block) {
          setSectionCache((prev) => ({ ...prev, [sectionKey]: block }));
        }
      })
      .catch((e) => {
        logApiError(`CustomerDetailPage.getCustomer360.${sectionKey}`, e);
        if (!cancelled) setSectionError(e instanceof Error ? e.message : "Failed to load section");
      })
      .finally(() => {
        if (!cancelled) setSectionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer, activeTab, sectionCache]);

  // Activity timeline
  useEffect(() => {
    if (!customer || activeTab !== "activity") return;
    if (timeline != null) return;
    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError("");
    void api
      .getCustomerTimeline(customer.id, { limit: 50, offset: 0 })
      .then((payload) => {
        if (cancelled) return;
        setTimeline(payload.events ?? []);
        setTimelineTotal(payload.total ?? 0);
      })
      .catch((e) => {
        logApiError("CustomerDetailPage.getCustomerTimeline", e);
        if (!cancelled) setTimelineError(e instanceof Error ? e.message : "Failed to load activity");
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer, activeTab, timeline]);

  // Contacts list (also from 360 when allowed; refresh via contacts API for edits)
  const refreshContacts = useCallback(async (customerId: number) => {
    try {
      const rows = await api.listCustomerContacts(customerId);
      setContacts(rows);
    } catch (e) {
      logApiError("CustomerDetailPage.listCustomerContacts", e);
      setContactError(e instanceof Error ? e.message : "Failed to load contacts");
    }
  }, []);

  useEffect(() => {
    if (!customer || activeTab !== "contacts") return;
    const block = sectionCache.contacts;
    if (isAllowedSection(block)) {
      const from360 = asRecordList(block.contacts) as unknown as CustomerContactResponse[];
      if (from360.length && contacts.length === 0) setContacts(from360);
    }
    void refreshContacts(customer.id);
  }, [customer, activeTab, sectionCache.contacts, refreshContacts, contacts.length]);

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm(emptyContactForm());
    setContactError("");
    setContactFormOpen(true);
  };

  const openEditContact = (row: CustomerContactResponse) => {
    setEditingContact(row);
    setContactForm({
      name: row.name,
      designation: row.designation ?? "",
      department: row.department ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      whatsapp: row.whatsapp ?? "",
      is_primary: row.is_primary,
      is_active: row.is_active,
      notes: row.notes ?? "",
    });
    setContactError("");
    setContactFormOpen(true);
    setOpenActionsId(null);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    if (!contactForm.name.trim()) {
      setContactError("Name is required.");
      return;
    }
    setContactSaving(true);
    setContactError("");
    try {
      const body: CustomerContactCreate | CustomerContactUpdate = {
        name: contactForm.name.trim(),
        designation: contactForm.designation || null,
        department: contactForm.department || null,
        email: contactForm.email || null,
        phone: contactForm.phone || null,
        whatsapp: contactForm.whatsapp || null,
        is_primary: Boolean(contactForm.is_primary),
        is_active: contactForm.is_active !== false,
        notes: contactForm.notes || null,
      };
      if (editingContact) {
        await api.updateCustomerContact(customer.id, editingContact.id, body);
      } else {
        await api.createCustomerContact(customer.id, body as CustomerContactCreate);
      }
      setContactFormOpen(false);
      setEditingContact(null);
      await refreshContacts(customer.id);
      setSectionCache((prev) => {
        const next = { ...prev };
        delete next.contacts;
        return next;
      });
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactSaving(false);
    }
  };

  const deactivateContact = async (row: CustomerContactResponse) => {
    if (!customer) return;
    setOpenActionsId(null);
    try {
      await api.updateCustomerContact(customer.id, row.id, { is_active: false });
      await refreshContacts(customer.id);
      setSectionCache((prev) => {
        const next = { ...prev };
        delete next.contacts;
        return next;
      });
    } catch (err) {
      logApiError("CustomerDetailPage.deactivateContact", err);
      setContactError(err instanceof Error ? err.message : "Deactivate failed");
    }
  };

  if (loading) {
    return <div className="p-6 text-text-muted">Loading customer profile...</div>;
  }

  if (error || !customer) {
    return (
      <div className="space-y-3 p-6">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error || "Customer not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/customers")}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
        >
          Back to customers
        </button>
      </div>
    );
  }

  const shippingAddress = [
    customer.shipping_address_line1,
    customer.shipping_city,
    customer.shipping_postal_code,
    customer.shipping_country,
  ]
    .filter(Boolean)
    .join(", ");

  const billingAddress = [
    customer.billing_address_line1,
    customer.billing_city,
    customer.billing_postal_code,
    customer.billing_country,
  ]
    .filter(Boolean)
    .join(", ");

  const orders = related?.orders ?? [];
  const inquiries = related?.inquiries ?? [];
  const quotations = related?.quotations ?? [];
  const cid = customer.id;
  const q = `customer_id=${cid}`;

  const workflowItems = [
    {
      label: "Inquiries",
      value: inquiries.length,
      to: inquiries.length ? `/app/inquiries?q=${encodeURIComponent(customer.name)}` : undefined,
    },
    {
      label: "Quotations",
      value: quotations.length,
      to: quotations.length ? `/app/quotations?q=${encodeURIComponent(customer.customer_code || customer.name)}` : undefined,
    },
    {
      label: "Orders",
      value: orders.length,
      to: orders.length ? `/app/orders?q=${encodeURIComponent(customer.customer_code || customer.name)}` : undefined,
    },
    {
      label: "Profile",
      value: health?.profile_completeness != null ? `${Math.round(health.profile_completeness)}%` : "—",
      hint: "Server-computed completeness",
    },
  ];

  const merchBlock = sectionCache.merch;
  const commercialBlock = sectionCache.commercial;
  const operationsBlock = sectionCache.operations;
  const financeBlock = sectionCache.finance;
  const portalBlock = sectionCache.portal;
  const contactsBlock = sectionCache.contacts;

  return (
    <div className="space-y-6">
      <AppPageHeader
        backTo={{ label: "Back to customers", to: "/app/customers" }}
        title={customer.name}
        description={`${customer.customer_code} · ${customer.customer_type ?? "Unspecified type"}`}
        belowTitle={<WorkflowSummaryStrip items={workflowItems} />}
        actions={
          <>
            <Link
              to={`/app/inquiries/new?${q}`}
              className="inline-flex items-center rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              New Inquiry
            </Link>
            <Link
              to={`/app/quotations/new?${q}`}
              className="inline-flex items-center rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              New Quotation
            </Link>
            <Link
              to={`/app/merchandising/styles?${q}`}
              className="inline-flex items-center rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              New Style
            </Link>
            <Link
              to={`/app/orders/new?${q}`}
              className="inline-flex items-center rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              New Order
            </Link>
            <button
              type="button"
              onClick={() => window.open(`/app/customers/${customer.id}/print`, "_blank", "noopener,noreferrer")}
              className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              Print
            </button>
            <Link
              to={`/app/customers/${customer.id}/edit`}
              className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                (customer.status || "active").toLowerCase() === "active"
                  ? "bg-status-success-subtle text-status-success-foreground"
                  : "bg-status-warning-subtle text-status-warning-foreground"
              }`}
            >
              {customer.status || "active"}
            </span>
          </>
        }
      />

      {(customer.status || "active").toLowerCase() === "inactive" ? (
        <div className="rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-text-primary">
          <span className="inline-flex items-center rounded-full bg-status-warning-subtle px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-status-warning-foreground">
            Inactive
          </span>
          <p className="mt-1 text-text-secondary">
            This customer is inactive. Prefer an active customer when creating new inquiries, quotations, or orders.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              activeTab === t.id
                ? "bg-brand-primary text-white"
                : "bg-surface-subtle text-text-secondary hover:bg-surface-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <>
          <CustomerAiInsights
            customerId={customer.id}
            health={health}
            healthLoading={healthLoading}
            ai={customerAi}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="text-xs uppercase tracking-wide text-text-muted">Legal Entity</div>
              <div className="mt-1 font-semibold text-text-primary">{orDash(customer.legal_entity_name ?? customer.name)}</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="text-xs uppercase tracking-wide text-text-muted">Trade Name</div>
              <div className="mt-1 font-semibold text-text-primary">{orDash(customer.trade_name)}</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="text-xs uppercase tracking-wide text-text-muted">Tax / VAT</div>
              <div className="mt-1 font-semibold text-text-primary">{orDash(customer.tax_id_vat_number)}</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="text-xs uppercase tracking-wide text-text-muted">Website</div>
              {customer.website && safeHref(customer.website, { assumeHttps: true }) ? (
                <a
                  href={safeHref(customer.website, { assumeHttps: true })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-semibold text-brand-primary hover:underline"
                >
                  Open website
                </a>
              ) : customer.website ? (
                <div className="mt-1 break-all font-semibold text-text-primary">{customer.website}</div>
              ) : (
                <div className="mt-1 font-semibold text-text-primary">—</div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-surface-raised p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
                <UserRound className="h-4 w-4" />
                Contact & Communication
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Primary Contact</dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.primary_contact_name)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Designation</dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.designation)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-1 text-text-muted">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.contact_email ?? customer.email)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-1 text-text-muted">
                    <Phone className="h-3.5 w-3.5" />
                    Phone
                  </dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.contact_phone ?? customer.phone)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Newsletter</dt>
                  <dd className="font-medium text-text-primary">{customer.subscribe_newsletter ? "Subscribed" : "Not subscribed"}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-border bg-surface-raised p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
                <Building2 className="h-4 w-4" />
                Profile Summary
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Customer Code</dt>
                  <dd className="font-medium text-text-primary">{customer.customer_code}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Customer Type</dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.customer_type)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Preferred currency</dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.preferred_currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Payment terms</dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.payment_terms)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Default Incoterm</dt>
                  <dd className="font-medium text-text-primary">{orDash(customer.default_incoterm)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Status</dt>
                  <dd className="font-medium capitalize text-text-primary">{customer.status || "active"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Created</dt>
                  <dd className="font-medium text-text-primary">{formatDateTime(customer.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Updated</dt>
                  <dd className="font-medium text-text-primary">{formatDateTime(customer.updated_at)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <LinkedRecordsSection
            columns={[
              {
                title: "Orders",
                rows: orders.map((o) => ({
                  id: o.id,
                  label: o.code,
                  sub: o.status,
                  to: `/app/orders/${o.id}`,
                })),
              },
              {
                title: "Inquiries",
                rows: inquiries.map((i) => ({
                  id: i.id,
                  label: i.code,
                  sub: i.status,
                  to: `/app/inquiries/${i.id}`,
                })),
              },
              {
                title: "Quotations",
                rows: quotations.map((qRow) => ({
                  id: qRow.id,
                  label: qRow.code,
                  sub: qRow.status,
                  to: `/app/quotations/${qRow.id}`,
                })),
              },
            ]}
          />

          {canViewFinance ? (
            <div className="max-w-sm">
              <PartyLedgerSummaryCard partyType="CUSTOMER" partyId={customer.id} title="Customer party ledger" />
            </div>
          ) : null}

          {canViewFinance && recvAging && recvAging.rows?.length ? (
            <section className="rounded-xl border border-border bg-surface-raised p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-status-warning">Outstanding receivable bills</h2>
                <Link
                  to="/app/accounts/reports/ar-ap-aging"
                  className="text-xs font-medium text-brand-primary hover:underline"
                >
                  View full AR/AP aging
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-subtle text-left">
                    <tr>
                      <th className="px-2 py-1">Bill</th>
                      <th className="px-2 py-1">Due</th>
                      <th className="px-2 py-1 text-right">Outstanding</th>
                      <th className="px-2 py-1">Bucket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recvAging.rows.slice(0, 12).map((r) => (
                      <tr key={r.bill_id} className="border-t">
                        <td className="px-2 py-1">{r.bill_no}</td>
                        <td className="px-2 py-1">{r.due_date}</td>
                        <td className="px-2 py-1 text-right">{r.outstanding_amount.toLocaleString()}</td>
                        <td className="px-2 py-1">{r.bucket}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-surface-raised p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
                <MapPin className="h-4 w-4" />
                Billing Address
              </div>
              <p className="text-sm text-text-secondary">{billingAddress || "No billing address provided."}</p>
            </section>

            <section className="rounded-xl border border-border bg-surface-raised p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
                  <MapPin className="h-4 w-4" />
                  Shipping Address
                </div>
                {customer.same_as_billing ? (
                  <span className="rounded-full bg-status-warning-subtle px-2 py-0.5 text-[11px] font-semibold text-status-warning-foreground">Same as billing</span>
                ) : null}
              </div>
              <p className="text-sm text-text-secondary">{shippingAddress || "No shipping address provided."}</p>
            </section>
          </div>
        </>
      ) : null}

      {activeTab === "merch" ? (
        <div className="space-y-4">
          {sectionLoading && !merchBlock ? <SectionLoading /> : null}
          {sectionError && !merchBlock ? <SectionError message={sectionError} /> : null}
          {merchBlock && !isAllowedSection(merchBlock) ? <NoAccess /> : null}
          {isAllowedSection(merchBlock) ? (
            <LinkedRecordsSection
              title="Merchandising"
              columns={[
                {
                  title: "Inquiries",
                  rows: toLinkedRows(asRecordList(merchBlock.inquiries), ["inquiry_code"], (i) => `/app/inquiries/${i}`),
                },
                {
                  title: "Quotations",
                  rows: toLinkedRows(asRecordList(merchBlock.quotations), ["quotation_code"], (i) => `/app/quotations/${i}`),
                },
                {
                  title: "Orders",
                  rows: toLinkedRows(asRecordList(merchBlock.orders), ["order_code"], (i) => `/app/orders/${i}`),
                },
                {
                  title: "Styles",
                  rows: toLinkedRows(asRecordList(merchBlock.styles), ["style_code", "name"], (i) => `/app/merchandising/styles/${i}`),
                },
                {
                  title: "BOMs",
                  rows: toLinkedRows(asRecordList(merchBlock.boms), ["bom_code"], (i) => `/app/bom?highlight=${i}`),
                },
              ]}
            />
          ) : null}
          {isAllowedSection(merchBlock) &&
          ![merchBlock.inquiries, merchBlock.quotations, merchBlock.orders, merchBlock.styles, merchBlock.boms].some(
            (x) => asRecordList(x).length > 0,
          ) ? (
            <p className="text-sm text-text-muted">No merchandising records for this customer yet.</p>
          ) : null}
        </div>
      ) : null}

      {activeTab === "commercial" ? (
        <div className="space-y-4">
          {sectionLoading && !commercialBlock ? <SectionLoading /> : null}
          {sectionError && !commercialBlock ? <SectionError message={sectionError} /> : null}
          {commercialBlock && !isAllowedSection(commercialBlock) ? <NoAccess /> : null}
          {isAllowedSection(commercialBlock) ? (
            <>
              <LinkedRecordsSection
                title="Commercial"
                columns={[
                  {
                    title: "Master contracts",
                    rows: toLinkedRows(
                      asRecordList(commercialBlock.master_contracts),
                      ["reference"],
                      (i) => `/app/commercial/master-contracts?highlight=${i}`,
                    ),
                  },
                  {
                    title: "Proforma invoices",
                    rows: toLinkedRows(
                      asRecordList(commercialBlock.proforma_invoices),
                      ["reference"],
                      (i) => `/app/commercial/proforma-invoices/${i}/edit`,
                    ),
                  },
                  {
                    title: "Commercial invoices",
                    rows: toLinkedRows(
                      asRecordList(commercialBlock.commercial_invoices),
                      ["invoice_code"],
                      (i) => `/app/commercial/invoices/${i}`,
                    ),
                  },
                  {
                    title: "Export cases",
                    rows: toLinkedRows(
                      asRecordList(commercialBlock.export_cases),
                      ["reference"],
                      (i) => `/app/commercial/export-cases/${i}/edit`,
                    ),
                  },
                ]}
              />
              {(() => {
                const trade = commercialBlock.trade_cases as Customer360SectionBlock | undefined;
                if (!trade) return null;
                if (!isAllowedSection(trade)) return <NoAccess />;
                return (
                  <LinkedRecordsSection
                    title="Trade cases"
                    columns={[
                      {
                        title: "Trade cases",
                        rows: toLinkedRows(asRecordList(trade.rows), ["reference"], (i) => `/app/trade/cases/${i}`),
                      },
                    ]}
                  />
                );
              })()}
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "operations" ? (
        <div className="space-y-4">
          {sectionLoading && !operationsBlock ? <SectionLoading /> : null}
          {sectionError && !operationsBlock ? <SectionError message={sectionError} /> : null}
          {operationsBlock && !isAllowedSection(operationsBlock) ? <NoAccess /> : null}
          {isAllowedSection(operationsBlock) ? (
            <LinkedRecordsSection
              title="Operations"
              columns={[
                {
                  title: "Delivery challans",
                  rows: Array.isArray(operationsBlock.delivery_challans)
                    ? toLinkedRows(asRecordList(operationsBlock.delivery_challans), ["challan_code"], (i) => `/app/inventory/delivery-challans/${i}`)
                    : [],
                },
                {
                  title: "Process orders",
                  rows: Array.isArray(operationsBlock.process_orders)
                    ? toLinkedRows(asRecordList(operationsBlock.process_orders), ["process_number"], (i) => `/app/inventory/process-orders/${i}`)
                    : [],
                },
                {
                  title: "Knitting WOs",
                  rows: Array.isArray(operationsBlock.knitting_work_orders)
                    ? toLinkedRows(asRecordList(operationsBlock.knitting_work_orders), ["wo_number"], (i) => `/app/production/knitting/${i}`)
                    : [],
                },
                {
                  title: "Job work",
                  rows: Array.isArray(operationsBlock.job_work_contracts)
                    ? toLinkedRows(asRecordList(operationsBlock.job_work_contracts), ["contract_no"], (i) => `/app/production/job-work/${i}`)
                    : [],
                },
              ]}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "finance" ? (
        <div className="space-y-4">
          {sectionLoading && !financeBlock ? <SectionLoading /> : null}
          {sectionError && !financeBlock ? <SectionError message={sectionError} /> : null}
          {financeBlock && !isAllowedSection(financeBlock) ? <NoAccess /> : null}
          {!canViewFinance ? <NoAccess /> : null}
          {canViewFinance && isAllowedSection(financeBlock) ? (
            <>
              <div className="max-w-sm">
                <PartyLedgerSummaryCard partyType="CUSTOMER" partyId={customer.id} title="Customer party ledger" />
              </div>
              {Array.isArray(financeBlock.ar_aging_rows) && (financeBlock.ar_aging_rows as unknown[]).length > 0 ? (
                <section className="rounded-xl border border-border bg-surface-raised p-5">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-status-warning">AR bills</h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-surface-subtle text-left">
                        <tr>
                          <th className="px-2 py-1">Bill</th>
                          <th className="px-2 py-1">Due</th>
                          <th className="px-2 py-1 text-right">Amount</th>
                          <th className="px-2 py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asRecordList(financeBlock.ar_aging_rows).map((r) => (
                          <tr key={String(r.id)} className="border-t">
                            <td className="px-2 py-1">{String(r.bill_no ?? "—")}</td>
                            <td className="px-2 py-1">{String(r.due_date ?? "—")}</td>
                            <td className="px-2 py-1 text-right">{String(r.amount ?? "—")}</td>
                            <td className="px-2 py-1">{String(r.status ?? "—")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <p className="text-sm text-text-muted">No receivable bills linked to this customer.</p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "contacts" ? (
        <div className="space-y-4">
          {sectionLoading && !contactsBlock ? <SectionLoading /> : null}
          {contactsBlock && !isAllowedSection(contactsBlock) ? <NoAccess /> : null}
          {(!contactsBlock || isAllowedSection(contactsBlock)) && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-status-warning">Contacts</h2>
                <button
                  type="button"
                  onClick={openAddContact}
                  className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground"
                >
                  Add contact
                </button>
              </div>
              {contactError ? <SectionError message={contactError} /> : null}
              {contacts.length === 0 ? (
                <p className="text-sm text-text-muted">No contacts yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-subtle text-left text-text-secondary">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Phone</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((row) => (
                        <tr key={row.id} className="border-t border-border-subtle">
                          <td className="px-3 py-2 font-medium text-text-primary">
                            {row.name}
                            {row.is_primary ? (
                              <span className="ml-2 rounded-full bg-status-success-subtle px-1.5 py-0.5 text-[10px] font-semibold text-status-success-foreground">
                                Primary
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{orDash(row.designation)}</td>
                          <td className="px-3 py-2 text-text-secondary">{orDash(row.email)}</td>
                          <td className="px-3 py-2 text-text-secondary">{orDash(row.phone)}</td>
                          <td className="px-3 py-2 text-text-secondary">{row.is_active ? "Active" : "Inactive"}</td>
                          <td className="px-3 py-2">
                            <RowActionsMenu
                              rowId={row.id}
                              openId={openActionsId}
                              onOpenChange={setOpenActionsId}
                              items={[
                                { key: "edit", label: "Edit", onClick: () => openEditContact(row) },
                                ...(row.is_active
                                  ? [
                                      {
                                        key: "deactivate",
                                        label: "Deactivate",
                                        danger: true,
                                        onClick: () => void deactivateContact(row),
                                      },
                                    ]
                                  : []),
                              ]}
                              menuPortal
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {contactFormOpen ? (
                <form onSubmit={saveContact} className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {editingContact ? "Edit contact" : "Add contact"}
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-xs font-medium text-text-secondary">
                      Name *
                      <input
                        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        value={contactForm.name}
                        onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="block text-xs font-medium text-text-secondary">
                      Designation
                      <input
                        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        value={contactForm.designation ?? ""}
                        onChange={(e) => setContactForm((p) => ({ ...p, designation: e.target.value }))}
                      />
                    </label>
                    <label className="block text-xs font-medium text-text-secondary">
                      Email
                      <input
                        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        value={contactForm.email ?? ""}
                        onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </label>
                    <label className="block text-xs font-medium text-text-secondary">
                      Phone
                      <input
                        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                        value={contactForm.phone ?? ""}
                        onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-text-secondary">
                      <input
                        type="checkbox"
                        checked={Boolean(contactForm.is_primary)}
                        onChange={(e) => setContactForm((p) => ({ ...p, is_primary: e.target.checked }))}
                      />
                      Primary contact
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={contactSaving}
                      className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground disabled:opacity-50"
                    >
                      {contactSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactFormOpen(false)}
                      className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {activeTab === "portal" ? (
        <div className="space-y-4">
          {sectionLoading && !portalBlock ? <SectionLoading /> : null}
          {sectionError && !portalBlock ? <SectionError message={sectionError} /> : null}
          {portalBlock && !isAllowedSection(portalBlock) ? <NoAccess /> : null}
          {isAllowedSection(portalBlock) ? (
            <>
              <p className="text-sm text-text-secondary">
                Portal notes: {typeof portalBlock.notes_count === "number" ? portalBlock.notes_count : 0}
              </p>
              {asRecordList(portalBlock.accounts).length === 0 ? (
                <p className="text-sm text-text-muted">No portal accounts linked.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-subtle text-left">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Active</th>
                        <th className="px-3 py-2">Last login</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asRecordList(portalBlock.accounts).map((a, idx) => (
                        <tr key={String(a.access_id ?? idx)} className="border-t">
                          <td className="px-3 py-2">{String(a.full_name ?? "—")}</td>
                          <td className="px-3 py-2">{String(a.email ?? "—")}</td>
                          <td className="px-3 py-2">{a.is_active ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">{a.last_login_at ? formatDateTime(String(a.last_login_at)) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link
                to="/app/settings/external-access/customers"
                className="text-xs font-medium text-brand-primary hover:underline"
              >
                Manage external access
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <div className="space-y-3">
          {timelineLoading ? <SectionLoading /> : null}
          {timelineError ? <SectionError message={timelineError} /> : null}
          {!timelineLoading && !timelineError && (timeline?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-muted">No activity recorded yet.</p>
          ) : null}
          {timeline && timeline.length > 0 ? (
            <>
              <p className="text-xs text-text-muted">Showing {timeline.length} of {timelineTotal} events</p>
              <ul className="space-y-2">
                {timeline.map((ev, idx) => (
                  <li
                    key={`${ev.at}-${ev.action}-${idx}`}
                    className="rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-text-primary">{ev.action}</span>
                      <span className="text-xs text-text-muted">{formatDateTime(ev.at)}</span>
                    </div>
                    {ev.resource ? <div className="mt-0.5 text-xs text-text-secondary">{ev.resource}</div> : null}
                    {ev.details ? <div className="mt-1 text-text-secondary">{ev.details}</div> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
