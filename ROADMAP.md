# branchcraft — roadmap & gap analysis

PLAN.md is the design source of truth. This file is the brutally honest
gap analysis: what PLAN promised vs. what the codebase actually does,
organised by priority. Items move out of this file (and into PLAN.md
updates / commits) as they ship.

**Multi-Agent Activity & Conflict Detection — SHIPPED.** Design:
`docs/superpowers/specs/2026-04-26-multi-agent-activity-design.md`. Plan:
`docs/superpowers/plans/2026-04-26-pass-1-and-activity.md`. Live activity
feed in the rucksacks panel (4th section), inline `✎ file` on session
pills, amber-pulse on C1 concurrent-edit conflicts, ⚠N badge on branch
refs for C3 divergence. Backed by chokidar JSONL tail watcher,
ring-buffer activity store, and an SSE stream at
`/api/repos/:id/activity/stream` with auto-reconnect on the client. 34
new vitest cases across 6 files (extract, store, conflicts, watcher
plumbing, bus, manager).

**Pass 1 closed** (`08f4717`): worktree drag source, stale-outline
explanation, local vs remote ref distinction, hover-help audit,
disambig popup §4.4, apply modal §4.5, push gesture (row 7), reset
gesture (row 5), real squash-merge command. Drag surface now 5/19.

## Drag-gesture audit (PLAN.md §4.2)

| #  | Source → Target                          | Inferred command          | Status |
|----|------------------------------------------|---------------------------|--------|
| 1  | branch tip → branch tip                  | merge / rebase / squash   | ✅ disambig popup, all three options dispatch real commands (squash-merge is its own Command kind) |
| 2  | branch tip → commit on another branch    | rebase A onto `<commit>`  | ❌ Tier B (commits ARE drop targets now via A8, but only the same-lane / reset case is wired) |
| 3  | single commit → branch tip               | cherry-pick               | ✅ |
| 4  | multi-selected commits → branch tip      | cherry-pick in order      | ❌ no multi-select |
| 5  | branch tip → backward on own line        | reset (mode popup)        | ✅ ResetModePopup with mixed/soft/hard, hard danger-styled |
| 6  | branch tip → forward on own line         | merge `--ff-only`         | ❌ Tier B |
| 7  | local branch → `origin/X` marker         | push (lease if diverged)  | ✅ FF case auto-queues, diverged case prompts via apply-modal for lease/force/cancel |
| 8  | `origin/X` marker → local branch         | pull / fetch+merge/rebase | ❌ Tier B |
| 9  | worktree card → branch tip               | `git -C <wt> checkout`    | ✅ both directions (drag-from + drop-on) |
| 10 | branch / worktree → 🎒 stash             | `git stash push`          | ❌ Tier C |
| 11 | stash entry → worktree                   | `git stash pop` (or apply)| ❌ Tier C |
| 12 | tag handle → commit                      | create tag                | ❌ Tier C |
| 13 | tag in graph → 🏷 trash                  | delete tag                | ❌ Tier C |
| 14 | reflog entry → branch tip                | `reset --hard <reflog>`   | ❌ Tier C |
| 15 | commit → ⏪ trash zone                    | revert / reset            | ❌ Tier C |
| 16 | commit reordered within own branch line  | rebase -i: reorder        | ❌ Tier D |
| 17 | commit onto another commit (same branch) | rebase -i: squash         | ❌ Tier D |
| 18 | commit → ⏪ trash                         | rebase -i: drop           | ❌ Tier D |
| 19 | repo from hub sidebar → workspace        | switch repo               | ⚠ click works, drag doesn't |

**Score (post-Pass-1): 5 fully (1, 3, 5, 7, 9), 1 partial (19), 13 missing.**

## P0 — Pass 1 close-out

All P0 items shipped:

