import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WorktreeStatus } from '../../shared/types.ts';

const execFileAsync = promisify(execFile);

/**
 * Parse `git status --porcelain=v2 --branch` output.
 *
 *   # branch.oid <sha>
 *   # branch.head <name | (detached)>
 *   # branch.upstream <upstream>          (only when set)
 *   # branch.ab +N -M                     (only when upstream set)
 *   1 .M N... ... path                    (changed)
 *   2 R. ... ... path1\tpath2             (renamed)
 *   u UU ... path                         (unmerged)
 *   ? path                                (untracked)
 *
 * Each non-`#` line is one dirty entry — order doesn't matter, we just count.
 */
export function parseStatusPorcelainV2(output: string): WorktreeStatus {
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  let dirtyFiles = 0;

  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim();
    } else if (line.startsWith('# branch.ab ')) {
      const rest = line.slice('# branch.ab '.length).trim();
      const parts = rest.split(' ');
      const aStr = parts[0] ?? '';
      const bStr = parts[1] ?? '';
      ahead = Math.abs(Number.parseInt(aStr, 10)) || 0;
      behind = Math.abs(Number.parseInt(bStr, 10)) || 0;
    } else if (line.startsWith('#')) {
      // other branch headers
      continue;
    } else {
      const k = line[0];
      if (k === '1' || k === '2' || k === 'u' || k === '?') {
        dirtyFiles++;
      }
    }
  }

  return { dirtyFiles, upstream, ahead, behind };
}

/** Run `git status --porcelain=v2 --branch` in `worktreePath` and parse it. */
export async function getWorktreeStatus(worktreePath: string): Promise<WorktreeStatus> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v2', '--branch'],
      { cwd: worktreePath, maxBuffer: 16 * 1024 * 1024 },
    );
    return parseStatusPorcelainV2(stdout);
  } catch {
    // Worktree may be prunable, locked-on-removable-volume, or otherwise
    // unreadable. Treat as unknown but non-blocking.
    return { dirtyFiles: 0, upstream: null, ahead: 0, behind: 0 };
  }
}
