import { useEffect, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorialImageProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  /** Tailwind max-height class for the inline preview (default `max-h-72`). */
  previewClassName?: string;
}

/** Screenshot / diagram with caption. Click to open a full-size view (Esc or click to close). */
export function TutorialImage({ src, alt, caption, className, previewClassName }: TutorialImageProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <figure className={cn("my-4", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in rounded-lg border border-border bg-surface-subtle p-0"
        aria-label={`Enlarge image: ${alt}`}
      >
        <img
          src={src}
          alt={alt}
          className={cn("w-full rounded-lg object-contain", previewClassName ?? "max-h-72")}
          loading="lazy"
        />
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
          <ZoomIn className="h-3 w-3" aria-hidden />
          Enlarge
        </span>
      </button>
      {caption ? <figcaption className="mt-2 text-center text-xs text-text-muted">{caption}</figcaption> : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close enlarged image"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <img src={src} alt={alt} className="max-h-[85vh] max-w-full rounded-lg bg-white object-contain" />
          {caption ? <p className="mt-3 max-w-3xl text-center text-sm text-white/90">{caption}</p> : null}
        </div>
      ) : null}
    </figure>
  );
}
