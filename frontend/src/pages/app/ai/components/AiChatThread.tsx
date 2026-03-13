import type { AiMessageResponse } from "@/api/client";
import { AiResponseCard } from "@/pages/app/ai/components/AiResponseCard";
import { readMessageMeta } from "@/pages/app/ai/utils/aiFormatting";

interface Props {
  messages: AiMessageResponse[];
  loading: boolean;
}

export function AiChatThread({ messages, loading }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Conversation</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading conversation...</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-500">Start by asking a question or using a quick action.</p>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => {
            const isUser = message.role === "user";
            const meta = readMessageMeta(message);
            const toolResults = Array.isArray(meta.tool_results) ? meta.tool_results : [];
            return (
              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${
                    isUser ? "bg-primary text-white" : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {!isUser && meta.request_id ? (
                    <p className="mt-1 text-[11px] text-slate-500">Trace: {meta.request_id}</p>
                  ) : null}
                  {!isUser && toolResults.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {toolResults.map((item, idx) => (
                        <AiResponseCard key={`${message.id}-${idx}-${item.tool_name}`} item={item} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
