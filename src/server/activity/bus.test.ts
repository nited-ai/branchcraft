import { describe, expect, it, vi } from 'vitest';
import { ActivityBus, type BusMessage } from './bus.ts';

describe('ActivityBus', () => {
  it('delivers to subscribers of the same channel', () => {
    const bus = new ActivityBus();
    const fn = vi.fn();
    const unsub = bus.subscribe('repoA', fn);
    bus.publish('repoA', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } });
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does not deliver across channels', () => {
    const bus = new ActivityBus();
    const a = vi.fn();
    bus.subscribe('repoA', a);
    bus.publish('repoB', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } });
    expect(a).not.toHaveBeenCalled();
  });

  it('unsubscribe stops delivery', () => {
    const bus = new ActivityBus();
    const a = vi.fn();
    const unsub = bus.subscribe('repoA', a);
    unsub();
    bus.publish('repoA', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } });
    expect(a).not.toHaveBeenCalled();
  });

  it('throws no-op if a subscriber dies — delivers to others', () => {
    const bus = new ActivityBus();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.subscribe('repoA', bad);
    bus.subscribe('repoA', good);
    expect(() =>
      bus.publish('repoA', { kind: 'event', event: { sessionId: 's', cwd: '/r', ts: 1, kind: 'edit' } }),
    ).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
