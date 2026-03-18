import { useEffect, useState } from "react";
import { api, type HrEssProfileResponse, type HrEssProfileUpdate } from "@/api/client";

export function HrMyProfilePage() {
  const [profile, setProfile] = useState<HrEssProfileResponse | null>(null);
  const [form, setForm] = useState<HrEssProfileUpdate>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const load = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const row = await api.getHrEssMyProfile();
      setProfile(row);
      setForm({
        email: row.email,
        phone: row.phone,
        address_line: row.address_line,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateHrEssMyProfile(form);
      setProfile(updated);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">My Profile</h1>
        <p className="text-sm text-text-muted">View and update your own contact profile.</p>
      </div>
      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}
      {success && <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">{success}</div>}

      {loading || !profile ? (
        <div className="rounded-lg border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">Loading profile...</div>
      ) : (
        <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface-raised p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="text-sm text-text-secondary">
            <span className="font-medium">Employee:</span> {profile.employee_code} - {profile.full_name}
          </div>
          <div className="text-sm text-text-secondary">
            <span className="font-medium">Department:</span> {profile.department ?? "-"}
          </div>
          <div className="text-sm text-text-secondary sm:col-span-2">
            <span className="font-medium">Designation:</span> {profile.designation ?? "-"}
          </div>
          <input
            type="email"
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Email"
            value={form.email ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <input
            type="text"
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <input
            type="text"
            className="rounded border border-border px-3 py-2 text-sm sm:col-span-2"
            placeholder="Address"
            value={form.address_line ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, address_line: e.target.value }))}
          />
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
