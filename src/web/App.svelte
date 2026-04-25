<script lang="ts">
  import { onMount } from 'svelte';
  import type { ApiHealth, ApiWorktrees, Worktree } from '../shared/types.ts';

  let health = $state<ApiHealth | null>(null);
  let worktrees = $state<Worktree[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  onMount(async () => {
    try {
      const [healthRes, wtRes] = await Promise.all([
        fetch('/api/health').then((r) => r.json() as Promise<ApiHealth>),
        fetch('/api/worktrees').then(async (r) => {
          if (!r.ok) {
            const e = (await r.json()) as { error: string };
            throw new Error(e.error);
          }
          return r.json() as Promise<ApiWorktrees>;
        }),
      ]);
      health = healthRes;
      worktrees = wtRes.worktrees;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  function shortSha(sha: string): string {
    return sha.slice(0, 7);
  }
</script>

<main>
  <header>
    <h1>
      <span class="brand">branchcraft</span>
      <span class="version mono">v{health?.version ?? '…'}</span>
    </h1>
    <p class="tagline">Visual Git for solo devs and vibe-coding teams.</p>
  </header>

  <section class="status">
    <h2>Status mode — Evening 1 sketch</h2>

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
        Repo: <span class="mono">{health?.cwd}</span>
      </p>

      <h3>Worktrees ({worktrees.length})</h3>
      <table class="worktrees">
        <thead>
          <tr>
            <th>Path</th>
            <th>Branch</th>
            <th>HEAD</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {#each worktrees as wt (wt.path)}
            <tr>
              <td class="mono">
                {wt.path}
                {#if wt.isMain}<span class="tag main">main</span>{/if}
              </td>
              <td class="mono">
                {#if wt.branch}
                  {wt.branch}
                {:else}
                  <span class="dim">(detached)</span>
                {/if}
              </td>
              <td class="mono dim">{shortSha(wt.head)}</td>
              <td>
                {#if wt.isLocked}<span class="tag warn">locked</span>{/if}
                {#if wt.isPrunable}<span class="tag danger">prunable</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
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
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--s7) var(--s5);
    display: flex;
    flex-direction: column;
    gap: var(--s7);
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

  section h2 {
    margin: 0 0 var(--s4) 0;
    font-size: 18px;
    font-weight: 500;
    color: var(--text-primary);
    border-bottom: 1px solid var(--hairline);
    padding-bottom: var(--s2);
  }

  section h3 {
    margin: var(--s5) 0 var(--s3) 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--branch-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .dim {
    color: var(--text-secondary);
  }

  .error {
    color: var(--danger);
  }

  table.worktrees {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  table.worktrees th {
    text-align: left;
    font-weight: 500;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--hairline);
    padding: var(--s2) var(--s3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 11px;
  }

  table.worktrees td {
    padding: var(--s2) var(--s3);
    border-bottom: 1px solid var(--hairline);
    vertical-align: top;
  }

  table.worktrees tr:last-child td {
    border-bottom: none;
  }

  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    margin-left: var(--s2);
  }

  .tag.main {
    background: rgba(164, 185, 230, 0.15);
    color: var(--branch-0);
  }

  .tag.warn {
    background: rgba(212, 165, 74, 0.15);
    color: var(--warning);
  }

  .tag.danger {
    background: rgba(204, 102, 119, 0.15);
    color: var(--danger);
  }

  footer {
    border-top: 1px solid var(--hairline);
    padding-top: var(--s4);
    font-size: 12px;
  }
</style>
