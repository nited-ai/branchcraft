// Types shared between server and web.
// Keep this file dependency-free — both Hono and Svelte side import from here.

export interface WorktreeStatus {
  /** Number of dirty entries (changed, renamed, unmerged, untracked). */
  dirtyFiles: number;
  /** Upstream tracking ref (e.g. `origin/main`), or null if unset/detached. */
  upstream: string | null;
  /** Commits this worktree is ahead of upstream. */
  ahead: number;
  /** Commits this worktree is behind upstream. */
  behind: number;
}

export type SessionProviderId =
  | 'claude-code' // CCD GUI + `claude` CLI (shared storage)
  | 'aider'
  | 'codex-cli'
  | 'codex-desktop'
  | 'gemini-cli';

export type SessionSource =
  /** Started by a user typing a prompt or message. */
  | 'user'
  /** Invoked via a slash-command (`/foo`) — first message is wrapped in
      `<command-message>` / `<command-args>` tags. */
  | 'command'
  /** Spawned by a scheduled-task fire. Not really a conversation; the
      first message is a system wrapper describing the task. */
  | 'scheduled-task';

export interface Session {
  id: string;
  provider: SessionProviderId;
  /** Absolute cwd the session was started in — matched against worktree paths. */
  cwd: string;
  /** Display title — custom title if set, otherwise truncated first user message. */
  title: string;
  /** What kind of session this is — drives whether the UI groups it as
      a regular conversation or aggregates it under "background tasks". */
  source: SessionSource;
  /** Unix seconds. Best-effort: file btime where available, else mtime. */
  startedAt: number;
  /** Unix seconds — last write to the session's storage. */
  lastActivity: number;
  /** True when last activity is within ~2 min. */
  isLive: boolean;
}

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
  /** Working-tree status — omitted when the worktree is unreadable (e.g. prunable). */
  status?: WorktreeStatus;
  /** AI sessions discovered for this worktree's path. Empty when none found. */
  sessions: Session[];
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
  /** True for commits synthesized by the simulator (not in the real repo). */
  simulated?: boolean;
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

export type RepoStatusKind = 'clean' | 'dirty' | 'stale' | 'unknown';

export interface ApiRepoSummary {
  id: string;
  /** Absolute path on disk. */
  path: string;
  /** Display name — basename of `path`. */
  name: string;
  worktreeCount: number;
  status: RepoStatusKind;
  /** Number of worktrees with `behind > 0`. */
  staleCount: number;
  /** Number of worktrees with at least one dirty file. */
  dirtyCount: number;
  /** True if this repo's path is the server's startup cwd. */
  isCurrent: boolean;
}

export interface ApiRepos {
  /** Absolute path of the server's startup cwd. */
  cwd: string;
  /** Id of the pinned repo matching cwd, or null if cwd isn't pinned. */
  currentId: string | null;
  repos: ApiRepoSummary[];
}

export interface ApiAddRepoRequest {
  path: string;
}

// ── Simulator / queue ────────────────────────────────────────────────────────

export type Sha = string;
export type RefName = string;

export type Command =
  | { kind: 'merge'; from: RefName; into: RefName; ff?: 'auto' | 'only' | 'no' }
  | { kind: 'rebase'; branch: RefName; onto: Sha | RefName }
  | { kind: 'cherry-pick'; commits: Sha[]; onto: RefName }
  | {
      kind: 'reset';
      branch: RefName;
      to: Sha | RefName;
      mode?: 'soft' | 'mixed' | 'hard';
    }
  | { kind: 'push'; branch: RefName; remote?: string; force?: 'lease' | true }
  | {
      /** Switch a specific worktree to a branch or commit. Doesn't touch
          the graph topology — only changes what a worktree is checked out
          at. Detaches HEAD if the target is a sha. */
      kind: 'checkout';
      worktree: string;
      target: Sha | RefName;
    };

export interface ApiSimulateRequest {
  commands: Command[];
}

export interface ApplyResult {
  ok: boolean;
  command: Command;
  /** stdout / stderr text from git when relevant. */
  output?: string;
  error?: string;
}

export interface ApiApplyResponse {
  results: ApplyResult[];
  /** True iff every command succeeded — useful for client UX. */
  allSucceeded: boolean;
}

// ── Rucksacks (stash / tags / reflog) ────────────────────────────────────────

export interface StashEntry {
  index: number;
  message: string;
  sha: string;
  authorDate: number;
}

export interface TagEntry {
  name: string;
  sha: string;
  message: string;
  date: number;
}

export interface ReflogEntry {
  index: number;
  sha: string;
  action: string;
  message: string;
  date: number;
}

export interface ApiRucksacks {
  stash: StashEntry[];
  tags: TagEntry[];
  reflog: ReflogEntry[];
}
