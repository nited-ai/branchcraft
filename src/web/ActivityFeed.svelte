<script lang="ts">
  import type { ActivityEvent } from '../shared/types.ts';

  type Props = {
    events: ActivityEvent[];
    open: boolean;
    onToggleOpen: () => void;
    /** Click handler — caller uses this to scroll the corresponding session pill into view. */
    onClickEvent?: (e: ActivityEvent) => void;
  };
  let { events, open, onToggleOpen, onClickEvent }: Props = $props();

  function age(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  function basename(path: string): string {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts.at(-1) ?? path;
  }

  const KIND_GLYPH: Record<string, string> = {
    edit: '✎',
    write: '+',
    read: 'r',
    bash: '$',
    other: '·',
  };
</script>

<section class="activity" class:open>
  <button
    class="section-toggle"
    onclick={onToggleOpen}
    aria-expanded={open}
  >
    <span class="chev mono" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="label">Activity</span>
    <span class="count mono">{events.length}</span>
  </button>
  {#if open}
    <div class="body">
      {#if events.length === 0}
        <p class="dim">No live activity yet.</p>
      {:else}
        <ol>
          {#each events.slice(0, 50) as e (e.sessionId + ':' + e.ts)}
            <li>
              <button
                class="row"
                onclick={() => onClickEvent?.(e)}
                title={e.file ?? e.label ?? ''}
              >
                <span class="sid mono">{e.sessionId.slice(0, 6)}</span>
                <span class="glyph mono">{KIND_GLYPH[e.kind] ?? '·'}</span>
                <span class="what">{e.file ? basename(e.file) : (e.label ?? e.kind)}</span>
                <span class="meta mono">{age(e.ts)}</span>
              </button>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</section>

<style>
  .activity {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
  }
  .section-toggle {
    display: grid;
    grid-template-columns: 14px 1fr auto;
    gap: var(--s2);
    align-items: center;
    background: transparent;
    border: none;
    padding: var(--s2) 0;
    cursor: pointer;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
  }
  .section-toggle:hover {
    color: var(--branch-2);
  }
  .chev {
    color: var(--text-secondary);
    font-size: 10px;
    width: 14px;
  }
  .label {
    font-size: 12px;
    font-weight: 500;
    text-transform: lowercase;
    letter-spacing: 0.04em;
  }
  .count {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .body {
    padding-left: var(--s4);
    border-left: 1px dashed var(--hairline);
    margin-left: 6px;
  }
  .body p.dim {
    margin: var(--s1) 0;
    font-size: 11px;
    color: var(--text-secondary);
    font-style: italic;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s1);
  }
  .row {
    display: grid;
    grid-template-columns: 50px 14px 1fr auto;
    align-items: baseline;
    gap: var(--s2);
    width: 100%;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 1px var(--s2);
    color: var(--text-primary);
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--bg-elevated);
    border-color: var(--hairline);
  }
  .sid {
    color: var(--branch-2);
    font-size: 10px;
  }
  .glyph {
    color: var(--text-secondary);
  }
  .what {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--text-secondary);
    font-size: 10px;
  }
</style>
