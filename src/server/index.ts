import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { basename, dirname, resolve } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { isGitRepo, listWorktrees } from './git/worktrees.ts';
import { gitLog } from './git/log.ts';
import { assignLanes } from './git/layout.ts';
import { getWorktreeStatus } from './git/status.ts';
import {
  Simulator,
  buildSimState,
  simStateToCommits,
} from './git/simulate.ts';
import { applyCommands } from './git/apply.ts';
import { listReflog, listStash, listTags } from './git/rucksacks.ts';
import { getOrCreateActivityManager } from './activity/index.ts';
import { detectDivergence } from './activity/conflicts.ts';
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
  ApiApplyResponse,
  ApiGraph,
  ApiHealth,
  ApiRepoSummary,
  ApiRepos,
  ApiRucksacks,
  ApiSimulateRequest,
  ApiWorktrees,
  Command,
  DivergenceConflict,
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

async function gitDiffNamesSinceBase(
  repoPath: string,
  branch: string,
  base: string,
): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', `${base}...${branch}`], {
      cwd: repoPath,
      maxBuffer: 16 * 1024 * 1024,
    });
    return new Set(stdout.split(/\r?\n/).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function computeDivergence(repoPath: string): Promise<DivergenceConflict[]> {
  // Use the repo's default branch (HEAD-of-origin/HEAD) as the merge-base
  // anchor. If origin/HEAD isn't set, fall back to "main"; if that fails
  // too, skip divergence entirely.
  let base = '';
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd: repoPath,
    });
    base = stdout.trim();
  } catch {
    base = 'main';
  }
  let branchList = '';
  try {
    const { stdout } = await execFileAsync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
      cwd: repoPath,
      maxBuffer: 8 * 1024 * 1024,
    });
    branchList = stdout;
  } catch {
    return [];
  }
  const branches = branchList.split(/\r?\n/).filter(Boolean);
  const map = new Map<string, Set<string>>();
  for (const b of branches) {
    if (b === base) continue;
    map.set(b, await gitDiffNamesSinceBase(repoPath, b, base));
  }
  return detectDivergence(map);
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
  const [enriched, divergence] = await Promise.all([
    enrichWorktrees(repo.path),
    computeDivergence(repo.path),
  ]);
  const body: ApiWorktrees = { repoPath: repo.path, worktrees: enriched, divergence };
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

function isCommand(x: unknown): x is Command {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    o.kind === 'merge' ||
    o.kind === 'rebase' ||
    o.kind === 'cherry-pick' ||
    o.kind === 'reset' ||
    o.kind === 'push'
  );
}

app.post('/api/repos/:id/simulate', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  const body = (await c.req.json().catch(() => null)) as
    | ApiSimulateRequest
    | null;
  if (!body || !Array.isArray(body.commands) || !body.commands.every(isCommand)) {
    return c.json({ error: 'invalid_commands' }, 400);
  }
  const limit = 200;
  const raw = await gitLog(repo.path, { limit });
  const initial = buildSimState(raw);
  const sim = new Simulator({ seed: 'preview' });
  const after = sim.applyAll(initial, body.commands);
  const projected = simStateToCommits(after);
  const { commits, laneCount } = assignLanes(projected);
  const out: ApiGraph = { repoPath: repo.path, laneCount, commits };
  return c.json(out);
});

app.get('/api/repos/:id/rucksacks', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  if (!(await isGitRepo(repo.path))) {
    return c.json({ error: 'not_a_git_repo', path: repo.path }, 400);
  }
  const [stash, tags, reflog] = await Promise.all([
    listStash(repo.path),
    listTags(repo.path),
    listReflog(repo.path, { limit: 100 }),
  ]);
  const body: ApiRucksacks = { stash, tags, reflog };
  return c.json(body);
});

app.get('/api/repos/:id/activity', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  if (!(await isGitRepo(repo.path))) {
    return c.json({ error: 'not_a_git_repo', path: repo.path }, 400);
  }
  const worktrees = await listWorktrees(repo.path);
  const mgr = getOrCreateActivityManager({
    repoId: repo.id,
    worktreePaths: worktrees.map((w) => w.path),
  });
  return c.json(mgr.snapshot());
});

app.get('/api/repos/:id/activity/stream', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  if (!(await isGitRepo(repo.path))) {
    return c.json({ error: 'not_a_git_repo', path: repo.path }, 400);
  }
  const worktrees = await listWorktrees(repo.path);
  const mgr = getOrCreateActivityManager({
    repoId: repo.id,
    worktreePaths: worktrees.map((w) => w.path),
  });

  const heartbeatSec = Number(process.env.BRANCHCRAFT_SSE_HEARTBEAT_SEC ?? 20);

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('snapshot', mgr.snapshot());
      const unsub = mgr.bus.subscribe(repo.id, (msg) => {
        if (msg.kind === 'event') send('activity', msg.event);
        else if (msg.kind === 'conflict') send('conflict', msg.conflict);
        else if (msg.kind === 'snapshot') send('snapshot', msg.snapshot);
      });
      const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), heartbeatSec * 1000);
      // Hono closes the stream when the request is aborted; clean up here.
      const close = () => {
        clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      c.req.raw.signal.addEventListener('abort', close);
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  });
});

app.post('/api/repos/:id/apply', async (c) => {
  const repo = findRepoById(c.req.param('id'));
  if (!repo) return c.json({ error: 'repo_not_found' }, 404);
  const body = (await c.req.json().catch(() => null)) as
    | ApiSimulateRequest
    | null;
  if (!body || !Array.isArray(body.commands) || !body.commands.every(isCommand)) {
    return c.json({ error: 'invalid_commands' }, 400);
  }
  const results = await applyCommands(body.commands, { repoPath: repo.path });
  const out: ApiApplyResponse = {
    results,
    allSucceeded: results.every((r) => r.ok),
  };
  return c.json(out);
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
