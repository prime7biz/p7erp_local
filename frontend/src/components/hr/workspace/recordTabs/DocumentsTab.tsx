import { useCallback, useEffect, useState } from "react";
import { api, type HrEmployeeDocumentCreate } from "@/api/client";
import { hrBangladeshApi } from "@/api/hrBangladesh";
import { ActionsMenu } from "@/components/hr/bd/BdUi";
import { EmployeeDocumentUpload, SECURE_FILE_PREFIX } from "@/components/hr/bd/EmployeeDocumentUpload";
import { logApiError } from "@/utils/logApiError";
import { downloadBlob, errorText, type RecordTabProps } from "./shared";

const EMPTY_DOC: HrEmployeeDocumentCreate = { document_type: "NID", document_number: "", issue_date: "", expiry_date: "", notes: "" };

export function DocumentsTab({ employee, onError, onSuccess }: RecordTabProps) {
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof api.listHrEmployeeDocuments>>>([]);
  const [docForm, setDocForm] = useState<HrEmployeeDocumentCreate>(EMPTY_DOC);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocuments(await api.listHrEmployeeDocuments(employee.id));
    } catch (e) {
      logApiError("DocumentsTab.load", e);
      setDocuments([]);
    }
  }, [employee.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createHrEmployeeDocument(employee.id, {
        document_type: docForm.document_type.trim(),
        document_number: docForm.document_number?.trim() || null,
        issue_date: docForm.issue_date || null,
        expiry_date: docForm.expiry_date || null,
        notes: docForm.notes?.trim() || null,
      });
      setDocForm(EMPTY_DOC);
      await load();
      onSuccess("Document added.");
    } catch (err) {
      onError(errorText(err, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <EmployeeDocumentUpload employeeId={employee.id} onUploaded={() => void load()} />
      <form onSubmit={addDocument} className="rounded-xl border border-border bg-surface-raised p-4 grid gap-2 sm:grid-cols-2">
        <input className="rounded border px-2 py-1 text-sm" placeholder="Document type" value={docForm.document_type} onChange={(e) => setDocForm((p) => ({ ...p, document_type: e.target.value }))} />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Document number" value={docForm.document_number ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, document_number: e.target.value }))} />
        <input type="date" className="rounded border px-2 py-1 text-sm" value={docForm.issue_date ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, issue_date: e.target.value }))} />
        <input type="date" className="rounded border px-2 py-1 text-sm" value={docForm.expiry_date ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, expiry_date: e.target.value }))} />
        <input className="sm:col-span-2 rounded border px-2 py-1 text-sm" placeholder="Notes" value={docForm.notes ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} />
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add document record
          </button>
        </div>
      </form>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-4 py-2 text-left text-xs uppercase">Type</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Number</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Expiry</th>
              <th className="px-4 py-2 text-right text-xs uppercase">File</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-4 py-2">{d.document_type}</td>
                <td className="px-4 py-2">{d.document_number ?? "—"}</td>
                <td className="px-4 py-2">{d.expiry_date ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  {(d.file_path ?? "").startsWith(SECURE_FILE_PREFIX) ? (
                    <ActionsMenu
                      items={[
                        {
                          label: "Download",
                          onClick: () =>
                            void (async () => {
                              try {
                                const blob = await hrBangladeshApi.employeeDocumentBlob(employee.id, d.id);
                                const ext = blob.type === "application/pdf" ? "pdf" : blob.type.split("/")[1] || "bin";
                                downloadBlob(blob, `${employee.employee_code}-${d.document_type.toLowerCase()}-${d.id}.${ext}`);
                              } catch (err) {
                                onError(errorText(err, "Download failed"));
                              }
                            })(),
                        },
                      ]}
                    />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
