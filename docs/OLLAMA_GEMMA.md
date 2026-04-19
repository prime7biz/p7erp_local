# Ollama + Gemma (low-spec / CPU-only)

**Default tier-1 routing:** see [OpenRouter](OPENROUTER.md) — **Ollama first** when `OLLAMA_URL` is set, unless `OPENROUTER_TIER1_PREFERRED=true`. This page covers the **local** side.

P7 ERP uses **Ollama** as the local tier-1 fallback (`get_llm_provider()`), with a small **Gemma 2** model suitable for **4-core CPU, ~16 GB RAM, no GPU**.

## Default model

| Setting | Value |
|--------|--------|
| `OLLAMA_MODEL` | `gemma2:2b-instruct-q4_K_M` |

This tag is published on the [Ollama library](https://ollama.com/library/gemma2) (Q4_K_M quantization balances quality and RAM).

## Fallbacks if the machine is still tight

- `gemma2:2b-instruct-q4_0` — slightly smaller quant (if listed for your Ollama version)
- `gemma2:2b` — base 2B tag (often smallest footprint)

Pull manually, then set `OLLAMA_MODEL` to match `ollama list`.

## Docker Compose (dev / prod)

- Compose sets `OLLAMA_URL=http://ollama:11434` (backend talks to the `ollama` service by name).
- `ollama-init` runs `ollama pull gemma2:2b-instruct-q4_K_M` once the `ollama` service is healthy (download can take minutes; backend does not wait for it).

## Host Ollama + Docker backend

If Ollama runs on the host and the API runs in Docker:

```env
OLLAMA_URL=http://host.docker.internal:11434
```

(Linux without Docker Desktop: use the host gateway IP or run Ollama in Compose.)

## OpenRouter vs Ollama vs Gemini

Provider order in code: **Ollama (when enabled)** → **OpenRouter (if configured)** → **vLLM** → **stub**, unless **`OPENROUTER_TIER1_PREFERRED=true`** (then OpenRouter before Ollama). Gemini is not used for tier-1 chat.

- Tier-1 uses OpenRouter when Ollama is off/unconfigured and **`OPENROUTER_API_KEY`** + **`OPENROUTER_MODEL`** are set; see **`docs/OPENROUTER.md`**.
- `docker-compose.yml` defaults **`GEMINI_ENABLED=false`** (Gemini legacy features off).
- To use Google Gemini for planning/extraction, set **`GEMINI_API_KEY`** and **`GEMINI_ENABLED=true`**.

## Resource tips

- Keep **one** primary model pulled; avoid loading multiple large models.
- On shared hosts, **fewer Uvicorn workers** leave CPU for Ollama (see comments in `docker-compose.yml` / `docker-compose.prod.yml`).

## Smoke check

After `ollama list` shows your model:

```powershell
docker compose exec backend python -c "from app.modules.ai_tool.llm_provider import get_llm_provider; from app.modules.ai_tool.llm_provider.ollama_provider import OllamaLlmProvider; p=get_llm_provider(); print(type(p).__name__, isinstance(p, OllamaLlmProvider))"
```

Expect `OllamaLlmProvider` and `True` when Ollama is enabled and `OLLAMA_URL` is set.
