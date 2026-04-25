# Claude — read this first

This is **branchcraft**, a visual Git GUI with worktree + AI-session awareness and a drag-and-drop command simulator. Pre-MVP.

## Source of truth

Read in this order before any work:

1. [`PLAN.md`](./PLAN.md) — the full design spec, build plan, and aesthetic direction. ~1000 lines. Skim §0 (TL;DR), §3 (Aesthetic), §4 (UX model), §9 (Build plan) at minimum.
2. [`README.md`](./README.md) — public pitch, comparison vs existing tools.
3. [`Discussion #1`](https://github.com/nited-ai/branchcraft/discussions/1) — pre-MVP design feedback thread; the user has posted at least one comment shaping §4.1.

If you're tempted to add a feature or change scope, check `PLAN.md §10 (Out of Scope)` first. Most "why doesn't it do X" answers are explicit there.

## Status

- **Phase:** Evenings 1–6 + 8 landed. Evening 7 (GitHub OAuth) deliberately deferred — needs an OAuth-app/client-secret the codebase can't produce on its own.
- **Active branch:** `main`. Pre-MVP, no protected branch yet — direct commits to `main` are fine.
- **Tests:** 74 vitest cases across 9 files, all green. `tsc --noEmit && svelte-check` is clean.
- **Live:** open repo gets a vertical-flow graph with worktree cards, session pills (Claude Code + Aider), stale outline, theme toggle, multi-repo sidebar, sticky queue panel with simulator preview, drag-to-cherry-pick, drag-to-merge, three rucksacks (stash/tags/reflog).

## Run it

```bash
npm install      # only on first checkout
npm test         # vitest, currently 5 tests in src/server/git/worktrees.test.ts
npm run dev      # spawns Hono on :7777 + Vite on :5173 via scripts/dev.js
```

Visit http://localhost:5173 — Svelte SPA proxies `/api/*` to Hono. `localhost:7777/` returns 404 in dev (only serves the build output when one exists; see static-fallback note in `src/server/index.ts`).

`npm run dev` uses `scripts/dev.js` (not `concurrently`, which had Windows stdio-buffering issues). The script ignores stdin so children survive non-TTY parents like preview servers — don't change that without re-verifying. If you change parallelization, verify that tsx watch's output still flushes.

## File map

```
bin/branchcraft.js          CLI entry; expects dist/ from `npm run build`
src/shared/types.ts         Types shared between Hono server + Svelte web
src/server/index.ts         Hono app, all REST endpoints
src/server/config.ts        ~/.branchcraft/config.json store (pinned repos)
src/server/git/
  worktrees.ts              `git worktree list --porcelain` parser
  log.ts                    `git log --topo-order --format=...` parser
  layout.ts                 First-parent lane assignment for the graph
  status.ts                 `git status --porcelain=v2 --branch` parser
  rucksacks.ts              stash / tags / reflog list parsers
  simulate.ts               Pure simulator (merge / rebase / cherry-pick /
                            reset / push) with synth `sim-*` SHAs
  apply.ts                  Real `git` execution for /api/apply
src/server/sessions/
  types.ts                  SessionProvider plugin interface
  index.ts                  Registry + scanAllSessions
  claude-code.ts            CCD + claude CLI (~/.claude/projects/*.jsonl)
  aider.ts                  <repo>/.aider.chat.history.md
src/web/
  index.html / main.ts      Vite entry + Svelte 5 mount
  app.css                   Refined-GitKraken design tokens (PLAN.md §3)
  App.svelte                Top-level layout + state
  Graph.svelte              SVG graph + worktree cards + session pills + drag
  WorktreeCard.svelte       Inline card under a HEAD commit
  SessionPill.svelte        Live/idle pill with provider badge
  RepoSidebar.svelte        Left rail — pinned repos + status
  Rucksacks.svelte          Right rail — stash/tags/reflog
  AddRepoModal.svelte       + Add repo dialog
  CommandForm.svelte        Queue a command via form
  QueuePanel.svelte         Sticky-bottom queue + apply
  Coachmark.svelte          First-launch onboarding tip
  queue.ts                  commandSummary + COMMAND_BLURB
scripts/dev.js              Parallel dev runner replacing concurrently
vite.config.ts              root: src/web, /api proxy to :7777
vitest.config.ts            root: __dirname, tests under src/**/*
tsconfig.json               Strict, exactOptionalPropertyTypes, allowImportingTsExtensions
tsconfig.server.json        Server-only build config for `npm run build:server`
```

## Build plan (where to pick up)

PLAN.md §9 lists 9 evenings. State after the autonomous push-through:

- ✅ **E1** Status mode: graph + worktree cards + session pills + stale outline + theme toggle
- ✅ **E2** Multi-repo hub: pinned repos in `~/.branchcraft/config.json`, sidebar, URL routing
- ✅ **E3** Plugin architecture for sessions: claude-code + aider providers shipped; codex-cli, codex-desktop, gemini-cli have `SessionProviderId` slots but no implementation yet (PLAN.md §11 still lists their storage paths as open)
- ✅ **E4** Simulator core + queue + apply (5 commands)
- ✅ **E5** Drag layer — cherry-pick (commit → ref) and merge (ref → ref) gestures with hover preview. Disambig popup (§4.4) and rucksack drag-in / drag-out (§4.2 rows 10-15) NOT done yet
- ✅ **E6** Three rucksacks: data + sidebar; create-tag / pop-stash / restore-from-reflog flows still open
- ⏸ **E7** GitHub OAuth + PR overlay — **deliberately skipped** by the autonomous run. Requires a GitHub OAuth app and a client secret that can't be generated from inside the codebase. Pick up by registering one, then implementing the device-flow per §8 endpoints.
- ✅ **E8** Onboarding tooltips: COMMAND_BLURB hover hints on the queue, first-launch coachmark
- 🟡 **E9** Polish: repo unpin landed; reorder-compare panel (§4.7) and pair-swap hints not yet

Remaining stretch goals to check off before MVP-closed:
1. Codex / Gemini providers (paths verification in PLAN §11)
2. Disambig popup on ref-to-ref drag (currently always merges)
3. Apply-modal for tag / stash / squash-merge (need free-text input)
4. Reorder-compare diff panel
5. GitHub OAuth + PR markers (E7 in full)

When picking up, run `npm test && npm run typecheck` first — both should be clean. Then `npm run dev` and verify the live preview matches what the README claims.

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
- **CRLF:** repo enforces nothing; tests handle CRLF in worktree-porcelain output. Git auto-converts on Windows checkout (warnings during `git add` are harmless).
- **Bun:** Hono is Bun-compatible but the primary runtime is Node 20+. Bun-specific APIs (`Bun.spawn`, `Bun.watch`) must NOT be used in core code; if needed, gate behind a runtime check.
- **`bin/branchcraft.js`:** intentionally errors out without `dist/`. Use `npm run dev` from a checkout, or `npm run build && npm start`.
- **Cross-project preview:** Claude Preview's launch.json enforces cwd inside the active project root. If running CCD in this repo, that's fine; if running CCD elsewhere with a launch.json pointing here, it'll be blocked.
- **Static-serve in dev:** Hono only mounts the static fallback when both `dist/web/index.html` AND `dist/web/assets/` exist. Don't relax this — the older permissive check made dev mode serve raw `.ts` files at `:7777` and the browser rejected them with a MIME error.
- **Apply is real:** `/api/apply` runs `git` for real on the chosen worktree and stops on the first failure. The simulator preview uses `sim-*` SHAs that never touch disk. Test apply against throwaway repos until you trust your code paths — the autonomous push-through never exercised apply against this repo.
- **Branch names with slashes:** `feature/x` is a local branch (kind: 'branch'), `origin/main` is a remote. The simulator preserves the kind explicitly via `Map<RefName, { sha; kind }>`; do NOT switch back to a path-based heuristic.
- **Claude Code project key encoding:** `[:\\/.] -> -`. The encoder is intentionally pure (no `resolve()`) so it stays platform-deterministic — callers pre-resolve.

## Project hygiene

- License: MIT (also in package.json, also in LICENSE file).
- No CI yet. Adding a GitHub Action for `npm test` + `tsc --noEmit` is appropriate next housekeeping work.
- No issue templates linting test yet — that comes when there's runtime code worth testing in the browser.
- `.gitignore` intentionally **commits** `package-lock.json` (npm-published tool needs reproducible installs).

---

When in doubt: PLAN.md is the source of truth. If PLAN.md is wrong, fix PLAN.md in the same commit as the code change.
