import type { CSSProperties } from "react";

import { useSecureImageState } from "@/hooks/useSecureImage";
import { cn } from "@/lib/utils";

type Props = {
  url: string | null | undefined;
  alt: string;
  className?: string;
  style?: CSSProperties;
};

/** Renders tenant-scoped images that require JWT (paths under /api/v1/files/). */
export function SecureImage({ url, alt, className, style }: Props) {
  const { src, status } = useSecureImageState(url);
  const raw = (url ?? "").trim();
  if (!raw) return null;

  const showBackdrop = status === "loading" || status === "error";

  return (
    <span
      className={cn("relative inline-block overflow-hidden", className)}
      style={style}
    >
      {showBackdrop ? (
        <span
          className={cn(
            "absolute inset-0 block bg-surface-subtle",
            status === "loading" && "animate-pulse",
            status === "error" && "border border-dashed border-border",
          )}
          aria-hidden
        />
      ) : null}
      {src ? (
        <img
          src={src}
          alt={alt}
          className="relative z-[1] block h-full w-full object-cover"
          loading="lazy"
        />
      ) : null}
    </span>
  );
}
