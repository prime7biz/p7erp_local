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

const DEVICE_KEY = "p7_scan_device_id";
export const MAX_QUEUE = 5000;

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * Where one person's scans are kept. Each signed-in user of each company has their own queue,
 * so on a shared phone nobody sends (or sees) scans recorded under someone else's login.
 */
export type ScanKeys = { queue: string; problems: string };

/** Keys used before queues were split per user; still read once and handed over (adoptLegacyScans). */
export const LEGACY_SCAN_KEYS: ScanKeys = { queue: "p7_scan_queue", problems: "p7_scan_problems" };

export function scanKeys(tenantId: number, userId: number): ScanKeys {
  return { queue: `p7_scan_queue:${tenantId}:${userId}`, problems: `p7_scan_problems:${tenantId}:${userId}` };
}

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

export function loadQueue(store: Store = localStorage, keys: ScanKeys = LEGACY_SCAN_KEYS): QueuedScan[] {
  return read<QueuedScan>(store, keys.queue);
}

export function loadProblems(store: Store = localStorage, keys: ScanKeys = LEGACY_SCAN_KEYS): ScanProblem[] {
  return read<ScanProblem>(store, keys.problems);
}

/** Adds a scan; refuses when the device queue is full so nothing is silently dropped. */
export function enqueue(
  scan: Omit<QueuedScan, "client_key" | "scanned_at">,
  store: Store = localStorage,
  keys: ScanKeys = LEGACY_SCAN_KEYS,
  now = new Date(),
): QueuedScan | null {
  const queue = loadQueue(store, keys);
  if (queue.length >= MAX_QUEUE) return null;
  const item: QueuedScan = { ...scan, client_key: newClientKey(), scanned_at: now.toISOString() };
  store.setItem(keys.queue, JSON.stringify([...queue, item]));
  return item;
}

/**
 * Scans saved before queues were split per user are handed to the person who opens the scan
 * station next (exactly who would have sent them before), then the old keys are emptied.
 */
export function adoptLegacyScans(keys: ScanKeys, store: Store = localStorage): number {
  const legacyQueue = loadQueue(store, LEGACY_SCAN_KEYS);
  const legacyProblems = loadProblems(store, LEGACY_SCAN_KEYS);
  if (!legacyQueue.length && !legacyProblems.length) return 0;
  const queue = loadQueue(store, keys);
  const known = new Set(queue.map((s) => s.client_key));
  const moved = legacyQueue.filter((s) => !known.has(s.client_key));
  store.setItem(keys.queue, JSON.stringify([...queue, ...moved]));
  if (legacyProblems.length) {
    store.setItem(keys.problems, JSON.stringify([...loadProblems(store, keys), ...legacyProblems].slice(-500)));
  }
  store.setItem(LEGACY_SCAN_KEYS.queue, "[]");
  store.setItem(LEGACY_SCAN_KEYS.problems, "[]");
  return moved.length;
}

/**
 * Removes every scan the server answered for. Accepted / duplicate / already-scanned are done;
 * errors move to the problems list for a supervisor to look at. Unanswered scans stay queued.
 */
export function applyResults(
  results: ScanResult[],
  store: Store = localStorage,
  keys: ScanKeys = LEGACY_SCAN_KEYS,
): { done: number; problems: number } {
  const byKey = new Map(results.map((r) => [r.client_key, r]));
  const queue = loadQueue(store, keys);
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
  store.setItem(keys.queue, JSON.stringify(remaining));
  if (newProblems.length) store.setItem(keys.problems, JSON.stringify([...loadProblems(store, keys), ...newProblems].slice(-500)));
  return { done, problems: newProblems.length };
}

export function clearProblems(store: Store = localStorage, keys: ScanKeys = LEGACY_SCAN_KEYS): void {
  store.setItem(keys.problems, "[]");
}
