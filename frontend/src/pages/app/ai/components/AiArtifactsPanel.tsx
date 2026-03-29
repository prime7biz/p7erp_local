import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAiApprovalArtifacts } from "@/pages/app/ai/hooks/useAiApprovalArtifacts";

/**
 * Lists AI approval artifacts and drives approve / reject / commit / rollback via `useAiApprovalArtifacts`.
 */
export function AiArtifactsPanel() {
  const { items, loading, mutatingId, error, clearError, refresh, approveArtifact, rejectArtifact, commitArtifact, rollbackArtifact } =
    useAiApprovalArtifacts();
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void refresh({ limit: 40 });
  }, [refresh]);

  useEffect(() => {
    if (openActionsId == null) setCommentDraft("");
  }, [openActionsId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenActionsId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    await refresh({ limit: 40 });
    setOpenActionsId(null);
    setCommentDraft("");
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">AI approval drafts</h3>
        <button
          type="button"
          onClick={() => {
            clearError();
            void refresh({ limit: 40 });
          }}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-border dark:text-text-secondary dark:hover:bg-surface-subtle"
          title="Refresh list"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="mb-2 text-[11px] text-text-muted">
        Review MCP-generated drafts (vouchers, receipts, inquiries) before they post to ERP.
      </p>
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      {loading && items.length === 0 ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-text-muted">No artifacts yet.</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto text-xs" ref={menuRef}>
          {items.map((row) => {
            const busy = mutatingId === row.id;
            const canApprove = row.status === "pending_review";
            const canCommit = row.status === "approved";
            const canRollback = row.status === "committed";
            return (
              <div key={row.id} className="rounded-lg border border-border bg-surface-base p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] text-text-primary">{row.artifact_code}</p>
                    <p className="text-[11px] text-text-muted">
                      {row.artifact_type} · {row.source_tool}
                    </p>
                    <p className="text-[11px] capitalize text-text-secondary">Status: {row.status}</p>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId((id) => (id === row.id ? null : row.id));
                      }}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-border dark:text-text-secondary dark:hover:bg-surface-subtle"
                    >
                      Actions
                    </button>
                    {openActionsId === row.id ? (
                      <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-border dark:bg-surface-raised">
                        {canApprove ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-text-primary dark:hover:bg-surface-subtle"
                              onClick={() =>
                                void run(async () => {
                                  await approveArtifact(row.id, commentDraft.trim() || null);
                                })
                              }
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() =>
                                void run(async () => {
                                  await rejectArtifact(row.id, commentDraft.trim() || null);
                                })
                              }
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {canCommit ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-text-primary dark:hover:bg-surface-subtle"
                            onClick={() => void run(async () => commitArtifact(row.id))}
                          >
                            Commit to ERP
                          </button>
                        ) : null}
                        {canRollback ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() =>
                              void run(async () => {
                                const reason = window.prompt("Rollback reason?", "Recorded rollback") || "Rollback";
                                await rollbackArtifact(row.id, reason);
                              })
                            }
                          >
                            Record rollback
                          </button>
                        ) : null}
                        {!canApprove && !canCommit && !canRollback ? (
                          <span className="block px-2 py-1.5 text-[11px] text-text-muted">No actions</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                {openActionsId === row.id && canApprove ? (
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Optional comment for approve/reject…"
                    maxLength={2000}
                    className="mt-2 w-full rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] text-text-primary"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
