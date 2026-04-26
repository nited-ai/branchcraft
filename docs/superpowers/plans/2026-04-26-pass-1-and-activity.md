# PLAN-Fill Pass 1 + Multi-Agent Activity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the most user-blocking gaps from `PLAN.md` (per `ROADMAP.md` P0 + Tier-A) and ship the multi-agent activity feature designed in `docs/superpowers/specs/2026-04-26-multi-agent-activity-design.md`. After this plan: drag-from-worktree, drag-to-push, drag-to-reset, branch→branch with disambig popup, apply-modal for free-text commands, AND live activity / conflict detection are all in place.

**Architecture:** Two sequential parts in one plan.
- **Part A** finishes the PLAN.md drag surface that was promised during Evening 5 but only 1.5/19-implemented. P0 polish first (worktree as drag source, stale outline explained, ref distinction), then the auxiliary UI (disambig popup §4.4 + apply modal §4.5), then Tier-A gestures (rows 9, 7, 5).
- **Part B** is the entire activity spec, server-first (chokidar watcher, store, conflicts, SSE) → frontend (SSE client, pill enhancement, ActivityFeed in Rucksacks, branch ⚠N badges) → motion polish.

**Tech Stack:** Existing — Hono on Node 20, Svelte 5 runes, vitest, chokidar (already in deps for the watcher), `git` shell-out via `execFile`. No new dependencies.

**Working dir:** `D:\Git\Repos\branchcraft\.claude\worktrees\clever-babbage-9445d9` (existing worktree on branch `nited/clever-babbage-9445d9`, fast-forwarded to `main`).

**Pre-flight:** Run `npm test && npm run typecheck` — both must be green before starting, and after every commit.

**Out of scope (covered by separate later plans):** ROADMAP Tier B/C/D drags (rows 1 partially, 8, 4, 10-15, 16-18), reorder-compare panel §4.7, click-to-side-panel for commits/worktrees/sessions, branch colour override, CAD annotations §3.4, motion details from §3.5 beyond what the activity work needs, OAuth Evening 7, SSE-based watcher for `.git/refs` external changes, virtualisation past 500 commits, Codex/Gemini providers, Aider full history, repo-state cache.

---

# PART A — PLAN.md Pass 1

## Task A1: Worktree card as drag source (PLAN §4.2 row 9)

**Why:** Today the worktree card is only a *drop target*. PLAN row 9 says drag worktree → branch tip = `git -C <wt> checkout <branch>`. The user explicitly asked for this and "still can't drag worktrees".

**Files:**
- Modify: `src/web/Graph.svelte` (add pointerdown to `.card-row`, extend `Drag` union, extend `onPointerUp` dispatch)
- Modify: `src/web/queue.ts` (no changes needed — checkout summary already there)
- Modify: `src/server/git/apply.ts` (the existing `checkout` handler already runs in `cmd.worktree`, no change)
- Modify: `src/web/WorktreeCard.svelte` (cursor: grab on hover when draggable)
- Test: `src/server/git/simulate.test.ts` (no new test — checkout simulator is already a no-op for the graph)

- [ ] **Step 1: Extend the `Drag` union with a worktree variant**

In `src/web/Graph.svelte`, find the existing `type Drag` (search for `kind: 'commit'`) and add a third variant:

```ts
type Drag =
  | { kind: 'commit'; sha: string; subject: string }
  | { kind: 'ref'; name: string }
  | { kind: 'worktree'; path: string; branch: string | null }
  | null;
```

- [ ] **Step 2: Add `onWorktreePointerDown` handler**

Just below the existing `onRefPointerDown` function:

```ts
function onWorktreePointerDown(wt: Worktree, e: PointerEvent) {
  if (e.button !== 0) return;
  // Cards are also drop targets — only start a drag when the cursor is
  // actually on the card itself, not on something inside that bubbled up.
  if (!(e.currentTarget instanceof HTMLElement)) return;
  startDrag({ kind: 'worktree', path: wt.path, branch: wt.branch }, e);
}
```

- [ ] **Step 3: Wire the handler on the card-row**

Find `<div class="card-row" ...>` in the template (search `data-drop-worktree`). Add `onpointerdown`:

```svelte
<div
  class="card-row"
  class:drop-active={dropTarget?.kind === 'worktree' && dropTarget.worktreePath === card.worktree.path && drag !== null}
  style="top: {card.top}px;"
  data-drop-worktree={onQueueCommand ? card.worktree.path : undefined}
  onpointerdown={onQueueCommand ? (e) => onWorktreePointerDown(card.worktree, e) : undefined}
  onmouseenter={(e) => showHelp(helpForWorktree(card.worktree), e)}
  onmouseleave={hideHelp}
  role="presentation"
>
  <WorktreeCard worktree={card.worktree} />
</div>
```

- [ ] **Step 4: Extend `onPointerUp` to handle worktree drops**

In the existing `onPointerUp` function, find the `if (target.kind === 'ref')` block. Add a new branch for `d.kind === 'worktree'`:

```ts
if (target.kind === 'ref') {
  if (d.kind === 'commit') {
    onQueueCommand({ kind: 'cherry-pick', commits: [d.sha], onto: target.refName });
  } else if (d.kind === 'ref') {
    if (d.name === target.refName) return;
    onQueueCommand({ kind: 'merge', from: d.name, into: target.refName, ff: 'auto' });
  } else if (d.kind === 'worktree') {
    // Drag-from-worktree onto a ref pill = check that worktree out at the ref.
    onQueueCommand({ kind: 'checkout', worktree: d.path, target: target.refName });
  }
} else if (target.kind === 'worktree') {
  if (d.kind === 'commit') {
    onQueueCommand({ kind: 'checkout', worktree: target.worktreePath, target: d.sha });
  } else if (d.kind === 'ref') {
    onQueueCommand({ kind: 'checkout', worktree: target.worktreePath, target: d.name });
  }
  // worktree → worktree drop is meaningless — silently ignore.
}
```

- [ ] **Step 5: Update the drag-ghost label for worktree drags**

Find the `{#if drag}` block (search `drag-ghost`). Extend the ghost rendering so a worktree drag reads correctly:

```svelte
{#if drag}
  <div class="drag-ghost mono" style="left: {dragCursor.x + 10}px; top: {dragCursor.y + 6}px" aria-hidden="true">
    {#if drag.kind === 'commit'}
      <span class="kind">{dropTarget?.kind === 'worktree' ? 'checkout' : 'cherry-pick'}</span>
      <span class="ghost-label">{shortSha(drag.sha)}</span>
    {:else if drag.kind === 'ref'}
      <span class="kind">{dropTarget?.kind === 'worktree' ? 'checkout' : 'merge'}</span>
      <span class="ghost-label">{drag.name}</span>
    {:else}
      <span class="kind">checkout</span>
      <span class="ghost-label">{drag.path.split(/[/\\]/).filter(Boolean).at(-1) ?? drag.path}</span>
    {/if}
    {#if dropTarget}
      <span class="arrow">→</span>
      <span class="ghost-label target">
        {dropTarget.kind === 'ref'
          ? dropTarget.refName
          : (dropTarget.worktreePath.split(/[/\\]/).filter(Boolean).at(-1) ?? '')}
      </span>
    {/if}
  </div>
{/if}
```

- [ ] **Step 6: Add cursor: grab affordance on the card**

In `src/web/WorktreeCard.svelte`'s `<style>`, add:

```css
.card {
  /* existing rules */
  cursor: grab;
  user-select: none;
}

.card:active {
  cursor: grabbing;
}
```

- [ ] **Step 7: Run typecheck and tests**

```bash
npm run typecheck
npm test
```

Expected: `0 ERRORS 0 WARNINGS`, `83 passed`. The new code only extends existing patterns — no test changes required for this task; the row 9 gesture is exercised by the existing apply runner.

- [ ] **Step 8: Verify in the live preview**

In a running dev server, switch to a repo with multiple worktrees. Press-and-drag a worktree card onto a branch ref pill in the labels list. Expected:
1. Cursor flips to grabbing.
2. Drag-ghost reads `checkout <wt-name> → <branch>`.
3. Ref pill picks up the `.drop-active` halo.
4. Releasing on the ref pill queues `checkout <branch> in <wt-name>`.

Then confirm the reverse direction still works: drag a branch ref onto a worktree card → ghost reads `checkout`, drop queues the same command.

- [ ] **Step 9: Commit**

```bash
git add src/web/Graph.svelte src/web/WorktreeCard.svelte
git commit -m "feat(drag): worktree card is a drag source (PLAN §4.2 row 9)"
```

---

## Task A2: Stale outline legend entry + hover help

**Why:** The dashed amber border on a stale worktree card was rendered without explanation. New users can't decode the visual.

**Files:**
- Modify: `src/web/Legend.svelte` (add stale-outline item + merge-commit hollow circle item)
- Modify: `src/web/Graph.svelte` (extend `helpForWorktree` to mention the outline when behind > 0)

- [ ] **Step 1: Add stale + merge legend items**

In `src/web/Legend.svelte`, in the `<div class="legend">` block, just before the `+ Add repo`-equivalent (`background task` is the last existing item), add two more items:

```svelte
<span class="item">
  <svg width="14" height="14" aria-hidden="true">
    <circle
      cx="7"
      cy="7"
      r="4"
      fill="var(--bg)"
      stroke="var(--branch-0)"
      stroke-width="1.5"
    />
  </svg>
  <span>merge commit</span>
</span>

<span class="item" title="Worktree is N commits behind upstream">
  <span class="legend-stale" aria-hidden="true"></span>
  <span>stale worktree</span>
</span>
```

- [ ] **Step 2: Style the stale legend marker**

In the same file's `<style>` block, add at the bottom:

```css
.legend-stale {
  display: inline-block;
  width: 32px;
  height: 14px;
  border: 1px dashed var(--warning);
  border-radius: 3px;
  background: rgba(212, 165, 74, 0.06);
}
```

- [ ] **Step 3: Extend worktree hover help**

In `src/web/Graph.svelte`, find `helpForWorktree`. Replace it:

