// Types shared between server and web.
// Keep this file dependency-free — both Hono and Svelte side import from here.

export interface Worktree {
  /** Absolute path on disk. */
  path: string;
  /** Current HEAD SHA. */
  head: string;
  /** Branch name without `refs/heads/` prefix, or null when detached. */
  branch: string | null;
  /** True for the main worktree (always first in `git worktree list` output). */
  isMain: boolean;
  /** Locked by `git worktree lock`. */
  isLocked: boolean;
  /** Marked as prunable (its directory was removed without `git worktree remove`). */
  isPrunable: boolean;
}

export interface ApiHealth {
  ok: true;
  version: string;
  cwd: string;
  isGitRepo: boolean;
}

export interface ApiWorktrees {
  repoPath: string;
  worktrees: Worktree[];
}

export type RefKind = 'branch' | 'remote' | 'tag' | 'head' | 'stash';

export interface RefDecoration {
  kind: RefKind;
  /** Branch/tag/remote name. Null only for a bare detached HEAD. */
  name: string | null;
}

export interface Commit {
  sha: string;
  parents: string[];
  author: string;
  authorEmail: string;
  /** Author timestamp in unix seconds. */
  authorDate: number;
  subject: string;
  refs: RefDecoration[];
}

export interface LaidOutCommit extends Commit {
  /** Vertical position (0 = newest at top). */
  row: number;
  /** Horizontal lane index (0 = leftmost). */
  lane: number;
  /** Lane assigned to each parent, in the same order as `parents`. */
  parentLanes: number[];
}

export interface ApiGraph {
  repoPath: string;
  /** Number of lanes the layout uses (max lane index + 1). */
  laneCount: number;
  commits: LaidOutCommit[];
}
