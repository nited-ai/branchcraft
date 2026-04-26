import { describe, expect, it } from 'vitest';
import { detectConcurrent, detectDivergence } from './conflicts.ts';
import { ActivityStore } from './store.ts';
import type { ActivityEvent } from '../../shared/types.ts';

function ev(o: Partial<ActivityEvent> & Pick<ActivityEvent, 'sessionId' | 'ts'>): ActivityEvent {
  return { cwd: '/r', kind: 'edit', file: '/r/foo.ts', ...o };
}

describe('detectConcurrent (C1)', () => {
  it('returns null when no other session has touched the file recently', () => {
    const s = new ActivityStore();
    const e = ev({ sessionId: 'A', ts: 1000 });
    s.add(e);
    expect(detectConcurrent(s, e, { windowMs: 5 * 60_000, now: 1000 })).toBeNull();
  });

  it('emits a conflict when a different session touched the file in the window', () => {
    const s = new ActivityStore();
    const earlier = ev({ sessionId: 'B', ts: 1000 });
    s.add(earlier);
    const later = ev({ sessionId: 'A', ts: 60_000 });
    s.add(later);
    const c = detectConcurrent(s, later, { windowMs: 5 * 60_000, now: 60_000 });
    expect(c).not.toBeNull();
    expect(c?.kind).toBe('concurrent');
    expect(c?.file).toBe('/r/foo.ts');
    expect(c?.sessions.map((x) => x.sessionId).sort()).toEqual(['A', 'B']);
  });

  it('ignores the same session re-touching its own file', () => {
    const s = new ActivityStore();
    const a1 = ev({ sessionId: 'A', ts: 1000 });
    s.add(a1);
    const a2 = ev({ sessionId: 'A', ts: 2000 });
    s.add(a2);
    expect(detectConcurrent(s, a2, { windowMs: 5 * 60_000, now: 2000 })).toBeNull();
  });

  it('ignores prior touches outside the window', () => {
    const s = new ActivityStore();
    s.add(ev({ sessionId: 'B', ts: 0 }));
    const a = ev({ sessionId: 'A', ts: 10 * 60_000 });
    s.add(a);
    expect(detectConcurrent(s, a, { windowMs: 5 * 60_000, now: 10 * 60_000 })).toBeNull();
  });

  it('returns null when the event has no file', () => {
    const s = new ActivityStore();
    const e: ActivityEvent = { sessionId: 'A', cwd: '/r', ts: 1, kind: 'bash', label: 'ls' };
    s.add(e);
    expect(detectConcurrent(s, e, { windowMs: 5 * 60_000, now: 1 })).toBeNull();
  });

  it('aggregates more than two participants', () => {
    const s = new ActivityStore();
    s.add(ev({ sessionId: 'A', ts: 1 }));
    s.add(ev({ sessionId: 'B', ts: 2 }));
    const c3 = ev({ sessionId: 'C', ts: 3 });
    s.add(c3);
    const c = detectConcurrent(s, c3, { windowMs: 5 * 60_000, now: 3 });
    expect(c?.sessions.map((x) => x.sessionId).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('detectDivergence (C3)', () => {
  it('returns no divergence when all branches share zero files since base', () => {
    const branches = new Map<string, Set<string>>([
      ['main', new Set()],
      ['feat/a', new Set()],
    ]);
    expect(detectDivergence(branches)).toEqual([]);
  });

  it('emits divergence for two branches that share one file', () => {
    const branches = new Map<string, Set<string>>([
      ['feat/a', new Set(['src/foo.ts'])],
      ['feat/b', new Set(['src/foo.ts'])],
    ]);
    const out = detectDivergence(branches);
    expect(out).toHaveLength(2);
    const a = out.find((d) => d.branch === 'feat/a')!;
    expect(a.siblings).toEqual(['feat/b']);
    expect(a.overlap).toEqual(['src/foo.ts']);
  });

  it('caps overlap to 20 file paths', () => {
    const files = new Set<string>();
    for (let i = 0; i < 50; i++) files.add(`src/${i}.ts`);
    const branches = new Map<string, Set<string>>([
      ['a', files],
      ['b', files],
    ]);
    const out = detectDivergence(branches);
    expect(out[0]?.overlap.length).toBe(20);
  });

  it('lists multiple siblings for a branch with multiple overlaps', () => {
    const branches = new Map<string, Set<string>>([
      ['a', new Set(['x.ts'])],
      ['b', new Set(['x.ts'])],
      ['c', new Set(['x.ts'])],
    ]);
    const a = detectDivergence(branches).find((d) => d.branch === 'a')!;
    expect(a.siblings.sort()).toEqual(['b', 'c']);
  });
});
