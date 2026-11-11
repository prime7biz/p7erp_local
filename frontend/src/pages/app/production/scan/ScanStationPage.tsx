import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CloudOff, RefreshCw, ScanLine, Wifi } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
import { logApiError } from "@/utils/logApiError";
import {
  adoptLegacyScans,
  applyResults,
  clearProblems,
  deviceId,
  enqueue,
  loadProblems,
  loadQueue,
  scanKeys,
  type ScanProblem,
} from "./scanQueue";

type Setup = Awaited<ReturnType<typeof api.getScanSetup>>;
type Ops = Awaited<ReturnType<typeof api.getScanOperations>>["operations"];
type Summary = Awaited<ReturnType<typeof api.getScanSummary>>;
type Station = { lineId: string; orderId: string; opId: string; operator: string };

const STATION_KEY = "p7_scan_station";
const BATCH = 200;
const RETRY_MS = 15_000;

function loadStation(): Station {
  try {
    return { lineId: "", orderId: "", opId: "", operator: "", ...JSON.parse(localStorage.getItem(STATION_KEY) || "{}") };
  } catch {
    return { lineId: "", orderId: "", opId: "", operator: "" };
  }
}

const select = "w-full rounded-lg border border-border-strong px-3 py-2 text-base";

export function ScanStationPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const enabled = me?.feature_flags?.shop_floor_scan_enabled === true;
  const tenantId = me?.tenant_id;
  const userId = me?.user_id;
  const keys = useMemo(() => (tenantId != null && userId != null ? scanKeys(tenantId, userId) : null), [tenantId, userId]);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [ops, setOps] = useState<Ops>([]);
  const [station, setStation] = useState<Station>(loadStation);
  const [barcode, setBarcode] = useState("");
  const [queued, setQueued] = useState(0);
  const [problems, setProblems] = useState<ScanProblem[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [last, setLast] = useState<{ text: string; tone: "ok" | "warn" | "bad" } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    api.getScanSetup().then(setSetup).catch((e) => logApiError("ScanStation.setup", e));
  }, [enabled]);

  useEffect(() => {
    if (!keys) return;
    adoptLegacyScans(keys);
    setQueued(loadQueue(localStorage, keys).length);
    setProblems(loadProblems(localStorage, keys));
  }, [keys]);

  useEffect(() => {
    localStorage.setItem(STATION_KEY, JSON.stringify(station));
  }, [station]);

  useEffect(() => {
    if (!enabled || !station.orderId) {
      setOps([]);
      return;
    }
    api
      .getScanOperations(Number(station.orderId))
      .then((r) => setOps(r.operations))
      .catch((e) => logApiError("ScanStation.ops", e));
  }, [enabled, station.orderId]);

  const refreshSummary = useCallback(() => {
    if (!enabled || !navigator.onLine) return;
    api
      .getScanSummary({ sewing_line_id: station.lineId ? Number(station.lineId) : undefined })
      .then(setSummary)
      .catch((e) => logApiError("ScanStation.summary", e));
  }, [enabled, station.lineId]);

  const sync = useCallback(async () => {
    if (!keys || syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      let queue = loadQueue(localStorage, keys);
      while (queue.length) {
        const res = await api.uploadScans({ device_id: deviceId(), scans: queue.slice(0, BATCH) });
        applyResults(res.results, localStorage, keys);
        const bad = res.results.filter((r) => r.status === "error");
        if (bad.length) setLast({ text: t("scan.rejectedSome", { count: bad.length }), tone: "bad" });
        queue = loadQueue(localStorage, keys);
      }
      refreshSummary();
    } catch (e) {
      // Network or server down: scans stay queued and are retried automatically.
      logApiError("ScanStation.sync", e);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setQueued(loadQueue(localStorage, keys).length);
      setProblems(loadProblems(localStorage, keys));
    }
  }, [keys, refreshSummary, t]);

  useEffect(() => {
    if (!enabled) return;
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = window.setInterval(() => void sync(), RETRY_MS);
    void sync();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.clearInterval(timer);
    };
  }, [enabled, sync]);

  useEffect(refreshSummary, [refreshSummary]);

  if (!enabled) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6 text-sm text-text-secondary">
        <LanguageSwitcher />
        <p>
          {t("common.turnedOff")}{" "}
          <Link to="/app/settings/config" className="font-medium text-brand-primary hover:underline">{t("common.settingsConfig")}</Link>.
        </p>
      </div>
    );
  }

  const ready = Boolean(station.lineId && station.orderId && station.opId);
  const opName = ops.find((o) => String(o.id) === station.opId)?.operation_name;

  function onScan(e: FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    setBarcode("");
    inputRef.current?.focus();
    if (!code || !ready || !keys) return;
    const item = enqueue(
      {
        barcode: code,
        ob_op_id: Number(station.opId),
        operator_code: station.operator.trim() || null,
        sewing_line_id: Number(station.lineId),
      },
      localStorage,
      keys,
    );
    if (!item) {
      setLast({ text: t("scan.queueFull"), tone: "bad" });
      return;
    }
    setQueued(loadQueue(localStorage, keys).length);
    setLast({ text: t("scan.recorded", { code, op: opName ?? t("scan.operationFallback") }), tone: navigator.onLine ? "ok" : "warn" });
    void sync();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
          <ScanLine className="h-6 w-6" aria-hidden /> {t("scan.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm" role="status">
          <LanguageSwitcher />
          <span className={`inline-flex items-center gap-1 font-medium ${online ? "text-status-success-foreground" : "text-status-warning-foreground"}`}>
            {online ? <Wifi className="h-4 w-4" aria-hidden /> : <CloudOff className="h-4 w-4" aria-hidden />}
            {online ? t("scan.online") : t("scan.offline")}
          </span>
          <span className="text-text-secondary">{t("scan.waiting", { count: queued })}</span>
          <button type="button" onClick={() => void sync()} disabled={syncing || !online} className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2 py-1 text-xs disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden /> {t("scan.sendNow")}
          </button>
        </div>
      </div>

      <section className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("scan.setup")}>
        <div>
          <label htmlFor="st-line" className="text-xs font-medium text-text-muted">{t("scan.line")}</label>
          <select id="st-line" className={select} value={station.lineId} onChange={(e) => setStation({ ...station, lineId: e.target.value })}>
            <option value="">{t("common.select")}</option>
            {setup?.lines.map((l) => <option key={l.id} value={l.id}>{l.line_code} · {l.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="st-order" className="text-xs font-medium text-text-muted">{t("scan.order")}</label>
          <select id="st-order" className={select} value={station.orderId} onChange={(e) => setStation({ ...station, orderId: e.target.value, opId: "" })}>
            <option value="">{t("common.select")}</option>
            {setup?.orders.map((o) => <option key={o.id} value={o.id}>{o.order_code}{o.style_ref ? ` · ${o.style_ref}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="st-op" className="text-xs font-medium text-text-muted">{t("scan.operation")}</label>
          <select id="st-op" className={select} value={station.opId} onChange={(e) => setStation({ ...station, opId: e.target.value })} disabled={!station.orderId}>
            <option value="">{station.orderId && ops.length === 0 ? t("scan.noBulletin") : t("common.select")}</option>
            {ops.map((o) => <option key={o.id} value={o.id}>{o.sequence_no}. {o.operation_name} ({Number(o.smv)} {t("common.min")})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="st-operator" className="text-xs font-medium text-text-muted">{t("scan.operatorId")}</label>
          <input id="st-operator" className={select} maxLength={32} value={station.operator} onChange={(e) => setStation({ ...station, operator: e.target.value })} placeholder={t("scan.operatorPlaceholder")} />
        </div>
      </section>

      <form onSubmit={onScan} className="rounded-xl border-2 border-brand-primary/40 bg-surface-raised p-4">
        <label htmlFor="st-barcode" className="text-sm font-semibold text-text-primary">
          {ready ? t("scan.scanBundle") : t("scan.chooseFirst")}
        </label>
        <input
          id="st-barcode"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          inputMode="none"
          disabled={!ready}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border-strong px-4 py-4 text-2xl tracking-wider disabled:opacity-50"
          placeholder={t("scan.scanPlaceholder")}
        />
        {last ? (
          <p
            role="status"
            className={`mt-3 rounded-lg px-3 py-2 text-base font-medium ${
              last.tone === "ok" ? "bg-status-success-subtle text-status-success-foreground" : last.tone === "warn" ? "bg-status-warning-subtle text-status-warning-foreground" : "bg-status-danger-subtle text-status-danger-foreground"
            }`}
          >
            {last.text}
          </p>
        ) : null}
      </form>

      {problems.length ? (
        <section className="rounded-xl border border-status-danger/30 bg-status-danger-subtle p-4" aria-label={t("scan.rejectedTitle", { count: problems.length })}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-status-danger-foreground">{t("scan.rejectedTitle", { count: problems.length })}</h2>
            <button type="button" onClick={() => { if (keys) clearProblems(localStorage, keys); setProblems([]); }} className="text-xs underline">{t("common.clear")}</button>
          </div>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-status-danger-foreground">
            {problems.slice(-50).reverse().map((p) => (
              <li key={p.client_key}>{new Date(p.scanned_at).toLocaleTimeString()} · {p.barcode} — {p.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text-primary">{t("scan.todayByHour")} {station.lineId ? t("scan.thisLine") : ""}</h2>
          {summary ? (
            <>
              <p className="mt-1 text-xs text-text-muted">
                {t("scan.totals", { pcs: summary.total_pieces.toLocaleString(), minutes: Number(summary.earned_minutes).toLocaleString() })}
              </p>
              <table className="mt-2 w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-text-muted"><tr><th scope="col">{t("scan.hour")}</th><th scope="col">{t("scan.pieces")}</th><th scope="col">{t("scan.earnedMin")}</th></tr></thead>
                <tbody>
                  {summary.hours.length === 0 ? <tr><td colSpan={3} className="py-2 text-text-muted">{t("scan.noScans")}</td></tr> : null}
                  {summary.hours.map((h) => (
                    <tr key={h.hour} className="border-t border-border-subtle">
                      <td className="py-1">{String(h.hour).padStart(2, "0")}:00</td>
                      <td>{h.pieces.toLocaleString()}</td>
                      <td>{Number(h.earned_minutes).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="mt-2 text-xs text-text-muted">{online ? t("common.loading") : t("scan.backOnline")}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text-primary">{t("scan.topOperators")}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(summary?.operators ?? []).slice(0, 10).map((o) => (
              <li key={o.operator_code} className="flex justify-between tabular-nums">
                <span>{o.operator_code}</span>
                <span className="text-text-secondary">{o.pieces.toLocaleString()} {t("common.pcs")} · {Number(o.earned_minutes).toLocaleString()} {t("common.min")}</span>
              </li>
            ))}
            {summary && summary.operators.length === 0 ? <li className="text-text-muted">{t("scan.noScans")}</li> : null}
          </ul>
        </div>
      </section>
    </div>
  );
}
