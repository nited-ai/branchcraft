<script lang="ts">
  import type { LaidOutCommit, Session, Worktree } from '../shared/types.ts';
  import WorktreeCard from './WorktreeCard.svelte';
  import SessionPill from './SessionPill.svelte';

  type Props = {
    commits: LaidOutCommit[];
    laneCount: number;
    worktrees: Worktree[];
  };

  let { commits, laneCount, worktrees }: Props = $props();

  const ROW_H = 36;
  const LANE_W = 22;
  const PAD = 20;
  const COMMIT_R = 4;
  const HEAD_R = 6;
  const CARD_H = 30;
  const HINT_H = 18;
  const PILL_H = 24;
  const CARD_GAP = 4;

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

  type Row = {
    commit: LaidOutCommit;
    worktrees: Worktree[];
    top: number;
    dotY: number;
    height: number;
  };

  function worktreeBlockHeight(wt: Worktree): number {
    const sessionH = wt.sessions.length === 0
      ? HINT_H
      : wt.sessions.length * PILL_H;
    return CARD_H + sessionH;
  }

  let rows = $derived.by<Row[]>(() => {
    const result: Row[] = [];
    let top = PAD;
    for (const c of commits) {
      const wts = worktreesByCommit.get(c.sha) ?? [];
      let extras = 0;
      if (wts.length > 0) {
        extras = CARD_GAP;
        for (const wt of wts) extras += worktreeBlockHeight(wt);
      }
      const height = ROW_H + extras;
      result.push({
        commit: c,
        worktrees: wts,
        top,
        dotY: top + ROW_H / 2,
        height,
      });
      top += height;
    }
    return result;
  });

  let bySha = $derived(new Map(rows.map((r) => [r.commit.sha, r] as const)));

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

  type Edge = { key: string; d: string; color: string };
  let edges = $derived.by<Edge[]>(() => {
    const out: Edge[] = [];
    for (const r of rows) {
      const c = r.commit;
      for (let i = 0; i < c.parents.length; i++) {
        const parentSha = c.parents[i]!;
        const parentRow = bySha.get(parentSha);
        const parentLane = c.parentLanes[i];
        if (!parentRow || parentLane === undefined) continue;
        const childLane = i === 0 ? c.lane : parentLane;
        const colorLane = i === 0 ? c.lane : parentLane;
        out.push({
          key: `${c.sha}->${parentSha}#${i}`,
          d: pathBetween(
            laneX(childLane),
            r.dotY,
            laneX(parentLane),
            parentRow.dotY,
          ),
          color: laneColor(colorLane),
        });
      }
    }
    return out;
  });

  type SessionLayout = { key: string; top: number; session: Session };
  type CardLayout = {
    key: string;
    worktree: Worktree;
    top: number;
    dotX: number;
    connectorTop: number;
    connectorHeight: number;
    sessions: SessionLayout[];
    /** Top of the "no sessions" stub when worktree.sessions is empty. */
    hintTop: number | null;
  };
  let cardLayouts = $derived.by<CardLayout[]>(() => {
    const out: CardLayout[] = [];
    for (const r of rows) {
      const dotX = laneX(r.commit.lane);
      let cursor = r.top + ROW_H + CARD_GAP;
      for (const wt of r.worktrees) {
        const cardTop = cursor;
        const sessionsTop = cardTop + CARD_H;
        const sessions: SessionLayout[] = wt.sessions.map((s, i) => ({
          key: `${wt.path}|${s.id}`,
          top: sessionsTop + i * PILL_H,
          session: s,
        }));
        out.push({
          key: `${r.commit.sha}|${wt.path}`,
          worktree: wt,
          top: cardTop,
          dotX,
          connectorTop: r.dotY,
          connectorHeight: cardTop + CARD_H / 2 - r.dotY,
          sessions,
          hintTop: wt.sessions.length === 0 ? sessionsTop : null,
        });
        cursor += worktreeBlockHeight(wt);
      }
    }
    return out;
  });
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
      />
    {/each}

    {#each rows as r (r.commit.sha)}
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
        cx={laneX(r.commit.lane)}
        cy={r.dotY}
        r={isHead(r.commit) ? HEAD_R : COMMIT_R}
        fill={isMerge(r.commit) ? 'var(--bg)' : laneColor(r.commit.lane)}
        stroke={laneColor(r.commit.lane)}
        stroke-width={isMerge(r.commit) ? 1.5 : 0}
      />
    {/each}
  </svg>

  <ol class="labels">
    {#each rows as r (r.commit.sha)}
      <li style="top: {r.top}px; height: {ROW_H}px;">
        <span class="sha mono">{shortSha(r.commit.sha)}</span>
        {#each r.commit.refs as ref (ref.kind + (ref.name ?? ''))}
          {#if ref.name}
            <span class={`ref ref-${ref.kind}`}>{ref.name}</span>
          {/if}
        {/each}
        <span class="subject">{r.commit.subject}</span>
      </li>
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
    {#each card.sessions as s (s.key)}
      <div class="session-row" style="top: {s.top}px;">
        <SessionPill session={s.session} />
      </div>
    {/each}
  {/each}
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
    pointer-events: none;
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

  .hint-glyph {
    color: var(--text-secondary);
    opacity: 0.4;
  }

  .dim {
    color: var(--text-secondary);
  }
</style>
