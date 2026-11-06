/** Build the QR link printed on documents: a public page anyone can open without signing in. */

export function fullUrlFromApiPath(path: string | null | undefined): string {
  if (!path) return "";
  const p = path.trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
}

/** Public verification page for a QR verification id (e.g. "VFY-0123456789ABCDEF"). */
export function publicVerifyUrl(verificationId: string | null | undefined): string {
  const vid = (verificationId ?? "").trim();
  if (!vid) return "";
  return fullUrlFromApiPath(`/verify/document/${encodeURIComponent(vid)}`);
}

/** Last path segment of an older API verify path, e.g. "/api/v1/.../verify/VFY-..." → "VFY-...". */
function verificationIdFromPath(path: string | null | undefined): string {
  const p = (path ?? "").trim().replace(/\/+$/, "");
  const last = p.split("/").pop() ?? "";
  return last.toUpperCase().startsWith("VFY-") ? decodeURIComponent(last) : "";
}

export function inventoryPrintVerifyUrl(payload: {
  verification_path?: string | null;
  document: Record<string, unknown>;
  print_meta?: { verification_url?: string | null };
}): string {
  const raw = payload.document?.verification_id;
  const vid =
    (typeof raw === "string" ? raw.trim() : "") ||
    verificationIdFromPath(payload.print_meta?.verification_url) ||
    verificationIdFromPath(payload.verification_path);
  return publicVerifyUrl(vid);
}

export type VoucherPrintLike = {
  print_meta?: { verification_url?: string | null };
  voucher: { verification_id?: string | null };
};

export function voucherPrintVerificationUrl(data: VoucherPrintLike | null | undefined): string {
  if (!data) return "";
  const vid = data.voucher.verification_id?.trim() || verificationIdFromPath(data.print_meta?.verification_url);
  return publicVerifyUrl(vid);
}
