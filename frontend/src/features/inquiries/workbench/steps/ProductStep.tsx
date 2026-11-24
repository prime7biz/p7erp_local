import { useState } from "react";
import { api, type InquiryCreate, type InquiryTechnicalFile } from "@/api/client";
import { DEPARTMENT_OPTIONS } from "@/features/inquiries/workbench/inquiryDepartments";
import { saveBlob } from "@/lib/fileSave";
import { logApiError } from "@/utils/logApiError";

const INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0";

type Props = {
  form: InquiryCreate;
  onPatch: (patch: Partial<InquiryCreate>) => void;
  /** Set after the inquiry is saved — needed for technical file upload. */
  inquiryId?: number | null;
  technicalFiles?: InquiryTechnicalFile[];
  onTechnicalFilesChange?: (files: InquiryTechnicalFile[]) => void;
};

export function ProductStep({
  form,
  onPatch,
  inquiryId,
  technicalFiles = [],
  onTechnicalFilesChange,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const colorText = Array.isArray(form.color_options)
    ? form.color_options.join(", ")
    : form.color_options ?? "";

  const handleColorsBlur = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onPatch({ color_options: parts.length ? parts : null });
  };

  const uploadFile = async (file: File) => {
    if (!inquiryId) return;
    setUploading(true);
    setFileError("");
    try {
      const updated = await api.uploadInquiryTechnicalFile(inquiryId, file);
      onTechnicalFilesChange?.(updated.technical_files ?? []);
    } catch (e) {
      logApiError("ProductStep.uploadTechnicalFile", e);
      setFileError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!inquiryId) return;
    if (!window.confirm("Remove this technical file?")) return;
    setFileError("");
    try {
      const updated = await api.deleteInquiryTechnicalFile(inquiryId, fileId);
      onTechnicalFilesChange?.(updated.technical_files ?? []);
    } catch (e) {
      logApiError("ProductStep.deleteTechnicalFile", e);
      setFileError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const downloadFile = async (file: InquiryTechnicalFile) => {
    if (!file.url) {
      setFileError("File URL is missing.");
      return;
    }
    try {
      const blob = await api.fetchSecureFileBlob(file.url);
      await saveBlob(blob, file.filename || file.name || "technical-file");
    } catch (e) {
      logApiError("ProductStep.downloadTechnicalFile", e);
      setFileError(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">Step 2 — Product</h2>
      <p className="text-xs text-text-muted">
        Department, brand, season and tech-pack details help merchandising and samples.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Department</span>
          <select
            value={form.department ?? ""}
            onChange={(e) => onPatch({ department: e.target.value })}
            className={INPUT}
          >
            <option value="">— Select —</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Brand</span>
          <input
            type="text"
            value={form.brand ?? ""}
            onChange={(e) => onPatch({ brand: e.target.value })}
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Season</span>
          <input
            type="text"
            value={form.season ?? ""}
            onChange={(e) => onPatch({ season: e.target.value })}
            className={INPUT}
            placeholder="e.g. SS26"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Season year</span>
          <input
            type="text"
            value={form.season_year ?? ""}
            onChange={(e) => onPatch({ season_year: e.target.value })}
            className={INPUT}
            placeholder="e.g. 2026"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-text-muted">Material composition</span>
          <input
            type="text"
            value={form.material_composition ?? ""}
            onChange={(e) => onPatch({ material_composition: e.target.value })}
            className={INPUT}
            placeholder="e.g. 100% Cotton"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Size range</span>
          <input
            type="text"
            value={form.size_range ?? ""}
            onChange={(e) => onPatch({ size_range: e.target.value })}
            className={INPUT}
            placeholder="e.g. S–XXL"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Color options</span>
          <input
            type="text"
            defaultValue={colorText}
            key={colorText}
            onBlur={(e) => handleColorsBlur(e.target.value)}
            className={INPUT}
            placeholder="Comma-separated, e.g. Navy, White"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Country of origin</span>
          <input
            type="text"
            value={form.country_of_origin ?? ""}
            onChange={(e) => onPatch({ country_of_origin: e.target.value })}
            className={INPUT}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-text-muted">Special requirements</span>
          <textarea
            value={form.special_requirements ?? ""}
            onChange={(e) => onPatch({ special_requirements: e.target.value })}
            className={INPUT}
            rows={3}
          />
        </label>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Technical files</h3>
        {!inquiryId ? (
          <p className="text-xs text-text-muted">
            Save the inquiry as a draft first, then you can upload tech packs and CAD files here.
          </p>
        ) : (
          <>
            <input
              type="file"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
                e.target.value = "";
              }}
              className="block w-full text-sm text-text-secondary"
            />
            {uploading ? <p className="text-xs text-text-muted">Uploading…</p> : null}
            {fileError ? <p className="text-xs text-status-danger">{fileError}</p> : null}
            {technicalFiles.length === 0 ? (
              <p className="text-xs text-text-muted">No technical files yet.</p>
            ) : (
              <ul className="space-y-1">
                {technicalFiles.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-text-primary">{f.name || f.filename}</span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadFile(f)}
                        className="rounded-md px-2 py-1 text-xs text-brand-primary hover:bg-surface-subtle"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteFile(f.id)}
                        className="rounded-md px-2 py-1 text-xs text-status-danger hover:bg-status-danger-subtle"
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
