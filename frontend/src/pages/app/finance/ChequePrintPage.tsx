/**
 * Print a cheque from a Payment voucher (Tally-style cheque printing).
 * Standard Bangladeshi cheque leaf: 8" × 3.5" (203 × 89 mm). Field positions are in mm;
 * printer alignment offsets are remembered per browser because every printer feeds differently.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ChartOfAccountResponse, type VoucherResponse } from "@/api/client";
import { amountInWords, formatLakh } from "@/lib/amountInWords";
import { logApiError } from "@/utils/logApiError";
import { sumMoneyBy } from "@/lib/money";

const OFFSET_KEY = "p7_cheque_offset_mm";

type Offset = { x: number; y: number };

function readOffset(): Offset {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFSET_KEY) ?? "{}") as Partial<Offset>;
    return { x: Number(raw.x) || 0, y: Number(raw.y) || 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

/** Cheque boxes use DDMMYYYY. */
function dateDigits(iso: string): string[] {
  const [y = "", m = "", d = ""] = iso.split("-");
  return `${d}${m}${y}`.split("");
}

export function ChequePrintPage() {
  const { voucherId } = useParams();
  const id = Number(voucherId);
  const [voucher, setVoucher] = useState<VoucherResponse | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [error, setError] = useState("");
  const [payee, setPayee] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [acPayee, setAcPayee] = useState(true);
  const [offset, setOffset] = useState<Offset>(readOffset);

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return;
    let cancelled = false;
    void Promise.all([api.getVoucher(id), api.listChartOfAccounts()])
      .then(([v, accts]) => {
        if (cancelled) return;
        setVoucher(v);
        setAccounts(accts);
      })
      .catch((e) => {
        logApiError("ChequePrintPage.load", e);
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const { amount, bankName, defaultPayee } = useMemo(() => {
    if (!voucher) return { amount: 0, bankName: "", defaultPayee: "" };
    const bankCredits = voucher.lines.filter((l) => l.entry_type === "CREDIT" && accountById.get(l.account_id)?.is_bank_account);
    const debits = voucher.lines.filter((l) => l.entry_type === "DEBIT");
    const sum = (ls: typeof voucher.lines) => sumMoneyBy(ls, (l) => l.amount);
    const payeeLine = debits.find((l) => !accountById.get(l.account_id)?.is_bank_account);
    return {
      amount: bankCredits.length ? sum(bankCredits) : sum(debits),
      bankName: bankCredits[0] ? accountById.get(bankCredits[0].account_id)?.name ?? "" : "",
      defaultPayee: (payeeLine && accountById.get(payeeLine.account_id)?.name) || voucher.reference || "",
    };
  }, [voucher, accountById]);

  useEffect(() => {
    setPayee((p) => p || defaultPayee);
  }, [defaultPayee]);

  useEffect(() => {
    if (voucher) setChequeNo((c) => c || voucher.instrument_reference || "");
  }, [voucher]);

  useEffect(() => {
    localStorage.setItem(OFFSET_KEY, JSON.stringify(offset));
  }, [offset]);

  if (error) return <div className="p-8 text-sm text-status-danger-foreground">{error}</div>;
  if (!voucher) return <div className="p-8 text-sm text-text-muted">Loading…</div>;

  const isPayment = (voucher.voucher_type || "").toUpperCase() === "PAYMENT";
  const currency = voucher.currency || "BDT";
  const digits = dateDigits(voucher.voucher_date);
  const pos = (left: number, top: number) => ({ left: `${left + offset.x}mm`, top: `${top + offset.y}mm` });

  return (
    <div className="min-h-screen bg-surface p-6 print:bg-white print:p-0">
      <style>{"@page { size: 203mm 89mm; margin: 0; } @media print { body { margin: 0; } }"}</style>

      <div className="no-print mb-4 max-w-3xl space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-text-primary">
            Print cheque — {voucher.voucher_number} {bankName ? `· ${bankName}` : ""}
          </h1>
          <Link className="text-sm text-brand-primary hover:underline" to={`/app/accounts/vouchers/${voucher.id}`}>
            Back to voucher
          </Link>
        </div>
        {!isPayment ? (
          <p className="rounded border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground">
            This is a {voucher.voucher_type} voucher. Cheques are normally printed from Payment vouchers.
          </p>
        ) : null}
        {voucher.status !== "POSTED" && voucher.status !== "APPROVED" ? (
          <p className="rounded border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground">
            Voucher status is {voucher.status}. Print cheques only after the payment is approved.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Pay to (payee)</span>
            <input className="w-full rounded-lg border border-border-strong px-3 py-2" value={payee} onChange={(e) => setPayee(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Cheque number (for your records)</span>
            <input className="w-full rounded-lg border border-border-strong px-3 py-2" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={acPayee} onChange={(e) => setAcPayee(e.target.checked)} />
            Print "A/C Payee only"
          </label>
          <label className="flex items-center gap-1">
            Shift right (mm)
            <input className="w-16 rounded border px-2 py-1" type="number" step="0.5" value={offset.x} onChange={(e) => setOffset((o) => ({ ...o, x: Number(e.target.value) || 0 }))} />
          </label>
          <label className="flex items-center gap-1">
            Shift down (mm)
            <input className="w-16 rounded border px-2 py-1" type="number" step="0.5" value={offset.y} onChange={(e) => setOffset((o) => ({ ...o, y: Number(e.target.value) || 0 }))} />
          </label>
          <button type="button" className="rounded-lg bg-brand-primary px-4 py-2 font-semibold text-brand-primary-foreground" onClick={() => window.print()}>
            Print cheque
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Put a blank cheque leaf in the printer (8 × 3.5 inch). Test on plain paper first; use the shift fields to line up with your bank's
          leaf — the shift is remembered on this computer.
        </p>
      </div>

      <div
        className="relative overflow-hidden border border-dashed border-border-strong bg-white text-black print:border-0"
        style={{ width: "203mm", height: "89mm", fontFamily: "Arial, sans-serif" }}
      >
        {acPayee ? (
          <div className="absolute rotate-[-20deg] border-y-2 border-black px-2 text-[11pt] font-bold" style={pos(8, 8)}>
            A/C PAYEE ONLY
          </div>
        ) : null}
        <div className="absolute flex gap-[1.2mm] text-[12pt] font-semibold tracking-wide" style={pos(150, 8)}>
          {digits.map((d, i) => (
            <span key={i} className="inline-block w-[5mm] text-center">
              {d}
            </span>
          ))}
        </div>
        <div className="absolute w-[150mm] truncate text-[12pt] font-semibold" style={pos(25, 25)}>
          {payee}
        </div>
        <div className="absolute w-[130mm] text-[11pt] leading-[8mm]" style={pos(30, 35)}>
          {amountInWords(amount, currency)}
        </div>
        <div className="absolute text-[13pt] font-bold" style={pos(158, 42)}>
          {currency === "BDT" ? "" : `${currency} `}
          {formatLakh(amount)}/=
        </div>
      </div>
    </div>
  );
}
