# Cheap Auto cheat sheet

Paste these phrases to keep Cursor Auto on cheaper, capable models.  
Full policy: `MODEL-USAGE-POLICY.md`. Workflow: `ORCHESTRATION.md`.

**Rule of thumb:** parent chat first → Auto inherit agents only → Premium/Opus only if you say yes.

## One-line starter (paste every task)

```text
Cost mode: parent-first, Auto inherit only, no premium/Opus/Max.
Plan briefly here → build here → run focused tests yourself →
optional Auto qa-engineer / security-auditor only if needed.
Agents: up to 15, or the number I name in this chat. 0 premium unless I say yes.
```

## Always (keeps cost low)

- `Stay in parent chat. No premium. No Opus. No Max mode.`
- `Use Auto inherit agents only.`
- `Up to 15 agents, or the number I name in this chat. Prefer Grep/Read over launching explorer.`

## Plan

- `Short plan in this chat first. Do not launch architect unless the plan is large.`
- `If ADVANCED/CRITICAL: Auto plan-auditor only (not premium).`

## Build

- `Implement here yourself. Do not spawn backend/frontend-developer unless files are clearly split.`
- `Writers that change files use separate worktrees and disjoint files.`

## Verify

- `You run the focused tests in Docker/npm yourself.`
- `Only then: one Auto qa-engineer if the change is substantial.`
- `Security/tenant/finance: Auto security-auditor only. Ask me before any premium security review.`

## When something fails

- `Fix in this chat first. Do not start debugger-premium unless I approve.`

## What you do in Cursor (biggest savings)

1. Chat model dropdown: keep **Auto**, or lock **GPT 5.6 / Sonnet 5.5 / Gemini** if Auto feels expensive.
2. Leave **Max mode** off.
3. Start a **new chat per task** (long chats cost more).
4. Keep a **spending limit** on the Cursor dashboard.

## Default model map (no Premium)

| Stage | Who | Model |
|---|---|---|
| Plan | Parent chat | Auto |
| Plan review (big/risky) | `plan-auditor` | inherit (Auto) |
| Build | Parent (or Auto developer if split) | inherit |
| Run tests | Parent (Shell) | no extra model |
| QA | `qa-engineer` | inherit |
| Security | `security-auditor` | inherit |

Premium agents (`*-premium`) and Opus stay off unless you explicitly ask.
