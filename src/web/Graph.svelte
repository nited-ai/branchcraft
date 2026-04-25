<script lang="ts">
  import type { LaidOutCommit } from '../shared/types.ts';

  type Props = {
    commits: LaidOutCommit[];
    laneCount: number;
  };

  let { commits, laneCount }: Props = $props();

  const ROW_H = 36;
  const LANE_W = 22;
  const PAD = 20;
  const COMMIT_R = 4;
  const HEAD_R = 6;

  const laneX = (lane: number): number => PAD + lane * LANE_W + LANE_W / 2;
  const rowY = (row: number): number => PAD + row * ROW_H + ROW_H / 2;

  let bySha = $derived(new Map(commits.map((c) => [c.sha, c] as const)));

  let svgWidth = $derived(PAD + Math.max(1, laneCount) * LANE_W + PAD / 2);
  let svgHeight = $derived(PAD * 2 + commits.length * ROW_H);

  function pathTo(
    childLane: number,
    childRow: number,
    parentLane: number,
    parentRow: number,
  ): string {
    const x1 = laneX(childLane);
    const y1 = rowY(childRow);
    const x2 = laneX(parentLane);
    const y2 = rowY(parentRow);
    if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  }

  const laneColor = (lane: number): string => `var(--branch-${lane % 10})`;
  const isHead = (c: LaidOutCommit): boolean => c.refs.some((r) => r.kind === 'head');
  const isMerge = (c: LaidOutCommit): boolean => c.parents.length > 1;
  const shortSha = (s: string): string => s.slice(0, 7);

  type Edge = {
    key: string;
    d: string;
    color: string;
    dashed: boolean;
  };

  let edges = $derived.by<Edge[]>(() => {
    const out: Edge[] = [];
    for (const c of commits) {
      for (let i = 0; i < c.parents.length; i++) {
        const parentSha = c.parents[i]!;
        const parentLane = c.parentLanes[i];
        const parent = bySha.get(parentSha);
        if (parent === undefined || parentLane === undefined) continue;
        // First-parent edge keeps the child's lane color; merge edges use the
        // child lane's color too so that side-branch lines are colored by the
        // branch they're feeding. Out of viewport parents are skipped.
        const colorLane = i === 0 ? c.lane : parentLane;
        out.push({
          key: `${c.sha}->${parentSha}#${i}`,
          d: pathTo(i === 0 ? c.lane : parentLane, c.row, parentLane, parent.row),
          color: laneColor(colorLane),
          dashed: false,
        });
      }
    }
    return out;
  });

  function refClass(kind: string): string {
    return `ref ref-${kind}`;
  }
</script>

<div class="graph" style="--row-h: {ROW_H}px; --pad: {PAD}px; --svg-w: {svgWidth}px;">
  <svg
    class="graph-svg"
    width={svgWidth}
    height={svgHeight}
    viewBox="0 0 {svgWidth} {svgHeight}"
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
    <rect width={svgWidth} height={svgHeight} fill="url(#blueprint-grid)" />

    {#each edges as edge (edge.key)}
      <path
        d={edge.d}
        fill="none"
        stroke={edge.color}
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-dasharray={edge.dashed ? '4 3' : undefined}
      />
    {/each}

    {#each commits as c (c.sha)}
      {#if isHead(c)}
        <circle
          cx={laneX(c.lane)}
          cy={rowY(c.row)}
          r={HEAD_R + 4}
          fill={laneColor(c.lane)}
          fill-opacity="0.18"
        />
      {/if}
      <circle
        cx={laneX(c.lane)}
        cy={rowY(c.row)}
        r={isHead(c) ? HEAD_R : COMMIT_R}
        fill={isMerge(c) ? 'var(--bg)' : laneColor(c.lane)}
        stroke={laneColor(c.lane)}
        stroke-width={isMerge(c) ? 1.5 : 0}
      />
    {/each}
  </svg>

  <ol class="labels">
    {#each commits as c (c.sha)}
      <li style="top: {rowY(c.row) - ROW_H / 2}px;">
        <span class="sha mono">{shortSha(c.sha)}</span>
        {#each c.refs as ref (ref.kind + (ref.name ?? ''))}
          {#if ref.name}
            <span class={refClass(ref.kind)}>{ref.name}</span>
          {/if}
        {/each}
        <span class="subject">{c.subject}</span>
      </li>
    {/each}
  </ol>
</div>

<style>
  .graph {
    position: relative;
    /* Reserve enough height for the SVG, then absolute label list overlaps. */
    min-height: 200px;
  }

  .graph-svg {
    display: block;
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
    height: var(--row-h);
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
</style>
