/** Type an employee number or name and pick from the active employees list. */
import { useMemo, useState } from "react";
import type { HrEmployeeResponse } from "@/api/client";
import { inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel } from "@/components/hr/bd/bdHooks";

interface Props {
  id: string;
  employees: HrEmployeeResponse[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
}

export function EmployeePicker({ id, employees, value, onChange, placeholder }: Props) {
  const selected = employees.find((e) => e.id === value);
  const [text, setText] = useState("");
  const options = useMemo(() => employees.map((e) => ({ id: e.id, label: employeeLabel(e) })), [employees]);
  const listId = `${id}-list`;
  return (
    <>
      <input
        id={id}
        className={inputCls}
        list={listId}
        placeholder={placeholder ?? "Employee number or name"}
        value={selected && !text ? employeeLabel(selected) : text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const typed = v.trim().toUpperCase();
          const exact = options.find((o) => o.label === v) ?? employees.find((x) => x.employee_code.toUpperCase() === typed);
          onChange(exact ? exact.id : null);
          if (exact) setText("");
        }}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.slice(0, 2000).map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
    </>
  );
}