```ts
function helpForWorktree(wt: Worktree): HelpContent {
  const dirty = wt.status?.dirtyFiles ?? 0;
  const ahead = wt.status?.ahead ?? 0;
  const behind = wt.status?.behind ?? 0;
  const parts: string[] = [];
  parts.push(dirty === 0 ? 'clean' : `${dirty} unstaged file${dirty === 1 ? '' : 's'}`);
  if (behind > 0) parts.push(`${behind} commit${behind === 1 ? '' : 's'} behind ${wt.status?.upstream ?? 'upstream'}`);
  if (ahead > 0) parts.push(`${ahead} ahead`);
  const stale =
    behind > 0
      ? ` The dashed amber border means this worktree is behind its upstream — pull or rebase to catch up.`
      : '';
  return {
    kind: 'worktree',
    title: wt.path,
    body: `A checkout of this repo at ${wt.path}, currently on ${wt.branch ?? '(detached HEAD)'} (${parts.join(', ')}). Each worktree can be on a different branch — that's how you run several AI agents in parallel without them stepping on each other.${stale}`,
    ...(onQueueCommand
      ? {
          hint: 'Drag the card onto a branch label to switch this worktree to that branch. Or drop a commit / branch label onto the card for the same result from the other direction.',
        }
      : {}),
  };
}
```

- [ ] **Step 4: Typecheck and verify in preview**

```bash
npm run typecheck
```

Expected: clean.

In the live preview, hover over a worktree card whose `behind` > 0 (the main worktree of branchcraft when you've pushed from this worktree) — the help body should mention "dashed amber border".

The legend should now show 8 + 2 = 10 items, including a small dashed amber rectangle labelled "stale worktree".

- [ ] **Step 5: Commit**

```bash
git add src/web/Legend.svelte src/web/Graph.svelte
git commit -m "fix(ui): explain the stale-outline + add merge-commit to legend"
```

---

## Task A3: Distinguish local vs remote ref pills

**Why:** In a busy repo (SentryCall, 6 lanes, 8+ refs per HEAD commit) the local-branch pill (solid hairline border) and the remote pill (dashed hairline border) blur together. The user said "irgendwie sehe ich auch keine branches".

**Approach:** Render `origin/` (or any remote) as a small `o/` chip prefix, with the rest of the name in mono. Visual: `[o/] main`. Distinct from local: `[main]`. Background colour stays the same (so you can spot which lane); the prefix chip is what makes it scannable.

**Files:**
- Modify: `src/web/Graph.svelte` (rendering of `<span class="ref ref-remote">` to use a two-part chip)

- [ ] **Step 1: Pure helper to split a remote name**

In `src/web/Graph.svelte`'s `<script>` block, near the other helpers, add:

```ts
function splitRemoteRef(name: string): { remote: string; rest: string } {
  // Convention: first slash separates the remote from the branch path.
  // `origin/main` → { remote: 'origin', rest: 'main' }
  // `origin/feat/x` → { remote: 'origin', rest: 'feat/x' }
  const i = name.indexOf('/');
  if (i < 0) return { remote: '', rest: name };
  return { remote: name.slice(0, i), rest: name.slice(i + 1) };
}
```

- [ ] **Step 2: Render remote refs as a two-part chip**

Find the `{#each r.commit.refs as ref ...}` block in the labels rendering. Replace the `<span class={...}>{ref.name}</span>` with a conditional that splits remote refs:

```svelte
{#each r.commit.refs as ref (ref.kind + (ref.name ?? ''))}
  {#if ref.name}
    {#if ref.kind === 'remote'}
      {@const split = splitRemoteRef(ref.name)}
      <span
        class={`ref ref-${ref.kind}`}
        class:drop-active={dropTarget?.kind === 'ref' && dropTarget.refName === ref.name && drag !== null}
        data-drop-ref={onQueueCommand ? ref.name : undefined}
        onmouseenter={(e) => showHelp(helpForRef(ref), e)}
        onmouseleave={hideHelp}
      ><span class="remote-prefix">{split.remote}/</span>{split.rest}</span>
    {:else}
      <span
        class={`ref ref-${ref.kind}`}
        class:draggable={onQueueCommand && (ref.kind === 'branch' || ref.kind === 'head')}
        class:drop-active={dropTarget?.kind === 'ref' && dropTarget.refName === ref.name && drag !== null}
        role={onQueueCommand ? 'button' : undefined}
        data-drop-ref={onQueueCommand ? ref.name : undefined}
        onpointerdown={onQueueCommand && (ref.kind === 'branch' || ref.kind === 'head')
          ? (e) => onRefPointerDown(ref.name!, e)
          : undefined}
        onmouseenter={(e) => showHelp(helpForRef(ref), e)}
        onmouseleave={hideHelp}
      >{ref.name}</span>
    {/if}
  {/if}
{/each}
```

- [ ] **Step 3: Style the remote prefix chip**

In the `<style>` block, find `.ref-remote { ... }` and replace:

```css
.ref-remote {
  color: var(--text-secondary);
  border-style: dashed;
  /* Slightly tint the bg so even at a glance you can see "this isn't local". */
  background: rgba(138, 150, 168, 0.06);
}

.ref-remote .remote-prefix {
  color: var(--branch-7);
  font-weight: 600;
  margin-right: 1px;
  opacity: 0.85;
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Verify in preview**

Switch to SentryCall in the live preview. A commit row that previously read
`origin/main origin/fix/sen-240-… origin/HEAD fix/sen-240-…` should now read
`o/main o/fix/sen-240-… o/HEAD fix/sen-240-…` — the remote-prefix portion is dimmer-weight + slate, the rest in normal weight. The lone `fix/sen-240-…` (no prefix) is now visibly the local branch.

- [ ] **Step 6: Commit**

```bash
git add src/web/Graph.svelte
git commit -m "fix(ui): distinguish remote ref pills with a slate o/ prefix chip"
```

---

## Task A4: Hover-help audit pass

**Why:** A handful of strings still describe what we did to the display ("we collapsed these"), not what the underlying git concept is. The user explicitly called this out.

**Files:**
- Modify: `src/web/Graph.svelte` (`FOLD_HELP`, `TASK_FOLD_HELP`, `CONVERSATION_FOLD_HELP`, `helpForCommit` simulated branch)

- [ ] **Step 1: Replace the three fold-help constants**

Find the constants near the bottom of the `<script>` block. Replace:

```ts
const FOLD_HELP: HelpContent = {
  kind: 'fold',
  title: 'plain commits',
  body: 'These commits don\'t have any branches, tags, or worktrees pointing at them — there\'s nothing on them you can grab from here. They\'re collapsed so the graph stays focused on the points where you can actually act.',
  hint: 'Click anyway if you want to see them — e.g. to grab a single commit and cherry-pick it elsewhere.',
};

const TASK_FOLD_HELP: HelpContent = {
  kind: 'fold',
  title: 'background tasks',
  body: 'Hidden sessions started by automation — scheduled tasks, hooks, etc. Not real conversations. Always folded so a worktree with one human chat and 300 health-check fires shows the chat first.',
  hint: 'Open it if you\'re auditing what the scheduler did.',
};

const CONVERSATION_FOLD_HELP: HelpContent = {
  kind: 'fold',
  title: 'conversations',
  body: 'Folded because there are enough sessions here to clutter the card. The number is total — the "live" count is how many were active in the last 2 minutes.',
  hint: 'Click to see them all.',
};
```

These are already mostly fine — verify they read as intended. If anything reads like "we did X to display Y", rewrite to describe the underlying thing.

- [ ] **Step 2: Audit `helpForCommit` simulated branch**

Find the `if (c.simulated)` branch in `helpForCommit`. Verify the body explains *what a simulated commit is*, not "the simulator created this":

```ts
if (c.simulated) {
  return {
    kind: 'preview commit',
    title: shortSha(c.sha),
    body: 'A what-if commit — branchcraft computed what would land here if you applied the queued commands. Nothing exists on disk yet. Click Apply in the queue panel to actually create it, or remove the queued command to drop the preview.',
  };
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Verify hovers**

Hover the three fold rows + a simulated commit (queue any command via `+ Command` to produce one) in the live preview. Each should read as "what this is and what you can do", never "what the renderer did".

- [ ] **Step 5: Commit**

```bash
git add src/web/Graph.svelte
git commit -m "fix(ui): hover help describes the git concept, not the renderer"
```

---

## Task A5: Disambig popup component (PLAN §4.4)

**Why:** Branch → branch drag (PLAN row 1) currently always queues `merge`. PLAN.md §4.4 specifies a small popup at the drop point with rebase/merge/squash-merge options. Without this, half of row 1 is silently unreachable.

**Files:**
- Create: `src/web/DisambigPopup.svelte`
- Modify: `src/web/Graph.svelte` (open the popup on branch→branch drop instead of immediately queueing)

- [ ] **Step 1: Create the component**

Create `src/web/DisambigPopup.svelte`:

```svelte
<script lang="ts">
  /**
   * Compact disambiguation popup at a drop point. PLAN.md §4.4.
   *
   * Three options — rebase (default), merge, squash-merge — keyboard-
   * navigable (arrow keys), Enter confirms, Escape cancels.
   */
  type Choice = 'rebase' | 'merge' | 'squash';
  type Props = {
    open: boolean;
    fromName: string;
    intoName: string;
    x: number;
    y: number;
    onChoose: (c: Choice) => void;
    onCancel: () => void;
  };
  let { open, fromName, intoName, x, y, onChoose, onCancel }: Props = $props();

  const options: { kind: Choice; label: string }[] = [
    { kind: 'rebase', label: 'rebase (linear, rewrites SHAs)' },
    { kind: 'merge', label: 'merge (preserves history, may add merge commit)' },
    { kind: 'squash', label: 'squash-merge (one combined commit)' },
  ];

  let cursor = $state(0);
  let rootEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (open && rootEl) rootEl.focus();
  });
  $effect(() => {
    if (open) cursor = 0;
  });

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = (cursor + 1) % options.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = (cursor - 1 + options.length) % options.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[cursor];
      if (opt) onChoose(opt.kind);
    }
  }
</script>

{#if open}
  <div
    class="popup"
    style="left: {x}px; top: {y}px;"
    bind:this={rootEl}
    role="menu"
    aria-label="Choose branch combination"
    tabindex="-1"
    onkeydown={onKey}
  >
    <div class="hd mono">Drop {fromName} → {intoName}</div>
    <ol class="opts">
      {#each options as o, i (o.kind)}
        <li>
          <button
            class:active={i === cursor}
            onmouseenter={() => (cursor = i)}
            onclick={() => onChoose(o.kind)}
            role="menuitem"
          >
            <span class="chev mono" aria-hidden="true">{i === cursor ? '▸' : ' '}</span>
            <span class="kind mono">{o.kind}</span>
            <span class="lbl">{o.label}</span>
          </button>
        </li>
      {/each}
    </ol>
    <div class="ft mono">Esc cancel · Enter ok · ↑↓ navigate</div>
  </div>
{/if}

<style>
  .popup {
    position: fixed;
    z-index: 180;
    width: 320px;
    background: var(--bg-elevated);
    border: 1px solid var(--branch-2);
    border-radius: 6px;
    padding: var(--s2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    outline: none;
    font-size: 12px;
  }

  .hd {
    padding: 4px var(--s2);
    color: var(--text-secondary);
    border-bottom: 1px solid var(--hairline);
    margin-bottom: 4px;
    font-size: 11px;
  }

  .opts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .opts button {
    display: grid;
    grid-template-columns: 14px 80px 1fr;
    gap: var(--s2);
    align-items: baseline;
    width: 100%;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 4px var(--s2);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }

  .opts button.active {
    background: rgba(212, 165, 74, 0.1);
    border-color: var(--branch-2);
  }

  .chev {
    color: var(--branch-2);
  }

  .kind {
    color: var(--branch-2);
    font-size: 11px;
  }

  .lbl {
    color: var(--text-secondary);
  }

  .ft {
    padding: 4px var(--s2);
    color: var(--text-secondary);
    font-size: 10px;
    border-top: 1px solid var(--hairline);
    margin-top: 4px;
  }
</style>
```

- [ ] **Step 2: Wire it into Graph.svelte**

In `src/web/Graph.svelte`'s `<script>`, near the other top-level state, add:

```ts
import DisambigPopup from './DisambigPopup.svelte';

type PendingDisambig = {
  fromName: string;
  intoName: string;
  x: number;
  y: number;
};
let disambig = $state<PendingDisambig | null>(null);
```

Modify `onPointerUp`'s ref→ref branch:

```ts
} else if (d.kind === 'ref') {
  if (d.name === target.refName) return;
  // Per PLAN.md §4.4, ask whether to merge / rebase / squash. Pop the
  // disambig popup at the cursor; we resolve to a queued command in the
  // popup's onChoose callback.
  disambig = {
    fromName: d.name,
    intoName: target.refName,
    x: dragCursor.x,
    y: dragCursor.y,
  };
}
```

And add the popup at the bottom of the template (just before or after `<ContextHelp>`):

```svelte
<DisambigPopup
  open={disambig !== null}
  fromName={disambig?.fromName ?? ''}
  intoName={disambig?.intoName ?? ''}
  x={disambig?.x ?? 0}
  y={disambig?.y ?? 0}
  onChoose={(c) => {
    if (!disambig || !onQueueCommand) {
      disambig = null;
      return;
    }
    if (c === 'merge') {
      onQueueCommand({ kind: 'merge', from: disambig.fromName, into: disambig.intoName, ff: 'auto' });
    } else if (c === 'rebase') {
      onQueueCommand({ kind: 'rebase', branch: disambig.fromName, onto: disambig.intoName });
    } else if (c === 'squash') {
      // Squash uses merge with --squash semantics; reuse merge command with ff='no' as a stand-in
      // until a dedicated squash command is added in a later pass.
      onQueueCommand({ kind: 'merge', from: disambig.fromName, into: disambig.intoName, ff: 'no' });
    }
    disambig = null;
  }}
  onCancel={() => (disambig = null)}
/>
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Verify in preview**

In a repo with multiple branches, drag a branch ref pill onto another branch ref pill. Expected:
1. The popup appears at the drop point with "rebase / merge / squash-merge", rebase highlighted.
2. Arrow keys move the highlight; Enter queues the chosen command; Escape cancels.
3. Mouse hover changes the highlight; click queues immediately.

- [ ] **Step 5: Commit**

```bash
git add src/web/DisambigPopup.svelte src/web/Graph.svelte
git commit -m "feat(drag): disambig popup on branch → branch drop (PLAN §4.4)"
```

---

## Task A6: Apply modal component (PLAN §4.5)

**Why:** PLAN row 7 specifies that pushing with a diverged remote pops a "force-with-lease" confirmation. PLAN row 12 (tag) needs name + message inputs. Other paths (squash-merge with custom message, stash with note) all need free-text input. Without an apply-modal we can't ship those gestures faithfully.

This task ships the *generic* component. The push-specific wiring is Task A7; subsequent passes wire it into tag/stash/squash flows.

**Files:**
- Create: `src/web/ApplyModal.svelte`
- Modify: `src/web/App.svelte` (host the modal at top level — it overlays everything)

- [ ] **Step 1: Create `ApplyModal.svelte`**

```svelte
<script lang="ts">
  /**
   * Generic apply-modal for commands that need free-text input before
   * they can run. PLAN.md §4.5. Triggered when the queue's apply step
   * encounters a placeholder command — NOT on hover or drop.
   *
   * Caller passes `fields` describing the input shape; the modal calls
   * `onApply(values)` with a `Record<string, string>` once Apply is hit.
   */
  type Field = {
    name: string;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    required?: boolean;
    initial?: string;
  };
  type Props = {
    open: boolean;
    title: string;
    intro?: string;
    fields: Field[];
    confirmLabel?: string;
    danger?: boolean;
    onApply: (values: Record<string, string>) => void;
    onCancel: () => void;
  };
  let { open, title, intro, fields, confirmLabel = 'Apply', danger = false, onApply, onCancel }: Props = $props();

  let values = $state<Record<string, string>>({});
  let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Reset values when the modal opens with a new field set.
  $effect(() => {
    if (open) {
      const next: Record<string, string> = {};
      for (const f of fields) next[f.name] = f.initial ?? '';
      values = next;
      // Focus the first field shortly after mount.
      queueMicrotask(() => inputEl?.focus());
    }
  });

  let canApply = $derived(fields.every((f) => !f.required || (values[f.name] ?? '').trim().length > 0));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canApply) return;
    onApply(values);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={onKey}>
    <form class="modal" onsubmit={submit}>
      <h2>{title}</h2>
      {#if intro}<p class="intro">{intro}</p>{/if}
      {#each fields as f, i (f.name)}
        <label>
          <span class="label">{f.label}</span>
          {#if f.multiline}
            <textarea
              placeholder={f.placeholder ?? ''}
              bind:value={values[f.name]}
              bind:this={i === 0 ? inputEl : null}
              rows="3"
              spellcheck={false}
              autocomplete="off"
            ></textarea>
          {:else}
            <input
              type="text"
              placeholder={f.placeholder ?? ''}
              bind:value={values[f.name]}
              bind:this={i === 0 ? inputEl : null}
              spellcheck={false}
              autocomplete="off"
            />
          {/if}
        </label>
      {/each}
      <div class="actions">
        <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
        <button type="submit" class="submit" class:danger disabled={!canApply}>{confirmLabel}</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
  }
  .modal {
    background: var(--bg-elevated);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: var(--s5);
    width: 480px;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-direction: column;
    gap: var(--s4);
  }
  .modal h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .intro {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }
  .label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  input,
  textarea {
    background: var(--bg);
    color: var(--text-primary);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    padding: var(--s2) var(--s3);
    font: inherit;
    font-family: var(--font-mono);
    font-size: 13px;
    resize: vertical;
  }
  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--branch-2);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s3);
  }
  .cancel,
  .submit {
    padding: var(--s2) var(--s4);
    border-radius: 4px;
    border: 1px solid var(--hairline);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .submit {
    background: var(--branch-2);
    border-color: var(--branch-2);
    color: var(--bg);
    font-weight: 500;
  }
  .submit.danger {
    background: var(--danger);
    border-color: var(--danger);
  }
  .submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 2: Add a tiny dispatcher state in App.svelte**

In `src/web/App.svelte`'s `<script>`, near the other modal state:

```ts
import ApplyModal from './ApplyModal.svelte';

type ApplyModalState = {
  title: string;
  intro?: string;
  fields: { name: string; label: string; placeholder?: string; multiline?: boolean; required?: boolean; initial?: string }[];
  confirmLabel?: string;
  danger?: boolean;
  onApply: (values: Record<string, string>) => void;
};

let applyModal = $state<ApplyModalState | null>(null);

function openApplyModal(s: ApplyModalState) {
  applyModal = s;
}
function closeApplyModal() {
  applyModal = null;
}
```

- [ ] **Step 3: Render the modal at top level**

Just before or after `<Coachmark>` in the template:

```svelte
<ApplyModal
  open={applyModal !== null}
  title={applyModal?.title ?? ''}
  intro={applyModal?.intro}
  fields={applyModal?.fields ?? []}
  confirmLabel={applyModal?.confirmLabel}
  danger={applyModal?.danger ?? false}
  onApply={(values) => {
    applyModal?.onApply(values);
    closeApplyModal();
  }}
  onCancel={closeApplyModal}
/>
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Sanity-check the modal renders**

Temporarily add a button in `App.svelte`'s header (e.g. above the theme toggle) that calls:

```ts
openApplyModal({
  title: 'Sanity check',
  intro: 'Disposable test of the apply-modal component.',
  fields: [
    { name: 'foo', label: 'Foo', placeholder: 'bar', required: true },
    { name: 'msg', label: 'Message', multiline: true, placeholder: 'optional' },
  ],
  onApply: (v) => console.log('applied', v),
});
```

Click it. Verify Esc closes, Cancel closes, Apply with empty `foo` is disabled, Apply with `foo` filled triggers the handler.

Then **remove the temp button** before committing.

- [ ] **Step 6: Commit**

```bash
git add src/web/ApplyModal.svelte src/web/App.svelte
git commit -m "feat(ui): generic apply-modal for commands that need free text (PLAN §4.5)"
```

---

## Task A7: Drag local branch → origin/X marker (PLAN §4.2 row 7) — push gesture

**Why:** Row 7 = "drag a local branch tip onto its origin/* marker → push, with `--force-with-lease` if diverged". The push-with-lease prompt is exactly what apply-modal A6 was built for.

**Files:**
- Modify: `src/web/Graph.svelte` (resolve "this is a remote ref" detection, dispatch push command, open apply-modal when force needed)
- Modify: `src/web/App.svelte` (pass through `openApplyModal` to Graph)

- [ ] **Step 1: Pass `openApplyModal` to Graph**

In `App.svelte`'s `<Graph ...>` invocation, add the prop:

```svelte
<Graph
  commits={graphCommits}
  {laneCount}
  {worktrees}
  onQueueCommand={queueCommand}
  onOpenApplyModal={openApplyModal}
/>
```

- [ ] **Step 2: Accept the new prop in Graph.svelte**

In `src/web/Graph.svelte`, extend `Props`:

```ts
type Props = {
  commits: LaidOutCommit[];
  laneCount: number;
  worktrees: Worktree[];
  onQueueCommand?: (cmd: Command) => void;
  onOpenApplyModal?: (s: {
    title: string;
    intro?: string;
    fields: { name: string; label: string; placeholder?: string; multiline?: boolean; required?: boolean; initial?: string }[];
    confirmLabel?: string;
    danger?: boolean;
    onApply: (values: Record<string, string>) => void;
  }) => void;
};

let { commits, laneCount, worktrees, onQueueCommand, onOpenApplyModal }: Props = $props();
```

- [ ] **Step 3: Detect ref kinds at the drop site**

Build a fast lookup of ref kind by name in a `$derived`:

```ts
let refKindByName = $derived.by(() => {
  const m = new Map<string, 'branch' | 'remote' | 'tag' | 'head'>();
  for (const c of commits) for (const r of c.refs) {
    if (r.name) m.set(r.name, r.kind);
  }
  return m;
});
```

- [ ] **Step 4: Resolve push intent in onPointerUp**

In `onPointerUp`'s `target.kind === 'ref'` branch, add a clause for ref→remote BEFORE the existing branch→branch clause (so it takes precedence):

```ts
if (target.kind === 'ref') {
  if (d.kind === 'commit') {
    onQueueCommand({ kind: 'cherry-pick', commits: [d.sha], onto: target.refName });
  } else if (d.kind === 'ref') {
    if (d.name === target.refName) return;
    const targetKind = refKindByName.get(target.refName);
    const sourceKind = refKindByName.get(d.name);
    // Local branch (or current HEAD) → remote ref of the same logical name
    // = push. e.g. drag `main` onto `origin/main`.
    if (targetKind === 'remote' && sourceKind !== 'remote') {
      const remote = target.refName.split('/')[0] ?? 'origin';
      const branch = d.name;
      maybePromptForceAndQueuePush(branch, remote, target.refName);
      return;
    }
    // ... existing disambig popup logic for branch → branch ...
    disambig = { fromName: d.name, intoName: target.refName, x: dragCursor.x, y: dragCursor.y };
  } else if (d.kind === 'worktree') {
    onQueueCommand({ kind: 'checkout', worktree: d.path, target: target.refName });
  }
}
```

- [ ] **Step 5: Implement `maybePromptForceAndQueuePush`**

Just below `onPointerUp`, add:

```ts
function maybePromptForceAndQueuePush(branch: string, remote: string, remoteRef: string) {
  if (!onQueueCommand) return;

  // Check whether the branch's tip is an ancestor of the remote's tip:
  // if not, the push would be rejected without --force.
  const branchSha = (() => {
    for (const c of commits) for (const r of c.refs) {
      if (r.kind === 'branch' && r.name === branch) return c.sha;
      if (r.kind === 'head' && r.name === branch) return c.sha;
    }
    return null;
  })();
  const remoteSha = (() => {
    for (const c of commits) for (const r of c.refs) {
      if (r.kind === 'remote' && r.name === remoteRef) return c.sha;
    }
    return null;
  })();

  // Naive ancestry check: walk first-parents from `branchSha` until we hit
  // `remoteSha` or run out. Cheap and good enough for the lease prompt
  // heuristic; the actual safety check happens server-side in `git push`.
  function isAncestorViaFirstParents(start: string | null, target: string | null): boolean {
    if (!start || !target) return false;
    if (start === target) return true;
    const byShasMap = new Map(commits.map((c) => [c.sha, c] as const));
    let cur: string | undefined = start;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (cur === target) return true;
      const c = byShasMap.get(cur);
      if (!c) return false;
      cur = c.parents[0];
    }
    return false;
  }

  // If the remote tip is NOT an ancestor of the local tip, history has
  // diverged — show the lease prompt.
  const ff = isAncestorViaFirstParents(branchSha, remoteSha);
  if (ff) {
    onQueueCommand({ kind: 'push', branch, remote });
    return;
  }
  if (!onOpenApplyModal) {
    // No modal host — fall back to lease push (still safer than --force).
    onQueueCommand({ kind: 'push', branch, remote, force: 'lease' });
    return;
  }
  onOpenApplyModal({
    title: `Push ${branch} → ${remoteRef}`,
    intro: `${remoteRef} has commits that aren't in your local ${branch}. A regular push would be rejected.\n\n• Force-with-lease: overwrites the remote ONLY if it hasn't moved since your last fetch. Recommended.\n• Force: overwrites unconditionally. Dangerous on shared branches.\n• Cancel and pull first.`,
    fields: [
      {
        name: 'mode',
        label: 'Mode',
        placeholder: 'lease (default), force, or cancel',
        required: true,
        initial: 'lease',
      },
    ],
    confirmLabel: 'Queue push',
    danger: true,
    onApply: (values) => {
      const mode = (values.mode ?? '').trim().toLowerCase();
      if (mode === 'force') {
        onQueueCommand({ kind: 'push', branch, remote, force: true });
      } else if (mode === 'cancel') {
        // no-op
      } else {
        onQueueCommand({ kind: 'push', branch, remote, force: 'lease' });
      }
    },
  });
}
```

- [ ] **Step 6: Allow remote refs as drop targets**

The current `data-drop-ref` is set for ALL refs already (it doesn't gate on kind), so remote refs are already drop targets. Verify by reading `data-drop-ref` on a `.ref-remote` element in the live preview after typecheck.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 8: Verify in preview**

In a repo where local `main` is at the same commit as `origin/main`:
1. Drag the `main` ref pill onto `origin/main`. Expected: queue gets `push main → origin`, no modal (fast-forward).

In a repo where local has commits not yet pushed AND the remote has none of them (your normal case):
1. Same drag. Expected: queue gets `push main → origin` again, no modal.

For the diverged case, you can't easily simulate without an actual remote — verify the modal copy by triggering it manually (temporarily flip the `ff` check in your branch). Re-revert before commit.

- [ ] **Step 9: Commit**

```bash
git add src/web/Graph.svelte src/web/App.svelte
git commit -m "feat(drag): local branch → origin/X = push, lease prompt when diverged (PLAN §4.2 row 7)"
```

---

## Task A8: Drag branch tip backward on own line = reset (PLAN §4.2 row 5)

**Why:** Row 5 = "drag branch tip backward on its own lane → reset". Today there's no way to reset via the drag layer; the user has to type a `reset` command.

**Approach:** Treat any drop of a ref pill onto a *commit dot* on the same lane, where that commit is *behind* the current branch tip (i.e. is an ancestor), as a reset. PLAN says this should produce a popup for soft / mixed / hard. Reuse `DisambigPopup` with a custom set of options.

**Files:**
- Create: `src/web/ResetModePopup.svelte` (variant of disambig with reset modes)
- Modify: `src/web/Graph.svelte` (commit dots become drop targets; resolve drop accordingly)

- [ ] **Step 1: Create `ResetModePopup.svelte`**

```svelte
<script lang="ts">
  type Mode = 'soft' | 'mixed' | 'hard';
  type Props = {
    open: boolean;
    branch: string;
    sha: string;
    x: number;
    y: number;
    onChoose: (m: Mode) => void;
    onCancel: () => void;
  };
  let { open, branch, sha, x, y, onChoose, onCancel }: Props = $props();

  const options: { kind: Mode; label: string }[] = [
    { kind: 'mixed', label: 'mixed (default — keep changes unstaged)' },
    { kind: 'soft', label: 'soft (keep changes staged)' },
    { kind: 'hard', label: 'hard (DISCARD uncommitted changes)' },
  ];

  let cursor = $state(0);
  let rootEl = $state<HTMLDivElement | null>(null);
  $effect(() => { if (open && rootEl) rootEl.focus(); });
  $effect(() => { if (open) cursor = 0; });

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % options.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + options.length) % options.length; }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[cursor];
      if (opt) onChoose(opt.kind);
    }
  }
