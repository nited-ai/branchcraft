import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Commit, RefDecoration } from '../../shared/types.ts';

const execFileAsync = promisify(execFile);

/**
 * Format string for `git log --format=...`.
 *
 * Fields are NUL-separated (`%x00`) so commit subjects with spaces / commas /
 * tabs survive intact. One commit per line:
 *
 *   <sha>\0<parents>\0<author>\0<email>\0<authorTs>\0<subject>\0<decoration>
 */
export const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D';

export function parseGitLog(stdout: string): Commit[] {
  const commits: Commit[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split('\0');
    if (parts.length < 7) continue;
    const [sha, parentsStr, author, authorEmail, atStr, subject, refsStr] = parts as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (!sha || !atStr) continue;
    const parents = parentsStr ? parentsStr.split(' ').filter(Boolean) : [];
    const authorDate = Number.parseInt(atStr, 10);
    if (!Number.isFinite(authorDate)) continue;
    commits.push({
      sha,
      parents,
      author,
      authorEmail,
      authorDate,
      subject,
      refs: parseDecoration(refsStr),
    });
  }
  return commits;
}

/**
 * Parse `git log --format=%D` decoration. Examples:
 *   ""
 *   "HEAD -> main, origin/main"
 *   "tag: v1.0.0, origin/release"
 *   "refs/stash"
 */
export function parseDecoration(decoration: string): RefDecoration[] {
  const trimmed = decoration.trim();
  if (!trimmed) return [];
  const out: RefDecoration[] = [];
  for (const raw of trimmed.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    if (token === 'HEAD') {
      out.push({ kind: 'head', name: null });
    } else if (token.startsWith('HEAD -> ')) {
      // `HEAD -> main` = HEAD points to local branch `main` at this commit.
      // Emit only the head ref — emitting a separate branch ref with the
      // same name would render as a duplicate pill in the UI.
      out.push({ kind: 'head', name: token.slice('HEAD -> '.length) });
    } else if (token.startsWith('tag: ')) {
      out.push({ kind: 'tag', name: token.slice('tag: '.length) });
    } else if (token === 'refs/stash') {
      out.push({ kind: 'stash', name: 'stash' });
    } else if (token.includes('/')) {
      out.push({ kind: 'remote', name: token });
    } else {
      out.push({ kind: 'branch', name: token });
    }
  }
  return out;
}

/** Run `git log --all --topo-order` and parse the output. */
export async function gitLog(
  repoPath: string,
  opts?: { limit?: number },
): Promise<Commit[]> {
  const limit = opts?.limit ?? 200;
  const { stdout } = await execFileAsync(
    'git',
    [
      'log',
      '--all',
      '--topo-order',
      `--max-count=${limit}`,
      `--format=${LOG_FORMAT}`,
    ],
    { cwd: repoPath, maxBuffer: 32 * 1024 * 1024 },
  );
  return parseGitLog(stdout);
}
