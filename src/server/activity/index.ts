import type { ActivityEvent, ActivitySnapshot } from '../../shared/types.ts';
import { detectConcurrent } from './conflicts.ts';
import { ActivityBus } from './bus.ts';
import { ActivityStore } from './store.ts';
import { ActivityWatcher } from './watcher.ts';

export interface ActivityManagerOpts {
  repoId: string;
  worktreePaths: string[];
  /** Window for C1, defaults to 5 min. */
  concurrentWindowMs?: number;
}

/**
 * Per-repo wiring of watcher + store + conflict detection + bus. One
 * manager instance per active repo. Lifecycle: `start()` → live →
 * `stop()`.
 */
export class ActivityManager {
  readonly bus = new ActivityBus();
  private readonly store = new ActivityStore();
  private readonly watcher: ActivityWatcher;
  private readonly opts: ActivityManagerOpts;
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(opts: ActivityManagerOpts) {
    this.opts = opts;
    this.watcher = new ActivityWatcher({
      worktreePaths: opts.worktreePaths,
      onEvent: (e) => this.onEvent(e),
    });
  }

  async start(): Promise<void> {
    await this.watcher.start();
    await this.watcher.readInitialTails();
    this.pruneTimer = setInterval(() => this.store.prune(Date.now()), 60_000);
  }

  async stop(): Promise<void> {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    await this.watcher.stop();
  }

  snapshot(): ActivitySnapshot {
    return {
      events: this.store.events(200),
      concurrent: [], // Snapshot reflects steady-state; live conflicts go via bus.
      divergence: [], // C3 is attached to /api/repos/:id/worktrees by enrichWorktrees.
    };
  }

  private onEvent(event: ActivityEvent): void {
    this.store.add(event);
    this.bus.publish(this.opts.repoId, { kind: 'event', event });
    const conflict = detectConcurrent(this.store, event, {
      windowMs: this.opts.concurrentWindowMs ?? 5 * 60_000,
      now: Date.now(),
    });
    if (conflict) {
      this.bus.publish(this.opts.repoId, { kind: 'conflict', conflict });
    }
  }
}

/** Singleton-per-repo registry. */
const managers = new Map<string, ActivityManager>();

export function getOrCreateActivityManager(opts: ActivityManagerOpts): ActivityManager {
  const existing = managers.get(opts.repoId);
  if (existing) return existing;
  const m = new ActivityManager(opts);
  managers.set(opts.repoId, m);
  void m.start();
  return m;
}

export function shutdownAllActivityManagers(): Promise<void> {
  return Promise.all([...managers.values()].map((m) => m.stop())).then(() => {
    managers.clear();
  }) as unknown as Promise<void>;
}
