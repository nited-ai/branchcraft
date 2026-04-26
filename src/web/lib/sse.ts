import type { ActivityEvent, ActivitySnapshot, ConcurrentConflict, DivergenceConflict } from '../../shared/types.ts';

export interface ActivityHandlers {
  onSnapshot: (s: ActivitySnapshot) => void;
  onActivity: (e: ActivityEvent) => void;
  onConflict: (c: ConcurrentConflict | DivergenceConflict) => void;
}

/**
 * Subscribe to a repo's activity stream. Wraps EventSource with auto-
 * reconnect on transport errors and exponential backoff up to 30 s. The
 * returned function closes the connection AND prevents reconnects.
 */
export function subscribeActivity(repoId: string, handlers: ActivityHandlers): () => void {
  let es: EventSource | null = null;
  let backoffMs = 500;
  let stopped = false;

  function open() {
    if (stopped) return;
    es = new EventSource(`/api/repos/${repoId}/activity/stream`);
    es.addEventListener('snapshot', (ev) => {
      try {
        handlers.onSnapshot(JSON.parse((ev as MessageEvent).data));
        backoffMs = 500; // reset on successful receive
      } catch {
        // ignore malformed
      }
    });
    es.addEventListener('activity', (ev) => {
      try {
        handlers.onActivity(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore
      }
    });
    es.addEventListener('conflict', (ev) => {
      try {
        handlers.onConflict(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore
      }
    });
    es.addEventListener('heartbeat', () => {
      backoffMs = 500;
    });
    es.onerror = () => {
      es?.close();
      es = null;
      if (stopped) return;
      const delay = Math.min(backoffMs, 30_000);
      backoffMs = Math.min(backoffMs * 2, 30_000);
      setTimeout(open, delay);
    };
  }

  open();
  return () => {
    stopped = true;
    es?.close();
    es = null;
  };
}
