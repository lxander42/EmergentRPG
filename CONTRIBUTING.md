# Contributing to Emergent RPG

Thanks for your interest in contributing! This project is early-stage and experimental, and we value clarity, curiosity, and collaboration.

EmergentRPG is now a mobile-first web app (Next.js + Phaser, deployed on Vercel). All you need is Node 20+ and a phone or a laptop. No Unity required.

---

## Quick Start

```bash
git clone https://github.com/lxander42/emergentrpg
cd emergentrpg
npm install
npm run dev
```

Open <http://localhost:3000>.

### Phone-first workflow

The intended development flow is from a phone, using [Claude Code](https://claude.ai/code) and Vercel preview deploys:

1. Create a worktree off the latest `main` on a new short-lived branch:

   ```bash
   git fetch origin main
   git worktree add ../emergentrpg-<task> -b claude/<task> origin/main
   cd ../emergentrpg-<task>
   ```

2. Push commits — Vercel builds a preview URL for every push.
3. Open the preview URL on your phone, **Add to Home Screen** to install the PWA, and test on real hardware.
4. Open a PR into `main`. Once merged, GitHub deletes the branch and you `git worktree remove ../emergentrpg-<task>`.

The `.claude/hooks/session-start.sh` hook installs npm deps automatically on fresh Claude Code on the web sessions, so a brand-new remote session is ready to run `npm run dev`, `npm run typecheck`, or `npm run lint` without any manual setup.

## General Guidelines

- Keep changes focused and easy to review.
- Prefer small, incremental pull requests.
- Document systems, assumptions, and intent.
- Expect iteration — ideas may evolve or be discarded.

If you're unsure about direction, open an issue or draft PR early.

## Code & Design Philosophy

- Favor systems over scripts.
- Favor data-driven design — new factions, traits, and biomes should live in `content/` as plain TypeScript data, not as code branches.
- The simulation in `lib/sim/` should be **deterministic** given a seed. Anything stochastic must go through the seeded RNG in `lib/sim/rng.ts` so saves are reproducible.
- Optimize for emergent behavior, not hard-coded outcomes.
- Avoid premature optimization.

## Project Layout

See `README.md` → "Repository Structure" for the canonical layout. Quick map:

- `lib/sim/` — game rules, world tick, NPC behavior, factions
- `lib/render/` — Phaser scenes, camera, input, React ↔ Phaser bus
- `lib/state/` — Zustand store (the bridge between sim, UI, and Phaser)
- `lib/save/` — IndexedDB persistence
- `app/` — Next.js routes (UI)
- `components/` — React UI (HUD, panels, Phaser wrapper)
- `content/` — data-driven content

## Branching Model

`main` is the only persistent branch. It's protected; merges go through PRs with passing CI.

Each task lives in a short-lived `claude/<task-name>` branch checked out as a git worktree off `main`. After the PR merges, the branch is deleted (GitHub handles this automatically) and the worktree is removed locally. There is no `dev` branch.

## Pull Requests

- Open PRs against `main`.
- Clearly describe what you changed and why.
- Reference related issues or design docs when applicable.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` locally before requesting review.
- Vercel will post a preview URL on the PR — try it on a phone before merging.

## Questions & Discussion

If something is unclear or you want feedback:
- Open an issue
- Start a discussion
- Ask early — this project is meant to evolve collaboratively
