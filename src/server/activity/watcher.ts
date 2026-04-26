import chokidar, { type FSWatcher } from 'chokidar';
import { existsSync, statSync } from 'node:fs';
import { open as fsOpen } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { encodeProjectKey } from '../sessions/claude-code.ts';
import type { ActivityEvent } from '../../shared/types.ts';
import { extractActivityEvent } from './extract.ts';

const PROJECTS = join(homedir(), '.claude', 'projects');
const ACTIVE_THRESHOLD_MS = 60 * 60_000; // 60 min — only watch sessions active in the last hour
const MAX_PER_REPO = 50;
const RESCAN_INTERVAL_MS = 30_000;

interface FileState {
  /** Byte offset already read. */
  offset: number;
  /** Trailing partial line waiting for a newline. */
  partial: string;
  /** Resolved cwd of this session, used for path resolution. */
  cwd: string;
  /** Session id derived from the file basename (uuid.jsonl -> uuid). */
  sessionId: string;
}

export interface WatcherOpts {
  /** Worktree absolute paths whose JSONL files we should watch. */
  worktreePaths: string[];
  /** Called for every newly extracted ActivityEvent. */
  onEvent: (e: ActivityEvent) => void;
}

/**
 * Tail every active CCD session JSONL for the given worktrees. Per-file
 * byte offsets ensure we only read the new bytes on each `change` event.
 * Re-scans every {@link RESCAN_INTERVAL_MS} so newly active sessions get
 * picked up without the user reloading.
 */
export class ActivityWatcher {
  private watcher: FSWatcher | null = null;
  private states = new Map<string, FileState>();
  private rescanTimer: NodeJS.Timeout | null = null;
  private opts: WatcherOpts;

  constructor(opts: WatcherOpts) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (!existsSync(PROJECTS)) return;
    this.watcher = chokidar.watch([], {
      persistent: true,
      ignoreInitial: true,
    });
    this.watcher.on('change', (path) => void this.onChange(path));
    this.watcher.on('unlink', (path) => this.states.delete(path));
    await this.rescan();
    this.rescanTimer = setInterval(() => void this.rescan(), RESCAN_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.rescanTimer) clearInterval(this.rescanTimer);
    this.rescanTimer = null;
    if (this.watcher) await this.watcher.close();
    this.watcher = null;
    this.states.clear();
  }

  /** Read the *tail* of every currently-watched file (last ~256 KB) and
   *  emit events for what's already there. Useful on startup so the user
   *  sees recent activity instead of an empty feed. */
  async readInitialTails(maxBytes = 256 * 1024): Promise<void> {
    for (const [path, state] of this.states) {
      try {
        const stat = statSync(path);
        const start = Math.max(0, stat.size - maxBytes);
        const fh = await fsOpen(path, 'r');
        try {
          const buf = Buffer.alloc(stat.size - start);
          await fh.read(buf, 0, buf.length, start);
          // Drop any partial first line if start > 0.
          let chunk = buf.toString('utf-8');
          if (start > 0) {
            const i = chunk.indexOf('\n');
            chunk = i >= 0 ? chunk.slice(i + 1) : '';
          }
          this.consumeChunk(state, chunk);
          state.offset = stat.size;
        } finally {
          await fh.close();
        }
      } catch {
        // ignore — file may have been unlinked between scan and read
      }
    }
  }

  private async rescan(): Promise<void> {
    if (!this.watcher) return;
    const now = Date.now();
    const wanted = new Set<string>();
    let watched = 0;
    for (const wt of this.opts.worktreePaths) {
      const dir = join(PROJECTS, encodeProjectKey(resolve(wt)));
      if (!existsSync(dir)) continue;
      const { readdir, stat } = await import('node:fs/promises');
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!name.endsWith('.jsonl')) continue;
        if (watched >= MAX_PER_REPO) break;
        const path = join(dir, name);
        let st;
        try {
          st = await stat(path);
        } catch {
          continue;
        }
        if (now - st.mtimeMs > ACTIVE_THRESHOLD_MS) continue;
        wanted.add(path);
        watched++;
        if (!this.states.has(path)) {
          this.states.set(path, {
            offset: st.size, // start at end — only NEW bytes are surfaced live
            partial: '',
            cwd: wt,
            sessionId: name.replace(/\.jsonl$/, ''),
          });
          this.watcher.add(path);
        }
      }
    }
    // Drop watchers for files no longer wanted.
    for (const path of [...this.states.keys()]) {
      if (!wanted.has(path)) {
        this.states.delete(path);
        this.watcher.unwatch(path);
      }
    }
  }

  private async onChange(path: string): Promise<void> {
    const state = this.states.get(path);
    if (!state) return;
    let st;
    try {
      st = statSync(path);
    } catch {
      return;
    }
    if (st.size <= state.offset) {
      // Truncation / rotation — reset to tail.
      state.offset = st.size;
      state.partial = '';
      return;
    }
    const fh = await fsOpen(path, 'r');
    try {
      const buf = Buffer.alloc(st.size - state.offset);
      await fh.read(buf, 0, buf.length, state.offset);
      state.offset = st.size;
      this.consumeChunk(state, buf.toString('utf-8'));
    } finally {
      await fh.close();
    }
  }

  private consumeChunk(state: FileState, chunk: string): void {
    let buf = state.partial + chunk;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const e = extractActivityEvent(parsed, state.sessionId, state.cwd);
      if (e) this.opts.onEvent(e);
    }
    state.partial = buf;
  }
}
