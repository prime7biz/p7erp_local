# Prime7 multi-agent development workflow (quality-first hybrid)

How the agents in `.cursor/agents/` work together. Models and authorization: `MODEL-USAGE-POLICY.md`. Always-applied rules:
`prime7-core.mdc`, `prime7-security.mdc`, `prime7-orchestration.mdc`. Verified facts: `prime7-development.mdc`. Tracked
gaps: `KNOWN-ISSUES.md`.

Everything here is **instruction to the AI**. Cursor enforces only the agent-file `model` and `readonly` fields, its
approval prompts and your dashboard limits. It does not enforce gate order, loop limits or verdict wording.

## 1. Agents (17)

| Agent | Model | `readonly` | Writes files | Role |
|---|---|---|---|---|
| `explorer` | inherit (Auto) | true | no | Targeted evidence with file references |
| `architect` | inherit | true | no | STANDARD plans |
| `architect-premium` | `claude-opus-4-8-thinking-high` | true | no | ADVANCED and CRITICAL plans |
| `plan-auditor` | inherit | true | no | STANDARD plan verdict |
| `plan-auditor-premium` | `gpt-5.6-sol-medium` | true | no | Final plan verdict for ADVANCED and CRITICAL |
| `ui-designer` | inherit | true | no | Small or moderate UI briefs |
| `ui-designer-premium` | `gemini-3.1-pro` | true | no | New modules, dashboards, major redesigns |
| `backend-developer` | inherit | false | owned backend files | Routine backend scope |
| `backend-developer-premium` | `claude-sonnet-5-5-high` | false | owned backend files | Complex or CRITICAL backend scope |
| `frontend-developer` | inherit | false | owned frontend files | Routine frontend scope |
| `frontend-developer-premium` | `claude-sonnet-5-5-high` | false | owned frontend files | Complex screens and redesigns |
| `test-runner` | inherit | false | **no** (by instruction) | Executes allowlisted test, lint and type-check commands; raw results only |
| `qa-engineer` | inherit | true | no | STANDARD QA review of diff and test output |
| `qa-engineer-premium` | `gpt-5.6-sol-medium` | true | no | Final QA verdict for ADVANCED and CRITICAL |
| `debugger-premium` | `gpt-5.6-sol-medium` | false | **no** (by instruction) | Root cause of complex defects; proposes the fix |
| `security-auditor` | inherit | true | no | Security screening |
| `security-auditor-premium` | `claude-opus-4-8-thinking-high` | true | no | Final security review for ADVANCED sensitive and all CRITICAL changes |

**Read-only agents cannot run shell** (observed: Cursor blocks it). The parent passes them `git status --short`,
`git diff` and `test-runner` output in the prompt. Test **execution** (`test-runner`) is deliberately separated from QA
**judgement** (`qa-engineer`, `qa-engineer-premium`).

## 2. Parent responsibilities

- Classify the mode and say why.
- Choose agents (Premium is allowed under the standing authorization).
- Give each subagent a complete prompt, since subagents do not see the chat.
- Run `git status` and `git diff` itself, and forward the output to read-only reviewers.
- Check verdict lines and count correction rounds.
- Write the final report, naming every Premium agent used and why.

The parent never accepts a subagent's claim as proof.

## 3. Workflows

### STANDARD (default)
1. Explore (parent, `explore` or `explorer`).
2. For trivial changes, the parent or an Auto developer implements, then `test-runner` runs focused checks.
3. For substantial changes:
   - `architect` plans, then `plan-auditor` gives a verdict. Escalate both to Premium for a hard design.
   - An Auto developer implements, or a Premium developer if the scope is complex.
   - `test-runner` runs the tests.
   - `qa-engineer` reviews (required for substantial changes).
4. Security-sensitive changes (section 5) need an independent security review: `security-auditor`, escalating to
   `security-auditor-premium` for any finding of medium severity or above, or when the change is CRITICAL.
5. Report.

### ADVANCED (new modules, architecture changes, complex integrations, major UI redesigns)
1. `explorer` gathers evidence.
2. `architect-premium` writes the plan, split into disjoint scopes with routine and complex parts marked.
3. `plan-auditor-premium` gives the verdict. For REVISE, the architect fixes only the listed findings (max 2 rounds).
4. `ui-designer-premium` writes the brief if UI is involved.
5. Premium developers implement the complex scopes; Auto developers implement routine scopes (in parallel only per section 6).
6. `test-runner` runs the tests.
7. `qa-engineer-premium` reviews.
8. `security-auditor-premium` reviews the sensitive parts.
9. Report.

### CRITICAL (finance, accounting, inventory valuation, posting, tenant isolation, authorization, migrations)
1. `explorer` gathers evidence.
2. `architect-premium` writes the plan (mandatory). Acceptance criteria must be evidence-backed and each must name its regression test.
3. `plan-auditor-premium` gives the verdict (mandatory). A BLOCK stops the workflow.
4. Implementation: `backend-developer-premium` is preferred for complex logic, posting and migrations.
5. `test-runner` runs the focused suite plus neighbouring suites (tenant ownership, route permissions, finance posting
   guards, inventory accounting, commercial).
