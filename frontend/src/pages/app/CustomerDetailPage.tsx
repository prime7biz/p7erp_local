import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type CustomerResponse } from "@/api/client";
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

  if (loading) {
    return <div className="p-6 text-slate-500">Loading customer profile...</div>;
  }

  if (error || !customer) {
    return (
      <div className="space-y-3 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Customer not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/customers")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/app/customers" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{customer.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {customer.customer_code} · {customer.customer_type ?? "Unspecified type"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/app/customers/${customer.id}/edit`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit customer
          </Link>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${
              (customer.status || "active").toLowerCase() === "active"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {customer.status || "active"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Legal Entity</div>
          <div className="mt-1 font-semibold text-slate-900">{orDash(customer.legal_entity_name ?? customer.name)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Trade Name</div>
          <div className="mt-1 font-semibold text-slate-900">{orDash(customer.trade_name)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Tax / VAT</div>
          <div className="mt-1 font-semibold text-slate-900">{orDash(customer.tax_id_vat_number)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Website</div>
          {customer.website ? (
            <a href={customer.website} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-primary hover:underline">
              Open website
            </a>
          ) : (
            <div className="mt-1 font-semibold text-slate-900">—</div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-500">
            <UserRound className="h-4 w-4" />
            Contact & Communication
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Primary Contact</dt>
              <dd className="font-medium text-slate-800">{orDash(customer.primary_contact_name)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Designation</dt>
              <dd className="font-medium text-slate-800">{orDash(customer.designation)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="inline-flex items-center gap-1 text-slate-500">
                <Mail className="h-3.5 w-3.5" />
                Email
              </dt>
              <dd className="font-medium text-slate-800">{orDash(customer.contact_email ?? customer.email)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="inline-flex items-center gap-1 text-slate-500">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </dt>
              <dd className="font-medium text-slate-800">{orDash(customer.contact_phone ?? customer.phone)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Newsletter</dt>
              <dd className="font-medium text-slate-800">{customer.subscribe_newsletter ? "Subscribed" : "Not subscribed"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-500">
            <Building2 className="h-4 w-4" />
            Profile Summary
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Customer Code</dt>
              <dd className="font-medium text-slate-800">{customer.customer_code}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Customer Type</dt>
              <dd className="font-medium text-slate-800">{orDash(customer.customer_type)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium capitalize text-slate-800">{customer.status || "active"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Created</dt>
              <dd className="font-medium text-slate-800">{formatDateTime(customer.created_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Updated</dt>
              <dd className="font-medium text-slate-800">{formatDateTime(customer.updated_at)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-500">
            <MapPin className="h-4 w-4" />
            Billing Address
          </div>
          <p className="text-sm text-slate-700">{billingAddress || "No billing address provided."}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-500">
              <MapPin className="h-4 w-4" />
              Shipping Address
            </div>
            {customer.same_as_billing ? (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-600">Same as billing</span>
            ) : null}
          </div>
          <p className="text-sm text-slate-700">{shippingAddress || "No shipping address provided."}</p>
        </section>
      </div>
    </div>
  );
}
