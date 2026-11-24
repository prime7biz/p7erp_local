# Prime7 model usage policy (balanced, cost-aware)

Updated 2026-11-19. Premium is fully opt-in. Expensive Opus models are never auto-launched. Prefer cheaper
models (GPT 5.6, Claude Sonnet 5.5, Gemini). Companion files: `.cursor/rules/prime7-orchestration.mdc` (always
applied), `docs/ai-development/ORCHESTRATION.md` (workflow and gates), `.cursor/agents/` (agents).
Pasteable low-cost prompts: `docs/ai-development/CHEAP-AUTO-CHEATSHEET.md`.

## 1. Strategy

Priorities, in order:

1. Correctness and data integrity
2. Security and multi-tenant isolation
3. Business-workflow accuracy
4. Maintainability and architectural consistency
5. Test coverage and regression prevention
6. Performance and user experience
7. Cost

The quality rules stay (tenant checks, tests, an independent review of risky work). The Auto parent chat does most
work itself, Auto subagents do independent reviews, and Premium runs only when you ask.

## 2. Premium authorization (fully opt-in)

- Premium agents (`*-premium`) run only when the user asks in that task (for example "use premium" or names the agent),
  or after the AI asks with one short question and the user says yes.
- **No automatic Premium exception.** CRITICAL work uses Auto `security-auditor` on the final diff. Offer
  `security-auditor-premium` only if the user wants a stronger review.
- **Never auto-launch Opus.** Do not invoke `claude-opus-*` / Opus thinking-high pins unless the user explicitly
  requests that model for the task.
- Agent count: up to 15 agents per task. If the user names a number in the chat, use that number, including above 15.
  Premium stays opt-in (at most 1 Premium run unless the user asks). At most 2 correction rounds per gate.
- Never covered: enabling on-demand billing, raising spending limits, buying credits, production deployment,
  destructive migrations and production data changes. If a Premium call is refused, do not work around it.

## 3. Models

| Role | Model | Configured ID | When it runs |
|---|---|---|---|
| Parent chat and all Auto agents | Auto (or manually GPT 5.6 / Sonnet 5.5 / Gemini) | `inherit` | Always (default) |
| Plan verification, QA, debugging, architecture, security (Premium) | GPT-5.6 Sol Medium | `gpt-5.6-sol-medium` | On request only |
| Backend and frontend (Premium) | Claude Sonnet 5.5 Medium | `claude-sonnet-5-5-medium` | On request only |
| UI/UX design (Premium) | Gemini 3.1 Pro | `gemini-3.1-pro` | On request only |

Opus (`claude-opus-4-8-thinking-high` and similar) is **not** the default for any agent. Prefer the table above.

## 4. Agents and delegation

| Role | Default | Premium agent (opt-in) |
|---|---|---|
| Exploration | parent, or `explore` / `explorer` (quick) | none |
| Architecture | parent, or `architect` for large plans | `architect-premium` |
| Plan verification | `plan-auditor` (ADVANCED, CRITICAL) | `plan-auditor-premium` |
| Backend / frontend | parent, or `backend-developer` / `frontend-developer` | `*-developer-premium` |
| UI/UX design | parent, or `ui-designer` | `ui-designer-premium` |
| Test execution | parent runs tests in Shell; `test-runner` for long runs | none |
| QA review | `qa-engineer` (substantial changes) | `qa-engineer-premium` |
| Debugging | parent | `debugger-premium` |
| Security | `security-auditor` (sensitive STANDARD / ADVANCED / CRITICAL) | `security-auditor-premium` (on request only) |

## 5. Where the cost comes from (what you control)

| Cost driver | What to do |
|---|---|
| Premium subagents | Fully opt-in (this policy) |
| Number of subagents | Each one re-reads files from zero; up to 15 per task, or the number named in the chat |
| Long chats | Every message re-sends the whole chat; start a new chat for each new task |
| Always-applied rules + `AGENTS.md` | Sent with every message; keep them short; deploy and UI-button rules now load only when needed |
| Main chat model | Prefer **Auto**, or manually pick **GPT 5.6 / Sonnet 5.5 / Gemini**. Do not pin Opus for everyday work |
| Max mode | Leave off |

## 6. Observed platform behaviour and limits

| Topic | Status |
|---|---|
| Agent fields `name`, `description`, `model`, `readonly`, `is_background` | Verified; `model` defaults to `inherit` |
| `inherit` follows the parent model | Observed |
| What Auto resolves to | Chosen by Cursor's server; cannot be forced by rules. If Auto keeps picking an expensive model, pick GPT 5.6 / Sonnet / Gemini in the chat model dropdown |
| Premium agents are really used | Observed on 2026-11-09: one chat ran 12 Premium subagent calls under the old policy |
| `readonly: true` blocks shell | Observed; pass diffs and test output in the prompt |
| Billing pool per request | Only visible on the Cursor dashboard |

## 7. Billing safeguards

- Rules do not enforce billing. Dashboard spending limits do, so keep them set.
- Never claim a cost figure; there is no pricing or token data in the repository.
- Never enable on-demand billing, raise limits or buy credits on the user's behalf.

## 8. Maintenance

- To change a model, edit the `model:` line in the `*-premium.md` file after checking the slug in Cursor's model list.
- Premium files read their base agent file first. Keep both, and keep the base file's sections and headings stable.
- If a slug disappears, set it to `inherit` and record the change here.
- History: 2026-11-06 quality-first (many mandatory Premium steps) → 2026-11-09 one automatic Opus security review →
  2026-11-19 fully opt-in Premium, no Opus defaults → 2026-11-23 agent count raised from 3 to 15 per task, or any
  number named in the chat.
