import { useState } from "react";

import { mfgPredictiveApi, type ExplainSubject, type PredictionExplainResponse } from "@/api/mfgPredictive";
import { logApiError } from "@/utils/logApiError";

import { Chip } from "../IntelligenceUi";
import { ErrorBox, secondaryBtn } from "../phase2/Phase2Ui";
import { actionError, isAiWording } from "./phase4Logic";

/**
 * "Explain" for one finding or one order forecast. Shown only while `mfg_predictive_ai_text_v1` is on (the caller
 * decides). The answer is labelled: "AI wording" (approved AI provider, numbers checked by the server) or "Rule text".
 */
export function ExplainButton({ subject, recordId }: { subject: ExplainSubject; recordId: number }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PredictionExplainResponse | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      setResult(await mfgPredictiveApi.explainPrediction({ subject, record_id: recordId }));
    } catch (e) {
      logApiError("ExplainButton.explain", e);
      setError(actionError(e, subject === "order" ? "explain this forecast" : "explain this finding"));
    } finally {
      setPending(false);
    }
  };

  const ai = result ? isAiWording(result) : false;
  return (
    <div className="space-y-2" data-testid="mfg-explain">
      <button type="button" className={secondaryBtn} onClick={() => void run()} disabled={pending}>
        {pending ? "Explaining…" : result ? "Explain again" : "Explain"}
      </button>
      <ErrorBox message={error} />
      {result ? (
        <div className="space-y-1 rounded border border-border bg-surface-subtle p-2 text-xs text-text-primary">
          <Chip
            tone={ai ? "info" : "neutral"}
            title={ai ? "Worded by the company's approved AI provider; the numbers come from the statistics." : "Fixed wording from the rules (no AI)."}
          >
            {ai ? "AI wording" : "Rule text"}
          </Chip>
          <p className="whitespace-pre-line">{result.text}</p>
        </div>
      ) : null}
    </div>
  );
}
