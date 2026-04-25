import type { Session } from '../../shared/types.ts';

/**
 * Plugin interface for AI session providers (PLAN.md §7.4).
 *
 * Each provider knows where its tool stores session data on disk and how to
 * decode that into normalized {@link Session} records. Providers are queried
 * in parallel by the registry; one slow provider can't stall the others.
 */
export interface SessionProvider {
  id: Session['provider'];
  displayName: string;
  /**
   * Scan all sessions associated with `worktreePaths`. Each returned session
   * has `cwd` set to the worktree path that produced it so callers can group
   * sessions back to their worktree.
   *
   * Implementations MUST NOT throw — return [] on any error.
   */
  scanSessions(worktreePaths: string[]): Promise<Session[]>;
}
