/** Display labels shared by the Bangladesh HR screens. */

export const SEPARATION_TYPE_LABELS: Record<string, string> = {
  RESIGNATION: "Resignation (s.27)",
  DEEMED_RESIGNATION: "Unauthorised absence (s.27(3A))",
  TERMINATION: "Termination by employer (s.26)",
  RETRENCHMENT: "Retrenchment (s.20)",
  DISMISSAL: "Dismissal for misconduct (s.23)",
  RETIREMENT: "Retirement (s.28)",
  DEATH: "Death (s.19)",
};

export const ENFORCEMENT_LABELS: Record<string, { title: string; help: string }> = {
  hr_bd_minimum_wage_enforcement_enabled: {
    title: "Minimum wage",
    help: "Refuse a salary assignment or payroll line below the employee's Gazette grade (basic and gross).",
  },
  hr_bd_leave_accrual_enforcement_enabled: {
    title: "Earned leave accrual",
    help: "Allow applying 1 day per 18 worked days to the BD-EL balance (40-day cap after one continuous year).",
  },
  hr_bd_maternity_enforcement_enabled: {
    title: "Maternity benefit",
    help: "Maternity cases: 120 days, pay = monthly gross ÷ 26 per day, eligibility of 6 months' service and fewer than 2 surviving children.",
  },
  hr_bd_festival_compensation_enabled: {
    title: "Festival-day work",
    help: "Work on a festival holiday gives 2 days' compensatory wage plus an alternative holiday.",
  },
  hr_bd_service_benefits_enabled: {
    title: "Service benefits",
    help: "Gratuity / resignation / termination / death benefit cases and their use in final settlements.",
  },
};