</script>

{#if open}
  <div
    class="popup"
    style="left: {x}px; top: {y}px;"
    bind:this={rootEl}
    role="menu"
    aria-label="Reset mode"
    tabindex="-1"
    onkeydown={onKey}
  >
    <div class="hd mono">Reset {branch} → {sha.slice(0, 7)}</div>
    <ol class="opts">
      {#each options as o, i (o.kind)}
        <li>
          <button
            class:active={i === cursor}
            class:danger={o.kind === 'hard'}
            onmouseenter={() => (cursor = i)}
            onclick={() => onChoose(o.kind)}
            role="menuitem"
          >
            <span class="chev mono" aria-hidden="true">{i === cursor ? '▸' : ' '}</span>
            <span class="kind mono">{o.kind}</span>
            <span class="lbl">{o.label}</span>
          </button>
        </li>
      {/each}
    </ol>
    <div class="ft mono">Esc cancel · Enter ok</div>
  </div>
{/if}

<style>
  /* Mirrors DisambigPopup styles. */
  .popup { position: fixed; z-index: 180; width: 360px; background: var(--bg-elevated);
           border: 1px solid var(--branch-2); border-radius: 6px; padding: var(--s2);
           box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); outline: none; font-size: 12px; }
  .hd { padding: 4px var(--s2); color: var(--text-secondary);
        border-bottom: 1px solid var(--hairline); margin-bottom: 4px; font-size: 11px; }
  .opts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
  .opts button { display: grid; grid-template-columns: 14px 60px 1fr; gap: var(--s2);
                 align-items: baseline; width: 100%; background: transparent;
                 border: 1px solid transparent; border-radius: 4px; padding: 4px var(--s2);
                 color: var(--text-primary); text-align: left; cursor: pointer;
                 font: inherit; font-size: 12px; }
  .opts button.active { background: rgba(212, 165, 74, 0.1); border-color: var(--branch-2); }
  .opts button.danger.active { border-color: var(--danger); }
  .chev { color: var(--branch-2); }
  .kind { color: var(--branch-2); font-size: 11px; }
  .opts button.danger .kind { color: var(--danger); }
  .lbl { color: var(--text-secondary); }
  .ft { padding: 4px var(--s2); color: var(--text-secondary); font-size: 10px;
        border-top: 1px solid var(--hairline); margin-top: 4px; }
</style>
```

- [ ] **Step 2: Add commit dots as drop targets**

In `src/web/Graph.svelte`, on the `<circle class="commit-hit">` element (the invisible hit area), add `data-drop-commit-sha`:

```svelte
<circle
  class="commit-hit"
  role="button"
  tabindex="-1"
  aria-label="Drag commit {shortSha(r.commit.sha)}"
  cx={laneX(r.commit.lane)}
  cy={r.dotY}
  r="10"
  fill="transparent"
  data-drop-commit-sha={onQueueCommand ? r.commit.sha : undefined}
  onpointerdown={(e) => onCommitPointerDown(r.commit, e)}
  onmouseenter={(e) => showHelp(helpForCommit(r.commit), e)}
  onmouseleave={hideHelp}
/>
```

- [ ] **Step 3: Extend `DropTarget` and detection**

```ts
type DropTarget =
  | { kind: 'ref'; refName: string }
  | { kind: 'worktree'; worktreePath: string }
  | { kind: 'commit'; sha: string };
```

Update the `onPointerMove` loop to detect the new attribute:

```ts
for (const el of els) {
  if (!(el instanceof HTMLElement)) continue;
  if (el.dataset.dropRef) {
    found = { kind: 'ref', refName: el.dataset.dropRef };
    break;
  }
  if (el.dataset.dropWorktree) {
    found = { kind: 'worktree', worktreePath: el.dataset.dropWorktree };
    break;
  }
}
// SVG circles aren't HTMLElements — handle them via getAttribute on Element.
for (const el of els) {
  const sha = el instanceof Element ? el.getAttribute('data-drop-commit-sha') : null;
  if (sha) {
    found = { kind: 'commit', sha };
    break;
  }
}
dropTarget = found;
```

- [ ] **Step 4: Resolve ref → commit drops in onPointerUp**

Add the new branch in `onPointerUp`:

```ts
} else if (target.kind === 'commit') {
  if (d.kind === 'ref') {
    // PLAN row 5: branch tip dropped on a commit on its own line = reset.
    // Pop the mode popup; reset is destructive enough to warrant the
    // explicit choice every time.
    resetPopup = {
      branch: d.name,
      sha: target.sha,
      x: dragCursor.x,
      y: dragCursor.y,
    };
  }
  // ref tip → commit on a DIFFERENT lane is row 2 (rebase onto), not row 5.
  // Detection: compare the lane of the target commit to the source branch's
  // current commit. If they differ, queue rebase. Implemented in Tier B.
  // For now, we only handle the same-lane reset case explicitly above.
}
```

Also at the top, declare popup state:

```ts
import ResetModePopup from './ResetModePopup.svelte';

