/**
 * "Has the user changed this form?" for the unsaved-changes warning (`useUnsavedChangesGuard`).
 *
 * The hook keeps a text copy (snapshot) of the form values and compares every render with it.
 * The snapshot is taken on the first render and again on the render where `baselineKey` changes.
 * Change `baselineKey` (for example a counter) in the same update that loads, resets or saves the form,
 * so loaded data never counts as a change and the form is clean again right after saving.
 */
import { useState } from "react";

/** Form values as text, so two copies can be compared. */
export function formSnapshot(values: unknown): string {
  return JSON.stringify(values) ?? "";
}

export function useFormDirty(values: unknown, baselineKey?: unknown): boolean {
  const current = formSnapshot(values);
  const [baseline, setBaseline] = useState(() => ({ key: baselineKey, snapshot: current }));
  if (!Object.is(baseline.key, baselineKey)) {
    setBaseline({ key: baselineKey, snapshot: current });
    return false;
  }
  return current !== baseline.snapshot;
}
