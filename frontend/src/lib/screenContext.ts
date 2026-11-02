/** Which record is open on screen, so the AI assistant can answer "this order" questions. */
export type ScreenRecordType = "order" | "customer" | "style" | "voucher" | "employee";

export type ScreenContext = {
  route: string;
  record_type: ScreenRecordType;
  record_id: number;
};

const PATTERNS: { type: ScreenRecordType; re: RegExp; noun: string }[] = [
  { type: "order", re: /\/app\/orders\/(\d+)(?:\/|$)/, noun: "order" },
  { type: "customer", re: /\/app\/customers\/(\d+)(?:\/|$)/, noun: "customer" },
  { type: "style", re: /\/app\/merchandising\/styles\/(\d+)(?:\/|$)/, noun: "style" },
  { type: "voucher", re: /\/app\/accounts\/vouchers\/(\d+)(?:\/|$)/, noun: "voucher" },
  { type: "employee", re: /\/app\/hr\/employees\/(\d+)(?:\/|$)/, noun: "employee" },
];

export function screenContextFromPath(pathname: string): ScreenContext | null {
  for (const p of PATTERNS) {
    const m = p.re.exec(pathname);
    if (m) {
      const id = Number(m[1]);
      if (Number.isSafeInteger(id) && id > 0) return { route: pathname.slice(0, 300), record_type: p.type, record_id: id };
    }
  }
  return null;
}

export function screenRecordNoun(type: ScreenRecordType): string {
  return PATTERNS.find((p) => p.type === type)?.noun ?? "record";
}
