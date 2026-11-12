/** Test-only builders for statement API answers (4-decimal money strings, like the backend). */
import type { StatementEnvelope } from "@/api/financeStatements";

export function envelope<R extends string>(report: R, extra: Partial<StatementEnvelope> = {}): StatementEnvelope & { report: R } {
  return {
    report,
    company: { name: "Prime Garments Ltd", address: "Dhaka, Bangladesh", email: "accounts@prime.example" },
    period: {
      from_date: "2026-07-01",
      to_date: "2027-06-30",
      as_of_date: null,
      fiscal_year: "2026-27",
      fiscal_year_start: "2026-07-01",
      fiscal_year_end: "2027-06-30",
    },
    base_currency: "BDT",
    warnings: [],
    reconciliation: { balanced: true, difference: "0.0000" },
    data_as_of: "2026-11-12T10:00:00",
    ...extra,
  } as StatementEnvelope & { report: R };
}

export const MEMBER_ME = {
  feature_flags: { finance_statements_v2: true, fiscal_year_start_month: 7 } as Record<string, unknown>,
  role_name: "accountant",
  role_permissions: {} as Record<string, unknown>,
};
