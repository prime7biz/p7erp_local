import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import { resolveSafeImageUrl } from "@/utils/assetUrl";
import { logApiError } from "@/utils/logApiError";
import { toApiPathForBlobFetch } from "@/utils/secureImageUrl";

/**
 * For tenant file URLs (/api/v1/files/...) the browser cannot send Authorization on `<img src>`.
 * Fetch as blob with the API client, then expose an object URL for display.
 * Supports relative paths and absolute URLs to the same API origin (see secureImageUrl.ts).
 */
export function useSecureImage(pathOrUrl: string | null | undefined): string | null {
  const raw = (pathOrUrl ?? "").trim();
  const blobPath = toApiPathForBlobFetch(raw);
  const needsAuthFetch = blobPath != null;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const createdRef = useRef<string | null>(null);

  useEffect(() => {
    createdRef.current = null;
    if (!raw || !blobPath) {
      setBlobUrl(null);
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
        if (!cancelled) setBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (createdRef.current) {
        URL.revokeObjectURL(createdRef.current);
        createdRef.current = null;
      }
      setBlobUrl(null);
    };
  }, [raw, blobPath]);

  if (!raw) return null;
  if (/^https?:\/\/cdn\.example\.com\//i.test(raw)) return null;
  if (needsAuthFetch) return blobUrl;
  return resolveSafeImageUrl(raw);
}
