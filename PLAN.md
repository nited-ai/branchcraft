# branchcraft — Plan & Spec

**Status:** Draft v2 (post-scope-expansion to standalone tool), 2026-04-25
**License:** MIT
**Repo:** https://github.com/nited-ai/branchcraft

---

## 0. TL;DR

A local-first, web-based Git GUI that combines three things no other tool combines:
1. **Worktree awareness** (which checkout, which branch, which commit, dirty/clean, ahead/behind, fork-point)
2. **AI-session awareness** (which Claude Code / Codex / Gemini / Aider session is on which branch, how stale)
3. **Drag-and-drop command simulator** (preview any rebase / merge / cherry-pick / push before you run it, queue commands, reorder, apply)

For solo devs juggling worktrees, vibe-coding teams who don't know Git deeply yet, and learners who want to see what commands actually do.

**Distribution:** `npx branchcraft` in any Git repo → opens `localhost:7777`. No install required.

**Build effort:** ~9 evenings of focused work (~45-55 hours).

---

## 1. Problem & Goals

### 1.1 The gap in existing tools

| Tool | Graph | Worktrees | AI Sessions | Preview Sim | Open Source |
|---|:---:|:---:|:---:|:---:|:---:|
| GitKraken / Sourcetree / Fork | ✓ | partial | – | – | – |
| GitLens (VS Code) | ✓ | – | – | – | partial |
| ungit | ✓ | – | – | – | ✓ MIT |
| SourceGit | ✓ | ✓ | – | – | ✓ MIT |
| Crystal / Nimbalyst | – | ✓ | partial | – | partial |
| lazyworktree, git-worktree-manager | – | ✓ | – | – | ✓ |
| Learn Git Branching | sandbox | – | – | ✓ | ✓ |
| **branchcraft** | ✓ | ✓ | ✓ | ✓ | ✓ MIT |

No tool today combines real-repo worktree awareness + AI-session tracking + drag-and-drop command preview. branchcraft fills that gap.

### 1.2 Goals (priority-ordered)

1. **Stale-state visibility**: see at a glance which worktrees, sessions, branches are stale before you act on them.
2. **Command preview**: simulate every git command before applying — no surprises, no "oh shit, I forgot --force-with-lease".
3. **Multi-AI-tool tracking**: surface sessions from Claude Code, Codex CLI, Codex Desktop, Gemini CLI, Aider, and others via a plugin interface.
4. **Drag-first ergonomics**: common operations (rebase, merge, cherry-pick, push) via drag-and-drop with hover previews.
5. **Team-safe defaults**: pre-push lease checks, "you'd overwrite Alice's work" warnings, force-push gates.
6. **Pedagogical layer**: hover any command for an inline explanation. Designed so a beginner can use it without breaking things.
7. **Multi-repo hub**: pin multiple repos, switch between them, see status across all of them.

### 1.3 Non-goals (won't do)

- Replace Git CLI. branchcraft visualizes, simulates, and triggers — it doesn't reinvent.
- Conflict resolution UI. If a command conflicts during apply, surface the error honestly and point to CLI.
- Cloud / multi-user backend. Local-first only. Two devs running branchcraft on the same repo each see their own local view.
- Issue / project management. That's Linear's / GitHub's / Jira's job.

---

## 2. Users & Scenarios

### 2.1 Three user archetypes

**A) Multi-Worktree Power User** (Dimitri-shaped — the originator of this tool)
- Runs 3-6 worktrees and as many AI sessions in parallel.
- Needs: stale-detection, session-tracking, fork-point visualization.
- Uses: daily, multiple times per session.

**B) Vibe-Coding Team Member** (small team of mid-skill devs using AI heavily)
- Doesn't know Git deeply but commits and pushes daily.
- Needs: pre-push warnings, "would I overwrite anything?", visual confirmation of what's about to happen.
- Uses: every push, every merge, occasional rebase.

**C) Git Learner** (vibe-coder, junior dev, anyone new to Git)
- Doesn't know what rebase actually does. Has been told `--force` is bad. Wants to understand.
- Needs: hover-tooltips on every command, preview-before-execute, "what would happen if I drag this to here?"
- Uses: occasionally, as a learning aid; ideally graduates to using it as a daily tool.

### 2.2 Scenarios

**S1 — Worktree sanity check** (A, daily): "Which worktrees are stale? Where are my sessions?"
→ Status mode: 6 worktrees listed, 2 stale (3 commits behind origin/main), 1 dirty for 3 days, sessions shown as pills next to each.

**S2 — Pre-rebase preview** (A, B, weekly): "What will the graph look like if I rebase SEN-237 onto main?"
→ Drag SEN-237 tip → main tip → hover preview → drop → disambig (rebase/merge/squash) → click rebase → queue shows it → click Apply → confirm modal → done.