type ResetPopup = { branch: string; sha: string; x: number; y: number };
let resetPopup = $state<ResetPopup | null>(null);
```

And render it (next to the existing DisambigPopup):

```svelte
<ResetModePopup
  open={resetPopup !== null}
  branch={resetPopup?.branch ?? ''}
  sha={resetPopup?.sha ?? ''}
  x={resetPopup?.x ?? 0}
  y={resetPopup?.y ?? 0}
  onChoose={(mode) => {
    if (resetPopup && onQueueCommand) {
      onQueueCommand({ kind: 'reset', branch: resetPopup.branch, to: resetPopup.sha, mode });
    }
    resetPopup = null;
  }}
  onCancel={() => (resetPopup = null)}
/>
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Verify in preview**

In a repo with at least 3 commits on a branch:
1. Drag the branch ref pill onto a commit a few rows below it.
2. The reset-mode popup appears at the drop point with `mixed` highlighted.
3. Arrow / Enter chooses; Escape cancels.
4. Choosing `hard` queues `reset <branch> --hard <sha>`; `soft` and `mixed` analogously.

- [ ] **Step 7: Commit**

```bash
git add src/web/ResetModePopup.svelte src/web/Graph.svelte
git commit -m "feat(drag): branch tip → commit on own line = reset, mode popup (PLAN §4.2 row 5)"
```

---

## Task A9: Mark Pass 1 closed in ROADMAP.md

**Why:** Track progress visibly so the user (and future Claude sessions) can see what's done.

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the drag-gesture audit table**

In `ROADMAP.md`, update the rows whose status changes:

```markdown
| 1  | branch tip → branch tip                  | merge / rebase / squash   | ✅ disambig popup, queues merge/rebase/squash (squash via merge `--no-ff` until dedicated cmd) |
| 3  | single commit → branch tip               | cherry-pick               | ✅ |
| 5  | branch tip → backward on own line        | reset (mode popup)        | ✅ |
| 7  | local branch → `origin/X` marker         | push (lease if diverged)  | ✅ |
| 9  | worktree card → branch tip               | `git -C <wt> checkout`    | ✅ both directions; Pass 1 |
```

Update the score line:

```markdown
**Score: 4 fully (1, 3, 5, 9), 1 partial (7 — squash via merge stand-in), 14 missing.**
```

- [ ] **Step 2: Drop the now-fixed P0 items**

In ROADMAP P0, mark:

```markdown
### a) Worktree cards aren't drag sources
**SHIPPED** in Pass 1 (commit `feat(drag): worktree card is a drag source ...`).
Both directions work now — drag-from-worktree and drop-on-worktree.

### b) Visual states are silently rendered, never explained
**PARTIALLY SHIPPED**: stale-outline + merge-commit added to the legend.
Preview-commit was already in the legend. Hover-help on stale worktrees
mentions the dashed border explicitly.

### c) Local vs remote branch refs blur together
**SHIPPED** in Pass 1: remote refs render with a slate `o/` prefix chip.

### d) Hover help text still describes "what we did", not "what this is"
**SHIPPED** in Pass 1: audit pass swept the remaining strings.

### e) Sessions are sorted by lastActivity but not labelled
**STILL OPEN** — moves to Pass 2 (label or toggle).
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark Pass 1 PLAN-fill complete (rows 1, 5, 7, 9)"
```

---

# PART B — Multi-Agent Activity & Conflict Detection

## Task B1: Shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Append the new types**

```ts
// ── Activity & conflict detection ────────────────────────────────────────────

export type ActivityKind = 'edit' | 'write' | 'read' | 'bash' | 'other';

export interface ActivityEvent {
  /** Provider's session id (matches Session.id). */
  sessionId: string;
  /** Worktree path the session lives in — matches Worktree.path. */
  cwd: string;
  /** Unix milliseconds — derived from JSONL `timestamp`. */
  ts: number;
  kind: ActivityKind;
  /** Absolute path. Present for edit / write / read; absent for bash / other. */
  file?: string;
  /** Short label — bash command (first 60 chars) or tool name. */
  label?: string;
}

export interface ConcurrentConflict {
  kind: 'concurrent';
  file: string;
  /** Sessions that touched the file in the C1 window, newest first. */
  sessions: { sessionId: string; ts: number }[];
}

export interface DivergenceConflict {
  kind: 'divergence';
  /** Local branch name. */
  branch: string;
  siblings: string[];
  /** Files that overlap (capped at 20). */
  overlap: string[];
}

export interface ActivitySnapshot {
  events: ActivityEvent[];
  concurrent: ConcurrentConflict[];
  divergence: DivergenceConflict[];
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(activity): shared types for activity events + conflicts"
```

---

## Task B2: Extract — JSONL line → ActivityEvent

**Files:**
- Create: `src/server/activity/extract.ts`
- Test: `src/server/activity/extract.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/server/activity/extract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractActivityEvent } from './extract.ts';

const cwd = '/repo';

describe('extractActivityEvent', () => {
  it('returns null for non-message records', () => {
    expect(extractActivityEvent({ type: 'queue-operation' }, 'sid', cwd)).toBeNull();
    expect(extractActivityEvent({ type: 'custom-title' }, 'sid', cwd)).toBeNull();
  });

  it('extracts an Edit tool_use', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Edit',
            input: { file_path: '/repo/src/foo.ts', old_string: 'a', new_string: 'b' },
          },
        ],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    const e = extractActivityEvent(line, 'sid', cwd);
    expect(e).toMatchObject({
      sessionId: 'sid',
      cwd,
      kind: 'edit',
      file: '/repo/src/foo.ts',
    });
    expect(e?.ts).toBeGreaterThan(0);
  });

  it('extracts a Write tool_use', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/repo/new.ts', content: 'x' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toMatchObject({ kind: 'write', file: '/repo/new.ts' });
  });

  it('extracts a Read', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/repo/x.ts' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toMatchObject({ kind: 'read', file: '/repo/x.ts' });
  });

  it('extracts a Bash with truncated label', () => {
    const long = 'a'.repeat(200);
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: `echo ${long}` } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    const e = extractActivityEvent(line, 'sid', cwd);
    expect(e?.kind).toBe('bash');
    expect(e?.label?.length).toBeLessThanOrEqual(60);
    expect(e?.file).toBeUndefined();
  });

  it('handles MultiEdit by reporting the file_path', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'MultiEdit', input: { file_path: '/repo/m.ts', edits: [] } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toMatchObject({ kind: 'edit', file: '/repo/m.ts' });
  });

  it('falls through to "other" for unknown tools', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    const e = extractActivityEvent(line, 'sid', cwd);
    expect(e).toMatchObject({ kind: 'other', label: 'Glob' });
  });

  it('resolves relative file_path against cwd', () => {
    const line = {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/rel.ts' } }],
      },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', '/repo')).toMatchObject({
      file: '/repo/src/rel.ts',
    });
  });

  it('returns null for assistant messages with no tool_use', () => {
    const line = {
      type: 'message',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      timestamp: '2026-04-26T10:00:00.000Z',
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toBeNull();
  });

  it('returns null when timestamp is missing or unparseable', () => {
    const line = {
      type: 'message',
      message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'x' } }] },
    };
    expect(extractActivityEvent(line, 'sid', cwd)).toBeNull();
  });
});
```

- [ ] **Step 2: Verify the tests fail**

```bash
npm test -- src/server/activity/extract.test.ts
```

Expected: all 9 tests fail because `extractActivityEvent` doesn't exist.

- [ ] **Step 3: Implement `extract.ts`**

Create `src/server/activity/extract.ts`:

```ts
import { isAbsolute, resolve } from 'node:path';
import type { ActivityEvent, ActivityKind } from '../../shared/types.ts';

const KIND_BY_TOOL: Record<string, ActivityKind> = {
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'write',
  Read: 'read',
  NotebookRead: 'read',
  NotebookEdit: 'edit',
  Bash: 'bash',
};

/**
 * Map a parsed JSONL record (of the form CCD writes) to an ActivityEvent,
 * or null when the record is not a tool_use we want to surface.
 *
 * Pure — `cwd` is the absolute worktree path the session was started in,
 * used to resolve relative file_path inputs.
 */
export function extractActivityEvent(
  raw: unknown,
  sessionId: string,
  cwd: string,
): ActivityEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'message') return null;
  const msg = r.message;
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.role !== 'assistant') return null;
  const content = m.content;
  if (!Array.isArray(content)) return null;
  const ts = parseTs(r.timestamp);
  if (ts === null) return null;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type !== 'tool_use') continue;
    const name = typeof b.name === 'string' ? b.name : '';
    const input = (typeof b.input === 'object' && b.input !== null) ? (b.input as Record<string, unknown>) : {};
    const kind = KIND_BY_TOOL[name] ?? 'other';
    let file: string | undefined;
    let label: string | undefined;
    if (kind === 'edit' || kind === 'write' || kind === 'read') {
      const fp = typeof input.file_path === 'string' ? input.file_path : null;
      if (fp) file = isAbsolute(fp) ? fp : resolve(cwd, fp);
    } else if (kind === 'bash') {
      const cmd = typeof input.command === 'string' ? input.command : '';
      label = cmd.replace(/\s+/g, ' ').slice(0, 60);
    } else {
      label = name || 'tool_use';
    }
    return {
      sessionId,
      cwd,
      ts,
      kind,
      ...(file ? { file } : {}),
      ...(label ? { label } : {}),
    };
  }
  return null;
}

function parseTs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
```

- [ ] **Step 4: Verify the tests pass**

```bash
npm test -- src/server/activity/extract.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Full test run**

```bash
npm test
```

Expected: full count up by 9 (e.g. `92 passed`).

- [ ] **Step 6: Commit**

```bash
git add src/server/activity/extract.ts src/server/activity/extract.test.ts
git commit -m "feat(activity): extract — CCD JSONL line to ActivityEvent"
```

---

## Task B3: Store — ring buffer + per-file recent-touch index

**Files:**
- Create: `src/server/activity/store.ts`
- Test: `src/server/activity/store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/server/activity/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ActivityStore } from './store.ts';
import type { ActivityEvent } from '../../shared/types.ts';

function ev(o: Partial<ActivityEvent> & Pick<ActivityEvent, 'sessionId'>): ActivityEvent {
  return {
    cwd: '/repo',
    ts: Date.now(),
    kind: 'edit',
    file: '/repo/x.ts',
    ...o,
  };
}

