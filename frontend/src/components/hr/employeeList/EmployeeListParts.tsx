/**
 * Employee-specific building blocks for the HR Employees list (status badges, card view).
 * Shared pieces (stat card, Actions menu, sortable header) live in `components/hr/HrListParts.tsx`.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { HrEmployeeResponse } from "@/api/models";
import { EmployeeAvatar } from "@/components/hr/EmployeeAvatar";
import { ActiveBadge } from "@/components/hr/HrListParts";
import { formatShortDate, formatTenure, fullName, isOnProbation, joinedWithinDays } from "@/pages/app/hr/hrEmployeesListLogic";

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

export function EmployeeBadges({ employee }: { employee: HrEmployeeResponse }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ActiveBadge active={employee.is_active} />
      {isOnProbation(employee) && (
        <span className={`${badgeBase} bg-status-warning-subtle text-status-warning-foreground`}>Probation</span>
      )}
      {employee.is_active && joinedWithinDays(employee, 30) && (
        <span className={`${badgeBase} bg-brand-primary/10 text-brand-primary`}>New</span>
      )}
      {employee.user_id != null && (
        <span className={`${badgeBase} bg-status-info-subtle text-status-info-foreground`} title="Linked to an app user (self-service login)">
          ESS
        </span>
      )}
    </div>
  );
}

export function EmployeeCard({
  employee,
  departmentName,
  designationName,
  sectionName,
  selected,
  onToggleSelect,
  actions,
}: {
  employee: HrEmployeeResponse;
  departmentName: string;
  designationName: string;
  sectionName: string;
  selected: boolean;
  onToggleSelect: () => void;
  actions: ReactNode;
}) {
  const name = fullName(employee);
  const tenure = formatTenure(employee.joining_date);
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-surface-raised p-4 transition hover:shadow-md ${
        selected ? "border-brand-primary ring-1 ring-brand-primary/40" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${name}`}
        />
        <EmployeeAvatar name={name} size="lg" inactive={!employee.is_active} />
        <div className="min-w-0 flex-1">
          <Link to={`/app/hr/employees/${employee.id}`} className="block truncate font-semibold text-text-primary hover:text-brand-primary">
            {name}
          </Link>
          <p className="text-xs text-text-muted">{employee.employee_code}</p>
          <p className="mt-0.5 truncate text-sm text-text-secondary">{designationName}</p>
        </div>
        {actions}
      </div>
      <EmployeeBadges employee={employee} />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-text-muted">Department</dt>
        <dd className="truncate text-text-secondary">{departmentName}</dd>
        <dt className="text-text-muted">Section</dt>
        <dd className="truncate text-text-secondary">{sectionName}</dd>
        <dt className="text-text-muted">Joined</dt>
        <dd className="truncate text-text-secondary">
          {formatShortDate(employee.joining_date) || "-"}
          {tenure && <span className="text-text-muted"> ({tenure})</span>}
        </dd>
        <dt className="text-text-muted">Phone</dt>
        <dd className="truncate text-text-secondary">
          {employee.phone ? <a href={`tel:${employee.phone}`} className="hover:text-brand-primary">{employee.phone}</a> : "-"}
        </dd>
      </dl>
    </div>
  );
}
