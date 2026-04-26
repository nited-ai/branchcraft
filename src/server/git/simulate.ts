import type {
  Command,
  Commit,
  RefDecoration,
  RefKind,
  RefName,
  Sha,
} from '../../shared/types.ts';

/**
 * Pure, in-memory simulator for git operations. Takes a snapshot of the
 * graph state plus a queue of commands and produces what the graph would
 * look like *if* those commands were applied. No I/O, no git invocation —
 * purely a data transform we use to drive the UI's hover/queue preview.
 *
 * Synthesized commits get a `sim-N-...` SHA and `simulated: true` so the
 * renderer can dim them. New SHAs are deterministic per simulator instance
 * via an injected seed so tests don't drift.
 */

/** Where a ref points (sha) plus what kind of ref it is — preserved across simulation. */
export interface RefEntry {
  sha: Sha;
  kind: RefKind;
}

export interface SimState {
  /** Every commit visible to the simulator, including synthesized ones. */
  commits: Map<Sha, Commit>;
  /** Branch / remote-branch / head refs by name. Kind is preserved so we can
   *  reproject back to {@link Commit['refs']} without lossy heuristics. */
  refs: Map<RefName, RefEntry>;
}

export function cloneState(state: SimState): SimState {
  return {
    commits: new Map(state.commits),
    refs: new Map(state.refs),
  };
}

function setRef(state: SimState, name: RefName, sha: Sha) {
  const cur = state.refs.get(name);
  state.refs.set(name, { sha, kind: cur?.kind ?? 'branch' });
}

/**
 * Resolve a user-typed reference. Tries (in order): exact SHA match, named
 * ref, then prefix match against known SHAs. The prefix path lets users type
 * `c0c4701` instead of the full 40-char hash, matching git's own behavior.
 */
function resolveRef(state: SimState, ref: RefName | Sha): Sha | null {
  if (state.commits.has(ref)) return ref;
  const named = state.refs.get(ref)?.sha;
  if (named) return named;
  if (/^[0-9a-f]{4,40}$/i.test(ref)) {
    const lower = ref.toLowerCase();
    for (const sha of state.commits.keys()) {
      if (sha.toLowerCase().startsWith(lower)) return sha;
    }
  }
  return null;
}

function isAncestor(state: SimState, ancestor: Sha, descendant: Sha): boolean {
  if (ancestor === descendant) return true;
  const visited = new Set<string>();
  const queue: string[] = [descendant];
  while (queue.length) {
    const sha = queue.shift()!;
    if (sha === ancestor) return true;
    if (visited.has(sha)) continue;
    visited.add(sha);
    const c = state.commits.get(sha);
    if (c) queue.push(...c.parents);
  }
  return false;
}

function findMergeBase(state: SimState, a: Sha, b: Sha): Sha | null {
  const aAncestors = new Set<string>();
  const q1: string[] = [a];
  while (q1.length) {
    const sha = q1.shift()!;
    if (aAncestors.has(sha)) continue;
    aAncestors.add(sha);
    const c = state.commits.get(sha);
    if (c) q1.push(...c.parents);
  }
  const visited = new Set<string>();
  const q2: string[] = [b];
  while (q2.length) {
    const sha = q2.shift()!;
    if (aAncestors.has(sha)) return sha;
    if (visited.has(sha)) continue;
    visited.add(sha);
    const c = state.commits.get(sha);
    if (c) q2.push(...c.parents);
  }
  return null;
}

/** Walk first-parents from `from` until we hit `until` (exclusive). */
function firstParentChain(state: SimState, from: Sha, until: Sha): Commit[] {
  const out: Commit[] = [];
  const visited = new Set<string>();
  let cur: string | undefined = from;
  while (cur && cur !== until) {
    if (visited.has(cur)) break;
    visited.add(cur);
    const c = state.commits.get(cur);
    if (!c) break;
    out.push(c);
    cur = c.parents[0];
  }
  return out;
}

interface SimulatorOpts {
  /** Optional seed string mixed into synthesized SHAs to keep tests deterministic. */
  seed?: string;
}