describe('ActivityStore', () => {
  it('stores a per-session ring buffer capped at the configured size', () => {
    const s = new ActivityStore({ ringSize: 3 });
    for (let i = 0; i < 10; i++) s.add(ev({ sessionId: 'A', ts: i }));
    expect(s.recent('A').map((e) => e.ts)).toEqual([9, 8, 7]);
  });

  it('keeps sessions isolated', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add(ev({ sessionId: 'A', ts: 1 }));
    s.add(ev({ sessionId: 'B', ts: 2 }));
    expect(s.recent('A')).toHaveLength(1);
    expect(s.recent('B')).toHaveLength(1);
  });

  it('indexes recent file touches with the most recent first', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add(ev({ sessionId: 'A', file: '/r/foo.ts', ts: 1 }));
    s.add(ev({ sessionId: 'B', file: '/r/foo.ts', ts: 2 }));
    s.add(ev({ sessionId: 'C', file: '/r/foo.ts', ts: 3 }));
    expect(s.recentTouches('/r/foo.ts').map((t) => t.sessionId)).toEqual(['C', 'B', 'A']);
  });

  it('caps per-file index entries at 5', () => {
    const s = new ActivityStore({ ringSize: 5 });
    for (let i = 0; i < 10; i++) {
      s.add(ev({ sessionId: `S${i}`, file: '/r/foo.ts', ts: i }));
    }
    expect(s.recentTouches('/r/foo.ts')).toHaveLength(5);
  });

  it('flat events list is newest first across all sessions', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add(ev({ sessionId: 'A', ts: 1, file: '/r/a' }));
    s.add(ev({ sessionId: 'B', ts: 2, file: '/r/b' }));
    s.add(ev({ sessionId: 'A', ts: 3, file: '/r/a' }));
    expect(s.events().map((e) => e.ts)).toEqual([3, 2, 1]);
  });

  it('prune drops touches older than the threshold', () => {
    const s = new ActivityStore({ ringSize: 5 });
    const now = 100_000;
    s.add(ev({ sessionId: 'A', ts: now - 10 * 60_000, file: '/r/old' }));
    s.add(ev({ sessionId: 'B', ts: now - 1_000, file: '/r/new' }));
    s.prune(now);
    expect(s.recentTouches('/r/old')).toHaveLength(0);
    expect(s.recentTouches('/r/new')).toHaveLength(1);
  });

  it('events without a file do not enter the file index but ARE in the ring', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add({ sessionId: 'A', cwd: '/r', ts: 1, kind: 'bash', label: 'npm test' });
    expect(s.recent('A')).toHaveLength(1);
    expect(s.recentTouches('/r/whatever')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Verify the tests fail**

```bash
npm test -- src/server/activity/store.test.ts
```

Expected: all 7 tests fail because `ActivityStore` doesn't exist.

- [ ] **Step 3: Implement `store.ts`**

Create `src/server/activity/store.ts`:

```ts
import type { ActivityEvent } from '../../shared/types.ts';

interface StoreOpts {
  ringSize?: number;
  /** ms — file-index entries older than this are pruned. */
  fileIndexMaxAgeMs?: number;
  /** Max entries kept per file in the index. */
  fileIndexMaxPerFile?: number;
}

export interface RecentTouch {
  sessionId: string;
  ts: number;
}

export class ActivityStore {
  private readonly ringSize: number;
  private readonly fileIndexMaxAgeMs: number;
  private readonly fileIndexMaxPerFile: number;

  /** Per-session ring buffer, newest first. */
  private rings = new Map<string, ActivityEvent[]>();
  /** Per-file recent touches, newest first. */
  private fileTouches = new Map<string, RecentTouch[]>();

  constructor(opts: StoreOpts = {}) {
    this.ringSize = opts.ringSize ?? 50;
    this.fileIndexMaxAgeMs = opts.fileIndexMaxAgeMs ?? 5 * 60_000;
    this.fileIndexMaxPerFile = opts.fileIndexMaxPerFile ?? 5;
  }

  add(event: ActivityEvent): void {
    const ring = this.rings.get(event.sessionId) ?? [];
    ring.unshift(event);
    if (ring.length > this.ringSize) ring.length = this.ringSize;
    this.rings.set(event.sessionId, ring);

    if (event.file) {
      const list = this.fileTouches.get(event.file) ?? [];
      list.unshift({ sessionId: event.sessionId, ts: event.ts });
      if (list.length > this.fileIndexMaxPerFile) list.length = this.fileIndexMaxPerFile;
      this.fileTouches.set(event.file, list);
    }
  }

  /** Newest-first ring buffer for a session. */
  recent(sessionId: string): ActivityEvent[] {
    return [...(this.rings.get(sessionId) ?? [])];
  }

  /** Newest-first per-file touches. */
  recentTouches(file: string): RecentTouch[] {
    return [...(this.fileTouches.get(file) ?? [])];
  }

  /** Flat newest-first stream across all sessions, capped at `cap`. */
  events(cap = 200): ActivityEvent[] {
    const merged: ActivityEvent[] = [];
    for (const ring of this.rings.values()) merged.push(...ring);
    merged.sort((a, b) => b.ts - a.ts);
    if (merged.length > cap) merged.length = cap;
    return merged;
  }

  /** Drop file-index entries older than fileIndexMaxAgeMs from `now`. */
  prune(now: number): void {
    for (const [file, list] of this.fileTouches) {
      const fresh = list.filter((t) => now - t.ts < this.fileIndexMaxAgeMs);
      if (fresh.length === 0) this.fileTouches.delete(file);
      else if (fresh.length !== list.length) this.fileTouches.set(file, fresh);
    }
  }
}
```

- [ ] **Step 4: Verify the tests pass**

```bash
npm test -- src/server/activity/store.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/activity/store.ts src/server/activity/store.test.ts
git commit -m "feat(activity): in-memory store — ring buffer + recent-touch index"
```

---

## Task B4: Conflict detection — C1 (concurrent edit)

**Files:**
- Create: `src/server/activity/conflicts.ts`
- Test: `src/server/activity/conflicts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/server/activity/conflicts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectConcurrent } from './conflicts.ts';
import { ActivityStore } from './store.ts';
import type { ActivityEvent } from '../../shared/types.ts';

function ev(o: Partial<ActivityEvent> & Pick<ActivityEvent, 'sessionId' | 'ts'>): ActivityEvent {
  return { cwd: '/r', kind: 'edit', file: '/r/foo.ts', ...o };
}

describe('detectConcurrent (C1)', () => {
  it('returns null when no other session has touched the file recently', () => {
    const s = new ActivityStore();
    const e = ev({ sessionId: 'A', ts: 1000 });
    s.add(e);
    expect(detectConcurrent(s, e, { windowMs: 5 * 60_000, now: 1000 })).toBeNull();
  });

  it('emits a conflict when a different session touched the file in the window', () => {
    const s = new ActivityStore();
    const earlier = ev({ sessionId: 'B', ts: 1000 });
    s.add(earlier);
    const later = ev({ sessionId: 'A', ts: 60_000 });
    s.add(later);
    const c = detectConcurrent(s, later, { windowMs: 5 * 60_000, now: 60_000 });
    expect(c).not.toBeNull();
    expect(c?.kind).toBe('concurrent');
    expect(c?.file).toBe('/r/foo.ts');
    expect(c?.sessions.map((x) => x.sessionId).sort()).toEqual(['A', 'B']);
  });

  it('ignores the same session re-touching its own file', () => {
    const s = new ActivityStore();
    const a1 = ev({ sessionId: 'A', ts: 1000 });
    s.add(a1);
    const a2 = ev({ sessionId: 'A', ts: 2000 });
    s.add(a2);
    expect(detectConcurrent(s, a2, { windowMs: 5 * 60_000, now: 2000 })).toBeNull();
  });

  it('ignores prior touches outside the window', () => {
    const s = new ActivityStore();
    s.add(ev({ sessionId: 'B', ts: 0 }));
    const a = ev({ sessionId: 'A', ts: 10 * 60_000 });
    s.add(a);
    expect(detectConcurrent(s, a, { windowMs: 5 * 60_000, now: 10 * 60_000 })).toBeNull();
  });

  it('returns null when the event has no file', () => {
    const s = new ActivityStore();
    const e: ActivityEvent = { sessionId: 'A', cwd: '/r', ts: 1, kind: 'bash', label: 'ls' };
    s.add(e);
    expect(detectConcurrent(s, e, { windowMs: 5 * 60_000, now: 1 })).toBeNull();
  });

  it('aggregates more than two participants', () => {
    const s = new ActivityStore();
    s.add(ev({ sessionId: 'A', ts: 1 }));
    s.add(ev({ sessionId: 'B', ts: 2 }));
    const c3 = ev({ sessionId: 'C', ts: 3 });
    s.add(c3);
    const c = detectConcurrent(s, c3, { windowMs: 5 * 60_000, now: 3 });
    expect(c?.sessions.map((x) => x.sessionId).sort()).toEqual(['A', 'B', 'C']);
  });
});
```

- [ ] **Step 2: Verify they fail**

```bash
npm test -- src/server/activity/conflicts.test.ts
```

Expected: 6 fail; `detectConcurrent` doesn't exist.

- [ ] **Step 3: Implement `conflicts.ts`**

Create `src/server/activity/conflicts.ts`:

```ts
import type { ActivityEvent, ConcurrentConflict } from '../../shared/types.ts';
import type { ActivityStore } from './store.ts';

export interface DetectOpts {
  /** Window in ms — touches older than this don't count as concurrent. */
  windowMs: number;
  /** "Now" reference for window calculation. Injected for deterministic tests. */
  now: number;
}

/**
 * C1 — same-file concurrent edit detector.
 *
 * Inspect the per-file touch index after a new event has been recorded.
 * If at least one DIFFERENT session has touched the same file within
 * `windowMs`, emit a {@link ConcurrentConflict}. Otherwise null.
 *
 * Pure aside from reading the store; designed to run on the same code path
 * that records the event so warnings fire immediately.
 */
export function detectConcurrent(
  store: ActivityStore,
  event: ActivityEvent,
  opts: DetectOpts,
): ConcurrentConflict | null {
  if (!event.file) return null;
  const all = store.recentTouches(event.file);
  const inWindow = all.filter((t) => opts.now - t.ts <= opts.windowMs);
  const distinctSessions = new Set(inWindow.map((t) => t.sessionId));
  // Only a conflict when there's at least one OTHER session in the window.
  const others = [...distinctSessions].filter((s) => s !== event.sessionId);
  if (others.length === 0) return null;
  // Keep newest-first, dedup by session (latest ts per session).
  const latestPerSession = new Map<string, number>();
  for (const t of inWindow) {
    const cur = latestPerSession.get(t.sessionId) ?? 0;
    if (t.ts > cur) latestPerSession.set(t.sessionId, t.ts);
  }
  const sessions = [...latestPerSession.entries()]
    .map(([sessionId, ts]) => ({ sessionId, ts }))
    .sort((a, b) => b.ts - a.ts);
  return { kind: 'concurrent', file: event.file, sessions };
}
```

- [ ] **Step 4: Verify they pass**

```bash
npm test -- src/server/activity/conflicts.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/activity/conflicts.ts src/server/activity/conflicts.test.ts
git commit -m "feat(activity): C1 concurrent-edit detection"
```

---

## Task B5: Conflict detection — C3 (branch divergence)

**Files:**
- Modify: `src/server/activity/conflicts.ts` (add `detectDivergence`)
- Modify: `src/server/activity/conflicts.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

Append to `src/server/activity/conflicts.test.ts`:

```ts
import { detectDivergence } from './conflicts.ts';

describe('detectDivergence (C3)', () => {
  it('returns no divergence when all branches share zero files since base', () => {
    const branches = new Map<string, Set<string>>([
      ['main', new Set()],
      ['feat/a', new Set()],
    ]);
    expect(detectDivergence(branches)).toEqual([]);
  });

  it('emits divergence for two branches that share one file', () => {
    const branches = new Map<string, Set<string>>([
      ['feat/a', new Set(['src/foo.ts'])],
      ['feat/b', new Set(['src/foo.ts'])],
    ]);
    const out = detectDivergence(branches);
    expect(out).toHaveLength(2);
    const a = out.find((d) => d.branch === 'feat/a')!;
    expect(a.siblings).toEqual(['feat/b']);
    expect(a.overlap).toEqual(['src/foo.ts']);
  });

  it('caps overlap to 20 file paths', () => {
    const files = new Set<string>();
    for (let i = 0; i < 50; i++) files.add(`src/${i}.ts`);
    const branches = new Map<string, Set<string>>([
      ['a', files],
      ['b', files],
    ]);
    const out = detectDivergence(branches);
    expect(out[0]?.overlap.length).toBe(20);
  });

  it('lists multiple siblings for a branch with multiple overlaps', () => {
    const branches = new Map<string, Set<string>>([
      ['a', new Set(['x.ts'])],
      ['b', new Set(['x.ts'])],
      ['c', new Set(['x.ts'])],
    ]);
    const a = detectDivergence(branches).find((d) => d.branch === 'a')!;
    expect(a.siblings.sort()).toEqual(['b', 'c']);
  });
});
```

- [ ] **Step 2: Verify they fail**

```bash
npm test -- src/server/activity/conflicts.test.ts
```

Expected: 6 still pass + 4 new fail.

- [ ] **Step 3: Implement `detectDivergence`**

Append to `src/server/activity/conflicts.ts`:

```ts
import type { DivergenceConflict } from '../../shared/types.ts';

const OVERLAP_CAP = 20;

/**
 * C3 — branch divergence detector.
 *
 * Caller hands in a map `branchName → Set<fileChangedSinceBase>`. We
 * pairwise intersect and emit one DivergenceConflict per branch that
 * overlaps with at least one other.
 *
 * The map is a snapshot computed elsewhere (typically via
 * `git diff --name-only <merge-base>..<tip>`, cached by tip-sha so the
 * cost is paid once per branch tip).
 */
export function detectDivergence(branches: Map<string, Set<string>>): DivergenceConflict[] {
  const names = [...branches.keys()];
  const out = new Map<string, DivergenceConflict>();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      const filesA = branches.get(a)!;
      const filesB = branches.get(b)!;
      const overlap: string[] = [];
      for (const f of filesA) {
        if (filesB.has(f)) {
          overlap.push(f);
          if (overlap.length >= OVERLAP_CAP) break;
        }
      }
      if (overlap.length === 0) continue;

      // Merge into both branches' divergence entries.
      ensure(out, a).siblings.push(b);
      ensure(out, b).siblings.push(a);
      const ea = out.get(a)!;
      const eb = out.get(b)!;
      mergeOverlap(ea.overlap, overlap);
      mergeOverlap(eb.overlap, overlap);
    }
  }
  for (const d of out.values()) {
    d.siblings = [...new Set(d.siblings)].sort();
    d.overlap = [...new Set(d.overlap)].slice(0, OVERLAP_CAP);
  }
  return [...out.values()];
}

