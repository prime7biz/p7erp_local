# Prime7 model usage policy (quality-first hybrid Auto + Premium)

Updated 2026-11-06 for Cursor 3.29.9 (Windows). This replaces the earlier cost-minimization policy. Companion files:
`.cursor/rules/prime7-orchestration.mdc` (always applied), `docs/ai-development/ORCHESTRATION.md` (workflow and gates),
`.cursor/agents/` (agents).

## 1. Strategy

Build an enterprise-grade, secure, scalable garment ERP. Priorities, in order:

1. Correctness and data integrity
2. Security and multi-tenant isolation
3. Business-workflow accuracy
4. Maintainability and architectural consistency
5. Test coverage and regression prevention
6. Performance and user experience
7. Efficient use of the Auto and Premium allowances

Use Auto for valuable routine work: exploration, routine code, docs, test preparation and test execution. Use Premium
specialists wherever complexity, risk or independent verification calls for them. Do not hold Premium back at the expense
of quality, and do not run agents just to consume allowance.

## 2. Standing Premium authorization

The user has authorized Premium models for ordinary local development, planning, verification, debugging, testing and
security review (2026-11-06). The parent may invoke `*-premium` agents automatically when justified, and names them and the
reason in the final report.

**Not covered** (always ask the user): enabling on-demand billing, raising spending limits, buying credits, production
deployment, destructive migrations, and production data changes. Cursor's dashboard spending controls stay in force. If a
Premium call is refused (for example a limit was reached), do not work around it. For CRITICAL work, stop and report.

## 3. Models

| Role | Preferred model | Configured ID | Verified |
|---|---|---|---|
| Architecture | Claude Opus 4.8 High | `claude-opus-4-8-thinking-high` | Listed slug; seen as a real `modelName` in Cursor logs |
| Plan verification | GPT-5.6 Sol Medium | `gpt-5.6-sol-medium` | Listed slug; seen in Cursor logs |
| Backend and frontend | Claude Sonnet 5.5 High | `claude-sonnet-5-5-high` | Listed slug (the catalog name `claude-sonnet-5-5` appears in renderer logs) |
| UI/UX design | Gemini 3.1 Pro | `gemini-3.1-pro` | Listed slug; seen as `catalogModelId` |
| Complex debugging | GPT-5.6 Sol Medium | `gpt-5.6-sol-medium` | as above |
| QA reasoning | GPT-5.6 Sol Medium | `gpt-5.6-sol-medium` | as above |
| Security | Claude Opus 4.8 High | `claude-opus-4-8-thinking-high` | as above |
| Routine work | Auto | `inherit` | Agents follow the parent's model (observed) |

"Listed slug" means the ID appears in this Cursor session's subagent model list. "Claude Opus 4.8 High" maps to
`claude-opus-4-8-thinking-high`, the only Opus 4.8 slug.

## 4. Agents and delegation

| Role | Auto agent (`inherit`) | Premium agent (pinned) | Use Premium when |
|---|---|---|---|
| Exploration | `explorer`, built-in `explore` | none (not needed) | never |
| Architecture | `architect` | `architect-premium` | ADVANCED, CRITICAL, or a hard STANDARD design |
| Plan verification | `plan-auditor` | `plan-auditor-premium` | ADVANCED, CRITICAL, or a difficult plan |
| Backend | `backend-developer` | `backend-developer-premium` | complex logic, posting, transactions, valuation, authorization, migrations |
| Frontend | `frontend-developer` | `frontend-developer-premium` | complex screens, multi-step workflows, major redesigns, finance or inventory entry screens |
| UI/UX design | `ui-designer` | `ui-designer-premium` | new modules, dashboards, major redesigns |
| Test execution | `test-runner` | none (execution is mechanical) | never |
| QA review | `qa-engineer` | `qa-engineer-premium` | ADVANCED and CRITICAL (mandatory), or a substantial STANDARD change with risk |
| Debugging | parent (Auto) first | `debugger-premium` | complex or intermittent defects after a first Auto attempt |
| Security | `security-auditor` (screening) | `security-auditor-premium` | ADVANCED sensitive changes, all CRITICAL (mandatory) |

Independence works best when reviewer and author use different model families. For example, Sonnet implements, GPT-5.6
reviews QA and Opus reviews security.

## 5. Observed platform behaviour and limits

| Topic | Status | Evidence |
|---|---|---|
| Agent fields `name`, `description`, `model`, `readonly`, `is_background` | Verified | Parser in the installed app; `model` defaults to `inherit` |
| `inherit` follows the parent model | Observed | In the validation run, both subagents used the parent's resolved model |
| What "Auto" resolves to | Observed, varies | The chat selected `default` (Auto), and the requests ran on `claude-opus-5-5-high`. Auto's choice is made by the server; the label "Auto Cost" does not exist in the installed app |
| Which pool Auto or inherited agents bill | **Not verified** | Check the Cursor dashboard usage records |
| `readonly: true` blocks shell | Observed | Explorer reported "shell was blocked in Ask mode". Read-only agents need diffs and test output in their prompt |
| Pinned Premium models are honoured | **Not verified** | No Premium agent has been run yet. The first real Premium run will show it in the UI label and the logs |
| Discovery of new agent files | Observed | New agent files appear in the Task tool list from the next message, not immediately |
| Task `model` override vs agent file | Not verified | Do not rely on it; use the `*-premium` agent files |
| Max / Fast modes | Not expressed in IDs | Avoid unless needed |

## 6. Billing safeguards (still apply)

- Rules do not enforce billing. Dashboard spending limits do, so keep them set.
- Never claim a cost figure; there is no pricing or token data in the repository.
- Never enable on-demand billing, raise limits or buy credits on the user's behalf.
- Keep prompts focused and exploration targeted. Allow at most two correction rounds per failed gate.

## 7. Maintenance

- To change a model, edit the `model:` line in the `*-premium.md` file after checking the slug in Cursor's model list.
- Premium files read their base agent file first. Keep both, and keep the base file's sections and headings stable.
- If a slug disappears, set it to `inherit` and record the change here.
