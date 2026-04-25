import { describe, expect, it } from 'vitest';
import type { Commit } from '../../shared/types.ts';
import { assignLanes } from './layout.ts';

function commit(sha: string, parents: string[]): Commit {
  return {
    sha,
    parents,
    author: 'x',
    authorEmail: 'x@x',
    authorDate: 0,
    subject: sha,
    refs: [],
  };
}

describe('assignLanes', () => {
  it('places a linear history on a single lane', () => {
    const { commits, laneCount } = assignLanes([
      commit('C', ['B']),
      commit('B', ['A']),
      commit('A', []),
    ]);
    expect(laneCount).toBe(1);
    expect(commits.map((c) => c.lane)).toEqual([0, 0, 0]);
    expect(commits.map((c) => c.parentLanes)).toEqual([[0], [0], []]);
  });

  it('puts a side branch on a second lane and converges at the merge-base', () => {
    // newest first:
    //   D (main)   E (feat)
    //   |          |
    //   B          C
    //   |         /
    //   A <-- merge-base
    const { commits, laneCount } = assignLanes([
      commit('D', ['B']),
      commit('E', ['C']),
      commit('B', ['A']),
      commit('C', ['A']),
      commit('A', []),
    ]);
    expect(laneCount).toBe(2);
    const byLane = Object.fromEntries(commits.map((c) => [c.sha, c.lane]));
    expect(byLane).toEqual({ D: 0, E: 1, B: 0, C: 1, A: 0 });
  });

  it('routes a merge: second parent gets its own lane, then collapses', () => {
    // M = merge of B (first parent / mainline) and F (feature)
    //   M
    //   |\
    //   B F
    //   |/
    //   X
    const { commits, laneCount } = assignLanes([
      commit('M', ['B', 'F']),
      commit('F', ['X']),
      commit('B', ['X']),
      commit('X', []),
    ]);
    expect(laneCount).toBeGreaterThanOrEqual(2);
    const byLane = Object.fromEntries(commits.map((c) => [c.sha, c.lane]));
    expect(byLane.M).toBe(0);
    expect(byLane.B).toBe(0);
    expect(byLane.F).toBe(1);
    expect(byLane.X).toBe(0);
    const m = commits.find((c) => c.sha === 'M')!;
    expect(m.parentLanes).toEqual([0, 1]);
  });

  it('reuses a freed lane when a branch tip is abandoned', () => {
    // Main: M2 -> M1 -> root
    // Stale tip: S (no children, parent root)
    // Order: M2, M1, S, root
    const { commits, laneCount } = assignLanes([
      commit('M2', ['M1']),
      commit('M1', ['root']),
      commit('S', ['root']),
      commit('root', []),
    ]);
    expect(laneCount).toBe(2);
    const byLane = Object.fromEntries(commits.map((c) => [c.sha, c.lane]));
    expect(byLane.M2).toBe(0);
    expect(byLane.M1).toBe(0);
    expect(byLane.S).toBe(1);
    expect(byLane.root).toBe(0);
  });

  it('handles an empty input', () => {
    const { commits, laneCount } = assignLanes([]);
    expect(commits).toEqual([]);
    expect(laneCount).toBe(0);
  });

  it('handles three concurrent tips converging on one base', () => {
    // T1, T2, T3 -> base
    const { commits, laneCount } = assignLanes([
      commit('T1', ['base']),
      commit('T2', ['base']),
      commit('T3', ['base']),
      commit('base', []),
    ]);
    expect(laneCount).toBe(3);
    const byLane = Object.fromEntries(commits.map((c) => [c.sha, c.lane]));
    expect(byLane.T1).toBe(0);
    expect(byLane.T2).toBe(1);
    expect(byLane.T3).toBe(2);
    expect(byLane.base).toBe(0);
  });
});
