# OpenRouter (cloud LLM)

Tier-1 AI chat uses **local Ollama first** when `OLLAMA_ENABLED=true` and `OLLAMA_URL` is set. If Ollama is disabled or unavailable, the backend uses **OpenRouter** when `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are set. The OpenRouter provider also falls back to Ollama on failure or empty output when Ollama is configured.

Set **`OPENROUTER_TIER1_PREFERRED=true`** when you want **OpenRouter traffic first** (so usage appears on your OpenRouter dashboard) even while Ollama is running in Docker.

Structured INFO logs: every successful OpenRouter completion emits **`openrouter_chat_completion`** with `model`, `latency_ms`, token counts, and `feature` (`tier1`, `paid_mcp`, or the feature name for tenant text). Failures log **`openrouter_request_failed`**. Filter Docker logs with `docker compose logs backend | findstr openrouter` (Windows) or `grep openrouter` on Unix.

Tenant-scoped narratives that previously used only Gemini (`generate_text_for_tenant`) can try OpenRouter first when **`OPENROUTER_TENANT_TEXT_ENABLED=true`**: dashboard AI brief, weekly report, production planning text, finance business overview (when that path calls the helper), etc. Rows in **`ai_usage_log`** use `provider='openrouter'` with token counts when the response includes usage. Document extraction stays on **Gemini multimodal** unless you enable Gemini; routing OpenRouter vision for PDFs is not in this path yet.

Report / extended-analysis / forecast intents can **request paid escalation** (approval card); outbound prompts to cloud models apply **PII redaction** and a short **tenant metadata** prefix (no customer PII).

**Per-tenant daily quota (ERP-side):** `AI_MAX_REQUESTS_PER_TENANT_PER_DAY` (default **0** = unlimited in `config` / Docker Compose) applies to AI chat messages and approve-escalation calls. If you set a positive value and exceed it, the API returns **429** with text *Daily AI request limit…* — that is **not** the same as OpenRouter’s **HTTPStatusError 429** on paid cloud calls. **`AI_MAX_TOKENS_PER_REQUEST`** caps completion size for OpenRouter and paid OpenAI-compatible calls (default 4096).

## Environment variables (repo root `.env`)

Use **`KEY=value`** syntax (not YAML `KEY: value`). Use **only one** `OPENROUTER_MODEL=` line in `.env` (duplicate keys are invalid and make the active model unpredictable).

## Model slugs (copy into `OPENROUTER_MODEL`)

The backend sends **one** model per request (`OPENROUTER_MODEL` or `PAID_LLM_MODEL`). Curated slugs live in `backend/app/common/openrouter_model_presets.py` (`OPENROUTER_MODEL_PRESETS`) so they stay in sync with docs.

| Slug | Notes |
|------|--------|
| `google/gemini-2.5-flash-lite` | Paid / credits; good default when avoiding `:free` 429s. |
| `openai/gpt-4o` | Paid / credits; strong general model via OpenRouter. |
| `google/gemma-4-31b-it:free` | Default in `config` / Docker; general instruct. |
| `google/gemma-4-26b-a4b-it:free` | Alternate free Gemma 4. |
| `google/gemma-3-12b-it:free` | Alternate free Gemma 3 (mid size). |
| `google/gemma-3-4b-it:free` | Lightweight free Gemma 3. |
| `nvidia/nemotron-3-super-120b-a12b:free` | Large Nemotron MoE when free tier is available; strict limits. |
| `x-ai/grok-4.1-fast` | Grok fast path; often **credit-priced** — check OpenRouter pricing. |

Free `:free` models are throttled heavily (429s are common). For steady MCP / paid escalation, prefer **one** model **without** the `:free` suffix and ensure your OpenRouter account has **credits**.

### Reduce HTTP 429 (operator checklist)

1. **Single paid-capable model** — set exactly one line, for example:
   - `OPENROUTER_MODEL=google/gemini-2.5-flash-lite`
   - `OPENROUTER_MODEL=openai/gpt-4o`  
   Confirm the slug still exists at [openrouter.ai/models](https://openrouter.ai/models) (names change).

2. **Prefer local Ollama (Docker)** — avoid cloud traffic for tier‑1 when Ollama is healthy:
   ```env
   OPENROUTER_TIER1_PREFERRED=false
   ```
   In this repo, Ollama runs in **Docker Compose** (`ollama` service), not only `ollama serve` on the host. Ensure the stack is up (`docker compose up -d`) and the model is pulled (see `docs/OLLAMA_GEMMA.md`; default image pulls `gemma2:2b-instruct-q4_K_M`).

3. **Retries** — the backend already retries **429** and **503** on OpenRouter-compatible **POST** `chat/completions` and **GET** `/models` with exponential backoff (`backend/app/common/httpx_openrouter_retry.py`). Persistent 429 after retries means OpenRouter is still refusing the account or model; wait, add credits, or switch model.

**Synthetic “connection check” escalations** (tool names like `check_openrouter_connection`): the backend **does not** call `chat/completions` for those. It performs a lightweight **GET /models** probe with retries instead, so you can verify keys/reachability without burning the chat rate limit on a long session history.

```env
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemma-4-31b-it:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# Optional attribution (recommended by OpenRouter)
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=P7 ERP
# Prefer cloud tier-1 over Ollama when both are configured
OPENROUTER_TIER1_PREFERRED=false
# Tenant text (briefs, reports, planning narrative): OpenRouter first, then Gemini
OPENROUTER_TENANT_TEXT_ENABLED=false
```

## Gemini

Google Gemini is **off by default** (`GEMINI_ENABLED=false` in `config` / compose). Enable `GEMINI_ENABLED=true` and set `GEMINI_API_KEY` only if you want legacy Gemini features (planning, extraction, etc.).

## Paid escalation (MCP tool loop)

Some free models on OpenRouter may not support tool calling reliably; if escalation fails, try a tool-capable model or OpenAI.

For approved escalations, either set `PAID_LLM_PROVIDER=openrouter` or leave it empty: if `OPENROUTER_API_KEY` is set, the paid MCP loop defaults to OpenRouter.

Ensure `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` are set (or `PAID_LLM_*` as fallbacks when `PAID_LLM_PROVIDER=openrouter`).

Alternatively use OpenAI-compatible endpoints:

```env
PAID_LLM_PROVIDER=openai
PAID_LLM_BASE_URL=https://openrouter.ai/api/v1
PAID_LLM_API_KEY=sk-or-v1-...
PAID_LLM_MODEL=google/gemma-4-31b-it:free
```

## Smoke check

```powershell
docker compose exec backend python -c "from app.modules.ai_tool.llm_provider import get_llm_provider; from app.modules.ai_tool.llm_provider.openrouter_provider import OpenRouterLlmProvider; p=get_llm_provider(); print(type(p).__name__)"
```

With Ollama enabled in Docker (`OLLAMA_URL` set), expect `OllamaLlmProvider` for tier-1 even if `OPENROUTER_API_KEY` is set, unless `OPENROUTER_TIER1_PREFERRED=true`. With Ollama disabled and OpenRouter configured, expect `OpenRouterLlmProvider`.