6. `qa-engineer-premium` reviews (mandatory).
7. `security-auditor-premium` reviews (mandatory). An Auto `security-auditor` screening first is optional.
8. Block completion while any critical defect remains. If a mandatory Premium step is unavailable, stop and report.

## 4. Gates

| Gate | Pass condition | On failure |
|---|---|---|
| Plan | `VERDICT: PASS` from an auditor that did not write the plan | REVISE: architect fixes listed findings, fresh audit; max 2 rounds. BLOCK: stop |
| Scope | The parent's own `git diff --stat` shows only owned files changed | Stop and report |
| Tests | `RUN: COMPLETE` from `test-runner`, with result lines | `RUN: BLOCKED`: unblock safely or report |
| QA | `QA: PASS` from a reviewer that did not write the code | Implementer fixes findings, `test-runner` re-runs, fresh QA review; max 2 rounds |
| Security | `SECURITY: PASS` or `PASS WITH FINDINGS` with no critical or high findings | Same correction loop; an unresolved critical finding blocks completion |

- **Debugging:** when tests fail for unclear reasons after one Auto attempt, use `debugger-premium`. Its fix proposal goes
  to the responsible developer, and then the failed gate is re-run.
- **Never:** let the implementer be the only reviewer, treat generated code as proof, weaken a test or permission to pass a
  gate, or reuse the same agent instance to review its own output.

## 5. Security-sensitive triggers

Authentication or sessions; RBAC, permission keys or approval chains; tenant scoping or related-record ids; vouchers,
posting, ledgers, reversals or period locks; the posting modules (`finance`, `commercial`, `commission`, `facility`,
`hr_payroll`, `inventory`, `production`); inventory valuation or cost layers; migrations; files or media; AI/LLM endpoints;
external portals; env or config; raw SQL; deployment files.

## 6. Parallel work

- Use parallel agents only where the work truly separates. Do not add agents that add no value.
- **Read-only agents may run in parallel**, for example `qa-engineer-premium` and `security-auditor-premium` on the same diff,
  or `explorer` alongside `ui-designer`.
- **At most two implementation agents at once**, each in its own Git worktree (`git worktree add ../p7erp_wt_<scope> -b ai/<task>-<scope>`),
  with disjoint files and a frozen API contract. Never two writers in one checkout, never overlapping files.
- Repo facts:
  - `docker-compose.yml` bind-mounts the **main checkout** (`./backend:/app`, `./frontend:/app`), so
    `docker compose exec backend pytest` tests the main checkout only.
  - A worktree starts from a commit and lacks uncommitted changes, and the main tree has many.
  - So integrate worktree output into the main checkout (patch or a user-approved merge), then run `test-runner` there.
  - Run one pytest process at a time, because all tests share one dev database.
- In the main checkout, do not use `git checkout`, `stash`, `reset`, `clean` or branch switching while agents are active.
  Never revert other people's uncommitted changes.

## 7. Always needs the user

- Enabling on-demand billing, changing spending limits, or buying credits.
- Production deploys, tag pushes, SSH, and any non-local database action.
- Destructive or irreversible migrations, and `alembic downgrade`.
- `docker compose down -v`, and deleting data, files or branches.
- `git commit`, `push`, `tag`, force push, `reset`, `clean` or `stash`.
- Changes to `.env*`, credentials, compose files, Dockerfiles or CI.
- New dependencies.
- Schema, financial-semantics or permission changes outside the approved plan.
- Disabling a test or gate.

## 8. Stop conditions

- A plan BLOCK, or a third REVISE.
- A business rule the plan depends on is unspecified, POLICY or UNVERIFIED.
- An implementer needs a file outside its scope.
- Two correction rounds failed.
- Tests are blocked and cannot be unblocked safely.
- A mandatory Premium step for CRITICAL work is unavailable.
- Any destructive or production-affecting step is needed.
- Agent output contradicts `git diff` or the test output.

## 9. Final report skeleton

1. Mode and reason; each Premium agent used and why
2. Scope and plan verdict, with rounds used
3. Files changed, from the parent's own `git diff --stat`
4. Gates (Plan, Scope, Tests, QA, Security) with the verdict lines quoted
5. Test evidence: the exact commands and result lines from `test-runner`
6. Unverified items, open questions and unresolved findings (including any `KNOWN-ISSUES.md` item touched)
7. Operational impact and rollback; confirmation that nothing was committed, pushed or deployed unless asked

## 10. One-instruction usage

```text
<Describe the task>. Classify it per .cursor/rules/prime7-orchestration.mdc and follow
docs/ai-development/ORCHESTRATION.md end to end, using Premium specialists where justified. No commit or push.
```

To force a mode, add `Treat this as CRITICAL.` or `Treat this as ADVANCED.`

## 11. Known limitations

- Delegation is a model decision, so name an agent when it must be used.
- New agent files appear from the next message onward.
- Auto picks its own model on the server (observed `claude-opus-5-5-high`), and inherited agents follow it.
- Which billing pool is charged is visible only on the dashboard.
- Pinned Premium models have not been confirmed by a real run yet. The first Premium run should be checked in the UI and the logs.
- Premium files depend on their base files.
- Subagents do not see the chat.
