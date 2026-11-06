import type { TutorialSection } from "./types";
import { enrichTutorialSections } from "./tutorialArticleEnrich";
import { gettingStartedSection } from "./sections/getting-started";
import { supportSection } from "./sections/support";
import { merchandisingSection } from "./sections/merchandising";
import { exportImportSection } from "./sections/export-import";
import { inventorySection } from "./sections/inventory";
import { manufacturingSection } from "./sections/manufacturing";
import { qualitySection } from "./sections/quality";
import { aiToolsSection } from "./sections/ai-tools";
import { hrSection } from "./sections/hr";
import { hrPayrollSection } from "./sections/hr-payroll";
import { financeSection } from "./sections/finance";
import { financeReportsSection } from "./sections/finance-reports";
import { workflowSection } from "./sections/workflow";
import { reportsSection } from "./sections/reports";
import { settingsSection } from "./sections/settings";

/**
 * In-app help content — aligned with `frontend/src/app/sidebarConfig.tsx` and real routes.
 * Each section lives in its own file under `./sections/` (one file per sidebar area).
 * When you add/rename/remove sidebar items or change user-facing flows, update the matching article(s).
 */
const tutorialSectionsRaw: TutorialSection[] = [
  gettingStartedSection,
  supportSection,
  merchandisingSection,
  exportImportSection,
  inventorySection,
  manufacturingSection,
  qualitySection,
  aiToolsSection,
  hrSection,
  hrPayrollSection,
  financeSection,
  financeReportsSection,
  workflowSection,
  reportsSection,
  settingsSection,
];

export const tutorialSections: TutorialSection[] = enrichTutorialSections(tutorialSectionsRaw);