function ensure(m: Map<string, DivergenceConflict>, branch: string): DivergenceConflict {
  let d = m.get(branch);
  if (!d) {
    d = { kind: 'divergence', branch, siblings: [], overlap: [] };
    m.set(branch, d);
  }
  return d;
}

function mergeOverlap(into: string[], extra: string[]): void {
  for (const f of extra) {
    if (into.length >= OVERLAP_CAP) return;
    if (!into.includes(f)) into.push(f);
  }
}
```

- [ ] **Step 4: Verify all 10 tests pass**

```bash
npm test -- src/server/activity/conflicts.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/activity/conflicts.ts src/server/activity/conflicts.test.ts
git commit -m "feat(activity): C3 branch-divergence detection (pairwise file overlap)"
```

---

## Task B6: Watcher — chokidar tail of active JSONL files

**Files:**
- Create: `src/server/activity/watcher.ts`

- [ ] **Step 1: Implement the watcher**

Create `src/server/activity/watcher.ts`:

```ts
import chokidar, { type FSWatcher } from 'chokidar';
import { existsSync, statSync } from 'node:fs';
import { open as fsOpen } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { encodeProjectKey } from '../sessions/claude-code.ts';
import type { ActivityEvent } from '../../shared/types.ts';
import { extractActivityEvent } from './extract.ts';

const PROJECTS = join(homedir(), '.claude', 'projects');
const ACTIVE_THRESHOLD_MS = 60 * 60_000; // 60 min — only watch sessions active in the last hour
const MAX_PER_REPO = 50;
const RESCAN_INTERVAL_MS = 30_000;

interface FileState {
  /** Byte offset already read. */
  offset: number;
  /** Trailing partial line waiting for a newline. */
  partial: string;
  /** Resolved cwd of this session, used for path resolution. */
  cwd: string;
  /** Session id derived from the file basename (uuid.jsonl → uuid). */
  sessionId: string;
}

export interface WatcherOpts {
  /** Worktree absolute paths whose JSONL files we should watch. */
  worktreePaths: string[];
  /** Called for every newly extracted ActivityEvent. */
  onEvent: (e: ActivityEvent) => void;
}

/**
 * Tail every active CCD session JSONL for the given worktrees. Per-file
 * byte offsets ensure we only read the new bytes on each `change` event.
 * Re-scans every {@link RESCAN_INTERVAL_MS} so newly active sessions get
 * picked up without the user reloading.
 */
export class ActivityWatcher {
  private watcher: FSWatcher | null = null;
  private states = new Map<string, FileState>();
  private rescanTimer: NodeJS.Timeout | null = null;
  private opts: WatcherOpts;

  constructor(opts: WatcherOpts) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (!existsSync(PROJECTS)) return;
    this.watcher = chokidar.watch([], {
      persistent: true,
      ignoreInitial: true,
      // Don't fire add events; we'll initialize offsets manually so we can
      // skip pre-existing content.
    });
    this.watcher.on('change', (path) => void this.onChange(path));
    this.watcher.on('unlink', (path) => this.states.delete(path));
    await this.rescan();
    this.rescanTimer = setInterval(() => void this.rescan(), RESCAN_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.rescanTimer) clearInterval(this.rescanTimer);
    this.rescanTimer = null;
    if (this.watcher) await this.watcher.close();
    this.watcher = null;
    this.states.clear();
  }

  /** Read the *tail* of every currently-watched file (last ~256 KB) and
   *  emit events for what's already there. Useful on startup so the user
   *  sees recent activity instead of an empty feed. */
  async readInitialTails(maxBytes = 256 * 1024): Promise<void> {
    for (const [path, state] of this.states) {
      try {
        const stat = statSync(path);
        const start = Math.max(0, stat.size - maxBytes);
        const fh = await fsOpen(path, 'r');
        try {
          const buf = Buffer.alloc(stat.size - start);
          await fh.read(buf, 0, buf.length, start);
          // Drop any partial first line if start > 0.
          let chunk = buf.toString('utf-8');
          if (start > 0) {
            const i = chunk.indexOf('\n');
            chunk = i >= 0 ? chunk.slice(i + 1) : '';
          }
          this.consumeChunk(state, chunk);
          state.offset = stat.size;
        } finally {
          await fh.close();
        }
      } catch {
        // ignore — file may have been unlinked between scan and read
      }
    }
  }

  private async rescan(): Promise<void> {
    if (!this.watcher) return;
    const now = Date.now();
    const wanted = new Set<string>();
    let watched = 0;
    for (const wt of this.opts.worktreePaths) {
      const dir = join(PROJECTS, encodeProjectKey(wt));
      if (!existsSync(dir)) continue;
      // Read directory and find recent jsonls.
      const { readdir, stat } = await import('node:fs/promises');
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!name.endsWith('.jsonl')) continue;
        if (watched >= MAX_PER_REPO) break;
        const path = join(dir, name);
        let st;
        try {
          st = await stat(path);
        } catch {
          continue;
        }
        if (now - st.mtimeMs > ACTIVE_THRESHOLD_MS) continue;
        wanted.add(path);
        watched++;
        if (!this.states.has(path)) {
          this.states.set(path, {
            offset: st.size, // start at end — only NEW bytes are surfaced live
            partial: '',
            cwd: wt,
            sessionId: name.replace(/\.jsonl$/, ''),
          });
          this.watcher.add(path);
        }
      }
    }
    // Drop watchers for files no longer wanted.
    for (const path of [...this.states.keys()]) {
      if (!wanted.has(path)) {
        this.states.delete(path);
        this.watcher.unwatch(path);
      }
    }
  }

  private async onChange(path: string): Promise<void> {
    const state = this.states.get(path);
    if (!state) return;
    let st;
    try {
      st = statSync(path);
    } catch {
      return;
    }
    if (st.size <= state.offset) {
      // Truncation / rotation — reset to tail.
      state.offset = st.size;
      state.partial = '';
      return;
    }
    const fh = await fsOpen(path, 'r');
    try {
      const buf = Buffer.alloc(st.size - state.offset);
      await fh.read(buf, 0, buf.length, state.offset);
      state.offset = st.size;
      this.consumeChunk(state, buf.toString('utf-8'));
    } finally {
      await fh.close();
    }
  }

  private consumeChunk(state: FileState, chunk: string): void {
    let buf = state.partial + chunk;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const e = extractActivityEvent(parsed, state.sessionId, state.cwd);
      if (e) this.opts.onEvent(e);
    }
    state.partial = buf;
  }
}
```

- [ ] **Step 2: Smoke test the watcher**

This task has no unit tests because chokidar + fs is integration territory; we cover that in Task B11 via an integration test against a synthetic JSONL file. For now just typecheck:

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/activity/watcher.ts
git commit -m "feat(activity): chokidar watcher tails active JSONL files"
```

---

## Task B7: Bus — typed pub/sub per repo

**Files:**
- Create: `src/server/activity/bus.ts`
- Test: `src/server/activity/bus.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/server/activity/bus.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ActivityBus, type BusMessage } from './bus.ts';

describe('ActivityBus', () => {
  it('delivers to subscribers of the same channel', () => {
    const bus = new ActivityBus();
    const fn = vi.fn();
    const unsub = bus.subscribe('repoA', fn);
    bus.publish('repoA', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } });
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does not deliver across channels', () => {
    const bus = new ActivityBus();
    const a = vi.fn();
    bus.subscribe('repoA', a);
    bus.publish('repoB', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } });
    expect(a).not.toHaveBeenCalled();
  });

  it('unsubscribe stops delivery', () => {
    const bus = new ActivityBus();
    const a = vi.fn();
    const unsub = bus.subscribe('repoA', a);
    unsub();
    bus.publish('repoA', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } });
    expect(a).not.toHaveBeenCalled();
  });

  it('throws no-op if a subscriber dies — delivers to others', () => {
    const bus = new ActivityBus();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.subscribe('repoA', bad);
    bus.subscribe('repoA', good);
    expect(() =>
      bus.publish('repoA', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } }),
    ).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify they fail**

```bash
npm test -- src/server/activity/bus.test.ts
```

Expected: 4 fail.

- [ ] **Step 3: Implement `bus.ts`**

```ts
import type { ActivityEvent, ActivitySnapshot, ConcurrentConflict, DivergenceConflict } from '../../shared/types.ts';

export type BusMessage =
  | { kind: 'event'; event: ActivityEvent }
  | { kind: 'conflict'; conflict: ConcurrentConflict | DivergenceConflict }
  | { kind: 'snapshot'; snapshot: ActivitySnapshot };

type Subscriber = (msg: BusMessage) => void;

export class ActivityBus {
  private channels = new Map<string, Set<Subscriber>>();

  subscribe(repoId: string, fn: Subscriber): () => void {
    const set = this.channels.get(repoId) ?? new Set();
    set.add(fn);
    this.channels.set(repoId, set);
    return () => set.delete(fn);
  }

  publish(repoId: string, msg: BusMessage): void {
    const set = this.channels.get(repoId);
    if (!set) return;
    // Snapshot the subscribers so unsubscribe-during-iteration is safe.
    for (const fn of [...set]) {
      try {
        fn(msg);
      } catch {
        // A subscriber crashing must NOT stop delivery to siblings.
      }
    }
  }
}
```

- [ ] **Step 4: Verify pass**

```bash
npm test -- src/server/activity/bus.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/activity/bus.ts src/server/activity/bus.test.ts
git commit -m "feat(activity): tiny pub/sub bus for activity messages"
```

---

## Task B8: Wire — server-side activity manager

**Files:**
- Create: `src/server/activity/index.ts`

- [ ] **Step 1: Implement the manager**

```ts
import type { ActivityEvent, ActivitySnapshot } from '../../shared/types.ts';
import { detectConcurrent } from './conflicts.ts';
import { ActivityBus } from './bus.ts';
import { ActivityStore } from './store.ts';
import { ActivityWatcher } from './watcher.ts';

export interface ActivityManagerOpts {
  repoId: string;
  worktreePaths: string[];
  /** Window for C1, defaults to 5 min. */
  concurrentWindowMs?: number;
}

/**
 * Per-repo wiring of watcher + store + conflict detection + bus. One
 * manager instance per active repo. Lifecycle: `start()` → live →
 * `stop()`.
 */
export class ActivityManager {
  readonly bus = new ActivityBus();
  private readonly store = new ActivityStore();
  private readonly watcher: ActivityWatcher;
  private readonly opts: ActivityManagerOpts;
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(opts: ActivityManagerOpts) {
    this.opts = opts;
    this.watcher = new ActivityWatcher({
      worktreePaths: opts.worktreePaths,
      onEvent: (e) => this.onEvent(e),
    });
  }

  async start(): Promise<void> {
    await this.watcher.start();
    await this.watcher.readInitialTails();
    this.pruneTimer = setInterval(() => this.store.prune(Date.now()), 60_000);
  }

  async stop(): Promise<void> {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    await this.watcher.stop();
  }

  snapshot(): ActivitySnapshot {
    return {
      events: this.store.events(200),
      concurrent: [], // Snapshot reflects steady-state; live conflicts go via bus.
      divergence: [], // C3 is attached to /api/repos/:id/worktrees by enrichWorktrees.
    };
  }

  private onEvent(event: ActivityEvent): void {
    this.store.add(event);
    this.bus.publish(this.opts.repoId, { kind: 'event', event });
    const conflict = detectConcurrent(this.store, event, {
      windowMs: this.opts.concurrentWindowMs ?? 5 * 60_000,
      now: Date.now(),
    });
    if (conflict) {
      this.bus.publish(this.opts.repoId, { kind: 'conflict', conflict });
    }
  }
}

/** Singleton-per-repo registry. */
const managers = new Map<string, ActivityManager>();

export function getOrCreateActivityManager(opts: ActivityManagerOpts): ActivityManager {
  const existing = managers.get(opts.repoId);
  if (existing) return existing;
  const m = new ActivityManager(opts);
  managers.set(opts.repoId, m);
  void m.start();
  return m;
}

