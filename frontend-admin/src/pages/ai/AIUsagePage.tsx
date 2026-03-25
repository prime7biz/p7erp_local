import { useEffect, useState } from "react";
import { listAiUsage } from "@/api/client";

export function AIUsagePage() {
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    listAiUsage().then(setData);
  }, []);
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">AI usage</h1>
      <pre className="text-xs bg-white border rounded p-3 overflow-auto max-h-[70vh]">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