export class Simulator {
  private counter = 0;
  private readonly seed: string;

  constructor(opts: SimulatorOpts = {}) {
    this.seed = opts.seed ?? Math.random().toString(36).slice(2, 8);
  }

  private nextSha(): string {
    return `sim-${++this.counter}-${this.seed}`;
  }

  private synth(parents: Sha[], subject: string, source?: Commit): Commit {
    return {
      sha: this.nextSha(),
      parents,
      author: source?.author ?? 'simulator',
      authorEmail: source?.authorEmail ?? 'sim@local',
      authorDate: Math.floor(Date.now() / 1000),
      subject,
      refs: [],
      simulated: true,
    };
  }

  apply(state: SimState, cmd: Command): SimState {
    switch (cmd.kind) {
      case 'merge':
        return this.applyMerge(state, cmd);
      case 'rebase':
        return this.applyRebase(state, cmd);
      case 'cherry-pick':
        return this.applyCherryPick(state, cmd);
      case 'reset':
        return this.applyReset(state, cmd);
      case 'push':
        return this.applyPush(state, cmd);
      case 'checkout':
        // Checkout doesn't change the graph — it only moves which worktree
        // is at which commit. We don't model worktree-head in SimState, so
        // there's nothing to preview here. The queue still shows it and
        // apply executes it for real.
        return state;
    }
  }

  applyAll(state: SimState, commands: Command[]): SimState {
    let s = cloneState(state);
    for (const cmd of commands) s = this.apply(s, cmd);
    return s;
  }

  private applyMerge(
    state: SimState,
    cmd: Extract<Command, { kind: 'merge' }>,
  ): SimState {
    const fromSha = resolveRef(state, cmd.from);
    const intoSha = resolveRef(state, cmd.into);
    if (!fromSha || !intoSha || fromSha === intoSha) return state;
    const next = cloneState(state);
    const ff = cmd.ff ?? 'auto';
    if (isAncestor(state, intoSha, fromSha)) {
      // Fast-forward possible
      if (ff === 'no') {
        const m = this.synth([intoSha, fromSha], `Merge ${cmd.from} into ${cmd.into}`);
        next.commits.set(m.sha, m);
        setRef(next, cmd.into, m.sha);
      } else {
        setRef(next, cmd.into, fromSha);
      }
    } else {
      if (ff === 'only') return state;
      const m = this.synth([intoSha, fromSha], `Merge ${cmd.from} into ${cmd.into}`);
      next.commits.set(m.sha, m);
      setRef(next, cmd.into, m.sha);
    }
    return next;
  }

  private applyRebase(
    state: SimState,
    cmd: Extract<Command, { kind: 'rebase' }>,
  ): SimState {
    const branchSha = resolveRef(state, cmd.branch);
    const ontoSha = resolveRef(state, cmd.onto);
    if (!branchSha || !ontoSha) return state;
    if (branchSha === ontoSha) return state;
    const base = findMergeBase(state, branchSha, ontoSha);
    if (!base) return state;
    if (base === branchSha) {
      // branch is already an ancestor of onto — rebase = no commits to replay,
      // but we can still fast-forward branch to onto.
      const next = cloneState(state);
      setRef(next, cmd.branch, ontoSha);
      return next;
    }
    const chain = firstParentChain(state, branchSha, base).reverse(); // oldest first
    const next = cloneState(state);
    let parent = ontoSha;
    for (const c of chain) {
      const newC = this.synth([parent], c.subject, c);
      next.commits.set(newC.sha, newC);
      parent = newC.sha;
    }
    setRef(next, cmd.branch, parent);
    return next;
  }

  private applyCherryPick(
    state: SimState,
    cmd: Extract<Command, { kind: 'cherry-pick' }>,
  ): SimState {
    const ontoSha = resolveRef(state, cmd.onto);
    if (!ontoSha) return state;
    const next = cloneState(state);
    let parent = ontoSha;
    for (const sha of cmd.commits) {
      const resolved = resolveRef(state, sha);
      const orig = resolved ? state.commits.get(resolved) : undefined;
      if (!orig) continue;
      const newC = this.synth([parent], orig.subject, orig);
      next.commits.set(newC.sha, newC);
      parent = newC.sha;
    }
    setRef(next, cmd.onto, parent);
    return next;
  }