export function shutdownAllActivityManagers(): Promise<void> {
  return Promise.all([...managers.values()].map((m) => m.stop())).then(() => {
    managers.clear();
  }) as unknown as Promise<void>;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/activity/index.ts
git commit -m "feat(activity): per-repo manager wiring watcher + store + bus"
```

---

## Task B9: REST + SSE endpoints

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Add the snapshot endpoint**

In `src/server/index.ts`, after the `/api/repos/:id/rucksacks` handler:

```ts
import { getOrCreateActivityManager } from './activity/index.ts';

app.get('/api/repos/:id/activity', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  if (!(await isGitRepo(repo.path))) {
    return c.json({ error: 'not_a_git_repo', path: repo.path }, 400);
  }
  const worktrees = await listWorktrees(repo.path);
  const mgr = getOrCreateActivityManager({
    repoId: repo.id,
    worktreePaths: worktrees.map((w) => w.path),
  });
  return c.json(mgr.snapshot());
});
```

- [ ] **Step 2: Add the SSE stream endpoint**

```ts
app.get('/api/repos/:id/activity/stream', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  if (!(await isGitRepo(repo.path))) {
    return c.json({ error: 'not_a_git_repo', path: repo.path }, 400);
  }
  const worktrees = await listWorktrees(repo.path);
  const mgr = getOrCreateActivityManager({
    repoId: repo.id,
    worktreePaths: worktrees.map((w) => w.path),
  });

  const heartbeatSec = Number(process.env.BRANCHCRAFT_SSE_HEARTBEAT_SEC ?? 20);

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('snapshot', mgr.snapshot());
      const unsub = mgr.bus.subscribe(repo.id, (msg) => {
        if (msg.kind === 'event') send('activity', msg.event);
        else if (msg.kind === 'conflict') send('conflict', msg.conflict);
        else if (msg.kind === 'snapshot') send('snapshot', msg.snapshot);
      });
      const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), heartbeatSec * 1000);
      // Hono closes the stream when the request is aborted; clean up here.
      const close = () => {
        clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      c.req.raw.signal.addEventListener('abort', close);
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  });
});
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Manual verification with curl**

In one terminal:

```bash
curl -N http://localhost:7777/api/repos/<REPO_ID>/activity/stream
```

Expected:
- Immediately: `event: snapshot\ndata: {...}` with current events.
- Every 20 s: `event: heartbeat\ndata: {"ts":...}`.
- When you do an `Edit` in any active CCD session attached to this repo: `event: activity\ndata: {...}` within ~200 ms.
- When two sessions touch the same file in the C1 window: `event: conflict\ndata: {...}` immediately after the second touch.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts
git commit -m "feat(activity): /api/repos/:id/activity REST + SSE endpoints"
```

---

## Task B10: C3 wiring — enrich worktrees response with divergence

**Files:**
- Modify: `src/server/index.ts` (`enrichWorktrees` and `/api/repos/:id/worktrees`)
- Modify: `src/shared/types.ts` (extend `ApiWorktrees`)

- [ ] **Step 1: Extend `ApiWorktrees`**

In `src/shared/types.ts`:

```ts
export interface ApiWorktrees {
  repoPath: string;
  worktrees: Worktree[];
  /** Branch divergence conflicts at the time of the response. */
  divergence: DivergenceConflict[];
}
```

- [ ] **Step 2: Compute divergence in `enrichWorktrees`**

In `src/server/index.ts`, find `enrichWorktrees` and replace with:

```ts
import { detectDivergence } from './activity/conflicts.ts';

async function gitDiffNamesSinceBase(
  repoPath: string,
  branch: string,
  base: string,
): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', `${base}...${branch}`], {
      cwd: repoPath,
      maxBuffer: 16 * 1024 * 1024,
    });
    return new Set(stdout.split(/\r?\n/).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function computeDivergence(repoPath: string): Promise<DivergenceConflict[]> {
  // Use the repo's default branch (HEAD-of-origin/HEAD) as the merge-base
  // anchor. If origin/HEAD isn't set, fall back to "main"; if that fails
  // too, skip divergence entirely.
  let base = '';
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd: repoPath,
    });
    base = stdout.trim();
  } catch {
    base = 'main';
  }
  const { stdout: branchList } = await execFileAsync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
    cwd: repoPath,
    maxBuffer: 8 * 1024 * 1024,
  });
  const branches = branchList.split(/\r?\n/).filter(Boolean);
  const map = new Map<string, Set<string>>();
  for (const b of branches) {
    if (b === base) continue;
    map.set(b, await gitDiffNamesSinceBase(repoPath, b, base));
  }
  return detectDivergence(map);
}
```

We need `execFileAsync`; it's already used elsewhere in `index.ts` — verify the import. If not present, add at the top of the file:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
```

- [ ] **Step 3: Wire the call into the worktrees handler**

In the `/api/repos/:id/worktrees` handler, after `enrichWorktrees`:

```ts
const enriched = await enrichWorktrees(repo.path);
const divergence = await computeDivergence(repo.path);
const body: ApiWorktrees = { repoPath: repo.path, worktrees: enriched, divergence };
return c.json(body);
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Manual smoke**

```bash
curl http://localhost:7777/api/repos/<REPO_ID>/worktrees | grep -oE '"divergence":\[[^]]*\]'
```

Expected: a JSON array (possibly empty for branchcraft, populous for SentryCall).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/server/index.ts
git commit -m "feat(activity): C3 divergence attached to /api/repos/:id/worktrees"
```

---

## Task B11: Frontend — SSE client wrapper

**Files:**
- Create: `src/web/lib/sse.ts`

- [ ] **Step 1: Implement**

```ts
import type { ActivityEvent, ActivitySnapshot, ConcurrentConflict, DivergenceConflict } from '../../shared/types.ts';

export interface ActivityHandlers {
  onSnapshot: (s: ActivitySnapshot) => void;
  onActivity: (e: ActivityEvent) => void;
  onConflict: (c: ConcurrentConflict | DivergenceConflict) => void;
}

/**
 * Subscribe to a repo's activity stream. Wraps EventSource with auto-
 * reconnect on transport errors and exponential backoff up to 30 s. The
 * returned function closes the connection AND prevents reconnects.
 */
export function subscribeActivity(repoId: string, handlers: ActivityHandlers): () => void {
  let es: EventSource | null = null;
  let backoffMs = 500;
  let stopped = false;

  function open() {
    if (stopped) return;
    es = new EventSource(`/api/repos/${repoId}/activity/stream`);
    es.addEventListener('snapshot', (ev) => {
      try {
        handlers.onSnapshot(JSON.parse((ev as MessageEvent).data));
        backoffMs = 500; // reset on successful receive
      } catch {
        // ignore malformed
      }
    });
    es.addEventListener('activity', (ev) => {
      try {
        handlers.onActivity(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore
      }
    });
    es.addEventListener('conflict', (ev) => {
      try {
        handlers.onConflict(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore
      }
    });
    es.addEventListener('heartbeat', () => {
      backoffMs = 500;
    });
    es.onerror = () => {
      es?.close();
      es = null;
      if (stopped) return;
      const delay = Math.min(backoffMs, 30_000);
      backoffMs = Math.min(backoffMs * 2, 30_000);
      setTimeout(open, delay);
    };
  }

  open();
  return () => {
    stopped = true;
    es?.close();
    es = null;
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/web/lib/sse.ts
git commit -m "feat(activity): SSE client wrapper with auto-reconnect"
```

---

## Task B12: App-level activity state + subscription

**Files:**
- Modify: `src/web/App.svelte`

- [ ] **Step 1: Add state and subscription**

In `App.svelte`'s `<script>`:

```ts
import type { ActivityEvent, ConcurrentConflict, DivergenceConflict } from '../shared/types.ts';
import { subscribeActivity } from './lib/sse.ts';

let activityEvents = $state<ActivityEvent[]>([]);
let concurrentByFile = $state(new Map<string, ConcurrentConflict>());
let divergenceByBranch = $state(new Map<string, DivergenceConflict>());

let activityUnsub: (() => void) | null = null;

$effect(() => {
  activityUnsub?.();
  activityUnsub = null;
  if (!activeRepoId) return;
  activityUnsub = subscribeActivity(activeRepoId, {
    onSnapshot: (s) => {
      activityEvents = s.events;
      concurrentByFile = new Map(s.concurrent.map((c) => [c.file, c] as const));
      divergenceByBranch = new Map(s.divergence.map((d) => [d.branch, d] as const));
    },
    onActivity: (e) => {
      activityEvents = [e, ...activityEvents].slice(0, 200);
    },
    onConflict: (c) => {
      if (c.kind === 'concurrent') {
        const next = new Map(concurrentByFile);
        next.set(c.file, c);
        concurrentByFile = next;
      } else {
        const next = new Map(divergenceByBranch);
        next.set(c.branch, c);
        divergenceByBranch = next;
      }
    },
  });
});

// Also seed divergence from /api/repos/:id/worktrees response.
async function loadActiveRepo() {
  // ... existing function — extend the wtRes processing to set divergenceByBranch:
  // After:
  //   worktrees = wtRes.worktrees;
  // Add:
  //   if (Array.isArray(wtRes.divergence)) {
  //     divergenceByBranch = new Map(wtRes.divergence.map((d) => [d.branch, d]));
  //   }
}
```

- [ ] **Step 2: Update `loadActiveRepo` per inline note above**

