import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type BillsAgingResponse,
  type CustomerHealthResponse,
  type CustomerRelatedResponse,
  type CustomerResponse,
} from "@/api/client";
import { CustomerAiInsights } from "@/components/customers/CustomerAiInsights";
import { useCustomerAi } from "@/hooks/useCustomerAi";
import { logApiError } from "@/utils/logApiError";
import { ArrowLeft, Building2, Mail, MapPin, Pencil, Phone, UserRound } from "lucide-react";

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recvAging, setRecvAging] = useState<BillsAgingResponse | null>(null);
  const [related, setRelated] = useState<CustomerRelatedResponse | null>(null);
  const [health, setHealth] = useState<CustomerHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const customerAi = useCustomerAi();

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
  }, [id]);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;

    if (customer.name) {
      api
        .getBillsAging({ bill_type: "RECEIVABLE", party_name: customer.name })
        .then((d) => {
          if (!cancelled) setRecvAging(d);
        })
        .catch((e) => {
          logApiError("CustomerDetailPage.getBillsAging", e);
          if (!cancelled) setRecvAging(null);
        });
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
  }, [customer]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/app/customers" className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-brand-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">{customer.name}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {customer.customer_code} · {customer.customer_type ?? "Unspecified type"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.open(`/app/customers/${customer.id}/print`, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
          >
            Print / Save PDF
          </button>
          <Link
            to={`/app/customers/${customer.id}/edit`}
            className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit customer
          </Link>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${
              (customer.status || "active").toLowerCase() === "active"
                ? "bg-status-success-subtle text-status-success-foreground"
                : "bg-surface-subtle text-text-secondary"
            }`}
          >
            {customer.status || "active"}
          </span>
        </div>
      </div>

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
          {customer.website ? (
            <a href={customer.website} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-brand-primary hover:underline">
              Open website
            </a>
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

      {orders.length > 0 || inquiries.length > 0 || quotations.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-raised p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-status-warning">Related Records</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {orders.length > 0 ? (
              <div>
                <div className="text-xs text-text-muted mb-1">Orders ({orders.length})</div>
                <ul className="space-y-1">
                  {orders.slice(0, 8).map((o) => (
                    <li key={o.id}>
                      <Link to={`/app/orders/${o.id}`} className="text-sm text-brand-primary hover:underline">
                        {o.code} — {o.status}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {inquiries.length > 0 ? (
              <div>
                <div className="text-xs text-text-muted mb-1">Inquiries ({inquiries.length})</div>
                <ul className="space-y-1">
                  {inquiries.slice(0, 8).map((i) => (
                    <li key={i.id}>
                      <Link to={`/app/inquiries/${i.id}`} className="text-sm text-brand-primary hover:underline">
                        {i.code} — {i.status}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {quotations.length > 0 ? (
              <div>
                <div className="text-xs text-text-muted mb-1">Quotations ({quotations.length})</div>
                <ul className="space-y-1">
                  {quotations.slice(0, 8).map((q) => (
                    <li key={q.id}>
                      <Link to={`/app/quotations/${q.id}`} className="text-sm text-brand-primary hover:underline">
                        {q.code} — {q.status}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {recvAging && recvAging.rows?.length ? (
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
    </div>
  );
}
