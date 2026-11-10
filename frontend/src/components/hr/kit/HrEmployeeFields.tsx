import { useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { RemoteSearchSelect, type RemoteSelectOption } from "@/components/app/RemoteSearchSelect";
import { EmployeeAvatar } from "@/components/hr/EmployeeAvatar";
import { logApiError } from "@/utils/logApiError";
import { employeeLabel, type EmployeeLookup } from "./useEmployeeLookup";

/** Avatar, name and code of an employee in a table cell (falls back to the number). */
export function HrEmployeeCell({ id, lookup, link = true }: { id: number | null | undefined; lookup: EmployeeLookup; link?: boolean }) {
  if (typeof id !== "number" || id <= 0) return <span className="text-text-muted">—</span>;
  const emp = lookup(id);
  if (emp === undefined) {
    return <span className="inline-block h-4 w-28 animate-pulse rounded bg-surface-subtle" aria-label="Loading employee" />;
  }
  if (emp === null) return <span className="text-text-muted">Employee #{id}</span>;
  const name = (
    <span className="min-w-0">
      <span className="block truncate font-medium text-text-primary">{emp.full_name}</span>
      <span className="block truncate text-[11px] text-text-muted">{emp.employee_code}</span>
    </span>
  );
  return (
    <span className="inline-flex max-w-[240px] items-center gap-2">
      <EmployeeAvatar name={emp.full_name} inactive={!emp.is_active} />
      {link ? (
        <Link to={`/app/hr/employees/${emp.id}`} className="min-w-0 hover:text-brand-primary">
          {name}
        </Link>
      ) : (
        name
      )}
    </span>
  );
}

/** Search employees by code or name and pick one (replaces typing a raw employee id). */
export function HrEmployeeSelect({
  id,
  value,
  onChange,
  placeholder = "Search employee code or name…",
  required = false,
}: {
  id?: string;
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const fetchPage = useCallback(async (query: string, page: number, pageSize: number) => {
    const rows = await api.listHrEmployees({
      search: query || undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const options: RemoteSelectOption[] = rows.map((e) => ({
      value: e.id,
      label: `${e.employee_code} · ${[e.first_name, e.last_name].filter(Boolean).join(" ")}`,
    }));
    // The list endpoint has no total; a full page means "there may be more".
    const total = rows.length < pageSize ? (page - 1) * pageSize + rows.length : page * pageSize + 1;
    return { options, total };
  }, []);

  const hydrateById = useCallback(async (employeeId: number) => {
    try {
      const [row] = await api.lookupHrEmployees([employeeId]);
      return row ? { value: row.id, label: employeeLabel(row) } : null;
    } catch (err) {
      logApiError("HrEmployeeSelect.hydrate", err);
      return null;
    }
  }, []);

  return (
    <RemoteSearchSelect
      id={id}
      value={value && value > 0 ? value : ""}
      onChange={(next) => onChange(next === "" ? null : next)}
      fetchPage={fetchPage}
      hydrateById={hydrateById}
      placeholder={placeholder}
      allowClear={!required}
      menuPortal
      aria-label="Employee"
      className="w-full"
      emptyMessage="No employee matches"
    />
  );
}
