/** Build absolute URL for QR / print when API returns a relative path. */

export function fullUrlFromApiPath(path: string | null | undefined): string {
  if (!path) return "";
  const p = path.trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
}

export function inventoryPrintVerifyUrl(payload: {
  verification_path?: string | null;
  document: Record<string, unknown>;
  print_meta?: { verification_url?: string | null };
}): string {
  const meta = payload.print_meta?.verification_url?.trim();
  if (meta) return fullUrlFromApiPath(meta);
  const fromPath = payload.verification_path?.trim();
  if (fromPath) return fullUrlFromApiPath(fromPath);
  const raw = payload.document?.verification_id;
  const vid = typeof raw === "string" ? raw.trim() : "";
  if (!vid) return "";
  return fullUrlFromApiPath(`/api/v1/inventory/documents/verify/${encodeURIComponent(vid)}`);
}

export type VoucherPrintLike = {
  print_meta?: { verification_url?: string | null };
  voucher: { verification_id?: string | null };
};

export function voucherPrintVerificationUrl(data: VoucherPrintLike | null | undefined): string {
  if (!data) return "";
  const meta = data.print_meta?.verification_url?.trim();
  if (meta) return fullUrlFromApiPath(meta);
  const vid = data.voucher.verification_id?.trim();
  if (!vid) return "";
  return fullUrlFromApiPath(`/api/v1/finance/vouchers/verify/${encodeURIComponent(vid)}`);
}
