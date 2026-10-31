/**
 * Shared chart palette from design tokens (CSS variables).
 * Prefer these over hard-coded hex so light/dark themes stay in sync.
 */
export const CHART_COLORS = [
  "var(--color-brand-primary)", // Orange — Primary metric
  "var(--color-accent-secondary)", // Teal — Secondary
  "var(--color-status-info)", // Blue — Informational
  "var(--color-status-success)", // Green — Positive
  "var(--color-status-warning)", // Amber — Caution
  "var(--color-status-danger)", // Red — Critical
  "var(--color-status-neutral)", // Slate — Miscellaneous
] as const;

/** Hex fallbacks when a chart library cannot paint CSS variables (rare). */
export const CHART_COLORS_LIGHT = [
  "#ea580c",
  "#0d9488",
  "#0284c7",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#78716c",
] as const;

export const CHART_COLORS_DARK = [
  "#fb923c",
  "#2dd4bf",
  "#38bdf8",
  "#4ade80",
  "#fbbf24",
  "#f87171",
  "#a8a29e",
] as const;

export type ChartColor = (typeof CHART_COLORS)[number];

export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0];
}

/** Resolved hex for libraries that do not support CSS variables. */
export function getChartColor(index: number, isDark = false): string {
  const colors = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  return colors[index % colors.length] ?? colors[0];
}
