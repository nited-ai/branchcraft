import { describe, expect, it } from 'vitest';
import type { Commit } from '../../shared/types.ts';
import {
  Simulator,
  buildSimState,
  cloneState,
  simStateToCommits,
  topoSortNewestFirst,
} from './simulate.ts';

function commit(sha: string, parents: string[], subject = sha, ts = 0): Commit {
  return {
    sha,
    parents,
    author: 'x',
    authorEmail: 'x@x',
    authorDate: ts,
    subject,
    refs: [],
  };
}

/** Tiny helper so tests don't have to keep destructuring `{ sha }`. */
const refSha = (state: { refs: Map<string, { sha: string }> }, name: string) =>
  state.refs.get(name)?.sha;

function ref(commits: Commit[], sha: string, kind: 'branch' | 'remote' | 'head', name: string): Commit[] {
  return commits.map((c) =>
    c.sha === sha ? { ...c, refs: [...c.refs, { kind, name }] } : c,
  );
}

describe('topoSortNewestFirst', () => {
  it('emits children before parents', () => {
    const commits = [commit('A', []), commit('B', ['A'], 'B', 2), commit('C', ['B'], 'C', 3)];
    const sorted = topoSortNewestFirst(commits);
    expect(sorted.map((c) => c.sha)).toEqual(['C', 'B', 'A']);
  });

  it('breaks ties on author date (newer first)', () => {
    const commits = [
      commit('R', [], 'R', 0),
      commit('A', ['R'], 'A', 5), // newer
      commit('B', ['R'], 'B', 3),
    ];
    expect(topoSortNewestFirst(commits).map((c) => c.sha)).toEqual(['A', 'B', 'R']);
  });
});

describe('Simulator.applyMerge', () => {
  it('fast-forwards when target is an ancestor of source', () => {
    let commits = [commit('A', []), commit('B', ['A']), commit('C', ['B'])];
    commits = ref(commits, 'A', 'branch', 'old');
    commits = ref(commits, 'C', 'branch', 'new');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, { kind: 'merge', from: 'new', into: 'old' });
    expect(refSha(next, 'old')).toBe('C');
    // No new commits synthesized
    expect(next.commits.size).toBe(state.commits.size);
  });

  it('creates a synthesized merge commit on diverged branches', () => {
    // R - A (mine)
    //  \- B (theirs)
    let commits = [commit('R', []), commit('A', ['R']), commit('B', ['R'])];
    commits = ref(commits, 'A', 'branch', 'mine');
    commits = ref(commits, 'B', 'branch', 'theirs');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, { kind: 'merge', from: 'theirs', into: 'mine' });
    const newRef = refSha(next, 'mine')!;
    const merge = next.commits.get(newRef)!;
    expect(merge.simulated).toBe(true);
    expect(merge.parents).toEqual(['A', 'B']);
  });

  it('refuses with ff="only" when fast-forward is impossible', () => {
    let commits = [commit('R', []), commit('A', ['R']), commit('B', ['R'])];
    commits = ref(commits, 'A', 'branch', 'mine');
    commits = ref(commits, 'B', 'branch', 'theirs');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, {
      kind: 'merge',
      from: 'theirs',
      into: 'mine',
      ff: 'only',
    });
    // mine still points at A
    expect(refSha(next, 'mine')).toBe('A');
  });
});

describe('Simulator.applyRebase', () => {
  it('replays commits since merge-base on top of onto', () => {
    // R - M (main)
    //  \- F1 - F2 (feat)
    let commits = [
      commit('R', [], 'R', 0),
      commit('M', ['R'], 'M', 1),
      commit('F1', ['R'], 'F1', 2),
      commit('F2', ['F1'], 'F2', 3),
    ];
    commits = ref(commits, 'M', 'branch', 'main');
    commits = ref(commits, 'F2', 'branch', 'feat');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, { kind: 'rebase', branch: 'feat', onto: 'main' });
    const featTip = refSha(next, 'feat')!;
    expect(featTip.startsWith('sim-')).toBe(true);
    const tip = next.commits.get(featTip)!;
    expect(tip.subject).toBe('F2');
    expect(tip.simulated).toBe(true);
    const mid = next.commits.get(tip.parents[0]!)!;
    expect(mid.subject).toBe('F1');
    expect(mid.parents[0]).toBe('M'); // grafted on main
  });
});

