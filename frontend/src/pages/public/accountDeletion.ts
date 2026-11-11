/** First line of every request, so the team can find deletion requests among website messages. */
export const ACCOUNT_DELETION_SUBJECT = "ACCOUNT DELETION REQUEST";

export function buildDeletionMessage(companyCode: string, details: string): string {
  const lines = [ACCOUNT_DELETION_SUBJECT, `Company code: ${companyCode.trim() || "(not given)"}`];
  const extra = details.trim();
  if (extra) lines.push("", extra);
  return lines.join("\n");
}
