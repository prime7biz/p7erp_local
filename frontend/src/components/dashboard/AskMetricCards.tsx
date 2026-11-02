import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pin, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api, type MetricAnswer, type MetricMeta, type MetricValue, type SavedView } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";


const TABLE_KEY = "dashboard.metric_cards";
const MAX_PINS = 8;

/** Dashboard: ask a question, get ONE whitelisted figure, pin it as a card (flag `ai_dashboard_cards_enabled`). */
export function AskMetricCards() {
  const { me } = useAuth();
  const enabled = me?.feature_flags?.ai_dashboard_cards_enabled === true;
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<MetricAnswer | null>(null);
  const [pins, setPins] = useState<SavedView[]>([]);

  const loadPins = useCallback(async () => {
    try {
      setPins((await api.listSavedViews(TABLE_KEY)).filter((v) => v.is_mine));
    } catch (e) {
      logApiError("AskMetricCards.pins", e);
    }
  }, []);

  useEffect(() => {
    if (enabled) void loadPins();
  }, [enabled, loadPins]);

  if (!enabled) return null;

  const ask = async (q: string) => {
    if (q.trim().length < 2) return;
    setAsking(true);
    try {
      setAnswer(await api.askMetric(q.trim()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not answer");
    } finally {
      setAsking(false);
    }
  };

  const pin = async (m: MetricMeta) => {
    if (pins.some((p) => p.config.query === m.id)) {
      toast.info("Already pinned");
      return;
    }
    if (pins.length >= MAX_PINS) {
      toast.error(`You can pin up to ${MAX_PINS} cards`);
      return;
    }
    try {
      await api.createSavedView({ table_key: TABLE_KEY, name: m.label, config: { query: m.id } });
      toast.success("Pinned to your dashboard");
      setAnswer(null);
      setQuestion("");
      await loadPins();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not pin");
    }
  };

  const unpin = async (id: number) => {
    try {
      await api.deleteSavedView(id);
      setPins((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  };

  return (
    <section aria-labelledby="ask-metric-title" className="space-y-3">
      <h2 id="ask-metric-title" className="text-sm font-semibold text-text-primary">
        Ask a figure
      </h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-muted" aria-hidden />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder="e.g. How many orders are late? · Open orders by buyer · LCs expiring"
            aria-label="Ask a question about your figures"
            className="w-full rounded-lg border border-border-strong py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={asking || question.trim().length < 2}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50"
        >
          {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ask
        </button>
      </form>

      {answer ? (
        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-3 text-sm">
          {answer.matched ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <MetricBody m={answer.metric} />
              <button
                type="button"
                onClick={() => void pin(answer.metric)}
                className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-surface-base px-2.5 py-1 text-xs"
              >
                <Pin className="h-3.5 w-3.5" /> Pin card
              </button>
            </div>
          ) : (
            <p className="text-text-secondary">{answer.message}</p>
          )}
          {answer.suggestions.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="text-text-muted">{answer.matched ? "Related:" : "Try:"}</span>
              {answer.suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setQuestion(s.label);
                    void ask(s.label);
                  }}
                  className="rounded-full border border-border bg-surface-base px-2 py-0.5 text-text-secondary hover:text-text-primary"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          {answer.matched ? (
            <p className="mt-1 text-[11px] text-text-muted">
              Answered from a fixed list of figures{answer.method === "ai" ? " (AI picked the figure)" : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      {pins.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pins.map((p) => (
            <PinnedCard key={p.id} metricId={p.config.query ?? ""} onRemove={() => void unpin(p.id)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MetricBody({ m }: { m: MetricValue }) {
  return (
    <div className="min-w-0">
      <Link to={m.href} className="text-xs font-medium text-text-secondary hover:text-brand-primary hover:underline">
        {m.label}
      </Link>
      <p className="text-2xl font-semibold tabular-nums text-text-primary">
        {m.value.toLocaleString()} <span className="text-xs font-normal text-text-muted">{m.unit}</span>
      </p>
      {m.breakdown?.length ? (
        <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
          {m.breakdown.map((b) => (
            <li key={b.label} className="flex justify-between gap-3">
              <span className="truncate">{b.label}</span>
              <span className="tabular-nums">{b.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PinnedCard({ metricId, onRemove }: { metricId: string; onRemove: () => void }) {
  const [m, setM] = useState<MetricValue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMetric(metricId)
      .then((v) => {
        if (!cancelled) setM(v);
      })
      .catch((e) => {
        logApiError("AskMetricCards.card", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [metricId]);

  return (
    <div className="relative rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
      <button
        type="button"
        aria-label="Remove card"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded p-0.5 text-text-muted hover:bg-surface-subtle hover:text-text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {m ? <MetricBody m={m} /> : failed ? <p className="text-xs text-text-muted">This figure is not available.</p> : <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
    </div>
  );
}
