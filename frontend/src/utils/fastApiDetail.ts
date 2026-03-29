/** Normalize FastAPI `HTTPException(detail=...)` shapes for UI and logging. */

export function parseFastApiErrorDetail(detail: unknown): { message: string; code: string | null } {
  if (typeof detail === "string") {
    return { message: detail, code: null };
  }
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const o = detail as Record<string, unknown>;
    const message =
      typeof o.message === "string"
        ? o.message
        : typeof o.msg === "string"
          ? o.msg
          : "Request failed";
    const code = typeof o.code === "string" ? o.code : null;
    return { message, code };
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (typeof first?.msg === "string") {
      return { message: first.msg, code: null };
    }
  }
  return { message: "Request failed", code: null };
}
