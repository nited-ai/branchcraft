# Claude — read this first

This is **branchcraft**, a visual Git GUI with worktree + AI-session awareness and a drag-and-drop command simulator. Pre-MVP.

## Source of truth

Read in this order before any work:

1. [`PLAN.md`](./PLAN.md) — the full design spec, build plan, and aesthetic direction. ~1000 lines. Skim §0 (TL;DR), §3 (Aesthetic), §4 (UX model), §9 (Build plan) at minimum.
2. [`README.md`](./README.md) — public pitch, comparison vs existing tools.
3. [`Discussion #1`](https://github.com/nited-ai/branchcraft/discussions/1) — pre-MVP design feedback thread; the user has posted at least one comment shaping §4.1.

If you're tempted to add a feature or change scope, check `PLAN.md §10 (Out of Scope)` first. Most "why doesn't it do X" answers are explicit there.

## Status

- **Phase:** Evening 1 partially landed. Scaffold + first real logic (worktree parser) verified end-to-end.
- **Active branch:** `main`. Pre-MVP, no protected branch yet — direct commits to `main` are fine.
- **Sessions:** none of the AI session providers wired up yet. Evening 3 work.
- **Graph rendering:** not started. Evening 1's biggest remaining chunk.

## Run it

```bash
npm install      # only on first checkout
npm test         # vitest, currently 5 tests in src/server/git/worktrees.test.ts
npm run dev      # spawns Hono on :7777 + Vite on :5173 via scripts/dev.js
```

Visit http://localhost:5173 — Svelte SPA proxies `/api/*` to Hono. The current UI is an Evening-1 sketch: a worktree table, no graph yet.

`npm run dev` uses `scripts/dev.js` (not `concurrently`, which had Windows stdio-buffering issues). If you change parallelization, verify that tsx watch's output still flushes.

## File map

```
bin/branchcraft.js        CLI entry; expects dist/ from `npm run build`
src/shared/types.ts       Types shared between Hono server + Svelte web
src/server/index.ts       Hono app, /api/health and /api/worktrees
src/server/git/           Git wrappers — git binary shell-out via execFile
  worktrees.ts            `git worktree list --porcelain` parser (real)
  worktrees.test.ts       5 vitest cases: main/multi/locked/CRLF/empty
src/web/index.html        Vite entry, loads Manrope + IBM Plex Mono
src/web/main.ts           Svelte 5 mount
src/web/app.css           Refined-GitKraken design tokens (PLAN.md §3)
src/web/App.svelte        Evening-1 sketch UI, worktree table
scripts/dev.js            Parallel dev runner replacing concurrently
vite.config.ts            root: src/web, /api proxy to :7777
vitest.config.ts          root: __dirname, tests under src/**/*
tsconfig.json             Strict, exactOptionalPropertyTypes, path aliases
tsconfig.server.json      Server-only build config for `npm run build:server`
```

## Build plan (where to pick up)

PLAN.md §9 lists 9 evenings. As of last commit:
- ✅ Evening 1 partial: scaffold + worktree discovery + status table
- ⬜ Evening 1 remaining: SVG graph, worktree cards + session pills inline (per Discussion #1 §4.1.1/4.1.2), stale-detection visual, light/dark toggle button
- ⬜ Evening 2: multi-repo hub (left sidebar with pinned repos)
- ⬜ Evening 3: SessionProvider plugin architecture + 5 providers (CCD, Claude CLI, Codex CLI, Codex Desktop, Gemini CLI, Aider)
- ⬜ Evenings 4-9: simulator, drag, rucksacks, OAuth, teams, polish

When picking up, check the latest commit and recent Discussion comments first — both can change priorities.

## Conventions

- **TypeScript:** strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. Don't loosen.
- **Imports:** use the `.ts` extension explicitly (`import { x } from './y.ts'`) — required by `verbatimModuleSyntax`.
- **Svelte 5:** runes mode (`$state`, `$derived`, `$effect`). No legacy reactive `$:`.
- **Commits:** Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Testing:** every new server-side function gets at least one happy-path vitest. Frontend testing TBD when graph rendering lands.
- **Comments:** default to no comment. Only add when WHY is non-obvious (workaround, hidden constraint, surprising behavior). See PLAN.md and src files for tone.

## Aesthetic — "Refined GitKraken"

PLAN.md §3 has the full token list. Key points:
- Background: `#0d0e12` dark / `#fafaf9` light. Never pure black/white.
- Branch palette: 10 slots, deuteranopia-safe, uniform luminance. CSS variables `--branch-0` through `--branch-9`.
- Display font: Manrope. Mono: IBM Plex Mono. Banished: Inter, Roboto, Courier New, system-ui.
- Commit markers: **circles** (user preference). Diamonds were considered and rejected.
- Layout: vertical-flow graph, both sidebars collapsible (Discussion #1 feedback).

## Known gotchas

- **Windows + concurrently:** swallows tsx watch's stdout. Fixed via `scripts/dev.js`. Don't reintroduce `concurrently` for the dev script.
- **CRLF:** repo enforces nothing; tests handle CRLF in worktree-porcelain output.
- **Bun:** Hono is Bun-compatible but the primary runtime is Node 20+. Bun-specific APIs (`Bun.spawn`, `Bun.watch`) must NOT be used in core code; if needed, gate behind a runtime check.
- **`bin/branchcraft.js`:** intentionally errors out without `dist/`. Use `npm run dev` from a checkout, or `npm run build && npm start`.
- **Cross-project preview:** Claude Preview's launch.json enforces cwd inside the active project root. If running CCD in this repo, that's fine; if running CCD elsewhere with a launch.json pointing here, it'll be blocked.

## Project hygiene

- License: MIT (also in package.json, also in LICENSE file).
- No CI yet. Adding a GitHub Action for `npm test` + `tsc --noEmit` is appropriate next housekeeping work.
- No issue templates linting test yet — that comes when there's runtime code worth testing in the browser.
- `.gitignore` intentionally **commits** `package-lock.json` (npm-published tool needs reproducible installs).

---

When in doubt: PLAN.md is the source of truth. If PLAN.md is wrong, fix PLAN.md in the same commit as the code change.
