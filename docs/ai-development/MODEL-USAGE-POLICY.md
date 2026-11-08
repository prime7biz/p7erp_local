# Prime7 model usage policy (balanced, cost-aware)

Updated 2026-11-09. This replaces the 2026-11-06 "quality-first hybrid" policy, which gave a standing Premium
authorization and made several Premium steps mandatory. In practice one task could run 10+ Premium subagents, which made
Cursor too expensive. Companion files: `.cursor/rules/prime7-orchestration.mdc` (always applied),
`docs/ai-development/ORCHESTRATION.md` (workflow and gates), `.cursor/agents/` (agents).

## 1. Strategy

Priorities, in order:

1. Correctness and data integrity
2. Security and multi-tenant isolation
3. Business-workflow accuracy
4. Maintainability and architectural consistency
5. Test coverage and regression prevention
6. Performance and user experience
7. Cost

The quality rules stay (tenant checks, tests, an independent review of risky work). What changed is **who** does the
work: the Auto parent chat does most work itself, Auto subagents do independent reviews, and Premium is opt-in.

## 2. Premium authorization (opt-in)

- The 2026-11-06 standing Premium authorization is **withdrawn**.
- Premium agents (`*-premium`) run only when the user asks in that task (for example "use premium" or names the agent),
  or after the AI asks with one short question and the user says yes.
- **One automatic exception:** CRITICAL work (finance, posting, inventory valuation, tenancy, authorization,
  migrations) gets `security-auditor-premium` once on the final diff.
- Budget per task without asking: at most 3 subagent runs, at most 1 Premium run, at most 2 correction rounds per gate.
- Never covered: enabling on-demand billing, raising spending limits, buying credits, production deployment,
  destructive migrations and production data changes. If a Premium call is refused, do not work around it.

## 3. Models

| Role | Model | Configured ID | When it runs |
|---|---|---|---|
| Parent chat and all Auto agents | Auto | `inherit` | Always (default) |
| Security review | Claude Opus 4.8 High | `claude-opus-4-8-thinking-high` | Automatic once for CRITICAL; otherwise on request |
| Architecture | Claude Opus 4.8 High | `claude-opus-4-8-thinking-high` | On request only |
| Plan verification, QA, debugging | GPT-5.6 Sol Medium | `gpt-5.6-sol-medium` | On request only |
| Backend and frontend | Claude Sonnet 5.5 Medium | `claude-sonnet-5-5-medium` | On request only |
| UI/UX design | Gemini 3.1 Pro | `gemini-3.1-pro` | On request only |

The developer agents were pinned to `claude-sonnet-5-5-high`, which is not in the current Cursor subagent model list.
They now use `claude-sonnet-5-5-medium` (listed, and cheaper).

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
| Security | `security-auditor` (sensitive STANDARD / ADVANCED) | `security-auditor-premium` (automatic for CRITICAL) |

## 5. Where the cost comes from (what you control)

| Cost driver | What to do |
|---|---|
| Premium subagents | Opt-in now (this policy) |
| Number of subagents | Each one re-reads files from zero; budget is 3 per task |
| Long chats | Every message re-sends the whole chat; start a new chat for each new task |
| Always-applied rules + `AGENTS.md` | Sent with every message; keep them short; deploy and UI-button rules now load only when needed |
| Main chat model | Keep it on **Auto**; do not pin Opus or other premium models for everyday work |
| Max mode | Leave off |

## 6. Observed platform behaviour and limits

| Topic | Status |
|---|---|
| Agent fields `name`, `description`, `model`, `readonly`, `is_background` | Verified; `model` defaults to `inherit` |
| `inherit` follows the parent model | Observed |
| What Auto resolves to | Chosen by Cursor's server; cannot be controlled by rules |
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
- To return to the old quality-first policy, restore the 2026-11-06 versions of this file, `ORCHESTRATION.md`,
  `prime7-orchestration.mdc` and the agent descriptions from Git.
