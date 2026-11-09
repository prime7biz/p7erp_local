import type { HrEmployeeResponse } from "@/api/client";
import { saveBlob } from "@/lib/fileSave";

/** Props shared by every record tab (tabs that need a saved employee). */
export type RecordTabProps = {
  employee: HrEmployeeResponse;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function downloadBlob(blob: Blob, filename: string): void {
  void saveBlob(blob, filename);
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
