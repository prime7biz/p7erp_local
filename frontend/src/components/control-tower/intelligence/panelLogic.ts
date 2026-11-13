import type { CapacityDay } from "@/api/manufacturingIntelligence";

import { formatDate, formatDecimal, formatPercent } from "./formatDecimal";
import { reasonLabels } from "./reasonLabels";

export type ChipTone = "neutral" | "good" | "warn" | "bad" | "info";

export interface StatusStyle {
  cls: string;
  letter: string;
  label: string;
}

export const STATUS_STYLE: Record<string, StatusStyle> = {
  OVERLOADED: { cls: "bg-red-500 text-white", letter: "O", label: "Overloaded (firm load above practical capacity)" },
  LOADED: { cls: "bg-blue-400 text-white", letter: "L", label: "Loaded" },
  IDLE: { cls: "bg-green-100 text-green-900", letter: "I", label: "Idle (no firm load)" },
  CLOSED: { cls: "bg-gray-200 text-gray-500", letter: "–", label: "Closed day" },
  UNKNOWN: { cls: "bg-amber-100 text-amber-900", letter: "?", label: "Unknown (an input is missing)" },
};

export function statusStyle(status: string): StatusStyle {
  return STATUS_STYLE[status] ?? STATUS_STYLE.UNKNOWN!;
}

export function cellTitle(lineCode: string, d: CapacityDay): string {
  const parts = [
    `${lineCode} · ${formatDate(d.date)} · ${d.status}`,
    `Firm ${formatDecimal(d.firm_smv_minutes)} min, soft ${formatDecimal(d.soft_smv_minutes)} min`,
    `Practical ${d.practical_smv_minutes != null ? formatDecimal(d.practical_smv_minutes) + " min" : "unknown"}`,
    `Utilization ${d.utilization_pct != null ? formatPercent(d.utilization_pct) : "unknown"}`,
  ];
  if (d.assigned_operators != null) parts.push(`Assigned operators ${d.assigned_operators}`);
  if (d.assigned_machines != null) parts.push(`Assigned machines ${d.assigned_machines}`);
  const why = reasonLabels([...d.reason_codes, ...d.missing_inputs]);
  if (why.length) parts.push(why.join("; "));
  return `${statusStyle(d.status).label}. ${parts.join(". ")}`;
}

export function isSoftOnly(d: CapacityDay): boolean {
  return Number(d.soft_smv_minutes) > 0 && Number(d.firm_smv_minutes) === 0;
}

export function dimensionTone(status: string): ChipTone {
  if (status === "READY") return "good";
  if (status === "PARTIAL") return "warn";
  if (status === "BLOCKED") return "bad";
  return "neutral";
}

export function bandTone(band: string): ChipTone {
  if (band === "ON_TRACK" || band === "COMPLETE") return "good";
  if (band === "AT_RISK") return "warn";
  if (band === "LATE") return "bad";
  return "neutral";
}

/** Inclusive number of days between two ISO dates, or NaN for bad input. */
export function windowDays(from: string, to: string): number {
  const a = Date.parse(from + "T12:00:00");
  const b = Date.parse(to + "T12:00:00");
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86400000) + 1;
}
