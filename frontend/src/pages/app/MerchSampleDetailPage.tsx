import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type MerchSampleCommentOut,
  type MerchSampleCostLineCreate,
  type MerchSampleCostLineOut,
  type MerchSampleMaterialLineCreate,
  type MerchSampleMaterialLineOut,
  type MerchSampleMetricsOut,
  type MerchSampleOut,
  type MerchSampleTaskCreate,
  type MerchSampleTaskOut,
  type MerchSampleAiPlanProposalResponse,
  type InventoryItemResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";
import { logApiError } from "@/utils/logApiError";

export function MerchSampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sampleId = Number(id);
  const [row, setRow] = useState<MerchSampleOut | null>(null);
  const [comments, setComments] = useState<MerchSampleCommentOut[]>([]);
  const [metrics, setMetrics] = useState<MerchSampleMetricsOut | null>(null);
  const [tasks, setTasks] = useState<MerchSampleTaskOut[]>([]);
  const [costLines, setCostLines] = useState<MerchSampleCostLineOut[]>([]);
  const [matLines, setMatLines] = useState<MerchSampleMaterialLineOut[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<MerchSampleAiPlanProposalResponse | null>(null);
  const [lastProposalId, setLastProposalId] = useState<number | null>(null);

  const [newTask, setNewTask] = useState<MerchSampleTaskCreate>({ step_name: "" });
  const [newCost, setNewCost] = useState<MerchSampleCostLineCreate>({
    line_type: "labor",
    label: "",
  });
  const [newMat, setNewMat] = useState<MerchSampleMaterialLineCreate>({
    item_id: 0,
    qty: "1",
  });

  const load = useCallback(async () => {
    if (!Number.isFinite(sampleId) || sampleId <= 0) {
      setError("Invalid sample id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [s, c, m, t, co, ml, invPage] = await Promise.all([
        api.getMerchSample(sampleId),
        api.listMerchSampleComments(sampleId),
        api.getMerchSampleMetrics(sampleId),
        api.listMerchSampleTasks(sampleId),
        api.listMerchSampleCostLines(sampleId),
        api.listMerchSampleMaterialLines(sampleId),
        api.listInventoryItemsPaginated({ page: 1, page_size: 400 }).catch(() => ({
          items: [],
          total: 0,
          page: 1,
          page_size: 400,
          total_pages: 0,
        })),
      ]);
      setRow(s);
      setComments(c);
      setMetrics(m);
      setTasks(t);
      setCostLines(co);
      setMatLines(ml);
      setItems(invPage.items ?? []);
    } catch (e) {
      logApiError("MerchSampleDetailPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [sampleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchStatus = async (status: string) => {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      const u = await api.updateMerchSample(row.id, { status });
      setRow(u);
      const m = await api.getMerchSampleMetrics(row.id);
      setMetrics(m);
    } catch (e) {
      logApiError("MerchSampleDetailPage.patchStatus", e);
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!row || !commentText.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.addMerchSampleComment(row.id, { comment: commentText.trim() });
      setCommentText("");
      const c = await api.listMerchSampleComments(row.id);
      setComments(c);
    } catch (e) {
      logApiError("MerchSampleDetailPage.addComment", e);
      setError(e instanceof Error ? e.message : "Comment failed");
    } finally {
      setBusy(false);
    }
  };

  const actionsForStatus = (s: string) => {
    if (s === "requested") return [{ label: "Start (in progress)", status: "in_progress" }, { label: "Cancel", status: "cancelled" }];
    if (s === "in_progress")
      return [{ label: "Mark submitted", status: "submitted" }, { label: "Cancel", status: "cancelled" }];
    if (s === "submitted")
      return [
        { label: "Approve", status: "approved" },
        { label: "Reject", status: "rejected" },
      ];
    return [];
  };

  const addTask = async () => {
    if (!row || !newTask.step_name?.trim()) return;
    setBusy(true);
    try {
      await api.createMerchSampleTask(row.id, { ...newTask, step_name: newTask.step_name.trim() });
      setNewTask({ step_name: "" });
      setTasks(await api.listMerchSampleTasks(row.id));
      setMetrics(await api.getMerchSampleMetrics(row.id));
    } catch (e) {
      logApiError("MerchSampleDetailPage.addTask", e);
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const addCost = async () => {
    if (!row || !newCost.label?.trim()) return;
    setBusy(true);
    try {
      await api.createMerchSampleCostLine(row.id, {
        ...newCost,
        label: newCost.label.trim(),
      });
      setNewCost({ line_type: "labor", label: "" });
      setCostLines(await api.listMerchSampleCostLines(row.id));
      setMetrics(await api.getMerchSampleMetrics(row.id));
    } catch (e) {
      logApiError("MerchSampleDetailPage.addCost", e);
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const addMat = async () => {
    if (!row || !newMat.item_id) return;
    setBusy(true);
    try {
      await api.createMerchSampleMaterialLine(row.id, newMat);
      setNewMat({ item_id: 0, qty: "1" });
      setMatLines(await api.listMerchSampleMaterialLines(row.id));
    } catch (e) {
      logApiError("MerchSampleDetailPage.addMat", e);
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const runAiProposal = async () => {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.merchSampleAiPlanProposal(row.id);
      setAiPreview(res);
      setLastProposalId(res.proposal.id);
    } catch (e) {
      logApiError("MerchSampleDetailPage.aiProposal", e);
      setError(e instanceof Error ? e.message : "AI proposal failed");
    } finally {
      setBusy(false);
    }
  };

  const applyAi = async () => {
    if (!row || !lastProposalId) return;
    setBusy(true);
    try {
      await api.merchSampleAiPlanApply(row.id, { proposal_id: lastProposalId });
      setTasks(await api.listMerchSampleTasks(row.id));
      setMetrics(await api.getMerchSampleMetrics(row.id));
      setAiPreview(null);
    } catch (e) {
      logApiError("MerchSampleDetailPage.aiApply", e);
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  };

  const stripItems = items.slice(0, 400);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <AppPageHeader
        title={row ? row.sample_code : "Sample request"}
        description="Workflow, productivity metrics, costing, materials, and AI plan (proposal → apply)."
        actions={
          <Link to="/app/merchandising/samples" className="text-sm text-status-info-foreground hover:underline">
            Back to list
          </Link>
        }
      />

      {error ? (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-text-muted">Loading…</p> : null}

      {!loading && row ? (
        <>
          <WorkflowSummaryStrip
            items={[
              { label: "Type", value: row.sample_type },
              { label: "Status", value: row.status },
              ...(row.target_date ? [{ label: "Target", value: row.target_date }] : []),
              ...(metrics
                ? [
                    { label: "Tasks", value: metrics.task_count },
                    { label: "Est. cost", value: metrics.total_cost_amount },
                  ]
                : []),
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4 text-sm">
              <h3 className="text-sm font-semibold text-text-primary">Details</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-xs text-text-muted">Subtype</span>
                  <div>{row.sample_subtype || "—"}</div>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Revision</span>
                  <div>{row.revision_no}</div>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-text-muted">Style</span>
                  <div>
                    <Link className="text-status-info-foreground hover:underline" to={`/app/merchandising/styles/${row.style_id}`}>
                      {row.style_code || `#${row.style_id}`}
                    </Link>
                    {row.style_name ? <span className="text-text-muted"> — {row.style_name}</span> : null}
                  </div>
                </div>
                {row.inquiry_id ? (
                  <div>
                    <span className="text-xs text-text-muted">Inquiry</span>
                    <div>
                      <Link className="text-status-info-foreground hover:underline" to={`/app/inquiries/${row.inquiry_id}`}>
                        {row.inquiry_code || `#${row.inquiry_id}`}
                      </Link>
                    </div>
                  </div>
                ) : null}
                {row.order_id ? (
                  <div>
                    <span className="text-xs text-text-muted">Order</span>
                    <div>
                      <Link className="text-status-info-foreground hover:underline" to={`/app/orders/${row.order_id}`}>
                        {row.order_code || `#${row.order_id}`}
                      </Link>
                    </div>
                  </div>
                ) : null}
                <div>
                  <span className="text-xs text-text-muted">Target / Actual</span>
                  <div>
                    {row.target_date || "—"} / {row.actual_date || "—"}
                  </div>
                </div>
                {row.remarks ? (
                  <div className="sm:col-span-2">
                    <span className="text-xs text-text-muted">Remarks</span>
                    <div className="whitespace-pre-wrap">{row.remarks}</div>
                  </div>
                ) : null}
              </div>

              {actionsForStatus(row.status).length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {actionsForStatus(row.status).map((a) => (
                    <button
                      key={a.status}
                      type="button"
                      disabled={busy}
                      onClick={() => void patchStatus(a.status)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-subtle disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4 text-sm">
              <h3 className="text-sm font-semibold text-text-primary">Timeline & productivity</h3>
              {metrics ? (
                <ul className="space-y-1 text-xs text-text-secondary">
                  <li>Lead time (days): {metrics.lead_time_days ?? "—"}</li>
                  <li>Planned vs actual (days slip): {metrics.planned_vs_actual_days ?? "—"}</li>
                  <li>Avg task % complete: {metrics.avg_task_pct_complete ?? "—"}</li>
                  <li>Bottleneck step: {metrics.bottleneck_step || "—"}</li>
                  <li>Total cost (lines): {metrics.total_cost_amount}</li>
                </ul>
              ) : (
                <p className="text-xs text-text-muted">No metrics.</p>
              )}
              <div className="border-t border-border pt-2">
                <p className="text-xs font-medium text-text-muted">AI plan</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAiProposal()}
                    className="rounded-lg bg-status-info px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    Generate proposal
                  </button>
                  {lastProposalId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void applyAi()}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      Apply proposal #{lastProposalId}
                    </button>
                  ) : null}
                </div>
                {aiPreview ? (
                  <div className="mt-2 rounded border border-border-strong/30 bg-surface-subtle p-2 text-xs">
                    <p className="font-medium text-text-primary">Preview</p>
                    <ul className="mt-1 list-inside list-disc">
                      {aiPreview.preview.tasks.map((t, i) => (
                        <li key={i}>
                          {t.step_name} (day +{t.days_from_start}, {t.duration_days}d)
                        </li>
                      ))}
                    </ul>
                    {aiPreview.preview.risk_notes?.length ? (
                      <p className="mt-1 text-status-warning-foreground">{aiPreview.preview.risk_notes.join(" · ")}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <h3 className="text-sm font-semibold text-text-primary">Tasks</h3>
            <div className="mt-2 flex flex-wrap gap-2 border-b border-border pb-2">
              <input
                className="min-w-[160px] flex-1 rounded border border-border px-2 py-1 text-xs"
                placeholder="Step name"
                value={newTask.step_name ?? ""}
                onChange={(e) => setNewTask((x) => ({ ...x, step_name: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void addTask()}
                className="rounded-lg border border-border px-2 py-1 text-xs"
              >
                Add task
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="mt-2 min-w-full text-left text-xs">
                <thead>
                  <tr className="text-text-muted">
                    <th className="py-1 pr-2">Step</th>
                    <th className="py-1 pr-2">Planned</th>
                    <th className="py-1 pr-2">% done</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-t border-border/50">
                      <td className="py-1 pr-2">{t.step_name}</td>
                      <td className="py-1 pr-2">
                        {t.planned_start || "—"} → {t.planned_end || "—"}
                      </td>
                      <td className="py-1 pr-2">{t.pct_complete}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
              <h3 className="text-sm font-semibold text-text-primary">Costing lines</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  className="rounded border border-border px-2 py-1 text-xs"
                  value={newCost.line_type}
                  onChange={(e) => setNewCost((c) => ({ ...c, line_type: e.target.value }))}
                >
                  <option value="labor">labor</option>
                  <option value="material">material</option>
                  <option value="overhead">overhead</option>
                  <option value="other">other</option>
                </select>
                <input
                  className="min-w-[120px] flex-1 rounded border border-border px-2 py-1 text-xs"
                  placeholder="Label"
                  value={newCost.label}
                  onChange={(e) => setNewCost((c) => ({ ...c, label: e.target.value }))}
                />
                <input
                  className="w-20 rounded border border-border px-2 py-1 text-xs"
                  placeholder="Qty"
                  value={newCost.qty ?? ""}
                  onChange={(e) => setNewCost((c) => ({ ...c, qty: e.target.value || undefined }))}
                />
                <input
                  className="w-20 rounded border border-border px-2 py-1 text-xs"
                  placeholder="Rate"
                  value={newCost.rate ?? ""}
                  onChange={(e) => setNewCost((c) => ({ ...c, rate: e.target.value || undefined }))}
                />
                <input
                  className="w-20 rounded border border-border px-2 py-1 text-xs"
                  placeholder="Amt"
                  value={newCost.amount ?? ""}
                  onChange={(e) => setNewCost((c) => ({ ...c, amount: e.target.value || undefined }))}
                />
                <button type="button" disabled={busy} onClick={() => void addCost()} className="rounded-lg border px-2 py-1 text-xs">
                  Add
                </button>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {costLines.map((c) => (
                  <li key={c.id}>
                    [{c.line_type}] {c.label} qty {c.qty ?? "—"} × rate {c.rate ?? "—"} = {c.amount ?? "—"}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
              <h3 className="text-sm font-semibold text-text-primary">Material lines</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  className="min-w-[200px] flex-1 rounded border border-border px-2 py-1 text-xs"
                  value={newMat.item_id || ""}
                  onChange={(e) => setNewMat((m) => ({ ...m, item_id: Number(e.target.value) }))}
                >
                  <option value="">Select item…</option>
                  {stripItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.item_code} — {it.name}
                    </option>
                  ))}
                </select>
                <input
                  className="w-24 rounded border border-border px-2 py-1 text-xs"
                  value={newMat.qty}
                  onChange={(e) => setNewMat((m) => ({ ...m, qty: e.target.value }))}
                />
                <button type="button" disabled={busy} onClick={() => void addMat()} className="rounded-lg border px-2 py-1 text-xs">
                  Add
                </button>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {matLines.map((m) => (
                  <li key={m.id}>
                    {m.item_code} {m.qty} {m.uom || ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <h3 className="text-sm font-semibold text-text-primary">Comments</h3>
            <ul className="mt-2 space-y-2 text-xs">
              {comments.map((c) => (
                <li key={c.id} className="rounded border border-border-strong/30 bg-surface-subtle p-2">
                  <div className="text-text-muted">{new Date(c.created_at).toLocaleString()}</div>
                  <div className="mt-1 whitespace-pre-wrap text-text-primary">{c.comment}</div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <textarea
                className="min-h-[72px] flex-1 rounded border border-border px-2 py-1.5 text-sm"
                placeholder="Add a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !commentText.trim()}
                onClick={() => void addComment()}
                className="rounded-lg bg-status-info px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Post
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
