import type { ActivityEvent, ActivitySnapshot, ConcurrentConflict, DivergenceConflict } from '../../shared/types.ts';

export type BusMessage =
  | { kind: 'event'; event: ActivityEvent }
  | { kind: 'conflict'; conflict: ConcurrentConflict | DivergenceConflict }
  | { kind: 'snapshot'; snapshot: ActivitySnapshot };

type Subscriber = (msg: BusMessage) => void;

export class ActivityBus {
  private channels = new Map<string, Set<Subscriber>>();

  subscribe(repoId: string, fn: Subscriber): () => void {
    const set = this.channels.get(repoId) ?? new Set();
    set.add(fn);
    this.channels.set(repoId, set);
    return () => set.delete(fn);
  }

  publish(repoId: string, msg: BusMessage): void {
    const set = this.channels.get(repoId);
    if (!set) return;
    // Snapshot the subscribers so unsubscribe-during-iteration is safe.
    for (const fn of [...set]) {
      try {
        fn(msg);
      } catch {
        // A subscriber crashing must NOT stop delivery to siblings.
      }
    }
  }
}
