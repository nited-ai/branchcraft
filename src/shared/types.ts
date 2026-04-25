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