- a) **Worktree cards as drag sources** — SHIPPED in Pass 1 (`feat(drag): worktree card is a drag source` 4d592b2 + follow-ups).
- b) **Stale outline + merge in legend** — SHIPPED. `helpForWorktree` mentions the dashed amber border when behind > 0; legend has both stale and merge markers.
- c) **Local vs remote ref distinction** — SHIPPED. Remote pills now render with a slate `o/` prefix chip + faint slate-tinted background, role="none" for a11y.
- d) **Hover-help audit** — SHIPPED. The four fold/preview help strings rewritten to teach git concepts, not describe renderer state.
- e) **Sessions sort labelled** — STILL OPEN. Moves to Pass 2.

Plus the auxiliary UI (prerequisites for richer drags):

- §4.4 **Disambig popup** — SHIPPED. Branch→branch drag opens it; rebase / merge / squash-merge pick the right Command.
- §4.5 **Apply modal** — SHIPPED as a generic component. Used by the push gesture today; tag/stash/squash-merge text inputs land when those flows ship.

Plus the squash-merge command itself was promoted from a `merge ff:'no'` stand-in to a real `kind: 'squash-merge'` Command (simulate.ts, apply.ts, queue.ts, types.ts, simulate.test.ts +3 cases).

### d) Hover help text still describes "what we did", not "what this is"
Most cases were rewritten in `adcad20`, but a few stragglers remain
(particularly `FOLD_HELP`). Audit pass on every help string.

### e) Sessions are sorted by lastActivity but not labelled
The user said CCD's order looks different. We sort by `lastActivity
desc`. CCD's order is something else (likely AI-summarised + custom).
**Fix:** label "Most recent first" in the conversations fold or
expose a toggle.

## P1 — PLAN.md drag gestures, prioritised by user value

### Tier A (single-AI-coder daily flow)
1. **Row 9 — worktree → branch (checkout)**: see P0(a). Highest leverage
   for the multi-worktree-AI workflow PLAN.md §2.1 calls out as
   primary persona.
2. **Row 7 — local branch → `origin/X` (push)**: needed before pushing
   from the GUI is realistic. Today the user has to type a push command
   in the form.
3. **Row 5 — branch tip backward on own line (reset)**: the "I just
   broke main, undo me" gesture. High panic value.

### Tier B (two-AI-coders, vibe-team)
4. **Row 1 disambig popup** — branch → branch should ask
   merge/rebase/squash, not silently merge.
5. **Row 8 — origin/X → local (pull / fetch+merge/rebase)**: pulling
   from the GUI.
6. **Row 4 — multi-select cherry-pick**: shift/ctrl click + range select
   pill, then drag.

### Tier C (rucksack ↔ graph)
7. **Row 10 — branch/worktree → 🎒 stash** + apply-modal §4.5.
8. **Row 11 — stash entry → worktree** (pop / apply).
9. **Row 14 — reflog entry → branch tip** (reset).
10. **Row 12 — tag handle → commit** + apply-modal.
11. **Row 13 — tag in graph → 🏷 trash**.

### Tier D (interactive rebase)
12. **Rows 16-18** — reorder / squash / drop within a branch line.
    Big surface, end-of-MVP.

## P2 — auxiliary UI in PLAN

### Disambig popup (§4.4)
Compact menu anchored at drop point: rebase / merge / squash, default
focus, arrow keys, Enter to confirm, Esc to cancel-drag. Triggers on
the branch → branch row.

### Apply modal (§4.5)
For commands that need free text — squash-merge messages, tag
annotations, stash messages. Triggers when user hits Apply, NOT on
drop. Queue keeps a placeholder until then.

### Multi-select (§4.3)
Click / Shift-Click / Ctrl-Click on commit dots. Floating "N selected"
pill top-right with × to clear. Drag the selection to a branch tip →
cherry-pick in order.

### Reorder-compare (§4.7)
When a queue reorder produces a different graph, slide-up panel shows
side-by-side outcomes A vs B with content-hash-stable identical
commits in neutral and differing commits in slot-9 teal vs amber.

### Click → side panels
- Click a commit → details panel (full sha, body, files, parents).
- Click a worktree card → side panel with full path, dirty file list,
  fork-point details, last operation.
- Click a session pill → transcript side panel (last N messages).

### Branch colour override (§3.2)
Per-branch colour picker on the branch label. Persisted in
`~/.branchcraft/config.json` keyed by `{repoId, branchName}`.

### Dragging the repo from the sidebar (§4.2 row 19)
Currently click switches; drag-to-workspace is implied but not
implemented.

## P3 — aesthetic gaps from §3.4 / §3.5

### CAD-style annotations (§3.4)
Small monospace tags with thin lead lines pointing at commits:
- `HEAD@{2}` (recent reflog)
- `←merge-base` between two refs
- `session a1b2c3 started here` (PLAN.md §4.1.2)
- `PR #42` (Evening 7 territory)
Visible-by-default, toggleable per-category.

