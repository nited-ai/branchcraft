import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Worktree } from '../../shared/types.ts';

const execFileAsync = promisify(execFile);

/**
 * Parse the porcelain output of `git worktree list --porcelain`.
 *
 * Each worktree is a block of newline-separated key-value lines, blocks
 * separated by blank lines:
 *
 *   worktree /path/to/repo
 *   HEAD abc123...
 *   branch refs/heads/main
 *
 *   worktree /path/to/.claude/worktrees/foo
 *   HEAD def456...
 *   detached
 *
 * Possible flags after the basic three: `locked`, `prunable`.
 */
export function parseWorktreesPorcelain(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const blocks = output.split(/\r?\n\r?\n+/).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let path: string | undefined;
    let head: string | undefined;
    let branch: string | null = null;
    let detachedSeen = false;
    let isLocked = false;
    let isPrunable = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length).trim();
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length).trim();
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        branch = ref.startsWith('refs/heads/')
          ? ref.slice('refs/heads/'.length)
          : ref;
      } else if (line === 'detached' || line.startsWith('detached ')) {
        detachedSeen = true;
      } else if (line === 'locked' || line.startsWith('locked ')) {
        isLocked = true;
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        isPrunable = true;
      }
    }

    if (path && head) {
      worktrees.push({
        path,
        head,
        branch: detachedSeen ? null : branch,
        isMain: worktrees.length === 0,
        isLocked,
        isPrunable,
      });
    }
  }

  return worktrees;
}

/** List worktrees of the repo at `repoPath`. */
export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['worktree', 'list', '--porcelain'],
    { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 },
  );
  return parseWorktreesPorcelain(stdout);
}

/** Cheap check: does the path look like the top of a git repo or a worktree of one? */
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: path,
    });
    return true;
  } catch {
    return false;
  }
}
