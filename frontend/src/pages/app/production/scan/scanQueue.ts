/**
 * Offline-safe scan queue kept in localStorage. Every scan gets a unique client_key when it is
 * taken, so re-sending the queue after a lost connection can never double-count on the server.
 */
export type QueuedScan = {
  client_key: string;
  barcode: string;
  ob_op_id: number;
  scanned_at: string;
  operator_code: string | null;
  sewing_line_id: number | null;
  pieces?: number | null;
};

export type ScanResultStatus = "accepted" | "duplicate" | "already_scanned" | "error";
export type ScanResult = { client_key: string; status: ScanResultStatus; message?: string | null; bundle_no?: string | null };
export type ScanProblem = QueuedScan & { message: string };

const QUEUE_KEY = "p7_scan_queue";
const PROBLEMS_KEY = "p7_scan_problems";
const DEVICE_KEY = "p7_scan_device_id";
export const MAX_QUEUE = 5000;

type Store = Pick<Storage, "getItem" | "setItem">;

function read<T>(store: Store, key: string): T[] {
  try {
    const v = JSON.parse(store.getItem(key) || "[]");
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function newClientKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export function deviceId(store: Store = localStorage): string {
  let id = store.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev-${newClientKey().slice(0, 20)}`;
    store.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function loadQueue(store: Store = localStorage): QueuedScan[] {
  return read<QueuedScan>(store, QUEUE_KEY);
}

export function loadProblems(store: Store = localStorage): ScanProblem[] {
  return read<ScanProblem>(store, PROBLEMS_KEY);
}

/** Adds a scan; refuses when the device queue is full so nothing is silently dropped. */
export function enqueue(scan: Omit<QueuedScan, "client_key" | "scanned_at">, store: Store = localStorage, now = new Date()): QueuedScan | null {
  const queue = loadQueue(store);
  if (queue.length >= MAX_QUEUE) return null;
  const item: QueuedScan = { ...scan, client_key: newClientKey(), scanned_at: now.toISOString() };
  store.setItem(QUEUE_KEY, JSON.stringify([...queue, item]));
  return item;
}

/**
 * Removes every scan the server answered for. Accepted / duplicate / already-scanned are done;
 * errors move to the problems list for a supervisor to look at. Unanswered scans stay queued.
 */
export function applyResults(results: ScanResult[], store: Store = localStorage): { done: number; problems: number } {
  const byKey = new Map(results.map((r) => [r.client_key, r]));
  const queue = loadQueue(store);
  const remaining: QueuedScan[] = [];
  const newProblems: ScanProblem[] = [];
  let done = 0;
  for (const s of queue) {
    const r = byKey.get(s.client_key);
    if (!r) {
      remaining.push(s);
    } else if (r.status === "error") {
      newProblems.push({ ...s, message: r.message || "Rejected" });
    } else {
      done += 1;
    }
  }
  store.setItem(QUEUE_KEY, JSON.stringify(remaining));
  if (newProblems.length) store.setItem(PROBLEMS_KEY, JSON.stringify([...loadProblems(store), ...newProblems].slice(-500)));
  return { done, problems: newProblems.length };
}

export function clearProblems(store: Store = localStorage): void {
  store.setItem(PROBLEMS_KEY, "[]");
}
