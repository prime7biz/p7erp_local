from __future__ import annotations


def complexity_score(prompt: str) -> float:
    """Heuristic 0..1: higher means more likely to need premium / multi-step reasoning."""
    text = (prompt or "").strip().lower()
    if not text:
        return 0.0
    score = 0.0
    if len(text) > 1200:
        score += 0.35
    elif len(text) > 600:
        score += 0.2
    multi_tool_hints = (
        "compare",
        "and also",
        "as well as",
        "deep dive",
        "detailed analysis",
        "across all",
        "full picture",
    )
    if any(h in text for h in multi_tool_hints):
        score += 0.25
    if text.count("?") >= 2:
        score += 0.15
    if text.count("\n") >= 4:
        score += 0.1
    return min(1.0, score)


def suggest_premium_escalation(*, prompt: str, intent_confidence: float) -> tuple[bool, str]:
    """
    Returns (suggest_premium, reason).

    Does not force escalation; tier-1 triage still runs unless callers choose otherwise.
    """
    c = complexity_score(prompt)
    if c >= 0.75:
        return True, "High prompt complexity; consider premium orchestration."
    if intent_confidence < 0.45:
        return True, "Low intent confidence; consider premium disambiguation."
    return False, ""
