import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const NUL = '\0';

// ── Stash ────────────────────────────────────────────────────────────────────

export interface StashEntry {
  /** Index into stash list — `stash@{0}` is index 0. */
  index: number;
  /** Subject of the stash commit (`WIP on main: ...`). */
  message: string;
  sha: string;
  /** Author timestamp in unix seconds. */
  authorDate: number;
}

export const STASH_FORMAT = '%H%x00%s%x00%at';

export function parseStashList(stdout: string): StashEntry[] {
  const out: StashEntry[] = [];
  let index = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split(NUL);
    if (parts.length < 3) continue;
    const [sha, message, atStr] = parts as [string, string, string];
    const authorDate = Number.parseInt(atStr, 10);
    if (!sha || !Number.isFinite(authorDate)) continue;
    out.push({ index: index++, sha, message, authorDate });
  }
  return out;
}

export async function listStash(repoPath: string): Promise<StashEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['stash', 'list', `--format=${STASH_FORMAT}`],
      { cwd: repoPath, maxBuffer: 8 * 1024 * 1024 },
    );
    return parseStashList(stdout);
  } catch {
    return [];
  }
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export interface TagEntry {
  name: string;
  sha: string;
  /** Annotation message — empty for lightweight tags. */
  message: string;
  /** Timestamp the tag points at (commit/tag date), unix seconds. */
  date: number;
}

export const TAG_FORMAT =
  '%(refname:short)%00%(objectname)%00%(contents:subject)%00%(*authordate:unix)%(authordate:unix)';

export function parseTagList(stdout: string): TagEntry[] {
  const out: TagEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split(NUL);
    if (parts.length < 4) continue;
    const [name, sha, message, dateStr] = parts as [string, string, string, string];
    const date = Number.parseInt(dateStr, 10);
    if (!name || !sha) continue;
    out.push({
      name,
      sha,
      message,
      date: Number.isFinite(date) ? date : 0,
    });
  }
  return out;
}

export async function listTags(repoPath: string): Promise<TagEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'for-each-ref',
        '--sort=-creatordate',
        `--format=${TAG_FORMAT}`,
        'refs/tags',
      ],
      { cwd: repoPath, maxBuffer: 8 * 1024 * 1024 },
    );
    return parseTagList(stdout);
  } catch {
    return [];
  }
}

// ── Reflog ───────────────────────────────────────────────────────────────────

export interface ReflogEntry {
  /** Index in the listing (0 = newest). */
  index: number;
  /** Commit reflog entry currently points at. */
  sha: string;
  /** Action label, e.g. `commit`, `reset`, `pull`, `rebase`, `checkout`. */
  action: string;
  /** Free-form message after the colon. */
  message: string;
  /** Timestamp of the entry, unix seconds. */
  date: number;
}

export const REFLOG_FORMAT = '%H%x00%gs%x00%gt';

const ACTION_REGEX = /^(?<action>[\w/-]+):\s*(?<rest>.*)$/;

export function parseReflog(stdout: string): ReflogEntry[] {
  const out: ReflogEntry[] = [];
  let index = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split(NUL);
    if (parts.length < 3) continue;
    const [sha, gs, gt] = parts as [string, string, string];
    if (!sha) continue;
    const m = ACTION_REGEX.exec(gs);
    const action = m?.groups?.action ?? gs.split(':')[0] ?? 'unknown';
    const message = m?.groups?.rest ?? gs;
    const date = Number.parseInt(gt, 10);
    out.push({
      index: index++,
      sha,
      action,
      message,
      date: Number.isFinite(date) ? date : 0,
    });
  }
  return out;
}

export async function listReflog(
  repoPath: string,
  opts?: { limit?: number },
): Promise<ReflogEntry[]> {
  const limit = opts?.limit ?? 100;
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['reflog', '--all', `-n${limit}`, `--format=${REFLOG_FORMAT}`],
      { cwd: repoPath, maxBuffer: 8 * 1024 * 1024 },
    );
    return parseReflog(stdout);
  } catch {
    return [];
  }
}
