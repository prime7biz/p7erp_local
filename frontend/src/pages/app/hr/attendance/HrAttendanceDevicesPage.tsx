import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type HrAttendanceDevice,
  type HrAttendanceDeviceType,
  type HrAttendanceDeviceWithKey,
  type HrPunchFileFormat,
  type HrPunchImportSummary,
  type HrShiftResponse,
} from "@/api/client";
import { API_BASE } from "@/api/apiBase";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { ActiveBadge } from "@/components/hr/HrListParts";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { logApiError } from "@/utils/logApiError";

const PREFIX = "/app/hr";

interface DeviceForm {
  code: string;
  name: string;
  device_type: HrAttendanceDeviceType;
  serial_number: string;
  default_shift_id: string;
  push_allowed_ips: string;
}

const EMPTY_FORM: DeviceForm = {
  code: "",
  name: "",
  device_type: "ZKTECO",
  serial_number: "",
  default_shift_id: "",
  push_allowed_ips: "",
};

function pushUrl(): string {
  const base = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/api/v1/hr/attendance/device-push`;
}

function serverHost(): string {
  return typeof window !== "undefined" ? window.location.host : "";
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function HrAttendanceDevicesPage() {
  const [devices, setDevices] = useState<HrAttendanceDevice[]>([]);
  const [shifts, setShifts] = useState<HrShiftResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DeviceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [shownKey, setShownKey] = useState<HrAttendanceDeviceWithKey | null>(null);
  const [copied, setCopied] = useState(false);

  const [importDevice, setImportDevice] = useState<HrAttendanceDevice | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState<HrPunchFileFormat | "">("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<HrPunchImportSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deviceRows, shiftRows] = await Promise.all([api.listHrAttendanceDevices(), api.listHrShifts()]);
      setDevices(deviceRows);
      setShifts(shiftRows);
      setError("");
    } catch (err) {
      logApiError("hr.attendance.devices.load", err);
      setError(errorText(err, "Could not load devices"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftName = (id: number | null) => {
    if (id == null) return "—";
    const shift = shifts.find((s) => s.id === id);
    return shift ? `${shift.code} · ${shift.name}` : `#${id}`;
  };

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (d: HrAttendanceDevice) => {
    setEditId(d.id);
    setForm({
      code: d.code,
      name: d.name,
      device_type: (["GENERIC", "FINGERPRINT", "FACE"].includes(d.device_type) ? d.device_type : "ZKTECO") as HrAttendanceDeviceType,
      serial_number: d.serial_number ?? "",
      default_shift_id: d.default_shift_id != null ? String(d.default_shift_id) : "",
      push_allowed_ips: (d.push_allowed_ips ?? "").split(",").join(", "),
    });
    setFormOpen(true);
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    setError("");
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      device_type: form.device_type,
      serial_number: form.serial_number.trim() || null,
      default_shift_id: form.default_shift_id ? Number(form.default_shift_id) : null,
      push_allowed_ips: form.push_allowed_ips.trim() || null,
    };
    try {
      if (editId == null) {
        const created = await api.createHrAttendanceDevice(body);
        setShownKey(created);
        setCopied(false);
      } else {
        await api.updateHrAttendanceDevice(editId, body);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      logApiError("hr.attendance.devices.save", err);
      setError(errorText(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d: HrAttendanceDevice) => {
    if (d.is_active && !window.confirm(`Deactivate ${d.code}? It stops accepting punches until you activate it again.`)) return;
    try {
      await api.updateHrAttendanceDevice(d.id, { is_active: !d.is_active });
      await load();
    } catch (err) {
      logApiError("hr.attendance.devices.toggle", err);
      setError(errorText(err, "Update failed"));
    }
  };

  const rotateKey = async (d: HrAttendanceDevice) => {
    if (!window.confirm(`Create a new key for ${d.code}? The old key stops working immediately.`)) return;
    try {
      setShownKey(await api.rotateHrAttendanceDeviceKey(d.id));
      setCopied(false);
      await load();
    } catch (err) {
      logApiError("hr.attendance.devices.rotate", err);
      setError(errorText(err, "Could not create a new key"));
    }
  };

  const copyKey = async () => {
    if (!shownKey) return;
    try {
      await navigator.clipboard.writeText(shownKey.api_key);
      setCopied(true);
    } catch (err) {
      logApiError("hr.attendance.devices.copyKey", err);
      setError("Copy failed — select the key and copy it by hand");
    }
  };

  const openImport = (d: HrAttendanceDevice) => {
    setImportDevice(d);
    setImportFile(null);
    setImportFormat("");
    setSummary(null);
  };

  const runImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importDevice || !importFile) return;
    setImporting(true);
    setError("");
    try {
      setSummary(await api.importHrAttendancePunches(importDevice.id, importFile, importFormat || undefined));
    } catch (err) {
      logApiError("hr.attendance.devices.import", err);
      setError(errorText(err, "Import failed"));
    } finally {
      setImporting(false);
    }
  };

  const columns: HrTableColumn<HrAttendanceDevice>[] = [
    { key: "code", header: "Code", render: (d) => <span className="font-medium text-text-primary">{d.code}</span>, value: (d) => d.code },
    { key: "name", header: "Name", render: (d) => d.name, value: (d) => d.name },
    { key: "type", header: "Type", render: (d) => d.device_type, value: (d) => d.device_type, hideOnMobile: true },
    { key: "shift", header: "Default shift", render: (d) => shiftName(d.default_shift_id), value: (d) => shiftName(d.default_shift_id), hideOnMobile: true },
    {
      key: "key",
      header: "Key starts with",
      render: (d) => <span className="font-mono text-xs">p7d_{d.api_key_prefix}_…</span>,
      noExport: true,
      hideOnMobile: true,
    },
    {
      key: "last_push",
      header: "Last push",
      render: (d) => (
        <span className="text-xs text-text-muted">{d.last_seen_at ? new Date(`${d.last_seen_at}Z`).toLocaleString() : "Never"}</span>
      ),
      value: (d) => d.last_seen_at,
    },
    {
      key: "status",
      header: "Status",
      render: (d) => (
        <span>
          <ActiveBadge active={d.is_active} />
          {d.iclock_ready && <span className="block text-xs text-text-muted">Cloud push on</span>}
        </span>
      ),
      value: (d) => (d.is_active ? "Active" : "Inactive"),
    },
  ];

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Attendance devices"
        description="Register fingerprint / card machines, import their punch files, and let them send punches automatically. Punches become daily attendance (source DEVICE)."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Attendance devices" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          The device user code (PIN) is matched to the employee&apos;s <strong>Device PIN</strong> (on the employee
          form), otherwise to the employee code. Weekend days and overtime pay are set on{" "}
          <Link to={`${PREFIX}/settings`} className="underline">
            HR Settings
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Add device
        </button>
      </div>

      <HrDataTable
        rows={devices}
        rowKey={(d) => d.id}
        columns={columns}
        loading={loading}
        error={devices.length === 0 ? error : undefined}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No devices yet."
        emptyHint="Use Add device to register your first attendance machine."
        searchPlaceholder="Search code, name, type or shift…"
        statusOf={(d) => (d.is_active ? "Active" : "Inactive")}
        rowActions={(d) => [
          { key: "edit", label: "Edit", primary: true, onClick: () => openEdit(d) },
          { key: "import", label: "Import punches", primary: true, onClick: () => openImport(d) },
          { key: "rotate", label: "Rotate key", danger: true, onClick: () => void rotateKey(d) },
          {
            key: "toggle",
            label: d.is_active ? "Deactivate" : "Activate",
            danger: d.is_active,
            onClick: () => void toggleActive(d),
          },
        ]}
      />

      <HrFormDrawer
        open={formOpen}
        title={editId == null ? "Add device" : "Edit device"}
        onClose={() => setFormOpen(false)}
        onSubmit={saveForm}
        submitting={saving}
        error={error}
      >
        <label className="block text-sm">
          Code
          <input
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.code}
            maxLength={32}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            required
          />
        </label>
        <label className="block text-sm">
          Name
          <input
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.name}
            maxLength={128}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="block text-sm">
          Type
          <select
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.device_type}
            onChange={(e) => setForm((f) => ({ ...f, device_type: e.target.value as HrAttendanceDeviceType }))}
          >
            <option value="ZKTECO">ZKTeco</option>
            <option value="FINGERPRINT">Fingerprint terminal</option>
            <option value="FACE">Face recognition terminal</option>
            <option value="GENERIC">Other (CSV / JSON)</option>
          </select>
        </label>
        <label className="block text-sm">
          Serial number (optional)
          <input
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.serial_number}
            maxLength={64}
            onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Cloud push: allowed IP addresses (optional)
          <input
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.push_allowed_ips}
            maxLength={1024}
            placeholder="e.g. 103.4.145.10 or 103.4.145.0/24"
            onChange={(e) => setForm((f) => ({ ...f, push_allowed_ips: e.target.value }))}
          />
          <span className="mt-1 block text-xs text-text-muted">
            For ZKTeco machines with a &quot;Cloud Server&quot; setting: enter the factory&apos;s public internet IP
            (comma-separated). Cloud push works only when the serial number and this list are both filled in. On the
            machine, set the server address to <code>{serverHost()}</code>.
          </span>
        </label>
        <label className="block text-sm">
          Default shift (used when an employee has no roster for the day)
          <select
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.default_shift_id}
            onChange={(e) => setForm((f) => ({ ...f, default_shift_id: e.target.value }))}
          >
            <option value="">No default shift</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})
              </option>
            ))}
          </select>
        </label>
      </HrFormDrawer>

      {shownKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl space-y-3 rounded-xl border border-border bg-surface-raised p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary">API key for {shownKey.code}</h3>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Copy this key now. It is shown only once — P7 keeps only a fingerprint of it. If it is lost, use{" "}
              <strong>Rotate key</strong> to make a new one.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded border bg-surface-subtle px-2 py-1.5 text-xs">{shownKey.api_key}</code>
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void copyKey()}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="space-y-1 text-xs text-text-muted">
              <p>To let the device (or its bridge program) send punches automatically:</p>
              <p>
                POST <code className="break-all">{pushUrl()}</code>
              </p>
              <p>
                Header <code>X-Device-Key: &lt;this key&gt;</code>; body JSON{" "}
                <code>{'[{"employee_code":"E001","punched_at":"2026-11-05 08:01"}]'}</code> or ZKTeco attendance log lines
                as plain text.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white"
                onClick={() => setShownKey(null)}
              >
                I have saved the key
              </button>
            </div>
          </div>
        </div>
      )}

      {importDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={runImport}
            className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl border border-border bg-surface-raised p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-text-primary">Import punches — {importDevice.code}</h3>
            <p className="text-xs text-text-muted">
              CSV columns <code>employee_code,punched_at,direction</code> (direction optional), a ZKTeco attendance log
              (<code>attlog.dat</code> / .txt) or a JSON list. Up to 5,000 punches per file. Importing the same file again
              adds nothing.
            </p>
            <input
              type="file"
              accept=".csv,.txt,.dat,.json"
              className="block w-full text-sm"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null);
                setSummary(null);
              }}
              required
            />
            <label className="block text-sm">
              File type
              <select
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as HrPunchFileFormat | "")}
              >
                <option value="">Detect automatically</option>
                <option value="csv">CSV</option>
                <option value="zkteco">ZKTeco attendance log</option>
                <option value="json">JSON</option>
              </select>
            </label>

            {summary && (
              <div className="space-y-1 rounded-lg border border-border bg-surface-subtle p-3 text-sm">
                <div>
                  Received {summary.received} · new punches {summary.inserted} · already imported {summary.duplicates}
                </div>
                <div>
                  Attendance: created {summary.entries_created} · updated {summary.entries_updated} · unchanged{" "}
                  {summary.entries_unchanged}
                </div>
                {summary.skipped_manual > 0 && (
                  <div>Kept {summary.skipped_manual} day(s) entered or corrected by hand.</div>
                )}
                {summary.skipped_locked > 0 && (
                  <div>Skipped {summary.skipped_locked} day(s) in a locked payroll period.</div>
                )}
                {summary.unmatched_codes.length > 0 && (
                  <div className="text-status-danger-foreground">
                    Unknown employee codes ({summary.unmatched_punches} punches): {summary.unmatched_codes.join(", ")}
                  </div>
                )}
                {summary.invalid_count > 0 && (
                  <div className="text-status-danger-foreground">
                    {summary.invalid_count} line(s) could not be read:
                    <ul className="ml-4 list-disc text-xs">
                      {summary.invalid_lines.slice(0, 10).map((l) => (
                        <li key={l.line}>
                          Line {l.line}: {l.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setImportDevice(null)}>
                Close
              </button>
              <button
                type="submit"
                disabled={importing || !importFile}
                className="rounded bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {importing ? "Importing..." : "Import"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
