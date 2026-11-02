import { describe, expect, it } from "vitest";
import { applyResults, enqueue, loadProblems, loadQueue, MAX_QUEUE } from "./scanQueue";

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const base = { barcode: "BC1", ob_op_id: 7, operator_code: "OP1", sewing_line_id: 2 };

describe("scan queue", () => {
  it("gives every scan its own key and keeps unanswered scans queued", () => {
    const s = memoryStore();
    const a = enqueue(base, s)!;
    const b = enqueue({ ...base, barcode: "BC2" }, s)!;
    expect(a.client_key).not.toBe(b.client_key);
    expect(loadQueue(s)).toHaveLength(2);

    const out = applyResults([{ client_key: a.client_key, status: "accepted" }], s);
    expect(out).toEqual({ done: 1, problems: 0 });
    expect(loadQueue(s).map((q) => q.barcode)).toEqual(["BC2"]);
  });

  it("treats duplicate and already-scanned as done and moves errors to problems", () => {
    const s = memoryStore();
    const a = enqueue(base, s)!;
    const b = enqueue(base, s)!;
    const c = enqueue(base, s)!;
    const out = applyResults(
      [
        { client_key: a.client_key, status: "duplicate" },
        { client_key: b.client_key, status: "already_scanned" },
        { client_key: c.client_key, status: "error", message: "Unknown bundle barcode" },
      ],
      s,
    );
    expect(out).toEqual({ done: 2, problems: 1 });
    expect(loadQueue(s)).toEqual([]);
    expect(loadProblems(s)[0]?.message).toBe("Unknown bundle barcode");
  });

  it("refuses new scans when the device queue is full instead of dropping old ones", () => {
    const s = memoryStore();
    s.setItem("p7_scan_queue", JSON.stringify(Array.from({ length: MAX_QUEUE }, (_, i) => ({ ...base, client_key: `k${i}`, scanned_at: "" }))));
    expect(enqueue(base, s)).toBeNull();
    expect(loadQueue(s)).toHaveLength(MAX_QUEUE);
  });
});
