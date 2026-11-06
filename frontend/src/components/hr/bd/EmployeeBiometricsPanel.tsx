/**
 * Fingerprint / face enrollment register. The fingerprint or face template stays on the
 * attendance terminal; Prime7 only keeps the consent record, the device user number and status.
 */
import { useState } from "react";
import { api, type HrAttendanceDevice } from "@/api/client";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { ActionsMenu, Badge, Card, Field, Messages, SimpleTable, btnPrimary, inputCls } from "@/components/hr/bd/BdUi";
import { useAction, useLoad } from "@/components/hr/bd/bdHooks";

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "gray"> = {
  PENDING: "amber",
  ENROLLED: "green",
  WITHDRAWN: "red",
  DELETION_PENDING: "red",
  DELETED: "gray",
};

export function EmployeeBiometricsPanel({ employeeId }: { employeeId: number }) {
  const list = useLoad(() => hrBangladeshApi.biometricEnrollments(employeeId), [employeeId]);
  const devices = useLoad<HrAttendanceDevice[]>(() => api.listHrAttendanceDevices(), []);
  const [modality, setModality] = useState("FINGERPRINT");
  const [deviceId, setDeviceId] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("CONSENT");
  const [ack, setAck] = useState(false);
  const { busy, error, notice, run } = useAction();

  const act = (fn: () => Promise<unknown>, ok: string) => void run(async () => {
    await fn();
    await list.reload();
  }, ok);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    act(
      () =>
        hrBangladeshApi.createBiometric(employeeId, {
          modality,
          device_id: deviceId ? Number(deviceId) : null,
          lawful_basis: lawfulBasis,
          privacy_notice_acknowledged: ack,
        }),
      "Consent recorded. Now enroll the finger / face on the terminal using the device user number shown below.",
    );
    setAck(false);
  };

  const deviceName = (id: unknown) => devices.data?.find((d) => d.id === id)?.name ?? (id ? `#${String(id)}` : "Any device");

  return (
    <Card
      title="Fingerprint and face enrollment"
      description="Record the employee's consent, enroll on the attendance terminal, then confirm a test punch. The fingerprint or face template is never copied into Prime7."
    >
      <Messages error={error || list.error} notice={notice} />
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-3">
        <Field label="Type" htmlFor="bd-bio-modality">
          <select id="bd-bio-modality" className={inputCls} value={modality} onChange={(e) => setModality(e.target.value)}>
            <option value="FINGERPRINT">Fingerprint</option>
            <option value="FACE">Face</option>
          </select>
        </Field>
        <Field label="Terminal" htmlFor="bd-bio-device">
          <select id="bd-bio-device" className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Any / not decided</option>
            {(devices.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} - {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lawful basis" htmlFor="bd-bio-basis">
          <select id="bd-bio-basis" className={inputCls} value={lawfulBasis} onChange={(e) => setLawfulBasis(e.target.value)}>
            <option value="CONSENT">Employee consent</option>
            <option value="EMPLOYMENT_LAW">Required for attendance records</option>
          </select>
        </Field>
        <label className="flex items-start gap-2 text-sm text-text-secondary sm:col-span-3">
          <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          The employee was told the template stays on the terminal, only punch times reach Prime7, and they can ask for it to be deleted.
        </label>
        <div className="sm:col-span-3">
          <button type="submit" className={btnPrimary} disabled={!ack || busy}>
            Record consent
          </button>
        </div>
      </form>

      <SimpleTable
        rows={(list.data ?? []) as Row[]}
        rowKey={(r) => String(r.id)}
        empty={list.loading ? "Loading..." : "No enrollments yet."}
        columns={[
          { header: "Type", cell: (r) => String(r.modality) },
          { header: "Terminal", cell: (r) => deviceName(r.device_id) },
          { header: "Device user no.", cell: (r) => String(r.device_user_ref ?? "") },
          { header: "Status", cell: (r) => <Badge tone={STATUS_TONE[String(r.status)] ?? "gray"}>{String(r.status)}</Badge> },
          { header: "Enrolled", cell: (r) => (r.enrolled_at ? String(r.enrolled_at).slice(0, 10) : "-") },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <ActionsMenu
                items={[
                  {
                    label: "Confirm test punch",
                    hidden: r.status !== "PENDING",
                    onClick: () => act(() => hrBangladeshApi.markBiometricEnrolled(Number(r.id)), "Enrollment confirmed."),
                  },
                  {
                    label: "Withdraw consent",
                    danger: true,
                    hidden: !["PENDING", "ENROLLED"].includes(String(r.status)),
                    onClick: () => {
                      if (window.confirm("Withdraw consent? The template must then be deleted from the terminal."))
                        act(() => hrBangladeshApi.withdrawBiometric(Number(r.id)), "Consent withdrawn. Delete the template on the terminal, then confirm here.");
                    },
                  },
                  {
                    label: "Confirm deleted on terminal",
                    hidden: !["WITHDRAWN", "DELETION_PENDING"].includes(String(r.status)),
                    onClick: () => act(() => hrBangladeshApi.confirmBiometricDeletion(Number(r.id)), "Deletion confirmed."),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
