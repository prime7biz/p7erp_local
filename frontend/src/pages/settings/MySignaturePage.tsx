import { useEffect, useRef, useState } from "react";
import { api, type MySignature } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useSecureImageState } from "@/hooks/useSecureImage";
import { logApiError } from "@/utils/logApiError";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

/**
 * Self-service page: each user sets the designation and signature image that print in the
 * "Approved By" / "Posted By" blocks of documents they approve.
 */
export function MySignaturePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [signature, setSignature] = useState<MySignature | null>(null);
  const [designation, setDesignation] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { src: previewSrc, status: previewStatus } = useSecureImageState(signature?.signature_image_url);

  useEffect(() => {
    api
      .getMySignature()
      .then((data) => {
        setSignature(data);
        setDesignation(data.designation ?? "");
      })
      .catch((e) => {
        logApiError("MySignaturePage.getMySignature", e);
        setError(e instanceof Error ? e.message : "Failed to load your signature");
      })
      .finally(() => setLoading(false));
  }, []);

  const showResult = (message: string) => {
    setError("");
    setSuccess(message);
  };

  const handleSaveDesignation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess("");
    try {
      const updated = await api.updateMySignature({ designation: designation.trim() || null });
      setSignature(updated);
      setDesignation(updated.designation ?? "");
      showResult("Designation saved.");
    } catch (err) {
      logApiError("MySignaturePage.updateMySignature", err);
      setError(err instanceof Error ? err.message : "Failed to save designation");
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSuccess("");
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large (max 2 MB).");
      return;
    }
    setUploading(true);
    try {
      const updated = await api.uploadMySignatureImage(file);
      setSignature(updated);
      showResult("Signature image uploaded.");
    } catch (err) {
      logApiError("MySignaturePage.uploadMySignatureImage", err);
      setError(err instanceof Error ? err.message : "Failed to upload signature image");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    setUploading(true);
    setSuccess("");
    try {
      const updated = await api.deleteMySignatureImage();
      setSignature(updated);
      showResult("Signature image removed.");
    } catch (err) {
      logApiError("MySignaturePage.deleteMySignatureImage", err);
      setError(err instanceof Error ? err.message : "Failed to remove signature image");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <p className="p-4 text-sm text-text-muted">Loading your signature...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <AppPageHeader
        title="My Signature"
        description="When you check, approve or post a voucher, delivery challan, gate pass, GRN or other document, your name, designation, date and signature image are printed in its signature block."
      />

      {(error || success) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
              {success}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSaveDesignation} className="space-y-4 rounded-xl border border-border bg-surface-raised p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Name</label>
          <p className="text-text-primary">{signature?.display_name ?? "—"}</p>
          <p className="mt-0.5 text-xs text-text-muted">Taken from your user account (first and last name).</p>
        </div>
        <div>
          <label htmlFor="my-signature-designation" className="mb-1 block text-sm font-medium text-text-secondary">
            Designation
          </label>
          <input
            id="my-signature-designation"
            type="text"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm"
            placeholder="e.g. Finance Manager"
            maxLength={128}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save designation"}
        </button>
      </form>

      <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-6">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Signature image</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Sign on white paper, scan or photograph it, and crop tightly. PNG with a transparent background looks
            best. PNG, JPG or WEBP, up to 2 MB.
          </p>
        </div>

        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border bg-white">
          {previewSrc ? (
            <img src={previewSrc} alt="Your signature" className="max-h-24 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-text-muted">
              {previewStatus === "loading" ? "Loading preview…" : "No signature image uploaded yet."}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {uploading ? "Working…" : signature?.signature_image_url ? "Replace image" : "Upload image"}
          </button>
          {signature?.signature_image_url ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleRemoveImage()}
              className="rounded-lg border border-border px-4 py-2 text-sm text-status-danger hover:bg-status-danger-subtle disabled:opacity-50"
            >
              Remove image
            </button>
          ) : null}
        </div>
        <p className="text-xs text-text-muted">
          Documents you already approved will show the new image the next time they are printed.
        </p>
      </div>
    </div>
  );
}
