import { useState } from "react";
import { Link } from "react-router-dom";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { useAuth } from "@/context/AuthContext";
import { BondRegisterTab } from "./BondRegisterTab";
import { MushakTab } from "./MushakTab";
import { UdRegisterTab } from "./UdRegisterTab";

type Tab = "ud" | "bond" | "m61" | "m62";

const TABS: [Tab, string][] = [
  ["ud", "UD register"],
  ["bond", "Bond register"],
  ["m61", "Mushak 6.1 (purchases)"],
  ["m62", "Mushak 6.2 (sales)"],
];

/** Bangladesh bond, UD and VAT registers (flag `bd_bond_compliance_enabled`). */
export function BdCompliancePage() {
  const { me } = useAuth();
  const enabled = me?.feature_flags?.bd_bond_compliance_enabled === true;
  const [tab, setTab] = useState<Tab>("ud");

  const header = (
    <AppPageHeader
      title="Bond & VAT registers"
      description="UD entitlements and utilization, bonded-warehouse movements, and Mushak 6.1 / 6.2 registers with CSV/XLSX export."
    />
  );

  if (!enabled) {
    return (
      <div className={listPageRootClass}>
        {header}
        <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          Bond & VAT registers are turned off for this company. An admin can enable them in{" "}
          <Link to="/app/settings/config" className="font-medium text-brand-primary hover:underline">
            Settings → Configuration
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className={listPageRootClass}>
      {header}
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        These are working registers for your team. Exports are spreadsheets, not the official e-UD / CBMS / NBR upload files — check figures
        before filing.
      </p>
      <div role="tablist" aria-label="Register sections" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "ud" ? <UdRegisterTab /> : null}
      {tab === "bond" ? <BondRegisterTab /> : null}
      {tab === "m61" ? <MushakTab register="6-1" /> : null}
      {tab === "m62" ? <MushakTab register="6-2" /> : null}
    </div>
  );
}