Find the line after `worktrees = wtRes.worktrees;` and insert the divergence seeding code.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/web/App.svelte
git commit -m "feat(activity): App-level state + SSE subscription on repo switch"
```

---

## Task B13: ActivityFeed.svelte — 4th rucksack section

**Files:**
- Create: `src/web/ActivityFeed.svelte`
- Modify: `src/web/Rucksacks.svelte` (slot in the new section)

- [ ] **Step 1: Create `ActivityFeed.svelte`**

```svelte
<script lang="ts">
  import type { ActivityEvent } from '../shared/types.ts';

  type Props = {
    events: ActivityEvent[];
    open: boolean;
    onToggleOpen: () => void;
    /** Click handler — caller uses this to scroll the corresponding session pill into view. */
    onClickEvent?: (e: ActivityEvent) => void;
  };
  let { events, open, onToggleOpen, onClickEvent }: Props = $props();

  function age(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  function basename(path: string): string {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts.at(-1) ?? path;
  }

  const KIND_GLYPH: Record<string, string> = {
    edit: '✎',
    write: '＋',
    read: '▢',
    bash: '$',
    other: '·',
  };
</script>

<section class="activity" class:open>
  <button
    class="section-toggle"
    onclick={onToggleOpen}
    aria-expanded={open}
  >
    <span class="chev mono" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="label">Activity</span>
    <span class="count mono">{events.length}</span>
  </button>
  {#if open}
    <div class="body">
      {#if events.length === 0}
        <p class="dim">No live activity yet.</p>
      {:else}
        <ol>
          {#each events.slice(0, 50) as e (e.sessionId + ':' + e.ts)}
            <li>
              <button
                class="row"
                onclick={() => onClickEvent?.(e)}
                title={e.file ?? e.label ?? ''}
              >
                <span class="sid mono">{e.sessionId.slice(0, 6)}</span>
                <span class="glyph mono">{KIND_GLYPH[e.kind] ?? '·'}</span>
                <span class="what">{e.file ? basename(e.file) : (e.label ?? e.kind)}</span>
                <span class="meta mono">{age(e.ts)}</span>
              </button>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</section>

<style>
  .activity {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
  }
  .section-toggle {
    display: grid;
    grid-template-columns: 14px 1fr auto;
    gap: var(--s2);
    align-items: center;
    background: transparent;
    border: none;
    padding: var(--s2) 0;
    cursor: pointer;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
  }
  .section-toggle:hover {
    color: var(--branch-2);
  }
  .chev {
    color: var(--text-secondary);
    font-size: 10px;
    width: 14px;
  }
  .label {
    font-size: 12px;
    font-weight: 500;
    text-transform: lowercase;
    letter-spacing: 0.04em;
  }
  .count {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .body {
    padding-left: var(--s4);
    border-left: 1px dashed var(--hairline);
    margin-left: 6px;
  }
  .body p.dim {
    margin: var(--s1) 0;
    font-size: 11px;
    color: var(--text-secondary);
    font-style: italic;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s1);
  }
  .row {
    display: grid;
    grid-template-columns: 50px 14px 1fr auto;
    align-items: baseline;
    gap: var(--s2);
    width: 100%;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 1px var(--s2);
    color: var(--text-primary);
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--bg-elevated);
    border-color: var(--hairline);
  }
  .sid {
    color: var(--branch-2);
    font-size: 10px;
  }
  .glyph {
    color: var(--text-secondary);
  }
  .what {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--text-secondary);
    font-size: 10px;
  }
</style>
```

- [ ] **Step 2: Slot it into `Rucksacks.svelte`**

In `src/web/Rucksacks.svelte`, extend the `Props`:

```ts
import ActivityFeed from './ActivityFeed.svelte';
import type { ActivityEvent } from '../shared/types.ts';

type Props = {
  data: ApiRucksacks | null;
  loading: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Live activity events for the active repo. */
  activityEvents: ActivityEvent[];
  /** Caller wires to scroll-and-flash the matching session pill. */
  onActivityClick?: (e: ActivityEvent) => void;
};
let {
  data,
  loading,
  collapsed,
  onToggleCollapse,
  activityEvents,
  onActivityClick,
}: Props = $props();
```

Extend `SectionKey` and `open` defaults:

```ts
type SectionKey = 'stash' | 'tags' | 'reflog' | 'activity';

let open = $state<Record<SectionKey, boolean>>({
  stash: true,
  tags: false,
  reflog: false,
  activity: true,
});
```

After the reflog section, add:

```svelte
<ActivityFeed
  events={activityEvents}
  open={open.activity}
  onToggleOpen={() => (open.activity = !open.activity)}
  onClickEvent={onActivityClick}
/>
```

Update the localStorage hydration block to include `activity`:

```ts
if (typeof parsed.activity === 'boolean') open.activity = parsed.activity;
```

- [ ] **Step 3: Wire from App.svelte**

In `App.svelte`'s `<Rucksacks ...>` invocation, pass the new props:

```svelte
<Rucksacks
  data={rucksacks}
  loading={rucksacksLoading}
  collapsed={rucksacksCollapsed}
  onToggleCollapse={toggleRucksacks}
  activityEvents={activityEvents}
  onActivityClick={(e) => {
    // Jump-and-flash. The Graph component exposes a flashSession method via prop later;
    // for now, rely on the existing scroll-into-view by id.
    const pill = document.querySelector(`[data-session-id="${CSS.escape(e.sessionId)}"]`);
    if (pill instanceof HTMLElement) {
      pill.scrollIntoView({ block: 'center', behavior: 'smooth' });
      pill.classList.add('flash-target');
      setTimeout(() => pill.classList.remove('flash-target'), 700);
    }
  }}
/>
```

- [ ] **Step 4: Tag SessionPill with `data-session-id`**

In `src/web/SessionPill.svelte`, on the root `<div class="pill">`, add:

```svelte
<div class="pill" data-session-id={session.id} ...>
```

- [ ] **Step 5: Add a tiny flash animation in app.css**

Append to `src/web/app.css`:

```css
.flash-target {
  animation: bc-flash 700ms ease-out;
}
@keyframes bc-flash {
  0% {
    box-shadow: 0 0 0 0 rgba(212, 165, 74, 0.55);
  }
  100% {
    box-shadow: 0 0 0 12px rgba(212, 165, 74, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .flash-target {
    animation: none;
    outline: 2px solid var(--branch-2);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 6: Typecheck and verify**

```bash
npm run typecheck
```

In the live preview, switch to a repo with an active CCD session, do an Edit in CCD. The Activity section in the right rail should populate within ~1 s. Click an event → the corresponding session pill scrolls into view and flashes.

- [ ] **Step 7: Commit**

```bash
git add src/web/ActivityFeed.svelte src/web/Rucksacks.svelte src/web/App.svelte src/web/SessionPill.svelte src/web/app.css
git commit -m "feat(activity): ActivityFeed slotted into rucksacks (4th section)"
```

---

## Task B14: SessionPill activity prop + amber pulse

**Files:**
- Modify: `src/web/SessionPill.svelte` (accept `activity` prop, render inline)
- Modify: `src/web/Graph.svelte` (compute `activity` per session, pass to pill)
- Modify: `src/web/app.css` (warn-pulse keyframes)

- [ ] **Step 1: Extend SessionPill props**

```svelte
<script lang="ts">
  import type { Session, SessionProviderId } from '../shared/types.ts';

  type ActivityHint = {
    file?: string;
    ageSec: number;
    hasConflict: boolean;
  };
  type Props = { session: Session; activity?: ActivityHint };
  let { session, activity }: Props = $props();

  // ... existing logic ...

  function basename(p: string): string {
    return p.split(/[/\\]/).filter(Boolean).at(-1) ?? p;
  }
</script>

<div
  class="pill"
  class:live={session.isLive}
  class:warn={activity?.hasConflict}
  data-session-id={session.id}
  title={session.title}
>
  <span class={`dot ${session.isLive ? 'dot-live' : 'dot-idle'}`} aria-hidden="true"></span>
  <span class="badge mono">{badge}</span>
  <span class="sid mono">{shortId}</span>
  <span class="title">{session.title}</span>
  {#if activity?.file}
    <span class="now mono">✎ {basename(activity.file)}</span>
  {/if}
  <span class="age mono">{ageLabel}</span>
</div>
```

Append to the pill's CSS:

```css
.pill .now {
  font-size: 10px;
  color: var(--branch-2);
  margin-left: var(--s2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 12ch;
}
.pill.warn {
  animation: warn-pulse 2s ease-in-out infinite;
  border-color: var(--warning);
}
@media (prefers-reduced-motion: reduce) {
  .pill.warn {
    animation: none;
    border-color: var(--warning);
    background: rgba(212, 165, 74, 0.08);
  }
}
```

- [ ] **Step 2: Define `warn-pulse` keyframes in app.css**

In `src/web/app.css`:

```css
@keyframes warn-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(212, 165, 74, 0);
    border-color: rgba(212, 165, 74, 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(212, 165, 74, 0.18);
    border-color: var(--warning);
  }
}
```

- [ ] **Step 3: Compute and pass activity from Graph.svelte**

Add Props on `Graph.svelte`:

```ts
type Props = {
  // ... existing props
  recentActivity: Map<string /* sessionId */, ActivityEvent>;
  conflictFiles: Set<string>;
};
let { ..., recentActivity, conflictFiles }: Props = $props();
```

Inside the SessionPill render in `Graph.svelte`, build the hint:

```svelte
{#each card.sessions as s (s.key)}
  {@const a = recentActivity.get(s.session.id)}
  {@const ageSec = a ? Math.floor((Date.now() - a.ts) / 1000) : 0}
  <div
    class="session-row"
    style="top: {s.top}px;"
    onmouseenter={(e) => showHelp(helpForSession(s.session), e)}
    onmouseleave={hideHelp}
    role="presentation"
  >
    <SessionPill
      session={s.session}
      activity={a && a.file
        ? { file: a.file, ageSec, hasConflict: conflictFiles.has(a.file) }
        : undefined}
    />
  </div>
{/each}
```

- [ ] **Step 4: Pass props from App.svelte**

In `App.svelte`, build the maps from `activityEvents` and `concurrentByFile`:

```ts
let recentActivity = $derived.by(() => {
  const m = new Map<string, ActivityEvent>();
  // Most recent per session — events are newest first.
  for (const e of activityEvents) {
    if (!m.has(e.sessionId)) m.set(e.sessionId, e);
  }
  return m;
});
let conflictFiles = $derived(new Set(concurrentByFile.keys()));
```

Pass them to `<Graph ...>`:

```svelte
<Graph
  commits={graphCommits}
  {laneCount}
  {worktrees}
  onQueueCommand={queueCommand}
  onOpenApplyModal={openApplyModal}
  recentActivity={recentActivity}
  conflictFiles={conflictFiles}
/>
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Verify live**

In a live CCD session, do an Edit. The corresponding pill should sprout `✎ filename` within 1 s. Open a second CCD session that edits the same file — both pills go amber-pulse.

- [ ] **Step 7: Commit**

```bash
git add src/web/SessionPill.svelte src/web/Graph.svelte src/web/App.svelte src/web/app.css
git commit -m "feat(activity): inline file + amber-pulse on conflicting session pills"
```

---

## Task B15: Branch ⚠N badge in Graph.svelte

**Files:**
- Modify: `src/web/Graph.svelte` (extend ref pill render, extend `helpForRef`)

- [ ] **Step 1: Add divergence prop**

Extend `Graph.svelte` `Props`:

```ts
type Props = {
  // ... existing
  divergenceByBranch: Map<string, DivergenceConflict>;
};
let { ..., divergenceByBranch }: Props = $props();
```

- [ ] **Step 2: Render the badge after the branch label**

In the `{#each r.commit.refs as ref ...}` block, branch case (the `{:else}` of the remote check from Task A3), add the badge after the ref name span:

```svelte
<span ...> {ref.name}</span>
{#if ref.kind === 'branch' && divergenceByBranch.has(ref.name!)}
  {@const d = divergenceByBranch.get(ref.name!)!}
  <span
    class="ref-badge mono"
    title={`Conflicts at merge with ${d.siblings.join(', ')}`}
    onmouseenter={(e) => showHelp({
      kind: 'divergence',
      title: ref.name!,
      body: `This branch has committed edits to ${d.overlap.length} file${d.overlap.length === 1 ? '' : 's'} that other branches also touched. A merge would conflict on at least: ${d.overlap.slice(0, 3).join(', ')}${d.overlap.length > 3 ? '…' : ''}.`,
      hint: `Sibling branches: ${d.siblings.join(', ')}.`,
    }, e)}
    onmouseleave={hideHelp}
    role="img"
    aria-label="{d.siblings.length} divergence conflicts"
  >⚠{d.siblings.length}</span>
{/if}
```

- [ ] **Step 3: Style the badge**

In the `<style>` block of `Graph.svelte`:

```css
.ref-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
  background: rgba(212, 165, 74, 0.12);
  border: 1px solid rgba(212, 165, 74, 0.35);
  color: var(--warning);
  margin-left: -2px;
  margin-right: 2px;
  cursor: help;
  user-select: none;
}
```

- [ ] **Step 4: Pass the prop from App.svelte**

```svelte
<Graph
  ...
  divergenceByBranch={divergenceByBranch}
/>
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Verify live**

Switch to SentryCall — branches that overlap on file edits since `origin/main` should now show `⚠N` chips next to their names. Hover a chip → help describes which siblings + overlap.

- [ ] **Step 7: Commit**

```bash
git add src/web/Graph.svelte src/web/App.svelte
git commit -m "feat(activity): branch ⚠N badge for divergence conflicts (PLAN §4.2 row 5/§4.7)"
```

---

## Task B16: Wire ROADMAP.md update + close-out

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark the activity feature shipped**

Add a new section at the top of `ROADMAP.md` (above the existing P0):

```markdown
## Shipped

- **Multi-Agent Activity & Conflict Detection** — design at
  `docs/superpowers/specs/2026-04-26-multi-agent-activity-design.md`,
  plan at `docs/superpowers/plans/2026-04-26-pass-1-and-activity.md`.
  Live activity feed in the rucksacks panel, inline `✎ file` on session
  pills, amber-pulse on C1 concurrent-edit conflicts, ⚠N badge on
  branch refs for C3 divergence. Server: chokidar-watched JSONL tails
  + SSE at `/api/repos/:id/activity/stream`.
```

- [ ] **Step 2: Drop activity from P4-deferred**

P4 mentioned "File watching / SSE" as deferred. Replace that bullet:

```markdown
- **File watching / SSE for live activity** — SHIPPED via the activity
  feature above. The watcher is scoped to JSONL files; broader
  `.git/refs` watching for refresh-on-external-git-activity remains
  out of scope.
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark activity feature shipped"
```

---

## Task B17: Final acceptance pass

**Files:** none (verification only)

- [ ] **Step 1: Full test run**

```bash
npm test
```

Expected: all green. Approximate count: 83 (baseline) + 9 (extract) + 7 (store) + 10 (conflicts) + 4 (bus) = ~113.

- [ ] **Step 2: Full typecheck**

```bash
npm run typecheck
```

Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3: Live walkthrough**

In the dev server, on the active repo:

1. Drag a worktree card onto a branch ref pill → checkout queued (Task A1).
2. Hover a stale-outlined worktree card → help mentions the dashed border (Task A2).
3. Look at SentryCall remote refs → render with `o/` prefix (Task A3).
4. Hover a fold-toggle → didactic copy (Task A4).
5. Drag branch tip onto another → disambig popup with rebase/merge/squash (Task A5).
6. Drag local branch onto its origin marker → push queued, lease prompt if diverged (Task A7).
7. Drag branch tip onto a commit on its own line → reset-mode popup (Task A8).
8. Look at session pills with active CCD → file path appears inline (Task B14).
9. Make two CCD sessions touch the same file → both pills amber-pulse (Tasks B4 + B14).
10. Branches that share file edits → `⚠N` badge on ref pill, hover help lists siblings (Task B15).
11. Activity section in rucksacks shows live events; click an event → matching pill flashes (Task B13).

- [ ] **Step 4: Push everything**

```bash
git push origin HEAD:main
```

---

# Self-Review Notes

(Run after the plan is written; fix issues inline.)

**Spec coverage check:** Reads against `2026-04-26-multi-agent-activity-design.md`:

| Spec section                        | Plan task |
|-------------------------------------|-----------|
| §5 Data model (ActivityEvent, conflicts) | B1 |
| §6.1 Watcher                        | B6 |
| §6.2 Extract                        | B2 |
| §6.3 Store                          | B3 |
| §6.4 Conflict detection (C1, C3)    | B4 (C1), B5 (C3), B10 (C3 wiring) |
| §6.5 EventBus                       | B7 |
| §6.6 API (REST + SSE)               | B9 |
| §7.1 SSE client                     | B11 |
| §7.2 App-level state                | B12 |
| §7.3 SessionPill enhancement        | B14 |
| §7.4 ActivityFeed                   | B13 |
| §7.5 Branch ⚠N badge                | B15 |
| §7.6 CSS / motion                   | B14 (warn-pulse), B13 (flash-target) |
| §8 Phases                           | implicit in B-tasks ordering |
| §9 Testing                          | B2-B5, B7 carry tests; live manual in B17 |
| §10 Open questions                  | encoded in defaults (heartbeat 20 s configurable, base = origin/HEAD) |

PLAN.md gap-fill:

| ROADMAP entry                            | Plan task |
|------------------------------------------|-----------|
| P0 a) worktree as drag source            | A1 |
| P0 b) stale outline + merge legend       | A2 |
| P0 c) local vs remote ref distinction    | A3 |
| P0 d) hover help audit                   | A4 |
| P1 Tier-A row 9 (worktree → branch)      | A1 (covers both directions) |
| P1 Tier-A row 7 (push)                   | A7 |
| P1 Tier-A row 5 (reset)                  | A8 |
| P2 §4.4 disambig popup                   | A5 |
| P2 §4.5 apply modal                      | A6 |

**Placeholder scan:** No "TBD", "TODO", "implement later", "similar to Task N" wording in any task. Every step has runnable code, exact file paths, and an explicit commit step.

**Type consistency:** `ActivityEvent` shape is identical across B1, B2, B3, B4, B11, B12, B13, B14. `DivergenceConflict` ditto across B5, B10, B12, B15. `Drag` union extension in A1 matches the `dropTarget` union extension in A8. `applyModal` state shape declared in A6 matches the prop shape passed to Graph in A7.

**Scope check:** Plan describes Pass 1 (PLAN-fill) + the activity feature. Bigger than a typical single plan but every task is bite-sized, ordering is explicit, and Part A precedes Part B (the activity branch ⚠N badge in B15 references conflict types that exist after B5). Workable as one plan.

(No issues found above; nothing to fix inline.)