describe('Simulator.applyCherryPick', () => {
  it('creates synthesized copies on top of onto', () => {
    let commits = [
      commit('R', [], 'R', 0),
      commit('A', ['R'], 'feat: a', 1),
      commit('B', ['A'], 'feat: b', 2),
      commit('M', ['R'], 'main', 3),
    ];
    commits = ref(commits, 'M', 'branch', 'main');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, {
      kind: 'cherry-pick',
      commits: ['A', 'B'],
      onto: 'main',
    });
    const tip = next.commits.get(refSha(next, 'main')!)!;
    expect(tip.subject).toBe('feat: b');
    expect(tip.simulated).toBe(true);
    const before = next.commits.get(tip.parents[0]!)!;
    expect(before.subject).toBe('feat: a');
    expect(before.parents[0]).toBe('M');
  });
});

describe('Simulator.applyReset', () => {
  it('moves the branch ref to a target sha', () => {
    let commits = [commit('A', []), commit('B', ['A']), commit('C', ['B'])];
    commits = ref(commits, 'C', 'branch', 'main');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, { kind: 'reset', branch: 'main', to: 'A' });
    expect(refSha(next, 'main')).toBe('A');
  });
});

describe('Simulator.applyPush', () => {
  it('updates origin/<branch> when fast-forward is safe', () => {
    let commits = [commit('A', []), commit('B', ['A']), commit('C', ['B'])];
    commits = ref(commits, 'A', 'remote', 'origin/main');
    commits = ref(commits, 'C', 'branch', 'main');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, { kind: 'push', branch: 'main' });
    expect(refSha(next, 'origin/main')).toBe('C');
  });

  it('refuses to push when remote has diverged and force is unset', () => {
    // remote at X, local at Y, common ancestor R
    let commits = [
      commit('R', []),
      commit('X', ['R']),
      commit('Y', ['R']),
    ];
    commits = ref(commits, 'X', 'remote', 'origin/main');
    commits = ref(commits, 'Y', 'branch', 'main');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, { kind: 'push', branch: 'main' });
    expect(refSha(next, 'origin/main')).toBe('X'); // unchanged
  });

  it('updates remote when force is set', () => {
    let commits = [commit('R', []), commit('X', ['R']), commit('Y', ['R'])];
    commits = ref(commits, 'X', 'remote', 'origin/main');
    commits = ref(commits, 'Y', 'branch', 'main');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.apply(state, { kind: 'push', branch: 'main', force: 'lease' });
    expect(refSha(next, 'origin/main')).toBe('Y');
  });
});

describe('queue (applyAll)', () => {
  it('applies a sequence of commands in order', () => {
    let commits = [
      commit('R', [], 'R', 0),
      commit('A', ['R'], 'A', 1),
      commit('B', ['R'], 'B', 2),
    ];
    commits = ref(commits, 'A', 'branch', 'main');
    commits = ref(commits, 'B', 'branch', 'feat');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const next = sim.applyAll(state, [
      { kind: 'cherry-pick', commits: ['B'], onto: 'main' },
      { kind: 'reset', branch: 'feat', to: 'main' },
    ]);
    const mainTip = refSha(next, 'main')!;
    expect(refSha(next, 'feat')).toBe(mainTip);
    expect(next.commits.get(mainTip)?.simulated).toBe(true);
  });

  it('does not mutate the input state', () => {
    let commits = [commit('A', [])];
    commits = ref(commits, 'A', 'branch', 'main');
    const sim = new Simulator({ seed: 'test' });
    const state = buildSimState(commits);
    const before = cloneState(state);
    sim.apply(state, { kind: 'reset', branch: 'main', to: 'A' });
    expect(refSha(state, 'main')).toBe(refSha(before, 'main'));
  });
});

describe('simStateToCommits', () => {
  it('reattaches refs to the commits they point at', () => {
    let commits = [commit('A', []), commit('B', ['A'])];
    commits = ref(commits, 'A', 'branch', 'old');
    commits = ref(commits, 'B', 'branch', 'main');
    const sim = new Simulator({ seed: 'test' });
    let state = buildSimState(commits);
    state = sim.apply(state, { kind: 'reset', branch: 'main', to: 'A' });
    const out = simStateToCommits(state);
    const a = out.find((c) => c.sha === 'A')!;
    const names = a.refs.map((r) => r.name).sort();
    expect(names).toEqual(['main', 'old']);
  });
});
