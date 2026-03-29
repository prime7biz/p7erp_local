import { Sparkles, X, MessageSquare, Plus } from "lucide-react";
import { useLocation } from "react-router-dom";
import { AiChatThread } from "@/pages/app/ai/components/AiChatThread";
import { AiPromptInput } from "@/pages/app/ai/components/AiPromptInput";
import { useAiChatContext } from "@/context/AiChatContext";

export function GlobalAiChatWidget() {
  const location = useLocation();
  const {
    messages,
    loadingMessages,
    sending,
    approvingEscalationId,
    error,
    widgetOpen,
    loadingBootstrap,
    setWidgetOpen,
    toggleWidget,
    sendMessage,
    approveEscalation,
    cancelEscalation,
    createSession,
  } = useAiChatContext();

  // Show only inside authenticated application routes, including prefixed deployments
  // like "/erp/app" behind reverse proxies.
  const isAppRoute = /(^|\/)app(\/|$)/.test(location.pathname);
  if (!isAppRoute) return null;

  return (
    <>
      {/* FAB only when closed; when open it overlapped Send and duplicated header close. */}
      {!widgetOpen ? (
        <div className="fixed bottom-6 right-6 z-[80]">
          <button
            type="button"
            onClick={toggleWidget}
            className="group flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-brand-primary-foreground shadow-xl ring-1 ring-brand-primary/20 transition hover:scale-[1.03] hover:shadow-2xl"
            title="Open AI assistant"
          >
            <Sparkles className="h-6 w-6" />
          </button>
        </div>
      ) : null}

      <div
        className={`fixed inset-y-0 right-0 z-[75] w-full max-w-[430px] transform border-l border-border bg-surface-base shadow-2xl transition-transform duration-300 ease-out ${
          widgetOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border bg-surface-raised px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-brand-primary/10 p-1.5 text-brand-primary">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Prime7 AI Assistant</h2>
                <p className="text-xs text-text-muted">Available from any app page</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void createSession();
                }}
                className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                title="New AI session"
              >
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  New
                </span>
              </button>
              <button
                type="button"
                onClick={() => setWidgetOpen(false)}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-subtle"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loadingBootstrap ? (
              <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm text-text-muted">
                Initializing AI session...
              </div>
            ) : (
              <AiChatThread
                messages={messages}
                loading={loadingMessages}
                sending={sending}
                approvingEscalationId={approvingEscalationId}
                onApproveEscalation={(messageId, toolRequired) => {
                  void approveEscalation(messageId, toolRequired);
                }}
                onCancelEscalation={(messageId) => {
                  cancelEscalation(messageId);
                }}
              />
            )}
          </div>

          <div className="border-t border-border bg-surface-raised p-3">
            {error ? <p className="mb-2 text-xs text-status-danger">{error}</p> : null}
            {sending ? <p className="mb-2 text-xs text-text-muted">Local AI is thinking...</p> : null}
            {approvingEscalationId ? <p className="mb-2 text-xs text-text-muted">Cloud AI is processing...</p> : null}
            <AiPromptInput
              sending={sending}
              disabled={loadingBootstrap}
              onSend={async (prompt) => {
                await sendMessage(prompt);
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
