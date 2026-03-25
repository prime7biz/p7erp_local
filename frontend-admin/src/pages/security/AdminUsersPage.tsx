import { useEffect, useState } from "react";
import {
  listPlatformAdmins,
  createPlatformAdmin,
  patchPlatformAdmin,
  deletePlatformAdmin,
  type PlatformAdminItem,
} from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/context/ToastContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function roleBadge(role: string) {
  const r = role.toLowerCase();
  if (r === "super_admin") return "bg-violet-100 text-violet-900";
  if (r === "support_agent") return "bg-sky-100 text-sky-900";
  if (r === "billing_admin") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

export function AdminUsersPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PlatformAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "support_agent" });
  const [deactivateId, setDeactivateId] = useState<number | null>(null);

  function load() {
    setErr(null);
    listPlatformAdmins()
      .then((r) => setItems(r.items ?? []))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    try {
      await createPlatformAdmin({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      showToast("Admin created", "success");
      setDrawer(false);
      setForm({ username: "", email: "", password: "", role: "support_agent" });
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (loading && items.length === 0) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Platform admins"
        description="Users who can access this console (super admin only)."
        actions={
          <button type="button" onClick={() => setDrawer(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            New admin
          </button>
        }
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (a) => a.id },
          { key: "u", header: "Username", cell: (a) => a.username },
          { key: "e", header: "Email", cell: (a) => a.email },
          {
            key: "r",
            header: "Role",
            cell: (a) => (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadge(a.role)}`}>
                {a.role.replace(/_/g, " ")}
              </span>
            ),
          },
          {
            key: "a",
            header: "Active",
            cell: (a) => (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${a.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                {a.is_active ? "Yes" : "No"}
              </span>
            ),
          },
          {
            key: "x",
            header: "",
            cell: (a) => (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="text-xs text-indigo-600"
                  onClick={() => {
                    const role = window.prompt("New role (super_admin, support_agent, billing_admin)", a.role);
                    if (role == null) return;
                    patchPlatformAdmin(a.id, { role }).then(() => {
                      showToast("Updated", "success");
                      load();
                    });
                  }}
                >
                  Role
                </button>
                <button
                  type="button"
                  className="text-xs text-amber-700"
                  onClick={() =>
                    patchPlatformAdmin(a.id, { is_active: !a.is_active }).then(() => {
                      showToast("Updated", "success");
                      load();
                    })
                  }
                >
                  Toggle active
                </button>
                <button type="button" className="text-xs text-red-600" onClick={() => setDeactivateId(a.id)}>
                  Deactivate
                </button>
              </div>
            ),
          },
        ]}
        rows={items}
        rowKey={(a) => a.id}
        emptyMessage="No platform admins found."
      />

      <SideDrawer open={drawer} onClose={() => setDrawer(false)} title="New platform admin">
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs text-slate-500">Username</label>
            <input className="mt-1 w-full rounded border px-2 py-1" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Email</label>
            <input className="mt-1 w-full rounded border px-2 py-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Password (min 10 chars)</label>
            <input type="password" className="mt-1 w-full rounded border px-2 py-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Role</label>
            <select className="mt-1 w-full rounded border px-2 py-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="super_admin">super_admin</option>
              <option value="support_agent">support_agent</option>
              <option value="billing_admin">billing_admin</option>
            </select>
          </div>
          <button type="button" onClick={create} className="w-full rounded-lg bg-indigo-600 py-2 text-white font-semibold">
            Create
          </button>
        </div>
      </SideDrawer>

      <ConfirmDialog
        open={deactivateId != null}
        onClose={() => setDeactivateId(null)}
        onConfirm={async () => {
          if (deactivateId == null) return;
          const id = deactivateId;
          setDeactivateId(null);
          await deletePlatformAdmin(id);
          showToast("Deactivated", "success");
          load();
        }}
        title="Deactivate admin?"
        message="This sets is_active to false for this platform admin."
        danger
      />
    </div>
  );
}
