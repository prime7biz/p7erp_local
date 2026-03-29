import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { AiMessageResponse } from "@/api/client";
import { useAiMessageFeedback } from "@/pages/app/ai/hooks/useAiMessageFeedback";

const CATEGORIES = [
  { value: "", label: "Category (optional)" },
  { value: "wrong_answer", label: "Wrong answer" },
  { value: "missing_source", label: "Missing source" },
  { value: "hallucination", label: "Hallucination" },
  { value: "slow", label: "Too slow" },
  { value: "permission_issue", label: "Permission issue" },
  { value: "other", label: "Other" },
];

interface Props {
  message: AiMessageResponse;
}

export function AiMessageFeedbackBar({ message }: Props) {
  const { submitFeedback, submittingMessageId, error, clearError } = useAiMessageFeedback();
  const [thanks, setThanks] = useState(false);
  const [expandDown, setExpandDown] = useState(false);
  const [correction, setCorrection] = useState("");
  const [category, setCategory] = useState("");
  const [flagReview, setFlagReview] = useState(false);

  const busy = submittingMessageId === message.id;

  const onRate = async (rating: 1 | -1) => {
    clearError();
    if (rating === -1) {
      setExpandDown(true);
      return;
    }
    const res = await submitFeedback(message, rating);
    if (res) {
      setThanks(true);
      setExpandDown(false);
    }
  };

  const submitNegative = async () => {
    const res = await submitFeedback(message, -1, {
      correction_text: correction.trim() || null,
      feedback_category: category || null,
      flagged_for_review: flagReview,
    });
    if (res) {
      setThanks(true);
      setExpandDown(false);
      setCorrection("");
      setCategory("");
      setFlagReview(false);
    }
  };

  if (thanks) {
    return <p className="mt-2 text-[11px] text-text-muted">Thanks — your feedback was recorded.</p>;
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-text-muted">Was this helpful?</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRate(1)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          title="Helpful"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          Yes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRate(-1)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          title="Not helpful"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          No
        </button>
      </div>
      {expandDown ? (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface-subtle p-2">
          <p className="text-[11px] text-text-muted">Tell us what went wrong (optional).</p>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Correction or expected answer..."
            className="w-full rounded-md border border-border bg-surface-base px-2 py-1 text-xs text-text-primary"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-base px-2 py-1 text-xs text-text-primary"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value || "none"} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[11px] text-text-secondary">
            <input
              type="checkbox"
              checked={flagReview}
              onChange={(e) => setFlagReview(e.target.checked)}
            />
            Flag for admin review
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitNegative()}
              className="rounded-md bg-primary px-2 py-1 text-[11px] text-white hover:opacity-90 disabled:opacity-50"
            >
              Submit feedback
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setExpandDown(false);
                clearError();
              }}
              className="rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-base"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
