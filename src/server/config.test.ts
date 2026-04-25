import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addRepo,
  configFile,
  loadConfig,
  removeRepo,
  repoIdFromPath,
  saveConfig,
} from './config.ts';

describe('config', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'branchcraft-cfg-'));
    process.env.BRANCHCRAFT_HOME = tmp;
  });
  afterEach(() => {
    delete process.env.BRANCHCRAFT_HOME;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('repoIdFromPath is stable and path-sensitive', () => {
    expect(repoIdFromPath('/a/b')).toBe(repoIdFromPath('/a/b'));
    expect(repoIdFromPath('/a/b')).not.toBe(repoIdFromPath('/a/c'));
    // Length: 16-char hex prefix.
    expect(repoIdFromPath('/x')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('loadConfig returns empty defaults when no file exists', () => {
    expect(loadConfig()).toEqual({ pinnedRepos: [] });
  });

  it('addRepo persists across loads', () => {
    const repo = addRepo('/some/repo');
    expect(loadConfig().pinnedRepos[0]?.id).toBe(repo.id);
    expect(loadConfig().pinnedRepos[0]?.path).toBe(repo.path);
  });

  it('addRepo is idempotent for the same absolute path', () => {
    const r1 = addRepo('/x');
    const r2 = addRepo('/x');
    expect(r1.id).toBe(r2.id);
    expect(r1.addedAt).toBe(r2.addedAt);
    expect(loadConfig().pinnedRepos).toHaveLength(1);
  });

  it('removeRepo removes by id and is no-op for unknown ids', () => {
    const r = addRepo('/x');
    expect(removeRepo(r.id)).toBe(true);
    expect(loadConfig().pinnedRepos).toEqual([]);
    expect(removeRepo(r.id)).toBe(false);
    expect(removeRepo('definitely-not-an-id')).toBe(false);
  });

  it('loadConfig recovers from a malformed file', () => {
    saveConfig({ pinnedRepos: [{ id: 'a', path: '/x', addedAt: 0 }] });
    writeFileSync(configFile(), 'this is not JSON', 'utf-8');
    expect(loadConfig().pinnedRepos).toEqual([]);
  });

  it('loadConfig drops malformed entries instead of crashing', () => {
    writeFileSync(
      configFile(),
      JSON.stringify({
        pinnedRepos: [
          { id: 'good', path: '/p', addedAt: 0 },
          { id: 123, path: '/p2' }, // wrong types
          'string-junk',
          null,
        ],
      }),
      'utf-8',
    );
    const cfg = loadConfig();
    expect(cfg.pinnedRepos).toHaveLength(1);
    expect(cfg.pinnedRepos[0]?.id).toBe('good');
  });
});
