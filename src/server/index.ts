import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { basename, dirname, resolve } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isGitRepo, listWorktrees } from './git/worktrees.ts';
import { gitLog } from './git/log.ts';
import { assignLanes } from './git/layout.ts';
import { getWorktreeStatus } from './git/status.ts';
import {
  addRepo as cfgAddRepo,
  findRepoById,
  loadConfig,
  removeRepo as cfgRemoveRepo,
  repoIdFromPath,
} from './config.ts';
import { scanAllSessions } from './sessions/index.ts';
import type {
  ApiAddRepoRequest,
  ApiGraph,
  ApiHealth,
  ApiRepoSummary,
  ApiRepos,
  ApiWorktrees,
  RepoStatusKind,
  Worktree,
  WorktreeStatus,
} from '../shared/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BRANCHCRAFT_PORT ?? 7777);

// Server's startup cwd. Used for auto-bootstrap: if the user runs
// `npx branchcraft` in a git repo and has no pinned repos yet, we pin this
// one automatically so they get a usable view on first paint.
const cwd = resolve(process.env.BRANCHCRAFT_INVOKED_FROM ?? process.cwd());
const cwdId = repoIdFromPath(cwd);

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

// ── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', async (c) => {
  const isRepo = await isGitRepo(cwd);
  const body: ApiHealth = {
    ok: true,
    version: pkgVersion,
    cwd,
    isGitRepo: isRepo,
  };
  return c.json(body);
});

// ── Repo hub ─────────────────────────────────────────────────────────────────

function aggregateStatus(worktrees: Worktree[]): {
  status: RepoStatusKind;
  staleCount: number;
  dirtyCount: number;
} {
  let staleCount = 0;
  let dirtyCount = 0;
  let knownAny = false;
  for (const wt of worktrees) {
    if (!wt.status) continue;
    knownAny = true;
    if (wt.status.behind > 0) staleCount++;
    if (wt.status.dirtyFiles > 0) dirtyCount++;
  }
  if (!knownAny) return { status: 'unknown', staleCount: 0, dirtyCount: 0 };
  if (staleCount > 0) return { status: 'stale', staleCount, dirtyCount };
  if (dirtyCount > 0) return { status: 'dirty', staleCount, dirtyCount };
  return { status: 'clean', staleCount, dirtyCount };
}

async function enrichWorktrees(repoPath: string): Promise<Worktree[]> {
  const worktrees = await listWorktrees(repoPath);
  const sessions = await scanAllSessions(worktrees.map((w) => w.path));
  const sessionsByCwd = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = sessionsByCwd.get(s.cwd) ?? [];
    arr.push(s);
    sessionsByCwd.set(s.cwd, arr);
  }
  return Promise.all(
    worktrees.map(async (wt): Promise<Worktree> => {
      const sess = (sessionsByCwd.get(wt.path) ?? []).slice().sort(
        (a, b) => b.lastActivity - a.lastActivity,
      );
      if (wt.isPrunable) return { ...wt, sessions: sess };
      const status: WorktreeStatus = await getWorktreeStatus(wt.path);
      return { ...wt, status, sessions: sess };
    }),
  );
}

async function summarize(
  id: string,
  path: string,
): Promise<ApiRepoSummary> {
  const valid = await isGitRepo(path);
  if (!valid) {
    return {
      id,
      path,
      name: basename(path) || path,
      worktreeCount: 0,
      status: 'unknown',
      staleCount: 0,
      dirtyCount: 0,
      isCurrent: id === cwdId,
    };
  }
  const enriched = await enrichWorktrees(path);
  const agg = aggregateStatus(enriched);
  return {
    id,
    path,
    name: basename(path) || path,
    worktreeCount: enriched.length,
    status: agg.status,
    staleCount: agg.staleCount,
    dirtyCount: agg.dirtyCount,
    isCurrent: id === cwdId,
  };
}

app.get('/api/repos', async (c) => {
  const cfg = loadConfig();
  // Auto-bootstrap: if no repos pinned and cwd is a git repo, pin it now so
  // first paint lands on a real graph instead of an empty hub.
  if (cfg.pinnedRepos.length === 0 && (await isGitRepo(cwd))) {
    cfgAddRepo(cwd);
  }
  const fresh = loadConfig();
  const summaries = await Promise.all(
    fresh.pinnedRepos.map((r) => summarize(r.id, r.path)),
  );
  const currentId = summaries.find((s) => s.isCurrent)?.id ?? null;
  const body: ApiRepos = { cwd, currentId, repos: summaries };
  return c.json(body);
});

app.post('/api/repos', async (c) => {
  const body = (await c.req.json().catch(() => null)) as ApiAddRepoRequest | null;
  if (!body || typeof body.path !== 'string' || !body.path.trim()) {
    return c.json({ error: 'missing_path' }, 400);
  }
  const path = resolve(body.path);
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    return c.json({ error: 'not_a_directory', path }, 400);
  }
  if (!(await isGitRepo(path))) {
    return c.json({ error: 'not_a_git_repo', path }, 400);
  }
  const repo = cfgAddRepo(path);
  const summary = await summarize(repo.id, repo.path);
  return c.json(summary, 201);
});

app.delete('/api/repos/:id', (c) => {
  const id = c.req.param('id');
  const removed = cfgRemoveRepo(id);
  if (!removed) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ── Per-repo data ────────────────────────────────────────────────────────────

app.get('/api/repos/:id/worktrees', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  if (!(await isGitRepo(repo.path))) {
    return c.json({ error: 'not_a_git_repo', path: repo.path }, 400);
  }
  const enriched = await enrichWorktrees(repo.path);
  const body: ApiWorktrees = { repoPath: repo.path, worktrees: enriched };
  return c.json(body);
});

app.get('/api/repos/:id/graph', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  if (!(await isGitRepo(repo.path))) {
    return c.json({ error: 'not_a_git_repo', path: repo.path }, 400);
  }
  const limitParam = c.req.query('limit');
  const limit = limitParam
    ? Math.min(2000, Math.max(1, Number(limitParam)))
    : 200;
  const raw = await gitLog(repo.path, { limit });
  const { commits, laneCount } = assignLanes(raw);
  const body: ApiGraph = { repoPath: repo.path, laneCount, commits };
  return c.json(body);
});

// ── Static frontend (production builds only) ─────────────────────────────────

const distWebDir = resolve(__dirname, '../web');
const distIndex = resolve(distWebDir, 'index.html');
const distAssets = resolve(distWebDir, 'assets');
if (
  existsSync(distIndex) &&
  existsSync(distAssets) &&
  statSync(distAssets).isDirectory()
) {
  const { serveStatic } = await import('@hono/node-server/serve-static');
  app.use('/*', serveStatic({ root: distWebDir }));
  app.get('*', serveStatic({ path: `${distWebDir}/index.html` }));
}

console.log(`[branchcraft] starting on http://localhost:${PORT}`);
console.log(`[branchcraft] cwd: ${cwd}`);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[branchcraft] listening on :${info.port}`);
});
