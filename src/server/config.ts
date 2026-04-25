import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface PinnedRepo {
  id: string;
  path: string;
  /** Unix seconds when first pinned. */
  addedAt: number;
}

export interface BranchcraftConfig {
  pinnedRepos: PinnedRepo[];
}

const DEFAULT: BranchcraftConfig = { pinnedRepos: [] };

/**
 * Stable 16-char id from the absolute repo path. Truncated SHA-1 is more
 * than enough to disambiguate the handful of repos a developer pins.
 */
export function repoIdFromPath(path: string): string {
  return createHash('sha1').update(resolve(path)).digest('hex').slice(0, 16);
}

export function configDir(): string {
  return process.env.BRANCHCRAFT_HOME ?? join(homedir(), '.branchcraft');
}
export function configFile(): string {
  return join(configDir(), 'config.json');
}

export function loadConfig(): BranchcraftConfig {
  const file = configFile();
  if (!existsSync(file)) return { pinnedRepos: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<BranchcraftConfig>;
    return {
      pinnedRepos: Array.isArray(parsed.pinnedRepos)
        ? parsed.pinnedRepos.filter(
            (r): r is PinnedRepo =>
              typeof r === 'object' &&
              r !== null &&
              typeof (r as PinnedRepo).id === 'string' &&
              typeof (r as PinnedRepo).path === 'string',
          )
        : [],
    };
  } catch {
    // Malformed config — start fresh rather than crashing the server.
    return { pinnedRepos: [] };
  }
}

export function saveConfig(cfg: BranchcraftConfig): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configFile(), JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

/**
 * Pin a repo. Idempotent — a repo with the same absolute path returns the
 * existing entry rather than creating a duplicate.
 */
export function addRepo(path: string): PinnedRepo {
  const cfg = loadConfig();
  const absolute = resolve(path);
  const id = repoIdFromPath(absolute);
  const existing = cfg.pinnedRepos.find((r) => r.id === id);
  if (existing) return existing;
  const repo: PinnedRepo = {
    id,
    path: absolute,
    addedAt: Math.floor(Date.now() / 1000),
  };
  cfg.pinnedRepos.push(repo);
  saveConfig(cfg);
  return repo;
}

export function removeRepo(id: string): boolean {
  const cfg = loadConfig();
  const before = cfg.pinnedRepos.length;
  const next = cfg.pinnedRepos.filter((r) => r.id !== id);
  if (next.length === before) return false;
  saveConfig({ ...cfg, pinnedRepos: next });
  return true;
}

export function findRepoById(id: string): PinnedRepo | null {
  return loadConfig().pinnedRepos.find((r) => r.id === id) ?? null;
}

/** Mark `_DEFAULT` referenced so the unused-export linter is happy. */
export const _DEFAULT = DEFAULT;
