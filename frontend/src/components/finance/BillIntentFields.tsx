import { useEffect, useState } from "react";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import type { BillIntentInput, VoucherLineCreate } from "@/api/models";
import { listOpenBillReferences, type OpenBillReference, type SubAccount } from "@/api/subLedger";
import { logApiError } from "@/utils/logApiError";

const LINE_CTL =
  "w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-brand-primary";

type Props = {
  line: VoucherLineCreate;
  people: SubAccount[];
  showPerson: boolean;
  onChange: (patch: Partial<VoucherLineCreate>) => void;
};

/** Draft payment reference for one voucher line. It becomes a bill only after the voucher is posted. */
export function BillIntentFields({ line, people, showPerson, onChange }: Props) {
  const intent: BillIntentInput = line.bill_intents?.[0] ?? {
    allocation_type: "ON_ACCOUNT",
    amount: line.amount || "0",
  };
  const [openBills, setOpenBills] = useState<OpenBillReference[]>([]);
  const options = people.map((person) => ({ value: person.id, label: `${person.code} — ${person.name}` }));
  const oppositeSide = line.entry_type === "DEBIT" ? "CREDIT" : "DEBIT";

  useEffect(() => {
    const current = line.bill_intents?.[0];
    if (!current || current.amount === (line.amount || "0")) return;
    onChange({ bill_intents: [{ ...current, amount: line.amount || "0" }] });
  }, [line.amount, line.bill_intents, onChange]);

  useEffect(() => {
    if (intent.allocation_type !== "AGAINST_REF" || !line.account_id) {
      setOpenBills([]);
      return;
    }
    let cancelled = false;
    listOpenBillReferences(line.account_id, oppositeSide)
      .then((rows) => {
        if (!cancelled) setOpenBills(rows);
      })
      .catch((e) => logApiError("BillIntentFields.listOpenBillReferences", e));
    return () => {
      cancelled = true;
    };
  }, [intent.allocation_type, line.account_id, oppositeSide]);

  function setIntent(patch: Partial<BillIntentInput>) {
    const next = { ...intent, ...patch, amount: line.amount || "0" };
    const unused = next.allocation_type === "ON_ACCOUNT" && !line.sub_account_id && !next.reference_no && !next.target_bill_reference_id;
    onChange({ bill_intents: unused ? [] : [next] });
  }

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {showPerson ? (
        <LocalSearchSelect
          value={line.sub_account_id ?? ""}
          options={options}
          menuPortal
          placeholder="Person (optional)"
          onChange={(value) => onChange({ sub_account_id: value === "" || value == null ? null : Number(value) })}
        />
      ) : null}
      <select
        className={LINE_CTL}
        aria-label="Payment reference type"
        value={intent.allocation_type}
        onChange={(e) =>
          setIntent({
            allocation_type: e.target.value as BillIntentInput["allocation_type"],
            target_bill_reference_id: null,
          })
        }
      >
        <option value="NEW_REF">New Ref</option>
        <option value="AGAINST_REF">Against Ref</option>
        <option value="ADVANCE">Advance</option>
        <option value="ON_ACCOUNT">On Account</option>
      </select>
      {intent.allocation_type === "AGAINST_REF" ? (
        <LocalSearchSelect
          value={intent.target_bill_reference_id ?? ""}
          options={openBills.map((bill) => ({
            value: bill.id,
            label: `${bill.bill_number} — open ${bill.pending_amount}`,
          }))}
          menuPortal
          placeholder="Open bill"
          onChange={(value) =>
            setIntent({ target_bill_reference_id: value === "" || value == null ? null : Number(value) })
          }
        />
      ) : (
        <input
          className={LINE_CTL}
          aria-label="Payment reference number"
          placeholder="Reference number"
          value={intent.reference_no ?? ""}
          onChange={(e) => setIntent({ reference_no: e.target.value })}
        />
      )}
    </div>
  );
}
