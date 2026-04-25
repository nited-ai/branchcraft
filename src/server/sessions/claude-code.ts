import { createReadStream, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Session } from '../../shared/types.ts';
import type { SessionProvider } from './types.ts';

/**
 * Encode an *already-absolute* path the way Claude Code does for its
 * `~/.claude/projects/<key>/` directory naming.
 *
 *   D:\Git\Repos\branchcraft  ->  D--Git-Repos-branchcraft
 *   /home/d/work              ->  -home-d-work
 *
 * The transform is lossy (different paths can collide) but stable. We never
 * decode — we only forward-encode worktree paths and look up the result.
 *
 * Caller is responsible for resolving relative paths first. We avoid calling
 * `resolve()` inside the encoder so the function is deterministic across
 * platforms (Windows otherwise prefixes a drive letter to bare absolute
 * paths like `/foo`).
 */
export function encodeProjectKey(absPath: string): string {
  return absPath.replace(/[:\\/.]/g, '-');
}

const projectsDir = (): string => join(homedir(), '.claude', 'projects');

type TitleScan = { customTitle: string | null; firstUserText: string | null };

const EMPTY_SCAN: TitleScan = { customTitle: null, firstUserText: null };

function scanLine(line: string, acc: TitleScan): TitleScan {
  if (!line) return acc;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return acc;
  }
  if (typeof parsed !== 'object' || parsed === null) return acc;
  const o = parsed as Record<string, unknown>;
  if (
    acc.customTitle === null &&
    o.type === 'custom-title' &&
    typeof o.customTitle === 'string'
  ) {
    const t = o.customTitle.trim();
    if (t) return { ...acc, customTitle: t };
  }
  if (
    acc.firstUserText === null &&
    o.type === 'queue-operation' &&
    o.operation === 'enqueue' &&
    typeof o.content === 'string'
  ) {
    return { ...acc, firstUserText: o.content.replace(/\s+/g, ' ').trim() };
  }
  return acc;
}

function pickTitle(scan: TitleScan): string {
  if (scan.customTitle) return scan.customTitle.slice(0, 80);
  if (scan.firstUserText) return scan.firstUserText.slice(0, 80);
  return 'Untitled session';
}

/**
 * Walk a JSONL transcript and pull the best title we can find. Prefers an
 * explicit `custom-title` record; falls back to the first user message body
 * emitted as a `queue-operation` enqueue. Pure over a string — used by tests.
 */
export function extractTitle(jsonl: string): string {
  let acc = EMPTY_SCAN;
  for (const line of jsonl.split('\n')) {
    acc = scanLine(line, acc);
    if (acc.customTitle) break;
  }
  return pickTitle(acc);
}

/**
 * Stream the file line-by-line and stop as soon as a `custom-title` is found
 * or {@link MAX_TITLE_LINES} lines have been read. CCD transcripts run into
 * the megabytes once thinking blocks accumulate, so reading the whole file
 * just to find a small metadata record is wasteful.
 */
const MAX_TITLE_LINES = 500;

async function extractTitleFromFile(file: string): Promise<string> {
  const stream = createReadStream(file, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let acc = EMPTY_SCAN;
  let count = 0;
  try {
    for await (const line of rl) {
      acc = scanLine(line, acc);
      if (acc.customTitle) break;
      if (++count >= MAX_TITLE_LINES) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return pickTitle(acc);
}

async function scanWorktree(worktreePath: string): Promise<Session[]> {
  const dir = join(projectsDir(), encodeProjectKey(resolve(worktreePath)));
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir).catch(() => [] as string[]);
  const out: Session[] = [];
  const now = Date.now();
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const file = join(dir, name);
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    const title = await extractTitleFromFile(file).catch(() => 'Untitled session');
    out.push({
      id: name.replace(/\.jsonl$/, ''),
      provider: 'claude-code',
      cwd: worktreePath,
      title,
      startedAt: Math.floor(stat.birthtimeMs / 1000),
      lastActivity: Math.floor(stat.mtimeMs / 1000),
      isLive: now - stat.mtimeMs < 2 * 60 * 1000,
    });
  }
  return out;
}

export const claudeCodeProvider: SessionProvider = {
  id: 'claude-code',
  displayName: 'Claude Code',
  async scanSessions(worktreePaths) {
    if (!existsSync(projectsDir())) return [];
    const all = await Promise.all(worktreePaths.map((p) => scanWorktree(p).catch(() => [])));
    return all.flat();
  },
};
