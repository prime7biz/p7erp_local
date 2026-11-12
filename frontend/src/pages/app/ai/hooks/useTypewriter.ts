import { useEffect, useState } from "react";

export interface UseTypewriterOptions {
  /** Milliseconds between revealing each character */
  msPerChar?: number;
  /** When false, show full text immediately (no animation) */
  enabled?: boolean;
  /** Longest the whole animation may take; long replies reveal several characters per tick. */
  maxDurationMs?: number;
}

/** Characters revealed per tick so the animation never runs longer than `maxDurationMs`. */
export function typewriterStep(length: number, msPerChar: number, maxDurationMs?: number): number {
  if (!maxDurationMs || maxDurationMs <= 0 || length <= 0) return 1;
  const ticks = Math.max(1, Math.floor(maxDurationMs / Math.max(1, msPerChar)));
  return Math.max(1, Math.ceil(length / ticks));
}

/**
 * Reveals text progressively for a chat-style "typing" effect.
 * When `enabled` is false, always mirrors `fullText` with no animation.
 */
export function useTypewriter(fullText: string, options?: UseTypewriterOptions): {
  displayedText: string;
  isTyping: boolean;
} {
  const msPerChar = options?.msPerChar ?? 12;
  const enabled = options?.enabled ?? true;
  const maxDurationMs = options?.maxDurationMs;

  const [displayed, setDisplayed] = useState(() => (!enabled || !fullText ? fullText : ""));
  const [isTyping, setIsTyping] = useState(() => Boolean(enabled && fullText.length > 0));

  useEffect(() => {
    if (!enabled) {
      setDisplayed(fullText);
      setIsTyping(false);
      return;
    }
    if (!fullText) {
      setDisplayed("");
      setIsTyping(false);
      return;
    }
    setDisplayed("");
    setIsTyping(true);
    const step = typewriterStep(fullText.length, msPerChar, maxDurationMs);
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(fullText.length, i + step);
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) {
        window.clearInterval(id);
        setIsTyping(false);
      }
    }, msPerChar);
    return () => window.clearInterval(id);
  }, [fullText, enabled, msPerChar, maxDurationMs]);

  return { displayedText: displayed, isTyping };
}
