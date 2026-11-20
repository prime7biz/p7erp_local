/** Shared non-component helpers for the finance kit (kept separate for Fast Refresh). */

export function showingCountLabel(shown: number, total: number, noun: string): string {
  const plural = total === 1 ? noun : `${noun}s`;
  return `Showing ${shown} of ${total} ${plural}`;
}
