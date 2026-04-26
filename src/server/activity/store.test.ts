import { describe, expect, it } from 'vitest';
import { ActivityStore } from './store.ts';
import type { ActivityEvent } from '../../shared/types.ts';

function ev(o: Partial<ActivityEvent> & Pick<ActivityEvent, 'sessionId'>): ActivityEvent {
  return {
    cwd: '/repo',
    ts: Date.now(),
    kind: 'edit',
    file: '/repo/x.ts',
    ...o,
  };
}

describe('ActivityStore', () => {
  it('stores a per-session ring buffer capped at the configured size', () => {
    const s = new ActivityStore({ ringSize: 3 });
    for (let i = 0; i < 10; i++) s.add(ev({ sessionId: 'A', ts: i }));
    expect(s.recent('A').map((e) => e.ts)).toEqual([9, 8, 7]);
  });

  it('keeps sessions isolated', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add(ev({ sessionId: 'A', ts: 1 }));
    s.add(ev({ sessionId: 'B', ts: 2 }));
    expect(s.recent('A')).toHaveLength(1);
    expect(s.recent('B')).toHaveLength(1);
  });

  it('indexes recent file touches with the most recent first', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add(ev({ sessionId: 'A', file: '/r/foo.ts', ts: 1 }));
    s.add(ev({ sessionId: 'B', file: '/r/foo.ts', ts: 2 }));
    s.add(ev({ sessionId: 'C', file: '/r/foo.ts', ts: 3 }));
    expect(s.recentTouches('/r/foo.ts').map((t) => t.sessionId)).toEqual(['C', 'B', 'A']);
  });

  it('caps per-file index entries at 5', () => {
    const s = new ActivityStore({ ringSize: 5 });
    for (let i = 0; i < 10; i++) {
      s.add(ev({ sessionId: `S${i}`, file: '/r/foo.ts', ts: i }));
    }
    expect(s.recentTouches('/r/foo.ts')).toHaveLength(5);
  });

  it('flat events list is newest first across all sessions', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add(ev({ sessionId: 'A', ts: 1, file: '/r/a' }));
    s.add(ev({ sessionId: 'B', ts: 2, file: '/r/b' }));
    s.add(ev({ sessionId: 'A', ts: 3, file: '/r/a' }));
    expect(s.events().map((e) => e.ts)).toEqual([3, 2, 1]);
  });

  it('prune drops touches older than the threshold', () => {
    const s = new ActivityStore({ ringSize: 5 });
    const now = 100_000;
    s.add(ev({ sessionId: 'A', ts: now - 10 * 60_000, file: '/r/old' }));
    s.add(ev({ sessionId: 'B', ts: now - 1_000, file: '/r/new' }));
    s.prune(now);
    expect(s.recentTouches('/r/old')).toHaveLength(0);
    expect(s.recentTouches('/r/new')).toHaveLength(1);
  });

  it('events without a file do not enter the file index but ARE in the ring', () => {
    const s = new ActivityStore({ ringSize: 5 });
    s.add({ sessionId: 'A', cwd: '/r', ts: 1, kind: 'bash', label: 'npm test' });
    expect(s.recent('A')).toHaveLength(1);
    expect(s.recentTouches('/r/whatever')).toHaveLength(0);
  });
});