**S3 — Cherry-pick set** (A, B, monthly): "I want these 3 commits on main."
→ Ctrl-click 3 commits in source branch → drag selection to main tip → drop → cherry-pick.

**S4 — Pre-push safety** (B, daily): "Am I about to overwrite a teammate's work?"
→ Drag local branch to origin/X marker → tool detects divergence → warning modal "Origin has 2 commits you don't have. `--force-with-lease` would lose them. Pull/rebase first?" → user picks rebase-then-push.

**S5 — Stash workflow** (A, B, weekly): "Save my dirty state, switch branch, come back."
→ Drag worktree → 🎒 Stash → apply → switch branch via drag worktree → branch tip → later drag stash entry back to worktree → pop.

**S6 — Multi-repo glance** (A, daily): "Are all my projects in good shape?"
→ Hub mode, sidebar shows 5 pinned repos with status indicators (green/yellow/red dots). Click red one → see what's wrong.

**S7 — Beginner first rebase** (C, learning): "What does rebase actually do?"
→ Hover over the rebase command in the disambig popup → tooltip explains in 2 sentences with diagram. User drags, sees graph reshape in preview, decides whether to apply.

**S8 — Team standup snapshot** (B, daily): "What did everyone do yesterday?"
→ Hub mode → repo overview → graph shows commits from last 24h colored by author → quick visual answer.

---

## 3. Aesthetic Direction — "Refined GitKraken"

**Vision in one line:** GitKraken's information density without the noise. Linear's craft and polish without the dryness.

### 3.1 Inspiration

- **GitKraken's data layout** — multi-color branches, dense graph, side panels with rich metadata
- **Linear's craft** — restrained saturation, refined micro-animations, generous spacing, warm dark mode
- **Stripe Docs typography** — confident, technical, friendly
- **Architectural CAD blueprints** — hairlines, technical annotations, signature memorable detail

### 3.2 Color tokens

**Background:**
- Dark mode (default): `#0d0e12` (warm charcoal, never pure black)
- Light mode: `#fafaf9` (warm off-white)
- Toggle in header

**Branch palette** (10 slots, deuteranopia-safe, uniform luminance so no single branch dominates):

| Slot | Dark mode | Light mode | Default use |
|---|---|---|---|
| 0 | `#a4b9e6` indigo | `#4a5fa3` | main / master / default branch |
| 1 | `#9bbf9b` sage | `#5a8a5a` | release branches |
| 2 | `#d4a54a` amber | `#8a6d2a` | hotfix / urgent |
| 3 | `#e09a8a` coral | `#a55a4a` | breaking change |
| 4 | `#7ab3e5` sky | `#3a7aa5` | feature |
| 5 | `#b59ad4` plum | `#6a4a8a` | refactor |
| 6 | `#a8b07a` olive | `#5a604a` | chore |
| 7 | `#8a96a8` slate | `#4a5260` | docs / meta |
| 8 | `#d4a4b9` rose | `#8a4a5f` | experiments |
| 9 | `#7ab3b3` teal | `#3a7575` | preview / simulation |

User can override per-branch via a small color-picker on the branch label.

**Semantic accents:**
- Success: `#6db26d` (in-sync indicator, apply-success pulse)
- Warning: `#d4a54a` (stale-warning, force-push notice)
- Danger: `#cc6677` (force-push without lease, destructive ops)
- Preview: slot 9 teal (everything hypothetical)
- Text primary: `#f0e6d2` (warm off-white in dark) / `#1a1614` (warm dark in light)
- Text secondary: 55% of primary
- Hairlines: 25% of branch color, 1px solid

### 3.3 Typography

