import type { ActivityEvent, ConcurrentConflict } from '../../shared/types.ts';
import type { ActivityStore } from './store.ts';

export interface DetectOpts {
  /** Window in ms -- touches older than this don't count as concurrent. */
  windowMs: number;
  /** "Now" reference for window calculation. Injected for deterministic tests. */
  now: number;
}

/**
 * C1 -- same-file concurrent edit detector.
 *
 * Inspect the per-file touch index after a new event has been recorded.
 * If at least one DIFFERENT session has touched the same file within
 * `windowMs`, emit a {@link ConcurrentConflict}. Otherwise null.
 *
 * Pure aside from reading the store; designed to run on the same code path
 * that records the event so warnings fire immediately.
 */
export function detectConcurrent(
  store: ActivityStore,
  event: ActivityEvent,
  opts: DetectOpts,
): ConcurrentConflict | null {
  if (!event.file) return null;
  const all = store.recentTouches(event.file);
  const inWindow = all.filter((t) => opts.now - t.ts <= opts.windowMs);
  const distinctSessions = new Set(inWindow.map((t) => t.sessionId));
  // Only a conflict when there's at least one OTHER session in the window.
  const others = [...distinctSessions].filter((s) => s !== event.sessionId);
  if (others.length === 0) return null;
  // Keep newest-first, dedup by session (latest ts per session).
  const latestPerSession = new Map<string, number>();
  for (const t of inWindow) {
    const cur = latestPerSession.get(t.sessionId) ?? 0;
    if (t.ts > cur) latestPerSession.set(t.sessionId, t.ts);
  }
  const sessions = [...latestPerSession.entries()]
    .map(([sessionId, ts]) => ({ sessionId, ts }))
    .sort((a, b) => b.ts - a.ts);
  return { kind: 'concurrent', file: event.file, sessions };
}
