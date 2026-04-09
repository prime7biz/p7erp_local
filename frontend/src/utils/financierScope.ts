/** Match backend `app.external_access.constants.SCOPE_RANK` for nav gating. */

export const FINANCIER_SCOPES = {
  tenant_summary: 1,
  orders_and_pipeline: 2,
  financial_summary: 3,
  credit_monitoring: 4,
  full_financier_portal: 5,
} as const;

export type FinancierScopeKey = keyof typeof FINANCIER_SCOPES;

export function financierScopeAtLeast(granted: string | null | undefined, required: FinancierScopeKey): boolean {
  const r = FINANCIER_SCOPES[required];
  if (r == null) return false;
  let g = granted ? FINANCIER_SCOPES[granted as FinancierScopeKey] : undefined;
  if (g == null) {
    /* Older JWT / me payloads without scope: align with default invite scope */
    g = FINANCIER_SCOPES.orders_and_pipeline;
  }
  return g >= r;
}
