<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    ApiHealth,
    ApiWorktrees,
    ApiGraph,
    ApiRepos,
    ApiRepoSummary,
    Worktree,
    LaidOutCommit,
  } from '../shared/types.ts';
  import Graph from './Graph.svelte';
  import RepoSidebar from './RepoSidebar.svelte';
  import AddRepoModal from './AddRepoModal.svelte';

  type Theme = 'dark' | 'light';

  let health = $state<ApiHealth | null>(null);
  let repos = $state<ApiRepoSummary[]>([]);
  let activeRepoId = $state<string | null>(null);
  let activeRepoPath = $state<string | null>(null);
  let worktrees = $state<Worktree[]>([]);
  let graphCommits = $state<LaidOutCommit[]>([]);
  let laneCount = $state(0);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let theme = $state<Theme>('dark');
  let modalOpen = $state(false);

  function urlRepoId(): string | null {
    return new URL(location.href).searchParams.get('repo');
  }

  function setUrlRepoId(id: string | null) {
    const url = new URL(location.href);
    if (id) {
      url.searchParams.set('repo', id);
    } else {
      url.searchParams.delete('repo');
    }
    history.replaceState({}, '', url);
  }

  async function refreshRepos(): Promise<ApiRepos> {
    const res = await fetch('/api/repos');
    if (!res.ok) throw new Error(`/api/repos ${res.status}`);
    const body = (await res.json()) as ApiRepos;
    repos = body.repos;
    return body;
  }

  async function loadActiveRepo() {
    if (!activeRepoId) {
      worktrees = [];
      graphCommits = [];
      laneCount = 0;
      activeRepoPath = null;
      return;
    }
    const id = activeRepoId;
    const [wtRes, gRes] = await Promise.all([
      fetch(`/api/repos/${id}/worktrees`).then(async (r) => {
        if (!r.ok) {
          const e = (await r.json()) as { error: string };
          throw new Error(e.error);
        }
        return r.json() as Promise<ApiWorktrees>;
      }),
      fetch(`/api/repos/${id}/graph`).then(async (r) => {
        if (!r.ok) {
          const e = (await r.json()) as { error: string };
          throw new Error(e.error);
        }
        return r.json() as Promise<ApiGraph>;
      }),
    ]);
    worktrees = wtRes.worktrees;
    graphCommits = gRes.commits;
    laneCount = gRes.laneCount;
    activeRepoPath = wtRes.repoPath;
  }

  function switchRepo(id: string) {
    if (id === activeRepoId) return;
    activeRepoId = id;
    setUrlRepoId(id);
    loading = true;
    error = null;
    loadActiveRepo()
      .catch((e) => {
        error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        loading = false;
      });
  }

  function onRepoAdded(summary: ApiRepoSummary) {
    if (!repos.some((r) => r.id === summary.id)) {
      repos = [...repos, summary];
    }
    switchRepo(summary.id);
  }

  onMount(async () => {
    const saved = localStorage.getItem('branchcraft.theme');
    if (saved === 'dark' || saved === 'light') {
      theme = saved;
    } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }

    try {
      const [healthRes, reposRes] = await Promise.all([
        fetch('/api/health').then((r) => r.json() as Promise<ApiHealth>),
        refreshRepos(),
      ]);
      health = healthRes;
      const fromUrl = urlRepoId();
      const fromUrlMatches = fromUrl
        ? reposRes.repos.find((r) => r.id === fromUrl)
        : null;
      activeRepoId = fromUrlMatches
        ? fromUrlMatches.id
        : reposRes.currentId ?? reposRes.repos[0]?.id ?? null;
      if (activeRepoId) setUrlRepoId(activeRepoId);
      await loadActiveRepo();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('branchcraft.theme', theme);
    } catch {
      // localStorage unavailable (private mode etc.) — non-fatal
    }
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
  }
</script>

<div class="layout">
  <RepoSidebar
    {repos}
    activeId={activeRepoId}
    onSwitch={switchRepo}
    onAdd={() => (modalOpen = true)}
  />

  <main>
    <header>
      <div class="title">
        <h1>
          <span class="brand">branchcraft</span>
          <span class="version mono">v{health?.version ?? '…'}</span>
        </h1>
        <p class="tagline">Visual Git for solo devs and vibe-coding teams.</p>
      </div>
      <button
        class="theme-toggle"
        onclick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {#if theme === 'dark'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        {/if}
      </button>
    </header>

    <section class="status">
      <h2>Graph</h2>

      {#if loading}
        <p class="dim">loading repository state…</p>
      {:else if error}
        <p class="error">error: <span class="mono">{error}</span></p>
        <p class="dim">
          Pick a different repo from the sidebar or "+ Add repo" to pin one.
        </p>
      {:else if !activeRepoId}
        <p class="dim">No repo selected. Pin one with "+ Add repo".</p>
      {:else}
        <p class="dim">
          Repo: <span class="mono">{activeRepoPath ?? '…'}</span> ·
          <span class="mono">{graphCommits.length}</span> commits ·
          <span class="mono">{laneCount}</span> lanes
        </p>

        <Graph commits={graphCommits} {laneCount} {worktrees} />
      {/if}
    </section>

    <footer>
      <p class="dim">
        pre-MVP scaffold · see <a href="https://github.com/nited-ai/branchcraft/blob/main/PLAN.md">PLAN.md</a>
      </p>
    </footer>
  </main>
</div>

<AddRepoModal
  open={modalOpen}
  onClose={() => (modalOpen = false)}
  onAdded={onRepoAdded}
/>

<style>
  .layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100vh;
  }

  main {
    padding: var(--s7) var(--s5);
    display: flex;
    flex-direction: column;
    gap: var(--s7);
    max-width: 1200px;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s4);
  }

  header h1 {
    margin: 0 0 var(--s2) 0;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    display: flex;
    align-items: baseline;
    gap: var(--s3);
  }

  .brand {
    color: var(--text-primary);
  }

  .version {
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 400;
  }

  .tagline {
    margin: 0;
    color: var(--text-secondary);
    font-size: 15px;
  }

  .theme-toggle {
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--text-secondary);
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      color 120ms ease,
      border-color 120ms ease,
      background 120ms ease;
  }

  .theme-toggle:hover {
    color: var(--text-primary);
    border-color: var(--branch-2);
    background: rgba(212, 165, 74, 0.06);
  }

  section h2 {
    margin: 0 0 var(--s4) 0;
    font-size: 18px;
    font-weight: 500;
    color: var(--text-primary);
    border-bottom: 1px solid var(--hairline);
    padding-bottom: var(--s2);
  }

  .dim {
    color: var(--text-secondary);
  }

  .error {
    color: var(--danger);
  }

  footer {
    border-top: 1px solid var(--hairline);
    padding-top: var(--s4);
    font-size: 12px;
  }
</style>
