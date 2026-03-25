import { useCallback, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractionStatus } from "@/types/extraction";

const DEFAULT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

type Props = {
  title: string;
  subtitle: string;
  status: ExtractionStatus;
  error?: string | null;
  onExtract: (file: File) => void | Promise<void>;
  onClear: () => void;
  maxSizeMB?: number;
  accept?: string;
  disabled?: boolean;
};

function validateFile(file: File, maxSizeMB: number, accept: string): string | null {
  const types = accept.split(",").map((t) => t.trim().toLowerCase());
  const mime = (file.type || "").toLowerCase();
  if (!types.some((t) => mime === t || (t === "image/jpg" && mime === "image/jpeg"))) {
    return "Please use PNG, JPEG, WebP, or PDF.";
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return `File is too large (max ${maxSizeMB} MB).`;
  }
  return null;
}

export function FileImportCard({
  title,
  subtitle,
  status,
  error,
  onExtract,
  onClear,
  maxSizeMB = 10,
  accept = DEFAULT_ACCEPT,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const busy = status === "uploading";

  const pickFile = useCallback(
    (f: File | null) => {
      setLocalError(null);
      if (!f) {
        setFile(null);
        return;
      }
      const err = validateFile(f, maxSizeMB, accept);
      if (err) {
        setLocalError(err);
        setFile(null);
        return;
      }
      setFile(f);
    },
    [accept, maxSizeMB],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    pickFile(f);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const handleExtract = async () => {
    if (!file || disabled || busy) return;
    setLocalError(null);
    await onExtract(file);
  };

  const handleClear = () => {
    setFile(null);
    setLocalError(null);
    onClear();
  };

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <p className="text-text-secondary mt-1 text-sm">{subtitle}</p>

      <div
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors",
          dragOver ? "border-brand-primary bg-brand-primary/5" : "border-border-strong bg-surface-subtle",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={onInputChange}
          disabled={disabled || busy}
        />
        <Upload className="text-text-muted h-8 w-8" />
        <p className="text-text-primary mt-2 text-sm font-medium">Drag and drop a file here</p>
        <p className="text-text-muted mt-1 text-xs">or click to browse — PNG, JPEG, WebP, PDF — max {maxSizeMB} MB</p>
      </div>

      {file ? (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="text-text-muted h-4 w-4 shrink-0" />
            <span className="truncate text-text-primary">{file.name}</span>
          </div>
          <button
            type="button"
            className="text-text-muted hover:text-text-primary rounded p-1"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            disabled={busy}
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {(localError || error) && (
        <div className="text-status-danger mt-2 flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{localError || error}</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-border-strong bg-surface-base px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-subtle"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          disabled={disabled || busy}
        >
          Upload file
        </button>
        <button
          type="button"
          className="bg-brand-primary hover:bg-brand-primary/90 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={handleExtract}
          disabled={!file || disabled || busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Extract data
        </button>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
          onClick={handleClear}
          disabled={busy}
        >
          Clear imported data
        </button>
      </div>
    </section>
  );
}
