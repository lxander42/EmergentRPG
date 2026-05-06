---
description: Quiz the user on a roadmap item, then file it as a GitHub epic with linked sub-issues.
argument-hint: <roadmap item or phase name>
---

# Plan an epic

Take the roadmap item described in `$ARGUMENTS` and turn it into a filed GitHub epic with linked sub-issues. Don't write code. Don't open a PR. The deliverable is the issue list.

## 1. Frame the scope

Read the corresponding section of `README.md`. If `$ARGUMENTS` is ambiguous (multiple matching phases, vague phrase), ask the user which one they mean before going further. Confirm out loud what's already shipped vs. what this epic adds.

## 2. Quiz the user on design decisions

Use `AskUserQuestion` to ask 3–5 high-leverage questions before drafting anything. Focus on decisions that change the *shape* of the issue list — not minutiae that the implementing agent can settle:

- **Granularity** — atomic small issues vs. coarse milestones vs. epic + sub-issues. Recommend the third for anything ≥ 5 distinct work items.
- **Scope ceiling** — where does this epic stop, what's deferred to later phases.
- **Cross-cutting design choices** that propagate across multiple sub-issues (save schema, pathing, UI patterns, persistence).
- **Phase-boundary creep** — if a likely sub-issue belongs more naturally in a later phase per `README.md`, surface it and ask whether to keep or defer.

For each question, give 2–4 options with the recommended one labeled `(Recommended)` and listed first. One short paragraph of context per option, not a wall of text. A second round is fine if the first opened new ambiguity.

## 3. Draft the structure

Propose:
- **At most 2 epic issues** per roadmap bullet, each independently shippable.
- **Sub-issues** grouped under their parent epic. Tag the ones that block the rest as **foundation**.
- For each sub-issue: 1-line scope, 2–4 acceptance bullets, an explicit `Depends on` section listing other sub-issues by their planned label (`F1`, `B2`, etc.) — the implementing agent will resolve those to issue numbers later.

Reference real file paths (`lib/sim/path.ts`, `content/recipes.ts`, etc.) so the implementing agent doesn't have to hunt for the work site.

If you flagged any phase-creep in step 2, surface it again here.

## 4. Confirm before filing

Show the full structure as a chat message, then ask via `AskUserQuestion`:
- Ship to GitHub now
- Trim phase-creep / restructure first, then ship (recommended if anything was flagged)
- Draft to a local markdown file first

Do **not** file issues until the user has approved. Filing 20+ issues is hard to undo.

## 5. File on GitHub

Once approved:

1. Call `mcp__github__list_issues` to confirm no duplicates exist.
2. Create the epic issue(s) first via `mcp__github__issue_write` (`method: 'create'`). Capture each `id` from the response — the GraphQL ID, not the issue number.
3. Create sub-issues in parallel via `mcp__github__issue_write`. Each body must contain:
   - `Part of #<epic-number>` as the first line
   - `## Scope` — concrete bullets, file paths where relevant
   - `## Acceptance` — 2–4 checkbox criteria
   - `## Depends on` — explicit cross-references by issue number
4. Link each sub-issue to its parent epic with `mcp__github__sub_issue_write` (`method: 'add'`). Use the captured `id` for `sub_issue_id`, not the issue number.
5. Report back the full list of filed issues with their numbers and links.

## Constraints

- Repo scope: `lxander42/emergentrpg` only.
- Match the README's voice — matter-of-fact, systems-focused, no emojis, code references in backticks.
- Issue bodies are short. Scope + acceptance + dependencies. Nothing else.
- This command does **not** open a PR. Issue-list creation only.
