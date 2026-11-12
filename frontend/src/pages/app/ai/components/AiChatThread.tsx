import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AiMessageResponse } from "@/api/client";
import { AiAgentMarkdown } from "@/pages/app/ai/components/AiAgentMarkdown";
import { AiEscalationCard } from "@/pages/app/ai/components/AiEscalationCard";
import { AiMessageFeedbackBar } from "@/pages/app/ai/components/AiMessageFeedbackBar";
import { AiResponseCard } from "@/pages/app/ai/components/AiResponseCard";
import { useTypewriter } from "@/pages/app/ai/hooks/useTypewriter";
import { readMessageMeta } from "@/pages/app/ai/utils/aiFormatting";
import { blockedToolCount, checkedToolLabels } from "@/pages/app/ai/utils/agentToolLabels";

const HIDDEN_TOOL_CARDS = new Set(["knowledge_retrieval", "get_dashboard_summary"]);
const AGENT_TYPING_MAX_MS = 2500;

function TypingCaret() {
  return (
    <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current align-middle opacity-70" aria-hidden />
  );
}

function AssistantMessageBody({ content, animate }: { content: string; animate: boolean }) {
  const { displayedText, isTyping } = useTypewriter(content, { enabled: animate, msPerChar: 12 });
  return (
    <p className="whitespace-pre-wrap">
      {displayedText}
      {animate && isTyping ? <TypingCaret /> : null}
    </p>
  );
}

function AgentMessageBody({ content, animate }: { content: string; animate: boolean }) {
  const { displayedText, isTyping } = useTypewriter(content, {
    enabled: animate,
    msPerChar: 16,
    maxDurationMs: AGENT_TYPING_MAX_MS,
  });
  return (
    <div>
      <AiAgentMarkdown source={displayedText} />
      {animate && isTyping ? <TypingCaret /> : null}
    </div>
  );
}

interface Props {
  messages: AiMessageResponse[];
  loading: boolean;
  /** When a send/escalation completes, the latest assistant reply types out; omit on initial history load */
  sending?: boolean;
  approvingEscalationId: number | null;
  onApproveEscalation: (messageId: number, toolRequired: string) => void;
  onCancelEscalation: (messageId: number) => void;
}

export function AiChatThread({
  messages,
  loading,
  sending = false,
  approvingEscalationId,
  onApproveEscalation,
  onCancelEscalation,
}: Props) {
  const prevSendingRef = useRef(false);
  const prevApprovingRef = useRef<number | null>(null);
  const [streamMessageId, setStreamMessageId] = useState<number | null>(null);

  useEffect(() => {
    const sendFinished = prevSendingRef.current && !sending;
    const escalationFinished =
      prevApprovingRef.current !== null && approvingEscalationId === null;
    if (sendFinished || escalationFinished) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) setStreamMessageId(lastAssistant.id);
    }
    prevSendingRef.current = sending;
    prevApprovingRef.current = approvingEscalationId;
  }, [sending, approvingEscalationId, messages]);

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Conversation</h2>
      {loading ? (
        <p className="text-sm text-text-muted">Loading conversation...</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-text-muted">Start by asking a question or using a quick action.</p>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => {
            const isUser = message.role === "user";
            const meta = readMessageMeta(message);
            const toolResults = Array.isArray(meta.tool_results) ? meta.tool_results : [];
            const citations = (Array.isArray(meta.citations) ? meta.citations : []).filter(
              (c) => !!c && typeof c.href === "string" && c.href.startsWith("/app/") && typeof c.label === "string",
            );
            const isAgent = !isUser && meta.mode === "agent";
            const visibleToolResults = isAgent ? [] : toolResults.filter((r) => !HIDDEN_TOOL_CARDS.has(r.tool_name));
            const checked = isAgent ? checkedToolLabels(toolResults) : [];
            const blockedCount = isAgent ? blockedToolCount(toolResults) : 0;
            const animateAssistant = !isUser && streamMessageId !== null && message.id === streamMessageId;
            return (
              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${
                    isUser ? "bg-primary text-white" : "border border-border bg-surface-subtle text-text-primary"
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : isAgent ? (
                    <AgentMessageBody content={message.content} animate={animateAssistant} />
                  ) : (
                    <AssistantMessageBody content={message.content} animate={animateAssistant} />
                  )}
                  {checked.length > 0 ? (
                    <p className="mt-2 text-[11px] text-text-muted" data-testid="ai-agent-checked">
                      Checked: {checked.join(", ")}
                    </p>
                  ) : null}
                  {blockedCount > 0 ? (
                    <p className="mt-1 text-[11px] text-text-muted">
                      {blockedCount === 1
                        ? "1 lookup was skipped because your role cannot see that data."
                        : `${blockedCount} lookups were skipped because your role cannot see that data.`}
                    </p>
                  ) : null}
                  {!isUser && citations.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="text-text-muted">Source:</span>
                      {citations.map((c) => (
                        <Link key={c.href} to={c.href} className="rounded border border-border px-1.5 py-0.5 text-brand-primary hover:underline">
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {!isUser && meta.request_id ? (
                    <p className="mt-1 text-[11px] text-text-muted">Trace: {meta.request_id}</p>
                  ) : null}
                  {!isUser && meta.escalation_pending && typeof meta.tool_required === "string" ? (
                    <div className="mt-3">
                      <AiEscalationCard
                        reason={typeof meta.reason === "string" ? meta.reason : "This request needs paid processing."}
                        toolRequired={meta.tool_required}
                        loading={approvingEscalationId === message.id}
                        onApprove={() => onApproveEscalation(message.id, meta.tool_required as string)}
                        onCancel={() => onCancelEscalation(message.id)}
                      />
                    </div>
                  ) : null}
                  {!isUser && visibleToolResults.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {visibleToolResults.map((item, idx) => (
                        <AiResponseCard key={`${message.id}-${idx}-${item.tool_name}`} item={item} />
                      ))}
                    </div>
                  ) : null}
                  {!isUser ? <AiMessageFeedbackBar message={message} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
