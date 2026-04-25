import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from '../../shared/types.ts';
import type { SessionProvider } from './types.ts';

const HISTORY_FILE = '.aider.chat.history.md';
const SESSION_HEADER = /^# aider chat started at (.+)$/;

/**
 * Aider stores all chats in one append-only markdown file, with each session
 * delimited by a `# aider chat started at ...` header and user messages
 * prefixed by `> `. We surface one logical "session" per file — the most
 * recent chat — and fold the latest user message into its title.
 */
export function parseAiderHistory(md: string): {
  lastUserMsg: string | null;
  lastSessionStart: number | null;
} {
  let lastUserMsg: string | null = null;
  let lastSessionStart: number | null = null;
  for (const line of md.split(/\r?\n/)) {
    const sh = SESSION_HEADER.exec(line);
    if (sh && sh[1]) {
      const ts = Date.parse(sh[1]);
      if (!Number.isNaN(ts)) lastSessionStart = Math.floor(ts / 1000);
      // New session resets the message tracker so we report the LATEST
      // session's first user message, not the first ever.
      lastUserMsg = null;
    } else if (line.startsWith('> ')) {
      const text = line.slice(2).trim();
      if (text && lastUserMsg === null) lastUserMsg = text;
    }
  }
  return { lastUserMsg, lastSessionStart };
}

export const aiderProvider: SessionProvider = {
  id: 'aider',
  displayName: 'Aider',
  async scanSessions(worktreePaths) {
    const out: Session[] = [];
    const now = Date.now();
    for (const wt of worktreePaths) {
      const file = join(wt, HISTORY_FILE);
      if (!existsSync(file)) continue;
      let stat;
      let content;
      try {
        stat = statSync(file);
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const { lastUserMsg, lastSessionStart } = parseAiderHistory(content);
      const lastActivity = Math.floor(stat.mtimeMs / 1000);
      out.push({
        id: `aider-${encodeURIComponent(wt)}`,
        provider: 'aider',
        cwd: wt,
        title: (lastUserMsg ?? 'Aider chat').slice(0, 80),
        startedAt: lastSessionStart ?? Math.floor(stat.birthtimeMs / 1000),
        lastActivity,
        isLive: now - stat.mtimeMs < 2 * 60 * 1000,
      });
    }
    return out;
  },
};
