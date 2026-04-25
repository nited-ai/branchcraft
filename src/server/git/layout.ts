import type { Commit, LaidOutCommit } from '../../shared/types.ts';

/**
 * Assign a lane (column index) to each commit so the graph can be drawn.
 *
 * Input: commits in display order — newest first, topologically sorted so
 * children always appear before parents (`git log --topo-order`).
 *
 * Algorithm: walk top to bottom maintaining `activeLanes[i] = sha expected
 * next in lane i`. For each commit:
 *
 *   1. Find a lane already expecting this sha; if none, allocate the leftmost
 *      free slot (or grow). That's this commit's lane.
 *   2. Any *other* lane that also expected this sha (merge convergence) is
 *      freed — those branches collapse into this one going up.
 *   3. The lane is reassigned to the commit's first parent.
 *   4. Subsequent parents either reuse a lane that already expects them
 *      (criss-cross) or allocate a new one.
 *
 * The result preserves first-parent continuity, which is what makes the graph
 * read like git's own `--graph`.
 */
export function assignLanes(commits: Commit[]): {
  commits: LaidOutCommit[];
  laneCount: number;
} {
  const result: LaidOutCommit[] = [];
  const activeLanes: (string | null)[] = [];
  let laneCount = 0;

  function firstFreeOrGrow(): number {
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === null) return i;
    }
    activeLanes.push(null);
    return activeLanes.length - 1;
  }

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row]!;

    let lane = activeLanes.indexOf(commit.sha);
    if (lane === -1) lane = firstFreeOrGrow();

    for (let i = 0; i < activeLanes.length; i++) {
      if (i !== lane && activeLanes[i] === commit.sha) {
        activeLanes[i] = null;
      }
    }

    activeLanes[lane] = commit.parents[0] ?? null;

    const parentLanes: number[] = [];
    if (commit.parents.length > 0) parentLanes.push(lane);
    for (let p = 1; p < commit.parents.length; p++) {
      const parent = commit.parents[p]!;
      let pLane = activeLanes.indexOf(parent);
      if (pLane === -1) {
        pLane = firstFreeOrGrow();
        activeLanes[pLane] = parent;
      }
      parentLanes.push(pLane);
    }

    laneCount = Math.max(laneCount, activeLanes.length);

    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }

    result.push({ ...commit, row, lane, parentLanes });
  }

  return { commits: result, laneCount };
}
