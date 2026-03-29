import { useEffect, useState } from "react";

export interface UseTypewriterOptions {
  /** Milliseconds between revealing each character */
  msPerChar?: number;
  /** When false, show full text immediately (no animation) */
  enabled?: boolean;
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
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) {
        window.clearInterval(id);
        setIsTyping(false);
      }
    }, msPerChar);
    return () => window.clearInterval(id);
  }, [fullText, enabled, msPerChar]);

  return { displayedText: displayed, isTyping };
}
