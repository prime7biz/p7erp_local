import type { LegalSectionData } from "../types";
import { dpaGlobalDocument } from "./global";
import { dpaEuExtraSections } from "./eu";
import { dpaUsaExtraSections } from "./usa";
import { dpaBangladeshExtraSections } from "./bangladesh";
import { dpaIndiaExtraSections } from "./india";
import { dpaAfricaExtraSections } from "./africa";
import { dpaAsiaExtraSections } from "./asia";
import { dpaOtherExtraSections } from "./other";

export type DpaRegionId = "global" | "eu" | "usa" | "bangladesh" | "india" | "africa" | "asia" | "other";

export const DPA_BASE_SECTIONS: LegalSectionData[] = dpaGlobalDocument.sections;

export const DPA_META = {
  version: dpaGlobalDocument.version,
  lastUpdated: dpaGlobalDocument.lastUpdated,
  title: "Data Processing Agreement",
} as const;

export const DPA_REGION_TABS: { id: DpaRegionId; label: string; extraSections: LegalSectionData[] }[] = [
  { id: "global", label: "Global (base)", extraSections: [] },
  { id: "eu", label: "European Union", extraSections: dpaEuExtraSections },
  { id: "usa", label: "United States", extraSections: dpaUsaExtraSections },
  { id: "bangladesh", label: "Bangladesh", extraSections: dpaBangladeshExtraSections },
  { id: "india", label: "India", extraSections: dpaIndiaExtraSections },
  { id: "africa", label: "Africa (POPIA-style)", extraSections: dpaAfricaExtraSections },
  { id: "asia", label: "Asia–Pacific", extraSections: dpaAsiaExtraSections },
  { id: "other", label: "Other regions", extraSections: dpaOtherExtraSections },
];

export function getDpaSectionsForRegion(regionId: DpaRegionId): LegalSectionData[] {
  const row = DPA_REGION_TABS.find((t) => t.id === regionId);
  const extra = row?.extraSections ?? [];
  return [...DPA_BASE_SECTIONS, ...extra];
}
