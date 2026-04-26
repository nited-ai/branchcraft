<script lang="ts">
  import type { Command, LaidOutCommit, Session, Worktree } from '../shared/types.ts';
  import WorktreeCard from './WorktreeCard.svelte';
  import SessionPill from './SessionPill.svelte';

  type Props = {
    commits: LaidOutCommit[];
    laneCount: number;
    worktrees: Worktree[];
    onQueueCommand?: (cmd: Command) => void;
  };

  let { commits, laneCount, worktrees, onQueueCommand }: Props = $props();

  // ── Drag state ────────────────────────────────────────────────────────────
  // Two interactive sources: commit dots (drag → cherry-pick onto a ref) and
  // branch-ref pills (drag → merge into another ref). Drop targets are also
  // ref pills. Native HTML5 drag is awkward inside SVG, so we use plain
  // pointer events and resolve the drop target via elementsFromPoint.
  type Drag =
    | { kind: 'commit'; sha: string; subject: string }
    | { kind: 'ref'; name: string }
    | null;
  let drag = $state<Drag>(null);
  let dragCursor = $state({ x: 0, y: 0 });
  let dropTarget = $state<{ refName: string; commitSha?: string } | null>(null);

  const ROW_H = 36;
  const LANE_W = 22;
  const PAD = 20;
  const COMMIT_R = 4;
  const HEAD_R = 6;
  const CARD_H = 30;
  const HINT_H = 18;
  const PILL_H = 24;
  const SESSION_FOLD_H = 22;
  const CARD_GAP = 4;
  /** Collapsed-run row height — short, since it's a placeholder. */
  const COLLAPSED_H = 22;
  /** Min consecutive plain commits before we fold them. */
  const COLLAPSE_THRESHOLD = 3;
  /** Min sessions on a worktree before we fold them. */
  const SESSION_FOLD_THRESHOLD = 3;

  const laneX = (lane: number): number => PAD + lane * LANE_W + LANE_W / 2;

  let worktreesByCommit = $derived.by(() => {
    const map = new Map<string, Worktree[]>();
    for (const wt of worktrees) {
      const arr = map.get(wt.head) ?? [];
      arr.push(wt);
      map.set(wt.head, arr);
    }
    return map;
  });

  // ── Collapse plain commits into folded runs ──────────────────────────────
  // A commit is "plain" if it has no decoration AND no worktree at its sha
  // AND isn't simulated. Three or more consecutive plain commits collapse
  // into a single short row showing "▸ N commits".
  let expandedRuns = $state(new Set<string>());

  // Per-worktree expansion state for the two session-pill groups.
  // `expandedSessions` controls the user-conversation list (visible above
  // some threshold). `expandedTasks` controls scheduled-task pills, which
  // are ALWAYS folded by default — they're machine fires, not chats, and
  // should never crowd out real conversations.
  let expandedSessions = $state(new Set<string>());
  let expandedTasks = $state(new Set<string>());

  function partitionSessions(sessions: Session[]): {
    conversations: Session[];
    tasks: Session[];
  } {
    const conversations: Session[] = [];
    const tasks: Session[] = [];
    for (const s of sessions) {
      if (s.source === 'scheduled-task') tasks.push(s);
      else conversations.push(s);
    }
    return { conversations, tasks };
  }

  function isPlain(c: LaidOutCommit, wts: Worktree[]): boolean {
    if (c.simulated) return false;
    if (c.refs.length > 0) return false;
    if (wts.length > 0) return false;
    return true;
  }

  type Row =
    | {
        kind: 'commit';
        commit: LaidOutCommit;
        worktrees: Worktree[];
        top: number;
        dotY: number;
        height: number;
      }
    | {
        /**
         * Fold-toggle row for a run of plain commits. Always emitted for
         * every run (independent of state) so the user can re-collapse an
         * expanded run — same affordance, just a different chevron.
         */
        kind: 'fold';
        key: string;
        commits: LaidOutCommit[];
        lane: number;
        expanded: boolean;
        top: number;
        dotY: number;
        height: number;
      };

  function worktreeBlockHeight(wt: Worktree): number {
    const { conversations, tasks } = partitionSessions(wt.sessions);
    let h = CARD_H;
    if (conversations.length === 0 && tasks.length === 0) {
      return h + HINT_H;
    }
    if (conversations.length >= SESSION_FOLD_THRESHOLD) {
      h += SESSION_FOLD_H;
      if (expandedSessions.has(wt.path)) h += conversations.length * PILL_H;
    } else {
      h += conversations.length * PILL_H;
    }
    if (tasks.length > 0) {
      h += SESSION_FOLD_H;
      if (expandedTasks.has(wt.path)) h += tasks.length * PILL_H;
    }
    return h;
  }

  function toggleSessions(path: string) {
    const next = new Set(expandedSessions);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    expandedSessions = next;
  }

  function toggleTasks(path: string) {
    const next = new Set(expandedTasks);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    expandedTasks = next;
  }

  let rows = $derived.by<Row[]>(() => {
    // First, group consecutive plain commits into runs. Runs above the
    // threshold get a single fold-toggle row PLUS — when expanded — the
    // children below. Runs under the threshold stay flat (no toggle, no
    // visual disruption for two-commit gaps).
    type Group =
      | { kind: 'commit'; commit: LaidOutCommit; worktrees: Worktree[] }
      | { kind: 'run'; key: string; commits: LaidOutCommit[]; lane: number };
    const groups: Group[] = [];
    let buf: LaidOutCommit[] = [];
    const flush = () => {
      if (buf.length === 0) return;
      if (buf.length >= COLLAPSE_THRESHOLD) {
        const key = `${buf[0]!.sha}..${buf[buf.length - 1]!.sha}`;
        groups.push({ kind: 'run', key, commits: buf, lane: buf[0]!.lane });
      } else {
        for (const c of buf) groups.push({ kind: 'commit', commit: c, worktrees: [] });
      }
      buf = [];
    };
    for (const c of commits) {
      const wts = worktreesByCommit.get(c.sha) ?? [];
      if (isPlain(c, wts)) {
        buf.push(c);
      } else {
        flush();
        groups.push({ kind: 'commit', commit: c, worktrees: wts });
      }
    }
    flush();

    const result: Row[] = [];
    let top = PAD;
    const emitCommitRow = (
      c: LaidOutCommit,
      wts: Worktree[],
    ) => {
      let extras = 0;
      if (wts.length > 0) {
        extras = CARD_GAP;
        for (const wt of wts) extras += worktreeBlockHeight(wt);
      }
      const height = ROW_H + extras;
      result.push({
        kind: 'commit',
        commit: c,
        worktrees: wts,
        top,
        dotY: top + ROW_H / 2,
        height,
      });
      top += height;
    };
    for (const g of groups) {
      if (g.kind === 'commit') {
        emitCommitRow(g.commit, g.worktrees);
      } else {
        const expanded = expandedRuns.has(g.key);
        // Always emit the fold-toggle, regardless of expanded state. That's
        // the affordance to re-collapse — without it, expanding is one-way.
        result.push({
          kind: 'fold',
          key: g.key,
          commits: g.commits,
          lane: g.lane,
          expanded,
          top,
          dotY: top + COLLAPSED_H / 2,
          height: COLLAPSED_H,
        });
        top += COLLAPSED_H;
        if (expanded) {
          for (const c of g.commits) emitCommitRow(c, []);
        }
      }
    }
    return result;
  });

  /**
   * Map every commit sha (visible OR hidden inside a collapsed run) to the
   * row that represents it. Edges crossing a collapsed run land on the
   * collapsed row's dot position rather than on a non-rendered commit.
   */
  let rowBySha = $derived.by(() => {
    // When a run is expanded, every commit has its own row AND there's a
    // fold-toggle row above it. The commit-row wins (last write) so edges
    // land on the actual commit dot, not the toggle.
    const m = new Map<string, Row>();
    for (const r of rows) {
      if (r.kind === 'fold' && !r.expanded) {
        for (const c of r.commits) m.set(c.sha, r);
      }
    }
    for (const r of rows) {
      if (r.kind === 'commit') m.set(r.commit.sha, r);
    }
    return m;
  });

  function toggleRun(key: string) {
    const next = new Set(expandedRuns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedRuns = next;
  }

  let svgWidth = $derived(PAD + Math.max(1, laneCount) * LANE_W + PAD / 2);
  let totalHeight = $derived.by(() => {
    if (rows.length === 0) return 200;
    const last = rows[rows.length - 1]!;
    return last.top + last.height + PAD;
  });

  function pathBetween(x1: number, y1: number, x2: number, y2: number): string {
    if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  }

  const laneColor = (lane: number): string => `var(--branch-${lane % 10})`;
  const isHead = (c: LaidOutCommit): boolean => c.refs.some((r) => r.kind === 'head');
  const isMerge = (c: LaidOutCommit): boolean => c.parents.length > 1;
  const shortSha = (s: string): string => s.slice(0, 7);

  type Edge = { key: string; d: string; color: string; simulated: boolean };
  let edges = $derived.by<Edge[]>(() => {
    const out: Edge[] = [];
    for (const r of rows) {
      if (r.kind !== 'commit') continue;
      const c = r.commit;
      for (let i = 0; i < c.parents.length; i++) {
        const parentSha = c.parents[i]!;
        const parentRow = rowBySha.get(parentSha);
        const parentLane = c.parentLanes[i];
        if (!parentRow || parentLane === undefined) continue;
        // If the parent fell into a collapsed run, draw the edge to that
        // run's lane (it's a homogeneous run on a single lane).
        const targetLane =
          parentRow.kind === 'fold' ? parentRow.lane : parentLane;
        const childLane = i === 0 ? c.lane : targetLane;
        const colorLane = i === 0 ? c.lane : targetLane;
        const parentSimulated =
          parentRow.kind === 'commit' && parentRow.commit.simulated === true;
        out.push({
          key: `${c.sha}->${parentSha}#${i}`,
          d: pathBetween(
            laneX(childLane),
            r.dotY,
            laneX(targetLane),
            parentRow.dotY,
          ),
          color: laneColor(colorLane),
          // Edge to / from a simulated commit gets dashed too — keeps the
          // preview branch visually consistent end-to-end.
          simulated: c.simulated === true || parentSimulated,
        });
      }
    }
    return out;
  });

  type SessionLayout = { key: string; top: number; session: Session };
  type SessionFold = {
    top: number;
    total: number;
    live: number;
    expanded: boolean;
    kind: 'conversations' | 'tasks';
  };
  type CardLayout = {
    key: string;
    worktree: Worktree;
    top: number;
    dotX: number;
    connectorTop: number;
    connectorHeight: number;
    /** User + command-source pills, when expanded or below threshold. */
    sessions: SessionLayout[];
    /** Scheduled-task pills, when expanded. */
    tasks: SessionLayout[];
    sessionFold: SessionFold | null;
    tasksFold: SessionFold | null;
    /** Top of the "no sessions" stub when both groups are empty. */
    hintTop: number | null;
  };
  let cardLayouts = $derived.by<CardLayout[]>(() => {
    const out: CardLayout[] = [];
    for (const r of rows) {
      if (r.kind !== 'commit') continue;
      const dotX = laneX(r.commit.lane);
      let cursor = r.top + ROW_H + CARD_GAP;
      for (const wt of r.worktrees) {
        const cardTop = cursor;
        const afterCard = cardTop + CARD_H;
        const { conversations, tasks } = partitionSessions(wt.sessions);

        // Y-cursor walking down inside this worktree's block. Each piece
        // (conversation fold, conversation pills, tasks fold, task pills)
        // bumps it forward in the same order they render.
        let y = afterCard;
        let sessionFold: SessionFold | null = null;
        let sessions: SessionLayout[] = [];

        if (conversations.length >= SESSION_FOLD_THRESHOLD) {
          const expanded = expandedSessions.has(wt.path);
          sessionFold = {
            top: y,
            total: conversations.length,
            live: conversations.filter((s) => s.isLive).length,
            expanded,
            kind: 'conversations',
          };
          y += SESSION_FOLD_H;
          if (expanded) {
            sessions = conversations.map((s, i) => ({
              key: `${wt.path}|${s.id}`,
              top: y + i * PILL_H,
              session: s,
            }));
            y += conversations.length * PILL_H;
          }
        } else if (conversations.length > 0) {
          sessions = conversations.map((s, i) => ({
            key: `${wt.path}|${s.id}`,
            top: y + i * PILL_H,
            session: s,
          }));
          y += conversations.length * PILL_H;
        }

        let tasksFold: SessionFold | null = null;
        let tasksOut: SessionLayout[] = [];
        if (tasks.length > 0) {
          const expanded = expandedTasks.has(wt.path);
          tasksFold = {
            top: y,
            total: tasks.length,
            live: tasks.filter((s) => s.isLive).length,
            expanded,
            kind: 'tasks',
          };
          y += SESSION_FOLD_H;
          if (expanded) {
            tasksOut = tasks.map((s, i) => ({
              key: `${wt.path}|${s.id}`,
              top: y + i * PILL_H,
              session: s,
            }));
          }
        }

        out.push({
          key: `${r.commit.sha}|${wt.path}`,
          worktree: wt,
          top: cardTop,
          dotX,
          connectorTop: r.dotY,
          connectorHeight: cardTop + CARD_H / 2 - r.dotY,
          sessions,
          tasks: tasksOut,
          sessionFold,
          tasksFold,
          hintTop:
            conversations.length === 0 && tasks.length === 0 ? afterCard : null,
        });
        cursor += worktreeBlockHeight(wt);
      }
    }
    return out;
  });

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function startDrag(d: Exclude<Drag, null>, e: PointerEvent) {
    if (!onQueueCommand) return;
    drag = d;
    dragCursor = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    dragCursor = { x: e.clientX, y: e.clientY };
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    let found: { refName: string; commitSha?: string } | null = null;
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      const refName = el.dataset.dropRef;
      if (refName) {
        found = { refName };
        break;
      }
    }
    dropTarget = found;
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    const target = dropTarget;
    const d = drag;
    drag = null;
    dropTarget = null;
    if (!target || !d || !onQueueCommand) return;
    if (d.kind === 'commit') {
      onQueueCommand({
        kind: 'cherry-pick',
        commits: [d.sha],
        onto: target.refName,
      });
    } else if (d.kind === 'ref') {
      if (d.name === target.refName) return;
      // Default to merge — disambig popup (PLAN.md §4.4) is a later polish.
      onQueueCommand({
        kind: 'merge',
        from: d.name,
        into: target.refName,
        ff: 'auto',
      });
    }
  }

  function onCommitPointerDown(c: LaidOutCommit, e: PointerEvent) {
    if (e.button !== 0) return;
    startDrag({ kind: 'commit', sha: c.sha, subject: c.subject }, e);
  }

  function onRefPointerDown(name: string, e: PointerEvent) {
    if (e.button !== 0) return;
    startDrag({ kind: 'ref', name }, e);
  }