### Motion details (§3.5)
- Hover preview materialises commit-by-commit with 50ms stagger.
- Lines extend with `cubic-bezier(0.4, 0, 0.2, 1)` over 200ms.
- Apply success: cross-fade preview→applied 200ms, single 600ms gold
  pulse on the new HEAD.
- Stale warning: 4s slow pulse on the dashed outline (we render the
  outline; we don't pulse it).
- `prefers-reduced-motion`: respect everywhere — currently nowhere.

### Optional noise texture (§3.4)
1.5% opacity grain for the paper feel. Toggle in a settings panel
that doesn't yet exist.

### Off-screen commit indicator (§3.4)
"Commit older than viewport" → small arrow at the edge with mono
label. We render the whole graph at once (no virtualisation past
500 commits), so this lights up only when virtualisation lands.

## P4 — deferred / Evening 7+

- **GitHub OAuth + PR overlay** (Evening 7). Needs an OAuth-app
  registration the codebase can't do on its own. Hooks left in `§8`
  endpoint stubs.
- **File watching / SSE for git state** (PLAN §6, §8). The activity
  feature shipped its own JSONL watcher + `/api/repos/:id/activity/stream`
  SSE endpoint, but the broader git-state SSE (graph / worktrees /
  rucksacks pushed live on `.git/` change) is still missing. Today the
  UI re-fetches on focus / interval. Reuse the chokidar wiring from
  `src/server/activity/watcher.ts`.
- **Codex CLI / Codex Desktop / Gemini CLI providers** (PLAN §7.4
  open question). Storage paths still unverified — need a system
  with each tool installed to confirm.
- **Aider full history**: currently we surface only the most recent
  session per repo; PLAN §4.1.2 implies one pill per session.
- **Per-repo state cache** (PLAN §5.4: `state-<repo-hash>.json`,
  `cache-<repo-hash>/`).
- **Virtualisation past 500 commits** (PLAN §11 decision). Today we
  render up to 200 by default and 2000 max — anything beyond
  drops in performance.
- **VS Code extension** (Phase 2).
- **Tauri desktop bundle** (Phase 2).

## Build order proposal

Two passes, each ends in a working release:

### Pass 1 — finish the PLAN that's already half-built
1. P0 a/b/c/d/e (one polish commit)
2. P1 Tier A — rows 9, 7, 5 (one feature commit each)
3. P2 — disambig popup + apply modal (these two are the prerequisites
   for richer drags)

### Pass 2 — round out interactivity
4. P1 Tier B — rows 1, 8, 4
5. P1 Tier C — rucksack drags (rows 10-15)
6. P2 — multi-select, click-to-side-panel, branch colour override
7. P3 — CAD annotations + motion polish

### Pass 3 — long tail
8. P1 Tier D — rebase-i drags
9. P3 — noise texture, off-screen indicator
10. P2 — reorder-compare
11. P4 — virtualisation, state cache, OAuth (when secrets exist),
    SSE, remaining session providers
