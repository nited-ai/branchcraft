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

import type { SessionSource } from '../../shared/types.ts';

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
    return { ...acc, firstUserText: o.content.trim() };
  }
  return acc;
}

/**
 * Inspect the first user content and classify what kind of session this is.
 * CCD wraps non-conversational entry points in pseudo-XML that we recognize
 * here — `<scheduled-task>` for cron-style fires, `<command-message>` for
 * slash-commands. Everything else is a real chat.
 */
export function classifySource(firstUserText: string | null): SessionSource {
  if (!firstUserText) return 'user';
  const head = firstUserText.trimStart();
  if (head.startsWith('<scheduled-task')) return 'scheduled-task';
  if (head.startsWith('<command-message')) return 'command';
  return 'user';
}

/**
 * Pull a meaningful title out of CCD's wrapper formats:
 *   - `<scheduled-task name="x" ...>` → `[scheduled] x`
 *   - `<command-message>x</command-message>\n<command-args>y</command-args>`
 *     → `/x` (or `/x y` truncated) — the actual command the user ran
 *   - everything else → first ~80 chars of trimmed body
 */
function unwrapTitle(text: string): string {
  const trimmed = text.trim();
  // Scheduled-task: pull the task name attribute.
  const sched = /^<scheduled-task[^>]*\sname="([^"]+)"/.exec(trimmed);
  if (sched && sched[1]) return `[scheduled] ${sched[1]}`;
  // Slash-command: name + args inline.
  const cmd = /<command-name>([^<]+)<\/command-name>/.exec(trimmed);
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(trimmed);
  if (cmd && cmd[1]) {
    const name = cmd[1].trim();
    const argText = args?.[1]?.trim() ?? '';
    if (argText) return `${name} ${argText.replace(/\s+/g, ' ')}`.slice(0, 80);
    return name.slice(0, 80);
  }
  // Strip a leading `<command-message>` block (without args present).
  const stripped = trimmed.replace(/^<command-message>[\s\S]*?<\/command-message>\s*/, '');
  return stripped.replace(/\s+/g, ' ').slice(0, 80);
}

function pickTitle(scan: TitleScan): string {
  if (scan.customTitle) return scan.customTitle.slice(0, 80);
  if (scan.firstUserText) return unwrapTitle(scan.firstUserText) || 'Untitled session';
  return 'Untitled session';
}

/**
 * Walk a JSONL transcript and pull the best title we can find. Prefers an
 * explicit `custom-title` record; falls back to the first user message body
 * emitted as a `queue-operation` enqueue (with wrapper-stripping). Pure over
 * a string — used by tests.
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
 * Like {@link extractTitle} but also returns the inferred {@link SessionSource}.
 * The classification looks at the *raw* first user content, not the unwrapped
 * title — `<scheduled-task>` and `<command-message>` are signals about the
 * session's origin even when we manage to pull a clean title out of them.
 */
export function extractTitleAndSource(jsonl: string): { title: string; source: SessionSource } {
  let acc = EMPTY_SCAN;
  for (const line of jsonl.split('\n')) {
    acc = scanLine(line, acc);
    if (acc.customTitle) break;
  }
  return { title: pickTitle(acc), source: classifySource(acc.firstUserText) };
}

/**
 * Stream the file line-by-line and stop as soon as a `custom-title` is found
 * or {@link MAX_TITLE_LINES} lines have been read. CCD transcripts run into
 * the megabytes once thinking blocks accumulate, so reading the whole file
 * just to find a small metadata record is wasteful.
 */
const MAX_TITLE_LINES = 500;

async function extractTitleAndSourceFromFile(
  file: string,
): Promise<{ title: string; source: SessionSource }> {
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
  return { title: pickTitle(acc), source: classifySource(acc.firstUserText) };
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
    const { title, source } = await extractTitleAndSourceFromFile(file).catch(
      () => ({ title: 'Untitled session', source: 'user' as const }),
    );
    out.push({
      id: name.replace(/\.jsonl$/, ''),
      provider: 'claude-code',
      cwd: worktreePath,
      title,
      source,
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
