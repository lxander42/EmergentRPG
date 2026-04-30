# Contributing to Emergent RPG

Thanks for your interest in contributing! This project is early-stage and experimental, and we value clarity, curiosity, and collaboration.

EmergentRPG is now a mobile-first web app (Next.js + Phaser, deployed on Vercel). All you need is Node 20+ and a phone or a laptop. No Unity required.

---

## Quick Start

```bash
git clone https://github.com/lxander42/emergentrpg
cd emergentrpg
npm install
cp .env.example .env.local
# add your ANTHROPIC_API_KEY to .env.local
npm run dev
```

Open <http://localhost:3000>.

### Phone-first workflow

The intended development flow is from a phone, using [Claude Code](https://claude.ai/code) and Vercel preview deploys:

1. Create a feature branch off `dev`.
2. Push commits — Vercel builds a preview URL for every push.
3. Open the preview URL on your phone, **Add to Home Screen** to install the PWA, and test on real hardware.
4. Open a PR into `dev`.

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
- LLM-generated text in `app/api/*` is for flavor; it should never be authoritative for game state. Keep the source of truth in `lib/sim/world.ts`.
- Optimize for emergent behavior, not hard-coded outcomes.
- Avoid premature optimization.

## Project Layout

See `README.md` → "Repository Structure" for the canonical layout. Quick map:

- `lib/sim/` — game rules, world tick, NPC behavior, factions
- `lib/render/` — Phaser scenes, camera, input, React ↔ Phaser bus
- `lib/state/` — Zustand store (the bridge between sim, UI, and Phaser)
- `lib/save/` — IndexedDB persistence
- `lib/ai/` — Claude prompts and streaming helpers
- `app/` — Next.js routes (UI + Claude API endpoints)
- `components/` — React UI (HUD, panels, Phaser wrapper)
- `content/` — data-driven content

## Branching Model

- **main** — protected, must always remain stable.
- **dev** — active development. Create feature branches off `dev`. Periodically merged into `main` when stable.

## Signed Commits (Required)

All commits **must be signed**. Signed commits help maintain authorship clarity and accountability as the project grows.

```bash
git commit -S -m "Your commit message"
```

Or configure once:

```bash
git config --global commit.gpgsign true
```

PRs containing unsigned commits may be rejected or asked to be amended.

## Pull Requests

- Open PRs against `dev`.
- Clearly describe what you changed and why.
- Reference related issues or design docs when applicable.
- Run `npm run lint` and `npm run typecheck` locally before requesting review.
- Vercel will post a preview URL on the PR — try it on a phone before merging.

## Questions & Discussion

If something is unclear or you want feedback:
- Open an issue
- Start a discussion
- Ask early — this project is meant to evolve collaboratively
