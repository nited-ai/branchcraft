<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    ApiHealth,
    ApiWorktrees,
    ApiGraph,
    Worktree,
    LaidOutCommit,
  } from '../shared/types.ts';
  import Graph from './Graph.svelte';

  type Theme = 'dark' | 'light';

  let health = $state<ApiHealth | null>(null);
  let worktrees = $state<Worktree[]>([]);
  let graphCommits = $state<LaidOutCommit[]>([]);
  let laneCount = $state(0);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let theme = $state<Theme>('dark');

  onMount(async () => {
    const saved = localStorage.getItem('branchcraft.theme');
    if (saved === 'dark' || saved === 'light') {
      theme = saved;
    } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }

    try {
      const [healthRes, wtRes, graphRes] = await Promise.all([
        fetch('/api/health').then((r) => r.json() as Promise<ApiHealth>),
        fetch('/api/worktrees').then(async (r) => {
          if (!r.ok) {
            const e = (await r.json()) as { error: string };
            throw new Error(e.error);
          }
          return r.json() as Promise<ApiWorktrees>;
        }),
        fetch('/api/graph').then(async (r) => {
          if (!r.ok) {
            const e = (await r.json()) as { error: string };
            throw new Error(e.error);
          }
          return r.json() as Promise<ApiGraph>;
        }),
      ]);
      health = healthRes;
      worktrees = wtRes.worktrees;
      graphCommits = graphRes.commits;
      laneCount = graphRes.laneCount;
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
      // localStorage unavailable (private mode, etc.) — non-fatal
    }
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
  }
</script>

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
        Make sure you're running branchcraft from inside a git repo (or use
        BRANCHCRAFT_INVOKED_FROM).
      </p>
    {:else}
      <p class="dim">
        Repo: <span class="mono">{health?.cwd}</span> ·
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

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--s7) var(--s5);
    display: flex;
    flex-direction: column;
    gap: var(--s7);
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
