/**
 * Selected-person panel for the Manpower Organogram chart.
 */
import { Link } from "react-router-dom";
import type { ManpowerOrgNode } from "@/api/hrManpower";

type Props = {
  person: ManpowerOrgNode | null;
  approvalOn: boolean;
  workspaceV2: boolean;
  onClose: () => void;
  onFocusTeam: (id: number) => void;
  onJumpTo: (id: number) => void;
};

export function OrganogramInspector({
  person,
  approvalOn,
  workspaceV2,
  onClose,
  onFocusTeam,
  onJumpTo,
}: Props) {
  if (!person) return null;

  const canLegacyEdit = !(approvalOn && !workspaceV2);
  const showEdit = canLegacyEdit;

  return (
    <aside
      className="no-print flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm shadow-sm lg:w-80 lg:shrink-0"
      aria-label="Selected employee"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-text-primary">{person.name}</h3>
          <p className="text-xs text-text-secondary">{person.employee_code}</p>
        </div>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Department</dt>
          <dd>{person.department_name || "Undefined"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Designation</dt>
          <dd>{person.designation_title || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Present today</dt>
          <dd>{person.present_today ? "Yes" : "No"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Suggested</dt>
          <dd>{person.suggested ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Approved quota</dt>
          <dd>{person.approved_quota ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Direct reports</dt>
          <dd>{person.children.length}</dd>
        </div>
      </dl>

      {person.children.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium text-text-secondary">Direct reports</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {person.children.slice(0, 8).map((c) => (
              <li key={c.employee_id}>
                <button
                  type="button"
                  className="text-left text-brand-primary hover:underline"
                  onClick={() => onJumpTo(c.employee_id)}
                >
                  {c.name} ({c.employee_code})
                </button>
              </li>
            ))}
            {person.children.length > 8 ? (
              <li className="text-text-secondary">+{person.children.length - 8} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        <Link
          to={`/app/hr/employees/${person.employee_id}/profile`}
          className="rounded-md bg-brand-primary px-3 py-2 text-center text-xs font-medium text-white hover:opacity-90"
        >
          View profile
        </Link>
        {showEdit ? (
          <Link
            to={`/app/hr/employees/${person.employee_id}`}
            className="rounded-md border border-border px-3 py-2 text-center text-xs font-medium text-text-primary hover:bg-surface-subtle"
            title={approvalOn ? "Changes need Tier 1 and Tier 2 approval" : undefined}
          >
            Edit
          </Link>
        ) : (
          <p className="text-xs text-amber-700">
            Employee change approval is on without the unified workspace — use View profile, then submit a change request from there if available.
          </p>
        )}
        {person.children.length > 0 ? (
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-subtle"
            onClick={() => onFocusTeam(person.employee_id)}
          >
            Focus this team
          </button>
        ) : null}
      </div>
    </aside>
  );
}

export default OrganogramInspector;
