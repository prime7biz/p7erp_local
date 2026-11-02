import { API_BASE } from "@/api/apiBase";

export type LeadPayload = {
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  company_size?: string | null;
  message: string;
  /** Honeypot: must stay empty for real visitors. */
  website?: string | null;
};

/** POST a marketing lead (Contact / Book a demo). Throws an Error with a visitor-friendly message. */
export async function submitLead(payload: LeadPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/public/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      source_page: typeof window !== "undefined" ? window.location.pathname : null,
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "Too many submissions. Please wait a minute and try again."
        : res.status === 422
          ? "Please check your email address and required fields."
          : "We could not send your request. Please try again or contact us on WhatsApp.",
    );
  }
}
