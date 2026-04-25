import type { Session } from '../../shared/types.ts';
import { aiderProvider } from './aider.ts';
import { claudeCodeProvider } from './claude-code.ts';
import type { SessionProvider } from './types.ts';

/**
 * Registry of available session providers. Adding a new provider is just
 * implementing {@link SessionProvider} and pushing it here — no core changes.
 */
export const providers: SessionProvider[] = [claudeCodeProvider, aiderProvider];

/** Scan every registered provider in parallel and flatten the results. */
export async function scanAllSessions(worktreePaths: string[]): Promise<Session[]> {
  const results = await Promise.all(
    providers.map((p) => p.scanSessions(worktreePaths).catch(() => [] as Session[])),
  );
  return results.flat();
}

export type { SessionProvider } from './types.ts';