- **Display / UI:** [Manrope](https://manrope.fontShare.com/) (Google Fonts, free, variable, weights 300/400/500/600/700) — branches, labels, buttons, navigation.
- **Mono:** [IBM Plex Mono](https://www.ibm.com/plex/) (free, weights 400/500/600) — SHAs, branch paths, command output.
- **Banished:** Inter, Roboto, system-ui, San Francisco, Arial, Courier New.

### 3.4 Visual elements

**Commit markers** (user preference: circles, not diamonds):
- Standard commit: 8×8 filled circle in branch color
- Merge commit: 8×8 hollow circle, 1.5px border in branch color
- Current HEAD: 12×12 filled circle with subtle 16×16 glow halo (branch color, 25% opacity)
- Preview / simulation commit: 8×8 with 1.5px dashed outline, half-saturation
- Stale commit (session-started-here marker): small annotation outside the dot, no halo

**Branch lines:**
- Active / user-current branch: 2px solid in branch color
- Other visible branches: 1.5px solid in branch color
- Stale / preview: dashed `stroke-dasharray: 4 3`
- Off-screen indicator (commit older than viewport): small arrow at edge, monospace label

**Background detail (signature memorable):**
- Faint blueprint grid behind the graph: 64×64 px, 1px lines, 6% branch-0 color opacity. Disappears in light mode (becomes 4% gray).
- Optional subtle noise texture (1.5% opacity) for paper feel. Toggleable in settings.

**CAD-style annotations:**
- Small monospace tags pointing at commits with thin lead-lines: "HEAD@{2}", "←merge-base", "session a1b2c3 started here", "PR #42".
- These are visible-by-default, can be toggled per-category. Make this feel like a CAD tool, not a webapp.

### 3.5 Motion

- Hover preview materializes commit-by-commit with 50ms stagger (faster than the original Blueprint plan — vibe coders shouldn't wait).
- Lines extend with `cubic-bezier(0.4, 0, 0.2, 1)` over 200ms.
- Drag: lifted node scales 1.04, soft glow in branch color. Drop targets get subtle highlight ring.
- Apply success: cross-fade preview→applied 200ms, single 600ms gold pulse on new HEAD.
- Stale warning: 2px dashed warning-color outline around worktree box, 4s slow pulse.
- All animations respect `prefers-reduced-motion`.

### 3.6 Banished

- Heavy gradients (Purple-on-white especially)
- Drop-shadows as primary depth source
- Rounded blob shapes
- Generic chip / badge components
- Emoji icons in chrome (terminal output ok)
- Material Design elevations
- Pure-black background
- Pure-white background

---

## 4. UX Model

### 4.1 Overall layout

Vertical-flowing graph (newer commits at top), worktree cards attached to their HEAD commits as inline children, AI sessions hanging from those worktree cards. **Both sidebars are collapsible.**

```
┌──┬──────────────────────────────────────────────────┬───┐
│ ◀│                                                  │  ▶│
│  │                                                  │   │
│ R│   ●  74487b8  main "feat(workflow): intercept…" │ S │
│ e│   │  ┌─[📁 main · clean · 0↑ 0↓]                 │ t │
│ p│   │  ├─ 🟢 j0k1l2 [CC] "Design review"          │ a │
│ o│   │  └─ ⚪ a1b2c3 [AI] idle 3h                   │ s │
│ s│   ●                                              │ h │
│  │   │                                              │   │
│ ◆│   ●  806e283                                     │ T │
│ b│   │ ╲                                            │ a │
│ ◯│   │  ●  9ab12cd  feat/SEN-205 "portrait fix"     │ g │
│ S│   │  │  ┌─[📁 bold-euler · 2 dirty · 2↑ 1↓]      │ s │
│ ◯│   │  │  └─ 🟢 g7h8i9 [CX] LIVE 2h               │   │
│ d│   │  ●  a11f00d                                  │ R │
│ ◆│   │  │                                           │ e │
│ K│   ●  4fe099a  feat/SEN-208 (3 behind origin)     │ f │
│  │   │  ┌─[📁 zealous-bose · clean]                 │ l │
│ +│   │  └─ (no active sessions)                     │ o │
│  │   ●                                              │ g │
│  │                                                  │   │
│  │                                                  │ + │
├──┴──────────────────────────────────────────────────┴───┤
│  Queue: [rebase main] [push --force-with-lease] [▶ All] │
└─────────────────────────────────────────────────────────┘
```

**Three regions:**

1. **Left sidebar — Repo Hub** (collapsible). Pinned repos with status indicators (◆ dirty, ⚠ stale, ◯ clean). `+ Add repo`. Click to switch. Collapsed: 32px tab with icons only.
2. **Center — Graph** (always visible, fills available space). Vertical-flow commit graph. Worktree cards inline at their HEAD commit. Sessions hang as tree children under their worktree.
3. **Right sidebar — Rucksacks** (collapsible). 🎒 Stash, 🏷 Tags, ⏪ Reflog, ⌨ + Command. Each section independently collapsible.

The Queue panel slides up from the bottom when ≥1 command is queued.

**Why this IA:**
- A session belongs **to a worktree**, not to a branch. The grouping is now visually obvious — "session → worktree → branch + commit" is one glance.
- Worktree-to-HEAD connection is explicit: the worktree card sits adjacent to the exact commit it's checked out on.
- Collapsible sidebars: when focused on the graph (inspecting divergence, queuing a rebase) the side panels vanish so the graph gets the full canvas.

### 4.1.1 Worktree cards

Each card shows:
- Folder name (last segment of worktree path)
- Sync status (`clean` / `N dirty files`)
- Ahead / behind count vs upstream (`2↑ 1↓`)
- A subtle 1px dotted line connecting the card to its HEAD commit dot

Hover the card → commit dot pulses gently.
Click the card → opens a side panel with full path, dirty-file list, last operation, fork-point details.

### 4.1.2 Session pills under worktrees

Each session pill shows:
- Status dot: 🟢 LIVE (mtime < 2 min), ⚪ idle, ⚫ dead (>7 days, hidden by default)
- Provider badge: 2-letter monospace abbreviation — `CC` (Claude Code), `CL` (Claude CLI), `CX` (Codex CLI), `CD` (Codex Desktop), `GM` (Gemini), `AI` (Aider)
- Session ID (first 6 chars, monospace)
- Title (first user message, truncated ~30 chars)
- Age since last activity

Click a pill → opens transcript side panel (last N messages).

Sessions group under their parent worktree. If a worktree has 5+ sessions, the list scrolls within the card's allocated height (max ~120px before scroll).

### 4.1.3 Collapsibility

- **Repo Hub (left):** chevron toggle at top → slides shut to 32px tab. Re-open by clicking tab.
- **Rucksack stack (right):** same, plus each section (Stash / Tags / Reflog / + Command) has independent collapse toggle.
- **Persistence:** state stored in `~/.branchcraft/config.json` (global hub state) and per-repo state (rucksack section preferences memorized per repo).
- **Keyboard:** `[` toggles left sidebar, `]` toggles right.
- **Auto-collapse:** on viewports <1280px wide, both default to collapsed; user can still open manually.

### 4.2 Drag gestures (complete table)

| # | Drag source | Drop target | Inferred command | Disambig? |
|---|---|---|---|---|
| 1 | Branch tip A | Branch tip B | merge / rebase / squash-merge | popup |
| 2 | Branch tip A | Commit on B | `rebase A onto <commit>` | direct |
| 3 | Commit (1) | Branch tip | cherry-pick | direct |
| 4 | Commits (N, multi-select) | Branch tip | cherry-pick in commit order | direct |
| 5 | Branch tip | Backward on own line | `reset --hard/soft/mixed <commit>` | popup |
| 6 | Branch tip | Forward on own line | `merge --ff-only <commit>` | direct |
| 7 | Local branch | `origin/X` marker | `push` (`--force-with-lease` if diverged) | popup if force needed |
| 8 | `origin/X` marker | Local branch | `pull` / `fetch+merge` / `fetch+rebase` | popup |
| 9 | Worktree box | Branch tip | `git -C <wt> checkout <branch>` | direct |
| 10 | Branch / Worktree | 🎒 Stash | `git stash push` | apply-modal: optional message |
| 11 | Stash entry | Worktree | `git stash pop` (apply if Shift) | popup |
| 12 | 🏷 Tag handle | Commit | create tag | apply-modal: name + message |
| 13 | Tag in graph | 🏷 trash | delete tag | apply-modal: confirm |
| 14 | Reflog entry | Branch tip | `reset --hard <reflog>` | apply-modal: confirm |
| 15 | Commit | ⏪ trash zone | revert (or reset if branch tip) | popup |
| 16 | Commit within branch line, vertical | New position | rebase -i: reorder | direct |
| 17 | Commit onto another commit, same branch | – | rebase -i: squash | apply-modal: combined message |
| 18 | Commit → ⏪ trash | – | rebase -i: drop | popup |
| 19 | Repo from Hub sidebar | Workspace area | switch to that repo | direct |

### 4.3 Multi-select (for cherry-pick)

- **Click**: single commit
- **Shift-Click**: range select on same branch
- **Ctrl-Click**: add/remove (sparse selection)
- Selection indicator: floating "N selected" pill, top-right, with × to clear

### 4.4 Disambig popup

Compact, anchored at drop point:

```
┌─────────────────────────┐
│  Drop SEN-205 → main    │
│  ─────────────────────  │
│  ▸ rebase   [default]   │
│    merge                │
│    squash-merge         │
│  ─────────────────────  │
│  Esc cancel · Enter ok  │
└─────────────────────────┘
```

Keyboard: arrow keys to navigate, Enter to confirm, Esc to cancel-drag.

### 4.5 Apply modal (commands needing free text)

For squash-merge messages, tag annotation, stash messages:

```
┌──────────────────────────────────────────┐
│  Apply: tag v0.5.0 on commit 74487b8     │
│  ──────────────────────────────────────  │
│  Tag name:    [v0.5.0_______________]    │
│  Message:     [_____________________]    │
│               [_____________________]    │
│  ──────────────────────────────────────  │
│           [Cancel]    [Apply ▶]          │
└──────────────────────────────────────────┘
```

Triggers on Apply, NOT on hover/drop. Queue keeps a placeholder until then.

### 4.6 Queue + simulator + apply

- Queue panel slides up from bottom when ≥1 command exists.
- Live preview shows the result of the **entire queue** applied sequentially.
- Hover over a queue item: preview snapshots to "right after this command".
- Reorder via drag handle. Re-simulation is automatic.
- Apply All → confirm modal lists all commands → executes sequentially → on first error, halts and shows where.

### 4.7 Reorder-compare

When user reorders adjacent items in the queue and the resulting graph differs:

```
┌─ Reordering: rebase main ↔ cherry-pick X ─────────────────┐
│   Outcome A (current)           Outcome B (new)            │
│   ┌──────────────────┐          ┌──────────────────┐      │
│   │  ●─◯─◯─◯         │          │  ●─◯─◯─◯         │      │
│   │       ╲          │          │       ╲          │      │
│   │        ◯─◑       │          │        ◑─◯       │      │
│   └──────────────────┘          └──────────────────┘      │
│        [Keep A]                       [Use B]              │
└────────────────────────────────────────────────────────────┘
```

Identical commits across both outcomes are colored neutral; differing commits in slot-9-teal vs amber.

### 4.8 Onboarding tooltips

For learners (Pfad C):
- Hover any disambig option → 1-sentence what-it-does + tiny diagram
- Hover any queue command → "what this will do to your graph"
- First-launch coachmark: "Drag this branch onto another to see what would happen."
- "?" toggle in header to enable/disable verbose tooltips

---

## 5. Information Architecture

### 5.1 Two main modes (toggleable in header)

- **Status mode**: read-only dashboard. Sessions and worktrees and branches visible. No drag, no queue.
- **Simulator mode**: drag enabled, rucksacks visible, queue ready.

### 5.2 Multi-repo hub sidebar (always present)

```
Repos (5)
─────────
⬢ branchcraft     ✓ clean
⬢ SentryCall      ⚠ 2 stale
⬢ dotfiles        ✓ clean
⬢ KnxCasa         ◆ 1 dirty
⬢ FamilyOffice    ⚙ no changes
─────────
+ Add repo
```

- Click repo → switches workspace
- Status indicators: green/yellow/red dots
- "+ Add repo" → file dialog to pick a directory
- Repos persisted in `~/.branchcraft/config.json`
- Shift-click → split view (Phase 2, not MVP)

### 5.3 Routing

- `/` → last opened repo, status mode
- `/?repo=path&mode=sim` → specific repo + mode
- `/hub` → hub overview (all repos at once, status only)
- All state derivable from URL — bookmarkable

### 5.4 Persistence (`~/.branchcraft/`)

- `config.json` — pinned repos, theme preference, GitHub token (encrypted)
- `state-<repo-hash>.json` — last queue, last view position, per-repo
- `cache-<repo-hash>/` — cached git state for fast initial paint

---

## 6. Tech Stack

**Backend (primary: Node 20+, Bun-compatible):**
- **Node 20+** runtime — broad install base, mature ecosystem, npm distribution friendly
- Optional: **Bun** as alternative runtime (Hono is portable; one codebase runs on both)
- **Hono** framework with `@hono/node-server` adapter — lightweight, web-standards API
- `git` shell-out via `node:child_process` (`execFile`/`spawn`)
- File watching via **chokidar** (battle-tested cross-platform; native `fs.watch` is unreliable on Windows)
- Server-Sent Events for live updates (simpler than WebSocket, sufficient for one-way push)
- **TypeScript** strict mode

**Frontend:**
- **Svelte 5** (with runes) — leaner than React, less boilerplate, fast reactivity
- **Vite** — dev server with HMR, build
- **Native SVG** for graph — no library, full control over preview overlays and animations
- **svelte-dnd-action** for drag-and-drop
- **CSS variables** for theming (light/dark, color overrides)

**Dev tooling:**
- **tsx** for running TypeScript without a build step in dev
- **concurrently** to start backend + Vite frontend in one `npm run dev`
- **vitest** for tests

**Distribution:**
- **npm package** with `bin/branchcraft.js` shebang script that launches Node + serves the Vite-built static bundle
- `npx branchcraft` zero-install entry
- `npm install -g branchcraft` for global install
- Phase 2: VS Code extension wrapping the same backend
- Phase 2: optional Bun-based standalone binary via `bun build --compile`

**External integrations:**
- GitHub API via Octokit (OAuth device flow)
- File-based AI session detection per provider (see §7.4)

### 6.1 Why Node primary, not Bun

Originally the plan was Bun-first. Switched to Node-first because:
- Node is already installed on the target audience's machines (vibe-coders are typically already running Node for their JS projects)
- `npm install -g branchcraft` works universally; Bun installs require an extra step
- VS Code extension (Phase 2) runs on Node anyway
- Hono is runtime-agnostic, so Bun stays trivial to add later as an alternative

The cost is some performance (Bun is faster) and some convenience (Bun has built-in TS, FS watch, WS). We mitigate with `tsx`, `chokidar`, and SSE — none of which are heavy.

---

## 7. Data Model

### 7.1 Graph state (TypeScript)

```ts
type Sha = string;
type RefName = string;
type RepoId = string;  // hash of absolute repo path

interface Commit {
  sha: Sha;
  parents: Sha[];
  author: string;
  authorEmail: string;
  authorDate: number;
  subject: string;
  body?: string;
  contentHash: string;  // hash(treeId + parents[0]'s contentHash + subject) for stable identity
  refs: RefName[];
  lane?: number;
  simulated?: boolean;
}

interface Ref {
  name: RefName;
  kind: 'branch' | 'tag' | 'remote' | 'head';
  target: Sha;
  upstream?: RefName;
  ahead?: number;
  behind?: number;
  color?: string;  // user override, otherwise auto from palette
}

interface Worktree {
  path: string;
  isMain: boolean;
  branch: RefName;
  head: Sha;
  dirty: boolean;
  dirtyFiles: number;
  forkPoint: Sha;
  sessions: Session[];
}

interface Session {
  id: string;
  provider: SessionProviderId;
  title: string;
  startedAtSha: Sha;
  startedAt: number;
  lastActivity: number;
  isLive: boolean;
  pid?: number;
  metadata: Record<string, unknown>;  // provider-specific
}

interface Stash {
  index: number;
  message: string;
  sha: Sha;
  worktreePath?: string;
}

interface ReflogEntry {
  refIndex: number;
  sha: Sha;
  action: string;
  message: string;
  date: number;
}

interface PullRequest {
  number: number;
  title: string;
  branch: RefName;
  baseBranch: RefName;
  state: 'open' | 'merged' | 'closed';
  reviews: { approved: number; changes_requested: number };
  mergeable: boolean;
}

interface RepoState {
  id: RepoId;
  path: string;
  remoteUrl?: string;
  defaultBranch: RefName;
  commits: Map<Sha, Commit>;
  refs: Map<RefName, Ref>;
  worktrees: Worktree[];
  stash: Stash[];
  reflog: ReflogEntry[];
  pullRequests?: PullRequest[];
  activeWorktree?: string;
}

interface AppState {
  repos: Map<RepoId, RepoState>;
  activeRepoId?: RepoId;
  theme: 'dark' | 'light' | 'auto';
  github: { token?: string; user?: string };
}
```

### 7.2 Command model

```ts
type Command =
  | { kind: 'merge'; from: RefName; into: RefName; ff: 'auto'|'only'|'no' }
  | { kind: 'rebase'; branch: RefName; onto: Sha | RefName }
  | { kind: 'cherry-pick'; commits: Sha[]; onto: RefName }
  | { kind: 'reset'; branch: RefName; to: Sha; mode: 'soft'|'mixed'|'hard' }
  | { kind: 'push'; branch: RefName; remote: string; force?: 'lease' | true }
  | { kind: 'fetch'; remote: string }
  | { kind: 'pull'; branch: RefName; rebase?: boolean }
  | { kind: 'checkout'; branch: RefName; worktree?: string; createNew?: boolean }
  | { kind: 'branch'; name: RefName; from: Sha | RefName }
  | { kind: 'stash-push'; worktree: string; message?: string; includeUntracked?: boolean }
  | { kind: 'stash-pop'; entry: number; into: string }
  | { kind: 'stash-apply'; entry: number; into: string }
  | { kind: 'tag'; name: string; commit: Sha; annotated: boolean; message?: string }
  | { kind: 'tag-delete'; name: string }
  | { kind: 'revert'; commits: Sha[]; into: RefName }
  | { kind: 'rebase-i-reorder'; branch: RefName; newOrder: Sha[] }
  | { kind: 'rebase-i-squash'; branch: RefName; squashes: Array<{ keep: Sha; into: Sha }> }
  | { kind: 'rebase-i-drop'; branch: RefName; drop: Sha[] };

type SimulateFn = (state: RepoState, cmd: Command) => RepoState;
```

### 7.3 Stable commit identity (for reorder-compare)

After rebase, commits have new SHAs but the same content. For diff visualization:

```ts
function contentHash(c: { tree: string; subject: string; parentContentHash?: string }): string {
  return sha256(c.tree + '\0' + c.subject + '\0' + (c.parentContentHash ?? ''));
}
```

When diffing two outcomes: same `contentHash` in both → identical (neutral color); only in one → distinct (slot-9-teal vs amber).

### 7.4 Session provider plugin interface

```ts
interface SessionProvider {
  id: SessionProviderId;
  displayName: string;
  detectAvailable(): Promise<boolean>;
  scanSessions(repoPath: string): Promise<Session[]>;
  watchSessions?(repoPath: string, onUpdate: (s: Session[]) => void): () => void;
  readTranscript?(sessionId: string, opts?: { lastN?: number }): Promise<TranscriptEntry[]>;
}
```

**MVP providers (in priority order):**

| Provider | Storage | Difficulty | Notes |
|---|---|---|---|
| Claude Code (CCD + CLI) | `~/.claude/projects/<encoded-cwd>/*.jsonl` | easy | both CCD GUI and `claude` CLI share this path |
| Aider | `<repo>/.aider.chat.history.md` + `.aider.input.history` | easy | in-repo, well-documented |
| Codex CLI | TBD (likely `~/.codex/sessions/`) | medium | verify exact path during impl |
| Codex Desktop | TBD (likely `~/Library/Application Support/Codex/` mac, `%APPDATA%\Codex\` Windows) | medium | per-OS app data |
| Gemini CLI | TBD (likely `~/.gemini/` or in-repo) | medium | verify during impl |

**Phase 2 providers (not MVP):**
- Cursor (app-data, per-OS, requires more work)
- Continue (`~/.continue/sessions/`)
- Cline (VS Code extension storage)

The plugin interface lets community add more without core changes.

---

## 8. Backend API

```
GET   /api/repos                    → list of pinned repos with status
POST  /api/repos                    → add repo (body: { path: string })
DELETE /api/repos/:id               → remove from hub
GET   /api/repos/:id/state          → full RepoState
GET   /api/repos/:id/state/sse      → Server-Sent Events stream for live updates
POST  /api/repos/:id/simulate       → { queue: Command[] } → predicted RepoState
POST  /api/repos/:id/apply          → { queue: Command[] } → { results: ApplyResult[] }
GET   /api/repos/:id/sessions/:sid  → transcript (last N messages)
POST  /api/repos/:id/refresh        → force re-scan

GET   /api/github/auth              → start OAuth device flow → device code
GET   /api/github/auth/poll         → poll for token, return when ready
DELETE /api/github/auth             → revoke local token
GET   /api/github/repos/:id/prs     → list open PRs for the repo
```

**File watching** (per active repo):
- `.git/refs/**`, `.git/HEAD`, `.git/index`, `.git/worktrees/**`
- All AI provider session paths (delegated to provider implementations)

On any change → re-scan affected slice → push diff via SSE.

---

## 9. Build Plan — 9 Evenings

### Evening 1: Status Mode (single repo)
- Bun + Hono backend skeleton, SSE endpoint
- `git worktree list --porcelain` parser
- `git log --all --format=...` for graph data
- Svelte SPA with native SVG graph rendering (last 100 commits)
- Worktree boxes inline next to branches
- Stale-detection (yellow outline)
- Light/dark mode toggle
- **DoD:** open one repo, see graph + worktrees + stale indicators

### Evening 2: Multi-Repo Hub
- `~/.branchcraft/config.json` for pinned repos
- Sidebar with repo list, status indicators
- "+ Add repo" file picker
- Repo switching (URL routing)
- Per-repo state cache
- **DoD:** pin 5 repos, switch between them, status correct

### Evening 3: Plugin Architecture for Sessions
- `SessionProvider` interface + registry
- 5 providers: Claude (CCD + CLI), Aider, Codex CLI, Codex Desktop, Gemini CLI
- Verify session storage paths for each
- Sessions panel under graph showing provider + branch + age
- Click session → side panel with last N transcript entries
- **DoD:** sessions from 3+ providers visible across multiple repos

### Evening 4: Simulator Core + Queue
- Pure simulator functions for: merge, rebase, cherry-pick, push, reset (5 most common)
- Queue panel (slides up from bottom)
- "+ Command" dropdown for typed input
- `/api/simulate` endpoint
- Apply button + confirm modal → `/api/apply` runs sequentially
- **DoD:** type "rebase main", see preview, apply works on real repo

### Evening 5: Drag Layer + Hover Preview
- svelte-dnd-action integration
- Drop targets: branch tips, commits, worktrees
- Live hover preview during drag
- Disambig popups
- Multi-select for commits (Click, Shift-Click, Ctrl-Click)
- **DoD:** all 9 main drag gestures work with preview

### Evening 6: Three Rucksacks + Apply-Modal
- 🎒 Stash rucksack (`git stash list`)
- 🏷 Tags rucksack (`git tag --list`)
- ⏪ Reflog rucksack (`git reflog --all`)
- Drag-in / drag-out gestures (table 4.2 rows 10-15)
- Apply-modal for commands needing text
- **DoD:** stash workflow, create+delete tag, reflog restore all work

### Evening 7: GitHub OAuth + PR Overlay
- OAuth device-code flow
- Token storage in `~/.branchcraft/` (encrypted-at-rest)
- HTTPS push with token
- Pre-push lease check ("origin has 2 commits you don't have")
- PR overlay on graph (markers next to branch tips)
- PR list in sidebar
- **DoD:** connect GitHub, see PRs, push with auth, lease check warns correctly

### Evening 8: Team Features + Onboarding
- Pre-push warnings for shared branches ("you'd overwrite work on this")
- Onboarding tooltips on every command (1-sentence + diagram)
- "?" toggle in header for verbose mode
- First-launch coachmark
- Author-colored commits in last-24h view (for standup scenario)
- **DoD:** vibe-coder can do their first rebase without breaking things

### Evening 9: Reorder-Compare + Polish + Cross-Platform
- Drag-to-reorder in queue
- Reorder-compare panel (only when outcomes differ)
- Pair-swap hints (⇄ buttons that light up when swap matters)
- Interactive rebase gestures (rows 16-18)
- Polish: animation timing, keyboard shortcuts (Esc, Enter, Cmd-Z), error states
- Cross-platform validation (Mac, Linux, Windows)
- **DoD:** all 8 scenarios work end-to-end on all 3 OSes

---

## 10. Out of Scope (MVP)

Explicitly **not** in MVP:

- **VS Code extension** — separate distribution channel, ship later without core changes
- **Tauri desktop builds** — same, distribution-only
- **Inline PR comments / webhooks** — polling every 30s is fine for MVP
- **Issues / Projects integration** — Linear's / GitHub's job
- **Cursor / Continue / Cline session providers** — app-data storage, complex per-OS, plugin showcase later
- **Conflict resolution UI** — too much surface area, fall back to CLI
- **Multi-user / cloud backend** — local-first only
- **Submodules** — ignored
- **Explorer Mode (N-permutation queue exploration)** — empirically 0 cases warrant it (see SentryCall reflog analysis 2026-04-25)
- **Mobile / touch** — desktop only, mouse expected
- **History undo beyond reflog** — `git reflog` is the undo, surfaced via the rucksack
- **Custom remotes (GitLab, Bitbucket, Forgejo)** — GitHub only in MVP, abstract API later

---

## 11. Open Questions

### Still open

1. **Codex CLI / Codex Desktop / Gemini CLI session storage paths** — verify during Evening 3, document findings in this section.

### Decisions (resolved 2026-04-25)

- **Branch color persistence:** ✅ persisted in `~/.branchcraft/config.json` keyed by `{repoId, branchName}`. User overrides survive across sessions.
- **GitHub token storage:** ✅ OS keychain (macOS Keychain, Windows Credential Vault, Linux libsecret) via `keytar` or Bun-equivalent. Plain-file fallback with `chmod 600` and an on-screen security warning if keychain is unavailable.
- **Onboarding:** ✅ coachmarks on first action only. No full guided tour. Hover-tooltips per command serve the learner audience continuously.
- **Fonts:** ✅ bundle Manrope + IBM Plex Mono in the npm package (both OFL/SIL-licensed). Offline-first, faster initial paint.
- **Repo size limits:** ✅ virtualized graph past 500 commits with "show more" pagination. Soft upper limit ~50k commits visible without paging; documented in README.

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Simulator predicts a graph that conflicts with reality on apply | high | medium | Label clearly "Optimistic Preview". Apply surfaces conflict output honestly, points to CLI. |
| Filesystem watch unreliable on Windows | medium | high | Polling fallback every 5s if events stop arriving |
| Performance with 1000+ commits | medium | medium | Default 100 commits, virtualized graph past 500 |
| User drops the wrong thing | high | high | Always confirm modal on Apply, queue items removable, reflog rucksack one drag away to undo |
| Session discovery false positives (old jsonls) | medium | low | mtime filter (< 7 days), manual hide button per session |
| Bun has Windows quirks | medium | medium | Tested on Windows during Evening 9; Node + tsx is a 1-hour fallback if needed |
| GitHub API rate limits | low | medium | Cache PR data 60s, exponential backoff |
| OAuth token leakage | low | high | OS keychain, not plaintext. Refuse to log tokens anywhere. |

---

## 13. Definition of Done (overall MVP)

- [ ] `npx branchcraft` works in any Git repo, opens browser, shows status
- [ ] `~/.branchcraft/config.json` persists pinned repos
- [ ] Multi-repo hub with status indicators
- [ ] Status mode: worktrees, sessions, branches, PRs all visible
- [ ] 5 session providers detect sessions across all known repos
- [ ] Simulator mode: drag any of the 9 main gestures, see live preview, apply runs real commands
- [ ] Three rucksacks (stash, tags, reflog) functional
- [ ] GitHub OAuth flow + PR overlay + push auth + pre-push lease
- [ ] Team safety: pre-push warnings, onboarding tooltips
- [ ] Reorder-compare for non-commutative queues
- [ ] Light + dark mode toggle works
- [ ] Cross-platform tested on macOS, Linux, Windows
- [ ] README with quickstart accurate
- [ ] All 8 user scenarios from §2.2 demonstrated working

---

## Next steps (post-this-doc)

1. Verify Open Questions §11 numbers 1-6 (or accept proposals).
2. Begin Evening 1.
3. Open `Discussions` on GitHub for design feedback before code.
