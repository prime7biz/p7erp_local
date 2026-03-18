import { useEffect, useMemo, useState } from "react";
import {
  api,
  type CustomerIntermediaryLinkCreate,
  type CustomerIntermediaryLinkResponse,
  type CustomerIntermediaryLinkUpdate,
  type CustomerResponse,
  type IntermediaryCreate,
  type IntermediaryResponse,
  type IntermediaryUpdate,
} from "@/api/client";

type PartiesTab = "buying_houses" | "agents" | "links";

const emptyIntermediaryForm = (partyType: "BUYING_HOUSE" | "AGENT"): IntermediaryCreate => ({
  name: "",
  kind: partyType,
  is_active: true,
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  contact_address: "",
  notes: "",
});

const emptyLinkForm: CustomerIntermediaryLinkCreate = {
  customer_id: 0,
  intermediary_id: 0,
  is_primary: false,
  commission_type: undefined,
  commission_value: undefined,
  notes: "",
};

export function PartiesPage() {
  const [activeTab, setActiveTab] = useState<PartiesTab>("buying_houses");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [buyingHouses, setBuyingHouses] = useState<IntermediaryResponse[]>([]);
  const [agents, setAgents] = useState<IntermediaryResponse[]>([]);
  const [links, setLinks] = useState<CustomerIntermediaryLinkResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);

  const [editingIntermediary, setEditingIntermediary] = useState<IntermediaryResponse | null>(null);
  const [intermediaryForm, setIntermediaryForm] = useState<IntermediaryCreate>(
    emptyIntermediaryForm("BUYING_HOUSE")
  );

  const [editingLink, setEditingLink] = useState<CustomerIntermediaryLinkResponse | null>(null);
  const [linkForm, setLinkForm] = useState<CustomerIntermediaryLinkCreate>(emptyLinkForm);

  const allIntermediaries = useMemo(() => [...buyingHouses, ...agents], [buyingHouses, agents]);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [buyingHouseRows, agentRows, linkRows, customerRows] = await Promise.all([
        api.listIntermediaries({ kind: "BUYING_HOUSE" }),
        api.listIntermediaries({ kind: "AGENT" }),
        api.listCustomerIntermediaryLinks(),
        api.listCustomers(),
      ]);
      setBuyingHouses(buyingHouseRows);
      setAgents(agentRows);
      setLinks(linkRows);
      setCustomers(customerRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load parties");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const beginCreateIntermediary = (partyType: "BUYING_HOUSE" | "AGENT") => {
    setEditingIntermediary(null);
    setIntermediaryForm(emptyIntermediaryForm(partyType));
  };

  const beginEditIntermediary = (item: IntermediaryResponse) => {
    setEditingIntermediary(item);
    setIntermediaryForm({
      name: item.name,
      kind: item.kind,
      is_active: item.is_active,
      contact_name: item.contact_name ?? "",
      contact_email: item.contact_email ?? "",
      contact_phone: item.contact_phone ?? "",
      contact_address: item.contact_address ?? "",
      notes: item.notes ?? "",
    });
  };

  const saveIntermediary = async () => {
    if (!intermediaryForm.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError("");
    try {
      if (editingIntermediary) {
        const patch: IntermediaryUpdate = { ...intermediaryForm };
        await api.updateIntermediary(editingIntermediary.id, patch);
      } else {
        await api.createIntermediary(intermediaryForm);
      }
      setEditingIntermediary(null);
      beginCreateIntermediary(
        (activeTab === "agents" ? "AGENT" : "BUYING_HOUSE") as "AGENT" | "BUYING_HOUSE"
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save intermediary");
    }
  };

  const removeIntermediary = async (id: number) => {
    if (!window.confirm("Delete this party?")) return;
    setError("");
    try {
      await api.deleteIntermediary(id);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete intermediary");
    }
  };

  const beginCreateLink = () => {
    setEditingLink(null);
    setLinkForm(emptyLinkForm);
  };

  const beginEditLink = (item: CustomerIntermediaryLinkResponse) => {
    setEditingLink(item);
    setLinkForm({
      customer_id: item.customer_id,
      intermediary_id: item.intermediary_id,
      is_primary: item.is_primary,
      commission_type: item.commission_type ?? undefined,
      commission_value: item.commission_value ?? undefined,
      notes: item.notes ?? "",
    });
  };

  const saveLink = async () => {
    if (!linkForm.customer_id || !linkForm.intermediary_id) {
      setError("Customer and intermediary are required.");
      return;
    }
    setError("");
    try {
      if (editingLink) {
        const patch: CustomerIntermediaryLinkUpdate = {
          customer_id: linkForm.customer_id,
          intermediary_id: linkForm.intermediary_id,
          is_primary: linkForm.is_primary,
          commission_type: linkForm.commission_type,
          commission_value: linkForm.commission_value,
          notes: linkForm.notes,
        };
        await api.updateCustomerIntermediaryLink(editingLink.id, patch);
      } else {
        await api.createCustomerIntermediaryLink(linkForm);
      }
      beginCreateLink();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save customer link");
    }
  };

  const removeLink = async (id: number) => {
    if (!window.confirm("Delete this customer link?")) return;
    setError("");
    try {
      await api.deleteCustomerIntermediaryLink(id);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete customer link");
    }
  };

  useEffect(() => {
    if (activeTab === "buying_houses") beginCreateIntermediary("BUYING_HOUSE");
    if (activeTab === "agents") beginCreateIntermediary("AGENT");
    if (activeTab === "links") beginCreateLink();
  }, [activeTab]);

  const customerName = (id: number) => customers.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Parties</h1>
        <p className="text-sm text-text-muted">
          Manage buying houses, agents, and customer intermediary assignments.
        </p>
        <p className="text-xs text-text-muted mt-1">Fields marked with ** are mandatory.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("buying_houses")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeTab === "buying_houses" ? "bg-brand-primary text-brand-primary-foreground" : "bg-surface-subtle text-text-secondary"
            }`}
          >
            Buying Houses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("agents")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeTab === "agents" ? "bg-brand-primary text-brand-primary-foreground" : "bg-surface-subtle text-text-secondary"
            }`}
          >
            Agents
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("links")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeTab === "links" ? "bg-brand-primary text-brand-primary-foreground" : "bg-surface-subtle text-text-secondary"
            }`}
          >
            Customer Links
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center text-text-muted">
          Loading parties...
        </div>
      ) : (
        <>
          {(activeTab === "buying_houses" || activeTab === "agents") && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-surface-raised overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                    <tr>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Contact</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeTab === "buying_houses" ? buyingHouses : agents).map((row) => (
                      <tr key={row.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-2 text-text-secondary">{row.code}</td>
                        <td className="px-4 py-2 font-medium text-text-primary">{row.name}</td>
                        <td className="px-4 py-2 text-text-secondary">
                          {row.contact_name || row.contact_email || row.contact_phone || "—"}
                        </td>
                        <td className="px-4 py-2 text-text-secondary">{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => beginEditIntermediary(row)}
                            className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeIntermediary(row.id)}
                            className="rounded border border-status-danger/20 px-2 py-1 text-xs text-status-danger hover:bg-status-danger-subtle"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  {editingIntermediary ? "Edit party" : "New party"}
                </h2>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Name **</label>
                  <input
                    type="text"
                    value={intermediaryForm.name}
                    onChange={(e) =>
                      setIntermediaryForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Contact person</label>
                  <input
                    type="text"
                    value={intermediaryForm.contact_name ?? ""}
                    onChange={(e) =>
                      setIntermediaryForm((prev) => ({ ...prev, contact_name: e.target.value }))
                    }
                    className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Email</label>
                    <input
                      type="email"
                      value={intermediaryForm.contact_email ?? ""}
                      onChange={(e) =>
                        setIntermediaryForm((prev) => ({ ...prev, contact_email: e.target.value }))
                      }
                      className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Phone</label>
                    <input
                      type="text"
                      value={intermediaryForm.contact_phone ?? ""}
                      onChange={(e) =>
                        setIntermediaryForm((prev) => ({ ...prev, contact_phone: e.target.value }))
                      }
                      className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Status</label>
                  <select
                    value={intermediaryForm.is_active ? "ACTIVE" : "INACTIVE"}
                    onChange={(e) =>
                      setIntermediaryForm((prev) => ({
                        ...prev,
                        is_active: e.target.value === "ACTIVE",
                      }))
                    }
                    className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={saveIntermediary}
                    className="rounded bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground"
                  >
                    {editingIntermediary ? "Update" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      beginCreateIntermediary(activeTab === "agents" ? "AGENT" : "BUYING_HOUSE")
                    }
                    className="rounded border border-border-strong px-3 py-2 text-sm text-text-secondary"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "links" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-surface-raised overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                    <tr>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Intermediary</th>
                      <th className="px-4 py-2">Commission</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((row) => (
                      <tr key={row.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-2 text-text-secondary">{customerName(row.customer_id)}</td>
                        <td className="px-4 py-2 text-text-primary font-medium">
                          {row.intermediary_name ?? row.intermediary_code ?? `#${row.intermediary_id}`}
                        </td>
                        <td className="px-4 py-2 text-text-secondary">
                          {row.commission_type || row.commission_value != null
                            ? `${row.commission_type ?? "-"} / ${row.commission_value ?? "-"}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => beginEditLink(row)}
                            className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLink(row.id)}
                            className="rounded border border-status-danger/20 px-2 py-1 text-xs text-status-danger hover:bg-status-danger-subtle"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  {editingLink ? "Edit customer link" : "New customer link"}
                </h2>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Customer **</label>
                  <select
                    value={linkForm.customer_id || ""}
                    onChange={(e) =>
                      setLinkForm((prev) => ({ ...prev, customer_id: Number(e.target.value) || 0 }))
                    }
                    className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Intermediary **</label>
                  <select
                    value={linkForm.intermediary_id || ""}
                    onChange={(e) =>
                      setLinkForm((prev) => ({
                        ...prev,
                        intermediary_id: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select intermediary...</option>
                    {allIntermediaries.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.kind})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Comm. type</label>
                    <select
                      value={linkForm.commission_type ?? ""}
                      onChange={(e) =>
                        setLinkForm((prev) => ({
                          ...prev,
                          commission_type: e.target.value
                            ? (e.target.value as "PERCENTAGE" | "FIXED")
                            : undefined,
                        }))
                      }
                      className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                    >
                      <option value="">None</option>
                      <option value="PERCENTAGE">PERCENTAGE</option>
                      <option value="FIXED">FIXED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Comm. value</label>
                    <input
                      type="number"
                      step="0.01"
                      value={linkForm.commission_value ?? ""}
                      onChange={(e) =>
                        setLinkForm((prev) => ({
                          ...prev,
                          commission_value: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={Boolean(linkForm.is_primary)}
                    onChange={(e) =>
                      setLinkForm((prev) => ({ ...prev, is_primary: e.target.checked }))
                    }
                  />
                  Primary link
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={saveLink}
                    className="rounded bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground"
                  >
                    {editingLink ? "Update" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={beginCreateLink}
                    className="rounded border border-border-strong px-3 py-2 text-sm text-text-secondary"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
