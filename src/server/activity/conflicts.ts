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

import type { DivergenceConflict } from '../../shared/types.ts';

const OVERLAP_CAP = 20;

/**
 * C3 -- branch divergence detector.
 *
 * Caller hands in a map `branchName -> Set<fileChangedSinceBase>`. We
 * pairwise intersect and emit one DivergenceConflict per branch that
 * overlaps with at least one other.
 *
 * The map is a snapshot computed elsewhere (typically via
 * `git diff --name-only <merge-base>..<tip>`, cached by tip-sha so the
 * cost is paid once per branch tip).
 */
export function detectDivergence(branches: Map<string, Set<string>>): DivergenceConflict[] {
  const names = [...branches.keys()];
  const out = new Map<string, DivergenceConflict>();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      const filesA = branches.get(a)!;
      const filesB = branches.get(b)!;
      const overlap: string[] = [];
      for (const f of filesA) {
        if (filesB.has(f)) {
          overlap.push(f);
          if (overlap.length >= OVERLAP_CAP) break;
        }
      }
      if (overlap.length === 0) continue;

      // Merge into both branches' divergence entries.
      ensure(out, a).siblings.push(b);
      ensure(out, b).siblings.push(a);
      const ea = out.get(a)!;
      const eb = out.get(b)!;
      mergeOverlap(ea.overlap, overlap);
      mergeOverlap(eb.overlap, overlap);
    }
  }
  for (const d of out.values()) {
    d.siblings = [...new Set(d.siblings)].sort();
    d.overlap = [...new Set(d.overlap)].slice(0, OVERLAP_CAP);
  }
  return [...out.values()];
}

function ensure(m: Map<string, DivergenceConflict>, branch: string): DivergenceConflict {
  let d = m.get(branch);
  if (!d) {
    d = { kind: 'divergence', branch, siblings: [], overlap: [] };
    m.set(branch, d);
  }
  return d;
}

function mergeOverlap(into: string[], extra: string[]): void {
  for (const f of extra) {
    if (into.length >= OVERLAP_CAP) return;
    if (!into.includes(f)) into.push(f);
  }
}
