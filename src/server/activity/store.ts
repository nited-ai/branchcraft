import type { ActivityEvent } from '../../shared/types.ts';

interface StoreOpts {
  ringSize?: number;
  /** ms — file-index entries older than this are pruned. */
  fileIndexMaxAgeMs?: number;
  /** Max entries kept per file in the index. */
  fileIndexMaxPerFile?: number;
}

export interface RecentTouch {
  sessionId: string;
  ts: number;
}

export class ActivityStore {
  private readonly ringSize: number;
  private readonly fileIndexMaxAgeMs: number;
  private readonly fileIndexMaxPerFile: number;

  /** Per-session ring buffer, newest first. */
  private rings = new Map<string, ActivityEvent[]>();
  /** Per-file recent touches, newest first. */
  private fileTouches = new Map<string, RecentTouch[]>();

  constructor(opts: StoreOpts = {}) {
    this.ringSize = opts.ringSize ?? 50;
    this.fileIndexMaxAgeMs = opts.fileIndexMaxAgeMs ?? 5 * 60_000;
    this.fileIndexMaxPerFile = opts.fileIndexMaxPerFile ?? 5;
  }

  add(event: ActivityEvent): void {
    const ring = this.rings.get(event.sessionId) ?? [];
    ring.unshift(event);
    if (ring.length > this.ringSize) ring.length = this.ringSize;
    this.rings.set(event.sessionId, ring);

    if (event.file) {
      const list = this.fileTouches.get(event.file) ?? [];
      list.unshift({ sessionId: event.sessionId, ts: event.ts });
      if (list.length > this.fileIndexMaxPerFile) list.length = this.fileIndexMaxPerFile;
      this.fileTouches.set(event.file, list);
    }
  }

  /** Newest-first ring buffer for a session. */
  recent(sessionId: string): ActivityEvent[] {
    return [...(this.rings.get(sessionId) ?? [])];
  }

  /** Newest-first per-file touches. */
  recentTouches(file: string): RecentTouch[] {
    return [...(this.fileTouches.get(file) ?? [])];
  }

  /** Flat newest-first stream across all sessions, capped at `cap`. */
  events(cap = 200): ActivityEvent[] {
    const merged: ActivityEvent[] = [];
    for (const ring of this.rings.values()) merged.push(...ring);
    merged.sort((a, b) => b.ts - a.ts);
    if (merged.length > cap) merged.length = cap;
    return merged;
  }

  /** Drop file-index entries older than fileIndexMaxAgeMs from `now`. */
  prune(now: number): void {
    for (const [file, list] of this.fileTouches) {
      const fresh = list.filter((t) => now - t.ts < this.fileIndexMaxAgeMs);
      if (fresh.length === 0) this.fileTouches.delete(file);
      else if (fresh.length !== list.length) this.fileTouches.set(file, fresh);
    }
  }
}
