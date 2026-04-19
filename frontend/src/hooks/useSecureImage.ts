import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import { resolveSafeImageUrl } from "@/utils/assetUrl";
import { logApiError } from "@/utils/logApiError";
import { toApiPathForBlobFetch } from "@/utils/secureImageUrl";

export type SecureImageFetchStatus = "empty" | "loading" | "ready" | "error";

/** Seed / demo URLs: avoid dead DNS; show a local public asset instead. */
function normalizeDemoImageUrl(raw: string): string {
  if (/^https?:\/\/cdn\.example\.com\//i.test(raw)) {
    return "/images/og-default.png";
  }
  return raw;
}

/**
 * For tenant file URLs (/api/v1/files/...) the browser cannot send Authorization on `<img src>`.
 * Fetch as blob with the API client, then expose an object URL for display.
 */
export function useSecureImageState(pathOrUrl: string | null | undefined): {
  src: string | null;
  status: SecureImageFetchStatus;
} {
  const raw = (pathOrUrl ?? "").trim();
  const normalizedRaw = normalizeDemoImageUrl(raw);

  const blobPath = toApiPathForBlobFetch(normalizedRaw);
  const needsAuthFetch = blobPath != null;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const createdRef = useRef<string | null>(null);

  useEffect(() => {
    if (createdRef.current) {
      URL.revokeObjectURL(createdRef.current);
      createdRef.current = null;
    }
    setBlobUrl(null);
    setFailed(false);

    if (!normalizedRaw) {
      return;
    }
    if (!blobPath) {
      return;
    }

    let cancelled = false;

    void api
      .fetchSecureFileBlob(blobPath)
      .then((blob) => {
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        if (createdRef.current) URL.revokeObjectURL(createdRef.current);
        createdRef.current = u;
        setBlobUrl(u);
      })
      .catch((err) => {
        logApiError("useSecureImage.fetch", err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (createdRef.current) {
        URL.revokeObjectURL(createdRef.current);
        createdRef.current = null;
      }
      setBlobUrl(null);
    };
  }, [normalizedRaw, blobPath]);

  if (!normalizedRaw) {
    return { src: null, status: "empty" };
  }

  if (!needsAuthFetch) {
    return { src: resolveSafeImageUrl(normalizedRaw), status: "ready" };
  }

  if (failed) {
    return { src: null, status: "error" };
  }
  if (blobUrl) {
    return { src: blobUrl, status: "ready" };
  }
  return { src: null, status: "loading" };
}

export function useSecureImage(pathOrUrl: string | null | undefined): string | null {
  return useSecureImageState(pathOrUrl).src;
}
