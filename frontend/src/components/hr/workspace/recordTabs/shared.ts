import type { HrEmployeeResponse } from "@/api/client";

/** Props shared by every record tab (tabs that need a saved employee). */
export type RecordTabProps = {
  employee: HrEmployeeResponse;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
