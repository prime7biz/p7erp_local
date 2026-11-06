/** Rule sets (effective-dated labour-law values) and the Gazette wage schedule inside each set. */
import { useState } from "react";
import { hrBangladeshApi, type BdRuleSet, type BdWageRate } from "@/api/hrBangladesh";
import { ActionsMenu, Badge, Card, Messages, SimpleTable, btnPrimary } from "@/components/hr/bd/BdUi";
import { money, useAction, useLoad } from "@/components/hr/bd/bdHooks";

const STATUS_TONE = { DRAFT: "amber", APPROVED: "green", RETIRED: "gray" } as const;

export function RuleSetsTab({ onChanged }: { onChanged: () => void }) {
  const list = useLoad(() => hrBangladeshApi.bdRuleSets(), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const detail = useLoad(() => (openId ? hrBangladeshApi.bdRuleSet(openId) : Promise.resolve(null)), [openId]);
  const { busy, error, notice, run } = useAction();

  const act = (fn: () => Promise<unknown>, ok: string) =>
    void run(async () => {
      await fn();
      await list.reload();
      if (openId) await detail.reload();
      onChanged();
    }, ok);

  const rules = (detail.data?.rules_json ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <Messages error={error || list.error || detail.error} notice={notice} />
      <Card
        title="Rule sets"
        description="A rule set holds the labour-law numbers for a date range. Only an APPROVED set is used. To change a number, edit a DRAFT (values may only become more favourable to workers) and approve it."
        actions={
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => act(() => hrBangladeshApi.bdSeedOfficial(), "Official rule set created as DRAFT.")}>
            Create official rule set
          </button>
        }
      >
        <SimpleTable<BdRuleSet>
          rows={list.data ?? []}
          rowKey={(r) => r.id}
          empty={list.loading ? "Loading..." : "No rule set yet. Create the official one, review it, then approve."}
          columns={[
            { header: "Code", cell: (r) => r.code },
            { header: "Catalog", cell: (r) => r.catalog_version },
            { header: "From", cell: (r) => r.effective_from },
            { header: "To", cell: (r) => r.effective_to ?? "open" },
            { header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
            {
              header: "Actions",
              align: "right",
              cell: (r) => (
                <ActionsMenu
                  items={[
                    { label: "View values", onClick: () => setOpenId(r.id) },
                    {
                      label: "Approve",
                      hidden: r.status !== "DRAFT",
                      onClick: () => {
                        if (window.confirm("Approve this rule set? It becomes the source for previews and enforcement from its start date."))
                          act(() => hrBangladeshApi.bdApproveRuleSet(r.id), "Rule set approved.");
                      },
                    },
                    {
                      label: "Retire",
                      danger: true,
                      hidden: r.status === "RETIRED",
                      onClick: () => {
                        if (window.confirm("Retire this rule set? Previews fall back to the built-in catalog until another set is approved."))
                          act(() => hrBangladeshApi.bdRetireRuleSet(r.id), "Rule set retired.");
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      {openId && detail.data ? (
        <>
          <Card title={`Values in ${detail.data.code} (${detail.data.status})`} description="Days, rates and divisors used by the calculations.">
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(rules).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-border py-1">
                  <span className="text-text-muted">{k.replace(/_/g, " ")}</span>
                  <span className="font-medium text-text-primary">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Minimum wage schedule (Taka per month)" description="Garments sector Gazette 2023, effective 1 December 2023. Gross = basic + house rent + medical + transport + food.">
            <SimpleTable<BdWageRate>
              rows={detail.data.rates ?? []}
              rowKey={(r) => r.id}
              empty="No wage rates in this set."
              columns={[
                { header: "Grade", cell: (r) => <span className="font-mono text-xs">{r.rate_code}</span> },
                { header: "Class", cell: (r) => `${r.schedule_class === "WORKER" ? "Worker" : "Employee"}${r.employment_stage === "APPRENTICE" ? " apprentice" : ""}` },
                { header: "Basic", align: "right", cell: (r) => money(r.basic) },
                { header: "House rent", align: "right", cell: (r) => money(r.house_rent) },
                { header: "Medical", align: "right", cell: (r) => money(r.medical) },
                { header: "Transport", align: "right", cell: (r) => money(r.transport) },
                { header: "Food", align: "right", cell: (r) => money(r.food) },
                { header: "Gross", align: "right", cell: (r) => <span className="font-semibold">{money(r.gross)}</span> },
                { header: "Designations", cell: (r) => <span className="text-xs text-text-muted">{(r.designation_scope ?? []).join(", ")}</span> },
              ]}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
