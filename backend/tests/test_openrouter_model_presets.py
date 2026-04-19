from app.common.openrouter_model_presets import OPENROUTER_MODEL_PRESETS


def test_openrouter_model_presets_include_curated_slugs():
    slugs = {p["slug"] for p in OPENROUTER_MODEL_PRESETS}
    assert "google/gemini-2.5-flash-lite" in slugs
    assert "openai/gpt-4o" in slugs
    assert "google/gemma-4-31b-it:free" in slugs
    assert "nvidia/nemotron-3-super-120b-a12b:free" in slugs
    assert "x-ai/grok-4.1-fast" in slugs
    assert "google/gemma-3-12b-it:free" in slugs
