import type { CustomerApprovalChain, MaterialReadinessChain } from "@/types/productionPlanning";

type Props = {
  chainKey: string | null;
  customerApproval?: CustomerApprovalChain;
  material?: MaterialReadinessChain;
};

export function ReadinessDetailPanel({ chainKey, customerApproval, material }: Props) {
  if (!chainKey) return null;

  if (chainKey === "customer_approval" && customerApproval?.items?.length) {
    return (
      <div className="mt-2 rounded-lg border border-border-subtle bg-surface-subtle/50 p-3 text-xs">
        <div className="mb-2 font-medium text-text-secondary">TNA / approvals</div>
        <ul className="space-y-1">
          {customerApproval.items.map((a) => (
            <li key={a.id} className="flex justify-between gap-2">
              <span>{a.action}</span>
              <span className={a.done ? "text-emerald-600" : "text-amber-700"}>{a.done ? "Done" : "Pending"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (chainKey === "material_readiness" && material?.items?.length) {
    return (
      <div className="mt-2 rounded-lg border border-border-subtle bg-surface-subtle/50 p-3 text-xs">
        <div className="mb-2 font-medium text-text-secondary">Materials (BOM vs stock)</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-text-muted">
                <th className="pr-2 py-1">Item</th>
                <th className="pr-2 py-1">Required</th>
                <th className="pr-2 py-1">On hand</th>
                <th className="py-1">OK</th>
              </tr>
            </thead>
            <tbody>
              {material.items.map((row) => (
                <tr key={row.item_id} className="border-t border-border-subtle/60">
                  <td className="py-1 pr-2">{row.item_name || `#${row.item_id}`}</td>
                  <td className="py-1 pr-2">{row.required}</td>
                  <td className="py-1 pr-2">{row.on_hand}</td>
                  <td className="py-1">{row.ready ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}
