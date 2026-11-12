import { useState } from "react";
import { Sparkles, X, MessageSquare, Plus, Crosshair } from "lucide-react";
import { useLocation } from "react-router-dom";
import { AiChatThread } from "@/pages/app/ai/components/AiChatThread";
import { AiPromptInput } from "@/pages/app/ai/components/AiPromptInput";
import { useAiChatContext } from "@/context/AiChatContext";
import { useAuth } from "@/context/AuthContext";
import { useRecordBreadcrumbLabel } from "@/components/shell/recordBreadcrumb";
import { screenContextFromPath, screenRecordNoun } from "@/lib/screenContext";

export function GlobalAiChatWidget() {
  const location = useLocation();
  const { me } = useAuth();
  const appShellV2 = me?.feature_flags?.app_shell_v2 === true;
  const recordLabel = useRecordBreadcrumbLabel();
  const screen = screenContextFromPath(location.pathname);
  const [ignoredRoute, setIgnoredRoute] = useState<string | null>(null);
  const useScreen = screen !== null && ignoredRoute !== screen.route;
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
      {/* Desktop FAB — hidden when app_shell_v2 (use top-bar AI). Mobile always uses top bar. */}
      {!widgetOpen && !appShellV2 ? (
        <div className="no-print fixed bottom-6 right-6 z-[90] hidden lg:block">
          <button
            type="button"
            onClick={toggleWidget}
            className="group flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-brand-primary-foreground shadow-lg ring-1 ring-brand-primary/20 transition hover:scale-[1.03] hover:shadow-xl"
            title="Open AI assistant"
          >
            <Sparkles className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      <div
        className={`no-print fixed inset-y-0 right-0 z-[85] w-full max-w-[430px] transform border-l border-border bg-surface-base shadow-2xl transition-[transform,visibility] duration-300 ease-out ${
          widgetOpen ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
        aria-hidden={!widgetOpen}
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
            {sending ? (
              <p className="mb-2 text-xs text-text-muted">AI is thinking... checking your data can take up to 30 seconds.</p>
            ) : null}
            {approvingEscalationId ? <p className="mb-2 text-xs text-text-muted">Cloud AI is processing...</p> : null}
            {screen ? (
              <div className="mb-2 flex items-center gap-2 text-xs">
                {useScreen ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-brand-primary/30 bg-brand-primary/5 px-2 py-0.5 text-brand-primary">
                    <Crosshair className="h-3 w-3" aria-hidden />
                    Asking about {recordLabel || `this ${screenRecordNoun(screen.record_type)}`}
                    <button
                      type="button"
                      aria-label="Don't use this screen"
                      className="ml-0.5 rounded-full p-0.5 hover:bg-brand-primary/10"
                      onClick={() => setIgnoredRoute(screen.route)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <button type="button" className="text-text-muted underline" onClick={() => setIgnoredRoute(null)}>
                    Use this {screenRecordNoun(screen.record_type)} as context
                  </button>
                )}
              </div>
            ) : null}
            <AiPromptInput
              sending={sending}
              disabled={loadingBootstrap}
              onSend={async (prompt) => {
                await sendMessage(prompt, null, useScreen ? screen : null);
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
