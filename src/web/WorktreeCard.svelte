<script lang="ts">
  import type { Worktree } from '../shared/types.ts';

  type Props = { worktree: Worktree; draggable?: boolean };
  let { worktree, draggable = true }: Props = $props();

  const folderName = (path: string): string => {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts.at(-1) ?? path;
  };

  const isStale = $derived(
    worktree.status !== undefined && worktree.status.behind > 0,
  );
  const isDirty = $derived(
    worktree.status !== undefined && worktree.status.dirtyFiles > 0,
  );
</script>

<div class="card" class:stale={isStale} class:locked={worktree.isLocked} class:draggable={draggable}>
  <span class="folder mono" title={worktree.path}>
    {folderName(worktree.path)}
  </span>
  {#if worktree.isMain}
    <span class="badge badge-main">main</span>
  {/if}

  {#if worktree.status}
    {#if !isDirty}
      <span class="stat clean">clean</span>
    {:else}
      <span class="stat dirty">{worktree.status.dirtyFiles} dirty</span>
    {/if}
    {#if worktree.status.ahead > 0 || worktree.status.behind > 0}
      <span class="stat ab">
        {#if worktree.status.ahead > 0}
          <span class="ahead">{worktree.status.ahead}↑</span>
        {/if}
        {#if worktree.status.behind > 0}
          <span class="behind">{worktree.status.behind}↓</span>
        {/if}
      </span>
    {/if}
  {/if}

  {#if worktree.isLocked}<span class="badge badge-warn">locked</span>{/if}
  {#if worktree.isPrunable}<span class="badge badge-danger">prunable</span>{/if}
</div>

<style>
  .card {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    height: 24px;
    padding: 0 var(--s3);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--bg-elevated);
    font-size: 12px;
    white-space: nowrap;
    user-select: none;
  }

  .card.draggable {
    cursor: grab;
  }

  .card.draggable:active {
    cursor: grabbing;
  }

  .card.stale {
    border-color: var(--warning);
    border-style: dashed;
    box-shadow: 0 0 0 1px rgba(212, 165, 74, 0.08);
  }

  .folder {
    color: var(--text-primary);
    font-weight: 500;
  }

  .stat {
    color: var(--text-secondary);
    font-size: 11px;
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  .stat.dirty {
    color: var(--warning);
  }

  .stat.ab {
    font-family: var(--font-mono);
    display: inline-flex;
    gap: var(--s1);
  }

  .ahead {
    color: var(--success);
  }

  .behind {
    color: var(--warning);
  }

  .badge {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--hairline);
    text-transform: lowercase;
  }

  .badge-main {
    background: rgba(164, 185, 230, 0.12);
    border-color: rgba(164, 185, 230, 0.4);
    color: var(--branch-0);
  }

  .badge-warn {
    background: rgba(212, 165, 74, 0.12);
    border-color: rgba(212, 165, 74, 0.4);
    color: var(--warning);
  }

  .badge-danger {
    background: rgba(204, 102, 119, 0.12);
    border-color: rgba(204, 102, 119, 0.4);
    color: var(--danger);
  }
</style>
