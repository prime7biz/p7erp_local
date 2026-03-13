import { useState } from "react";

interface Props {
  disabled?: boolean;
  onGenerate: (input: { prompt: string; horizonDays: number; fromDate?: string; toDate?: string }) => Promise<void> | void;
}

export function AiForecastRequestPanel({ disabled, onGenerate }: Props) {
  const [prompt, setPrompt] = useState("Generate cash flow projection");
  const [horizonDays, setHorizonDays] = useState(30);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const submit = async () => {
    const clean = prompt.trim();
    if (!clean || horizonDays < 7 || horizonDays > 365) return;
    await onGenerate({
      prompt: clean,
      horizonDays,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Forecast Request</h2>
      <div className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          placeholder="Generate inventory shortage forecast"
          disabled={disabled}
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            min={7}
            max={365}
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value || 30))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            disabled={disabled}
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            disabled={disabled}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            disabled={disabled}
          />
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled}
          className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Generate Forecast
        </button>
        <p className="text-[11px] text-slate-500">
          Forecasts are scenario-based and depend on assumptions. Confidence and limitations are shown in each result.
        </p>
      </div>
    </div>
  );
}
