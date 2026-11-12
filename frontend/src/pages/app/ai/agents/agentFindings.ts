import type { GovernedFinding } from "@/api/client";

/** Finance findings can only be acknowledged; the server refuses to notify anyone about them. */
export function isAcknowledgeOnly(f: GovernedFinding): boolean {
  return f.suggested_action?.type === "acknowledge";
}

export const ACKNOWLEDGE_ONLY_NOTE = "Finance finding: it can only be acknowledged, nobody is notified.";
