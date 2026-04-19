"""Curated OpenRouter model slugs for operators (set ``OPENROUTER_MODEL`` to one at a time).

Pricing and free-tier availability change; confirm at https://openrouter.ai/models before production.
"""

from __future__ import annotations

from typing import Final, TypedDict


class OpenRouterModelPreset(TypedDict):
    slug: str
    label: str
    notes: str


# Single env var OPENROUTER_MODEL (or PAID_LLM_MODEL for paid escalation) — pick one slug.
OPENROUTER_MODEL_PRESETS: Final[list[OpenRouterModelPreset]] = [
    {
        "slug": "google/gemini-2.5-flash-lite",
        "label": "Gemini 2.5 Flash Lite (paid / credits)",
        "notes": "Usually fewer 429s than :free models; confirm pricing on OpenRouter.",
    },
    {
        "slug": "openai/gpt-4o",
        "label": "OpenAI GPT-4o via OpenRouter (paid / credits)",
        "notes": "Strong general model; billed via OpenRouter credits.",
    },
    {
        "slug": "google/gemma-4-31b-it:free",
        "label": "Gemma 4 31B Instruct (free)",
        "notes": "Application default in config/docker; general instruct.",
    },
    {
        "slug": "google/gemma-4-26b-a4b-it:free",
        "label": "Gemma 4 26B A4B Instruct (free)",
        "notes": "Alternate free Gemma 4 family (smaller / different MoE layout).",
    },
    {
        "slug": "google/gemma-3-12b-it:free",
        "label": "Gemma 3 12B Instruct (free)",
        "notes": "Alternate free Gemma 3 instruct.",
    },
    {
        "slug": "google/gemma-3-4b-it:free",
        "label": "Gemma 3 4B Instruct (free)",
        "notes": "Lightweight free Gemma 3 instruct.",
    },
    {
        "slug": "nvidia/nemotron-3-super-120b-a12b:free",
        "label": "NVIDIA Nemotron 3 Super 120B A12B (free)",
        "notes": "Large MoE when offered on free tier; expect strict rate limits.",
    },
    {
        "slug": "x-ai/grok-4.1-fast",
        "label": "xAI Grok 4.1 Fast",
        "notes": "Often billed against credits on OpenRouter; verify current pricing.",
    },
]
