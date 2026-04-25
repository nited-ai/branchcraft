<script lang="ts">
  import type { ApiRepoSummary } from '../shared/types.ts';

  type Props = {
    repos: ApiRepoSummary[];
    activeId: string | null;
    onSwitch: (id: string) => void;
    onAdd: () => void;
  };

  let { repos, activeId, onSwitch, onAdd }: Props = $props();

  function statusLabel(r: ApiRepoSummary): string {
    if (r.status === 'stale') return `${r.staleCount} stale`;
    if (r.status === 'dirty') return `${r.dirtyCount} dirty`;
    if (r.status === 'unknown') return 'unknown';
    return 'clean';
  }
</script>

<aside class="hub">
  <div class="hub-header">
    <span class="title">Repos</span>
    <span class="count mono">{repos.length}</span>
  </div>

  {#if repos.length === 0}
    <p class="empty">No repos pinned yet.</p>
  {:else}
    <ol class="repo-list">
      {#each repos as r (r.id)}
        <li>
          <button
            class="repo"
            class:active={r.id === activeId}
            onclick={() => onSwitch(r.id)}
            title={r.path}
          >
            <span class={`dot dot-${r.status}`} aria-hidden="true"></span>
            <span class="text">
              <span class="name">{r.name}</span>
              <span
                class="status mono"
                class:warn={r.status === 'stale'}
                class:dirty={r.status === 'dirty'}
              >
                {statusLabel(r)}
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}

  <button class="add" onclick={onAdd}>+ Add repo</button>
</aside>

<style>
  .hub {
    display: flex;
    flex-direction: column;
    gap: var(--s3);
    padding: var(--s5) var(--s4);
    border-right: 1px solid var(--hairline);
    height: 100vh;
    box-sizing: border-box;
    background: var(--bg);
    position: sticky;
    top: 0;
    overflow-y: auto;
  }

  .hub-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: var(--s2);
    border-bottom: 1px solid var(--hairline);
  }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--branch-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .count {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .empty {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-style: italic;
  }

  .repo-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .repo {
    display: grid;
    grid-template-columns: 12px 1fr;
    align-items: start;
    gap: var(--s2);
    width: 100%;
    padding: var(--s2) var(--s3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 100ms ease, border-color 100ms ease;
  }

  .repo:hover {
    background: var(--bg-elevated);
  }

  .repo.active {
    background: var(--bg-elevated);
    border-color: var(--branch-2);
  }

  .dot {
    /* The flex/grid is `align: start`; nudge the dot to the row's optical center. */
    margin-top: 6px;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .status {
    font-size: 10px;
    color: var(--text-secondary);
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  .status.warn {
    color: var(--warning);
  }

  .status.dirty {
    color: var(--warning);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-secondary);
    flex-shrink: 0;
  }

  .dot-clean {
    background: var(--success);
  }

  .dot-dirty {
    background: var(--warning);
  }

  .dot-stale {
    background: var(--warning);
    box-shadow: 0 0 0 2px rgba(212, 165, 74, 0.18);
  }

  .dot-unknown {
    background: var(--text-secondary);
    opacity: 0.4;
  }

  .add {
    margin-top: auto;
    padding: var(--s2) var(--s3);
    background: transparent;
    border: 1px dashed var(--hairline);
    border-radius: 4px;
    color: var(--text-secondary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: color 100ms ease, border-color 100ms ease;
  }

  .add:hover {
    color: var(--branch-2);
    border-color: var(--branch-2);
    border-style: solid;
  }
</style>
