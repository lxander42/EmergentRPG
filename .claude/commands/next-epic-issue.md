---
description: Pick the next ready sub-issue from an epic, branch, implement, PR, and subscribe.
argument-hint: [epic issue number]
---

# Work the next epic issue

Take a single sub-issue from an open epic — the one that's ready to ship next — and drive it from a clean branch to a reviewed-ready PR. This command does write code and does open a PR. Repo scope: `lxander42/emergentrpg` only.

The companion to `/plan-epic`: that command files the epic and its sub-issues; this one executes them, one at a time.

## 1. Resolve the epic

- If `$ARGUMENTS` is a number, treat it as the epic issue number. Verify it's open and labeled `epic` via `mcp__github__issue_read`. Reject anything else.
- If `$ARGUMENTS` is empty, call `mcp__github__list_issues` with `state: 'open'` and the `epic` label.
  - **One match** -> use it.
  - **Multiple** -> ask the user via `AskUserQuestion` (up to 4 options, format `#<n> <title>`).
  - **Zero** -> tell the user to run `/plan-epic` first and stop.
- If `$ARGUMENTS` is anything else (a phrase, a slug), do not guess — ask the user to re-run with an issue number.

## 2. Enumerate sub-issues

Read the epic's linked sub-issues via `mcp__github__issue_read` (the sub-issue connection populated by `/plan-epic` step 5.4). If that connection is empty, fall back to `mcp__github__search_issues` with a query like `repo:lxander42/emergentrpg "Part of #<epic>" in:body`.

For each sub-issue capture: number, title, state, labels, the `## Scope` body, the `## Acceptance` body, and the `## Depends on` body. The structure is the one written by `/plan-epic` step 5.3.

## 3. Pick the next ready one (auto-pick, then confirm)

1. Filter to `state: open`.
2. Compute **ready** = every issue number listed in `## Depends on` is closed (or that section is empty/absent).
3. Sort ready issues: `foundation`-labeled first, then ascending issue number.
4. Take the head of the list. If the ready list is empty, print the blocked sub-issues with their open dependencies and stop — there's nothing to do until something else closes.

Before any branch or write, surface the candidate to the user: number, title, scope bullets, acceptance bullets, dependency status. Then `AskUserQuestion`:

- **Proceed with #N** (Recommended)
- **Pick a different ready issue** — show the rest of the ready list and let the user choose
- **Abort**

## 4. Branch off `origin/main`

`main` is the only persistent branch (per `CLAUDE.md`). One feature, one branch, one PR.

```
git fetch origin main
git switch -c claude/<slug> origin/main
```

`<slug>` = kebab-case of the sub-issue title, lowercased, ASCII-only, truncated to ~40 chars. If the branch already exists locally, append a short suffix.

## 5. Implement

The sub-issue's `## Scope` and `## Acceptance` are the spec. Honor every architectural invariant in `CLAUDE.md`:

- `lib/sim/` stays pure TypeScript — no Phaser, React, DOM, Dexie, fetch.
- All randomness via `lib/sim/rng.ts`. Never `Math.random()` inside `lib/sim/`.
- Single source of truth is the Zustand store (`lib/state/game-store.ts`). Prefer store actions over new bus events.
- Bump `WORLD_VERSION` in `lib/sim/world.ts` if `World`, `Npc`, `FactionState`, `Player`, `BiomeInterior`, or related shapes change.
- Phaser is client-only — `next/dynamic({ ssr: false })` only.
- Mobile-first defaults: `min-h-[100dvh]`, ≥ 44px hit targets, viewport not relaxed.
- Strict TS with `noUncheckedIndexedAccess`. No `any`.
- No comments unless the WHY is non-obvious. No emojis.

Track work with TodoWrite as items complete; mark each acceptance bullet as a separate todo so progress is visible.

## 6. Verify

Run, in order, halting on the first failure and fixing the root cause before retrying:

```
npm run typecheck
npm run lint
npm run build
```

These three are pre-allowlisted in `.claude/settings.json`. Do not push or open a PR until all three pass.

## 7. Commit, push, PR

- Commit with a plain, matter-of-fact message: `<short summary> (#<sub-issue>)`. No emojis. Don't reference the current task or PR in the message body.
- `git push -u origin claude/<slug>`. On network failure only, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s). Don't retry on non-network failures — diagnose them.
- Open the PR with `mcp__github__create_pull_request` against `main`. Body:

  ```
  Closes #<sub-issue>
  Part of #<epic>

  <one short paragraph: what changed and why>
  ```

- Subscribe to the new PR with `mcp__github__subscribe_pr_activity`. This is required by `CLAUDE.md` — review comments and CI failures arrive in-session as `<github-webhook-activity>` events. Don't end the turn without subscribing.

## 8. Report back

Print:

- The PR URL.
- The sub-issue closed and the epic it belongs to.
- The remaining open sub-issues under that epic, with their ready/blocked status.

If anything is still ready, suggest re-running `/next-epic-issue <epic>` to take the next one.

## Constraints

- Repo scope: `lxander42/emergentrpg` only.
- No emojis in source, commit messages, or PR bodies.
- Never push to `main`. Always `claude/<slug>`.
- Don't merge directly. The PR is the review handoff.
- Don't open the PR until typecheck + lint + build all pass.
- One sub-issue per invocation. If you finish early, the user re-runs the command for the next one.
