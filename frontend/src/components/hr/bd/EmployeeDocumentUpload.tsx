/**
 * Upload a CV, NID / birth registration scan or certificate (PDF or photo; phone camera works too).
 * Files are stored encrypted in private storage; download is audited.
 */
import { useState } from "react";
import { hrBangladeshApi } from "@/api/hrBangladesh";
import { Card, Field, Messages, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { useAction } from "@/components/hr/bd/bdHooks";

export const UPLOAD_DOCUMENT_TYPES = [
  ["CV", "CV / resume"],
  ["NID_SCAN", "NID scan"],
  ["BIRTH_REGISTRATION_SCAN", "Birth registration scan"],
  ["CERTIFICATE", "Certificate"],
  ["MEDICAL", "Medical"],
  ["OTHER", "Other"],
] as const;

export const SECURE_FILE_PREFIX = "hr_secure:document:";

export function EmployeeDocumentUpload({ employeeId, onUploaded }: { employeeId: number; onUploaded: () => void }) {
  const [docType, setDocType] = useState("CV");
  const [file, setFile] = useState<File | null>(null);
  const { busy, error, notice, run } = useAction();

  const upload = () =>
    file &&
    void run(async () => {
      await hrBangladeshApi.uploadEmployeeDocument(employeeId, file, docType, file.name);
      setFile(null);
      onUploaded();
    }, "File uploaded.");

  return (
    <Card title="Upload CV or scanned document" description="PDF, JPG, PNG or WebP up to the server size limit. On a phone, 'Scan with camera' opens the back camera.">
      <Messages error={error} notice={notice} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Document type" htmlFor="bd-doc-type">
          <select id="bd-doc-type" className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
            {UPLOAD_DOCUMENT_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <label className={`${btnSecondary} cursor-pointer`}>
            Choose file
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className={`${btnSecondary} cursor-pointer`}>
            Scan with camera
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <span className="text-sm text-text-muted">{file ? file.name : "No file chosen"}</span>
          <button type="button" className={btnPrimary} disabled={!file || busy} onClick={upload}>
            {busy ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </Card>
  );
}
