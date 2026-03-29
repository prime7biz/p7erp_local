import { useEffect, useRef, useState } from "react";
import type { AiMessageResponse } from "@/api/client";
import { AiEscalationCard } from "@/pages/app/ai/components/AiEscalationCard";
import { AiMessageFeedbackBar } from "@/pages/app/ai/components/AiMessageFeedbackBar";
import { AiResponseCard } from "@/pages/app/ai/components/AiResponseCard";
import { useTypewriter } from "@/pages/app/ai/hooks/useTypewriter";
import { readMessageMeta } from "@/pages/app/ai/utils/aiFormatting";

const HIDDEN_TOOL_CARDS = new Set(["knowledge_retrieval", "get_dashboard_summary"]);

function AssistantMessageBody({ content, animate }: { content: string; animate: boolean }) {
  const { displayedText, isTyping } = useTypewriter(content, { enabled: animate, msPerChar: 12 });
  return (
    <p className="whitespace-pre-wrap">
      {displayedText}
      {animate && isTyping ? (
        <span
          className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current align-middle opacity-70"
          aria-hidden
        />
      ) : null}
    </p>
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
            const visibleToolResults = toolResults.filter((r) => !HIDDEN_TOOL_CARDS.has(r.tool_name));
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
                  ) : (
                    <AssistantMessageBody content={message.content} animate={animateAssistant} />
                  )}
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
