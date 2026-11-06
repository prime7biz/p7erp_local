/** Employee number prefix and width. The counter only goes up: changing the prefix never reuses a number. */
import { useEffect, useState } from "react";
import { hrBangladeshApi } from "@/api/hrBangladesh";
import { Card, Field, Messages, btnPrimary, inputCls } from "@/components/hr/bd/BdUi";
import { useAction, useLoad } from "@/components/hr/bd/bdHooks";

export function EmployeeNumberFormatCard() {
  const fmt = useLoad(() => hrBangladeshApi.employeeNumberFormat(), []);
  const [prefix, setPrefix] = useState("EMP-");
  const [width, setWidth] = useState("7");
  const { busy, error, notice, run } = useAction();

  useEffect(() => {
    if (fmt.data) {
      setPrefix(fmt.data.prefix);
      setWidth(String(fmt.data.width));
    }
  }, [fmt.data]);

  const preview = `${prefix}${"1".padStart(Number(width) || 7, "0")}`;

  return (
    <Card
      title="Employee number format"
      description="Every new employee gets the next number automatically. A number is used once only: it is never given to another employee, even after resignation."
    >
      <Messages error={error || fmt.error} notice={notice} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Prefix" htmlFor="bd-num-prefix" hint="Letters, digits or hyphen, up to 12">
          <input id="bd-num-prefix" className={inputCls} maxLength={12} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </Field>
        <Field label="Digits" htmlFor="bd-num-width" hint="3 to 10">
          <input id="bd-num-width" type="number" min={3} max={10} className={inputCls} value={width} onChange={(e) => setWidth(e.target.value)} />
        </Field>
        <div className="text-sm text-text-secondary sm:col-span-2">
          <p>
            Format example: <span className="font-medium text-text-primary">{preview}</span>
          </p>
          <p>
            Next number: <span className="font-medium text-text-primary">{fmt.data?.next_code ?? "..."}</span>
          </p>
        </div>
      </div>
      <button
        type="button"
        className={btnPrimary}
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await hrBangladeshApi.setEmployeeNumberFormat(prefix, Number(width));
            await fmt.reload();
          }, "Number format saved. The sequence continues from the last number.")
        }
      >
        Save format
      </button>
    </Card>
  );
}
