import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { resolve } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { isGitRepo, listWorktrees } from './git/worktrees.ts';
import { gitLog } from './git/log.ts';
import { assignLanes } from './git/layout.ts';
import type { ApiGraph, ApiHealth, ApiWorktrees } from '../shared/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BRANCHCRAFT_PORT ?? 7777);

// Resolve the repo we're serving. Priority:
// 1. BRANCHCRAFT_INVOKED_FROM (set by bin/branchcraft.js)
// 2. process.cwd() (when running via `npm run dev` from the repo itself)
const repoPath = resolve(process.env.BRANCHCRAFT_INVOKED_FROM ?? process.cwd());

const pkgVersion = (() => {
  try {
    const pkgPath = resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
})();

const app = new Hono();

app.use('/api/*', cors());

app.get('/api/health', async (c) => {
  const isRepo = await isGitRepo(repoPath);
  const body: ApiHealth = {
    ok: true,
    version: pkgVersion,
    cwd: repoPath,
    isGitRepo: isRepo,
  };
  return c.json(body);
});

app.get('/api/worktrees', async (c) => {
  if (!(await isGitRepo(repoPath))) {
    return c.json({ error: 'not_a_git_repo', cwd: repoPath }, 400);
  }
  const worktrees = await listWorktrees(repoPath);
  const body: ApiWorktrees = { repoPath, worktrees };
  return c.json(body);
});

app.get('/api/graph', async (c) => {
  if (!(await isGitRepo(repoPath))) {
    return c.json({ error: 'not_a_git_repo', cwd: repoPath }, 400);
  }
  const limitParam = c.req.query('limit');
  const limit = limitParam ? Math.min(2000, Math.max(1, Number(limitParam))) : 200;
  const raw = await gitLog(repoPath, { limit });
  const { commits, laneCount } = assignLanes(raw);
  const body: ApiGraph = { repoPath, laneCount, commits };
  return c.json(body);
});

// Serve built frontend in production (when dist/web exists).
const distWebDir = resolve(__dirname, '../web');
if (existsSync(distWebDir) && statSync(distWebDir).isDirectory()) {
  // Lazy import so dev doesn't load this branch.
  const { serveStatic } = await import('@hono/node-server/serve-static');
  app.use('/*', serveStatic({ root: distWebDir }));
  app.get('*', serveStatic({ path: `${distWebDir}/index.html` }));
}

console.log(`[branchcraft] starting on http://localhost:${PORT}`);
console.log(`[branchcraft] repo: ${repoPath}`);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[branchcraft] listening on :${info.port}`);
});