</script>

<div class="graph" style="--svg-w: {svgWidth}px; height: {totalHeight}px;">
  <svg
    class="graph-svg"
    width={svgWidth}
    height={totalHeight}
    viewBox="0 0 {svgWidth} {totalHeight}"
    role="img"
    aria-label="Commit graph"
  >
    <defs>
      <pattern
        id="blueprint-grid"
        x="0"
        y="0"
        width="64"
        height="64"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 64 0 L 0 0 0 64"
          fill="none"
          stroke="var(--branch-0)"
          stroke-opacity="0.06"
          stroke-width="1"
        />
      </pattern>
    </defs>
    <rect width={svgWidth} height={totalHeight} fill="url(#blueprint-grid)" />

    {#each edges as edge (edge.key)}
      <path
        d={edge.d}
        fill="none"
        stroke={edge.color}
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-dasharray={edge.simulated ? '4 3' : undefined}
        opacity={edge.simulated ? 0.6 : 1}
      />
    {/each}

    {#each rows as r (r.kind === 'commit' ? r.commit.sha : `${r.key}#${r.expanded ? 'x' : 'c'}`)}
      {#if r.kind === 'commit'}
        {#if isHead(r.commit)}
          <circle
            cx={laneX(r.commit.lane)}
            cy={r.dotY}
            r={HEAD_R + 4}
            fill={laneColor(r.commit.lane)}
            fill-opacity="0.18"
          />
        {/if}
        <circle
          class="commit-dot"
          class:draggable={!r.commit.simulated && onQueueCommand}
          role={!r.commit.simulated && onQueueCommand ? 'button' : 'img'}
          aria-label={shortSha(r.commit.sha)}
          cx={laneX(r.commit.lane)}
          cy={r.dotY}
          r={isHead(r.commit) ? HEAD_R : COMMIT_R}
          fill={r.commit.simulated ? 'var(--bg)' : isMerge(r.commit) ? 'var(--bg)' : laneColor(r.commit.lane)}
          stroke={laneColor(r.commit.lane)}
          stroke-width={r.commit.simulated || isMerge(r.commit) ? 1.5 : 0}
          stroke-dasharray={r.commit.simulated ? '2 2' : undefined}
          opacity={r.commit.simulated ? 0.7 : 1}
          onpointerdown={!r.commit.simulated && onQueueCommand ? (e) => onCommitPointerDown(r.commit, e) : undefined}
        />
      {:else if !r.expanded}
        <!-- Folded run: short dashed segment so the lane stays visually continuous. -->
        <line
          x1={laneX(r.lane)}
          y1={r.top}
          x2={laneX(r.lane)}
          y2={r.top + r.height}
          stroke={laneColor(r.lane)}
          stroke-width="1.5"
          stroke-dasharray="3 2"
          opacity="0.5"
        />
      {/if}
    {/each}
  </svg>

  <ol class="labels">
    {#each rows as r (r.kind === 'commit' ? r.commit.sha : `${r.key}#${r.expanded ? 'x' : 'c'}`)}
      {#if r.kind === 'commit'}
        <li style="top: {r.top}px; height: {ROW_H}px;">
          <span class="sha mono">{shortSha(r.commit.sha)}</span>
          {#each r.commit.refs as ref (ref.kind + (ref.name ?? ''))}
            {#if ref.name}
              <span
                class={`ref ref-${ref.kind}`}
                class:draggable={onQueueCommand && (ref.kind === 'branch' || ref.kind === 'head')}
                class:drop-active={dropTarget?.refName === ref.name && drag !== null}
                role={onQueueCommand ? 'button' : undefined}
                data-drop-ref={onQueueCommand ? ref.name : undefined}
                onpointerdown={onQueueCommand && (ref.kind === 'branch' || ref.kind === 'head')
                  ? (e) => onRefPointerDown(ref.name!, e)
                  : undefined}
              >{ref.name}</span>
            {/if}
          {/each}
          <span class="subject">{r.commit.subject}</span>
        </li>
      {:else}
        <li
          style="top: {r.top}px; height: {r.height}px;"
          class="fold-row"
          class:expanded={r.expanded}
        >
          <button
            class="collapse-toggle"
            onclick={() => toggleRun(r.key)}
            title={r.expanded
              ? `Collapse these ${r.commits.length} commits`
              : `Show ${r.commits.length} hidden commits`}
          >
            <span class="chev mono" aria-hidden="true">{r.expanded ? '▾' : '▸'}</span>
            <span class="count mono">{r.commits.length}</span>
            <span class="lbl">commits</span>
            {#if !r.expanded}
              <span class="range mono">
                {shortSha(r.commits[0]!.sha)}…{shortSha(r.commits[r.commits.length - 1]!.sha)}
              </span>
            {/if}
          </button>
        </li>
      {/if}
    {/each}
  </ol>

  {#each cardLayouts as card (card.key)}
    <span
      class="connector"
      style="
        left: {card.dotX}px;
        top: {card.connectorTop}px;
        height: {card.connectorHeight}px;
      "
      aria-hidden="true"
    ></span>
    <div class="card-row" style="top: {card.top}px;">
      <WorktreeCard worktree={card.worktree} />
    </div>
    {#if card.hintTop !== null}
      <div class="session-hint" style="top: {card.hintTop}px;">
        <span class="hint-glyph mono" aria-hidden="true">·</span>
        <span class="dim">no sessions</span>
      </div>
    {/if}
    {#if card.sessionFold}
      <div class="session-fold" style="top: {card.sessionFold.top}px;">
        <button
          class="session-fold-btn"
          onclick={() => toggleSessions(card.worktree.path)}
          title={card.sessionFold.expanded
            ? 'Hide conversations'
            : `Show ${card.sessionFold.total} conversations`}
        >
          <span class="chev mono" aria-hidden="true">{card.sessionFold.expanded ? '▾' : '▸'}</span>
          <span class="count mono">{card.sessionFold.total}</span>
          <span class="lbl">conversations</span>
          {#if card.sessionFold.live > 0}
            <span class="live-dot" aria-hidden="true"></span>
            <span class="live-count mono">{card.sessionFold.live} live</span>
          {/if}
        </button>
      </div>
    {/if}
    {#each card.sessions as s (s.key)}
      <div class="session-row" style="top: {s.top}px;">
        <SessionPill session={s.session} />
      </div>
    {/each}
    {#if card.tasksFold}
      <div class="session-fold session-fold-tasks" style="top: {card.tasksFold.top}px;">
        <button
          class="session-fold-btn task-fold-btn"
          onclick={() => toggleTasks(card.worktree.path)}
          title={card.tasksFold.expanded
            ? 'Hide background tasks'
            : `Show ${card.tasksFold.total} background tasks (scheduled / automated, not chats)`}
        >
          <span class="chev mono" aria-hidden="true">{card.tasksFold.expanded ? '▾' : '▸'}</span>
          <span class="count mono">{card.tasksFold.total}</span>
          <span class="lbl">background tasks</span>
        </button>
      </div>
    {/if}
    {#each card.tasks as s (s.key)}
      <div class="session-row session-row-task" style="top: {s.top}px;">
        <SessionPill session={s.session} />
      </div>
    {/each}
  {/each}

  {#if drag}
    <div
      class="drag-ghost mono"
      style="left: {dragCursor.x + 10}px; top: {dragCursor.y + 6}px"
      aria-hidden="true"
    >
      {#if drag.kind === 'commit'}
        <span class="kind">cherry-pick</span>
        <span class="ghost-label">{shortSha(drag.sha)}</span>
      {:else}
        <span class="kind">merge</span>
        <span class="ghost-label">{drag.name}</span>
      {/if}
      {#if dropTarget}
        <span class="arrow">→</span>
        <span class="ghost-label target">{dropTarget.refName}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .graph {
    position: relative;
  }

  .graph-svg {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    /*
     * Critical: SVG children (commit dots) need to receive pointer events
     * so users can click and drag them. We previously had `pointer-events:
     * none` here as defensive overflow protection, but that silently
     * disabled dragging — labels live to the RIGHT of the SVG (left:
     * var(--svg-w)) and don't overlap, so the protection isn't needed.
     */
  }

  .labels {
    list-style: none;
    margin: 0;
    padding: 0;
    position: absolute;
    top: 0;
    left: var(--svg-w);
    right: 0;
  }

  .labels li {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: var(--s2);
    padding-left: var(--s4);
    white-space: nowrap;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sha {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .ref {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--hairline);
    color: var(--text-primary);
    text-transform: lowercase;
    letter-spacing: 0.02em;
    user-select: none;
  }

  .ref.draggable {
    cursor: grab;
  }

  .ref.draggable:active {
    cursor: grabbing;
  }

  .ref.drop-active {
    background: rgba(212, 165, 74, 0.18);
    border-color: var(--branch-2);
    box-shadow: 0 0 0 2px rgba(212, 165, 74, 0.16);
  }

  .commit-dot.draggable {
    cursor: grab;
    transition: transform 100ms ease, filter 100ms ease;
    transform-origin: center;
    /* SVG transforms work in user-space; transform-box ensures CSS
       transform-origin: center actually centers on the circle, not on
       the SVG origin. */
    transform-box: fill-box;
  }

  .commit-dot.draggable:hover {
    transform: scale(1.6);
    filter: drop-shadow(0 0 4px var(--branch-2));
  }

  .commit-dot.draggable:active {
    cursor: grabbing;
  }

  .ref.draggable {
    transition: transform 100ms ease, box-shadow 100ms ease;
  }

  .ref.draggable:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .fold-row {
    padding-left: var(--s4);
  }

  .collapse-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    background: transparent;
    border: 1px dashed var(--hairline);
    border-radius: 4px;
    padding: 2px 8px;
    color: var(--text-secondary);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: color 100ms ease, border-color 100ms ease, background 100ms ease;
  }

  .collapse-toggle:hover {
    color: var(--branch-2);
    border-color: var(--branch-2);
    border-style: solid;
  }

  /* Expanded toggle reads as a section header, not a fat button. */
  .fold-row.expanded .collapse-toggle {
    border-style: solid;
    border-color: transparent;
    background: rgba(212, 165, 74, 0.04);
    color: var(--text-secondary);
  }

  .fold-row.expanded .collapse-toggle:hover {
    border-color: var(--branch-2);
  }

  .collapse-toggle .chev {
    color: var(--branch-2);
    font-size: 10px;
    width: 10px;
    text-align: center;
  }

  .collapse-toggle .count {
    color: var(--text-primary);
    font-weight: 500;
  }

  .collapse-toggle .lbl {
    color: var(--text-secondary);
  }

  .collapse-toggle .range {
    color: var(--text-secondary);
    font-size: 10px;
    margin-left: var(--s2);
    opacity: 0.7;
  }

  .ref-head {
    background: rgba(212, 165, 74, 0.12);
    border-color: rgba(212, 165, 74, 0.4);
    color: var(--branch-2);
  }

  .ref-tag {
    background: rgba(155, 191, 155, 0.1);
    border-color: rgba(155, 191, 155, 0.35);
    color: var(--branch-1);
  }

  .ref-remote {
    color: var(--text-secondary);
    border-style: dashed;
  }

  .subject {
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .connector {
    position: absolute;
    width: 2px;
    background-image: linear-gradient(
      to bottom,
      var(--branch-2) 0 3px,
      transparent 3px 6px
    );
    background-size: 2px 6px;
    background-repeat: repeat-y;
    opacity: 0.55;
    pointer-events: none;
  }

  .card-row {
    position: absolute;
    left: calc(var(--svg-w) + var(--s4));
    display: flex;
    align-items: center;
  }

  .session-hint {
    position: absolute;
    left: calc(var(--svg-w) + var(--s4) + var(--s5));
    display: flex;
    align-items: center;
    gap: var(--s2);
    height: 18px;
    font-size: 11px;
  }

  .session-row {
    position: absolute;
    left: calc(var(--svg-w) + var(--s4) + var(--s5));
    right: 0;
    height: 24px;
    display: flex;
    align-items: center;
    padding-right: var(--s4);
  }

  .session-fold {
    position: absolute;
    left: calc(var(--svg-w) + var(--s4) + var(--s5));
    height: 22px;
    display: flex;
    align-items: center;
  }

  .session-fold-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    background: transparent;
    border: 1px dashed var(--hairline);
    border-radius: 4px;
    padding: 2px 8px;
    color: var(--text-secondary);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: color 100ms ease, border-color 100ms ease;
  }

  .session-fold-btn:hover {
    color: var(--branch-2);
    border-color: var(--branch-2);
    border-style: solid;
  }

  .session-fold-btn .chev {
    color: var(--branch-2);
    font-size: 10px;
    width: 10px;
    text-align: center;
  }

  .session-fold-btn .count {
    color: var(--text-primary);
    font-weight: 500;
  }

  .session-fold-btn .lbl {
    color: var(--text-secondary);
  }

  .session-fold-btn .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    margin-left: var(--s2);
  }

  .session-fold-btn .live-count {
    color: var(--success);
    font-size: 10px;
  }

  /*
   * Background-task fold + pills get a flatter, dimmer treatment so they
   * don't compete visually with real conversations. Same fold mechanic,
   * but the user knows at a glance "this is machine noise, not a chat".
   */
  .task-fold-btn {
    border-style: dashed;
    border-color: var(--hairline);
  }

  .task-fold-btn .lbl {
    color: var(--text-secondary);
  }

  .task-fold-btn .count {
    color: var(--text-secondary);
  }

  .session-row-task :global(.pill) {
    opacity: 0.6;
    background: transparent;
  }

  .session-row-task :global(.pill .badge) {
    background: rgba(138, 150, 168, 0.12);
    border-color: rgba(138, 150, 168, 0.3);
    color: var(--branch-7);
  }

  .drag-ghost {
    position: fixed;
    z-index: 200;
    pointer-events: none;
    background: var(--bg-elevated);
    border: 1px solid var(--branch-2);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .drag-ghost .kind {
    color: var(--branch-2);
    font-weight: 600;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.08em;
  }

  .drag-ghost .ghost-label {
    color: var(--text-primary);
  }

  .drag-ghost .ghost-label.target {
    color: var(--success);
  }

  .drag-ghost .arrow {
    color: var(--text-secondary);
  }

  .hint-glyph {
    color: var(--text-secondary);
    opacity: 0.4;
  }

  .dim {
    color: var(--text-secondary);
  }
</style>