  private applyReset(
    state: SimState,
    cmd: Extract<Command, { kind: 'reset' }>,
  ): SimState {
    const target = resolveRef(state, cmd.to);
    if (!target) return state;
    const next = cloneState(state);
    setRef(next, cmd.branch, target);
    return next;
  }

  private applyPush(
    state: SimState,
    cmd: Extract<Command, { kind: 'push' }>,
  ): SimState {
    const localSha = resolveRef(state, cmd.branch);
    if (!localSha) return state;
    const remote = cmd.remote ?? 'origin';
    const remoteRef = `${remote}/${cmd.branch}`;
    const remoteSha = state.refs.get(remoteRef)?.sha;
    // Diverged remote: refuse silently unless force was requested. The UI
    // surfaces this as an empty diff; the actual `git push` would error.
    if (
      remoteSha &&
      !isAncestor(state, remoteSha, localSha) &&
      cmd.force === undefined
    ) {
      return state;
    }
    const next = cloneState(state);
    // Push always creates/updates a remote ref.
    next.refs.set(remoteRef, { sha: localSha, kind: 'remote' });
    return next;
  }
}

/**
 * Topological sort: leaves first (newest), parents last. Tie-break by author
 * date desc to keep the result stable when two branches converge.
 */
export function topoSortNewestFirst(commits: Commit[]): Commit[] {
  const bySha = new Map(commits.map((c) => [c.sha, c] as const));
  const remainingChildren = new Map<string, number>();
  for (const c of commits) remainingChildren.set(c.sha, 0);
  for (const c of commits) {
    for (const p of c.parents) {
      if (remainingChildren.has(p)) {
        remainingChildren.set(p, (remainingChildren.get(p) ?? 0) + 1);
      }
    }
  }
  const sources: Commit[] = [];
  for (const c of commits) {
    if ((remainingChildren.get(c.sha) ?? 0) === 0) sources.push(c);
  }
  const out: Commit[] = [];
  while (sources.length) {
    sources.sort((a, b) => b.authorDate - a.authorDate);
    const next = sources.shift()!;
    out.push(next);
    for (const p of next.parents) {
      const parent = bySha.get(p);
      if (!parent) continue;
      const cnt = (remainingChildren.get(p) ?? 0) - 1;
      remainingChildren.set(p, cnt);
      if (cnt === 0) sources.push(parent);
    }
  }
  return out;
}

/**
 * Build a SimState from the graph data we already have. Branch / remote /
 * head refs from the decoration lists become entries in `state.refs`,
 * preserving the original kind so we can reproject without heuristics.
 */
export function buildSimState(commits: Commit[]): SimState {
  const state: SimState = {
    commits: new Map(commits.map((c) => [c.sha, c] as const)),
    refs: new Map(),
  };
  for (const c of commits) {
    for (const ref of c.refs) {
      if (!ref.name) continue;
      if (
        ref.kind === 'branch' ||
        ref.kind === 'remote' ||
        ref.kind === 'head'
      ) {
        state.refs.set(ref.name, { sha: c.sha, kind: ref.kind });
      }
    }
  }
  return state;
}

/**
 * Project a SimState back into a Commit[] suitable for {@link assignLanes}.
 * Reattaches the ref decorations to whichever commit each ref now points at,
 * preserving the original ref kind (so `feature/x` doesn't get reclassified
 * as a remote just because it has a slash).
 */
export function simStateToCommits(state: SimState): Commit[] {
  const out: Commit[] = [];
  const refsBySha = new Map<string, RefDecoration[]>();
  for (const [name, entry] of state.refs) {
    const arr = refsBySha.get(entry.sha) ?? [];
    arr.push({ kind: entry.kind, name });
    refsBySha.set(entry.sha, arr);
  }
  for (const c of state.commits.values()) {
    out.push({ ...c, refs: refsBySha.get(c.sha) ?? [] });
  }
  return topoSortNewestFirst(out);
}
