import { useEffect, useState } from "react";
import { getSystemHealth } from "@/api/client";

export function SystemHealthPage() {
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    getSystemHealth().then(setData);
  }, []);
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">System health</h1>
      <pre className="text-xs bg-white border rounded p-3 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
