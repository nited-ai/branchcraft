<script lang="ts">
  import type { ApplyResult, Command } from '../shared/types.ts';
  import { COMMAND_BLURB, commandSummary } from './queue.ts';

  type Props = {
    queue: Command[];
    applyResults: ApplyResult[] | null;
    applying: boolean;
    onRemove: (index: number) => void;
    onClear: () => void;
    onApply: () => void;
  };

  let {
    queue,
    applyResults,
    applying,
    onRemove,
    onClear,
    onApply,
  }: Props = $props();
</script>

{#if queue.length > 0 || (applyResults && applyResults.length > 0)}
  <aside class="queue-panel" aria-label="Command queue">
    <div class="hd">
      <span class="title">Queue</span>
      <span class="count mono">{queue.length}</span>
      <span class="spacer"></span>
      {#if queue.length > 0}
        <button class="ghost" onclick={onClear}>Clear</button>
        <button class="apply" disabled={applying} onclick={onApply}>
          {applying ? 'Applying…' : `Apply ${queue.length}`}
        </button>
      {/if}
    </div>

    {#if queue.length > 0}
      <ol class="items">
        {#each queue as cmd, i (i + ':' + commandSummary(cmd))}
          <li>
            <span class="kind mono">{cmd.kind}</span>
            <span class="summary mono" title={COMMAND_BLURB[cmd.kind]}>
              {commandSummary(cmd)}
            </span>
            <button
              class="remove"
              onclick={() => onRemove(i)}
              aria-label="Remove from queue"
              title="Remove"
            >×</button>
          </li>
        {/each}
      </ol>
    {/if}

    {#if applyResults && applyResults.length > 0}
      <ol class="results">
        {#each applyResults as r, i (i)}
          <li class:ok={r.ok} class:fail={!r.ok}>
            <span class="status mono">{r.ok ? 'ok' : 'fail'}</span>
            <span class="summary mono">{commandSummary(r.command)}</span>
            {#if r.error}
              <pre class="err mono">{r.error}</pre>
            {:else if r.output}
              <pre class="out mono">{r.output}</pre>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </aside>
{/if}

<style>
  .queue-panel {
    position: sticky;
    bottom: 0;
    margin-top: var(--s5);
    background: var(--bg-elevated);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: var(--s3) var(--s4);
    display: flex;
    flex-direction: column;
    gap: var(--s3);
  }

  .hd {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    color: var(--branch-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .count {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .spacer {
    flex: 1;
  }

  .ghost,
  .apply {
    padding: var(--s2) var(--s3);
    border-radius: 4px;
    border: 1px solid var(--hairline);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .apply {
    background: var(--branch-2);
    border-color: var(--branch-2);
    color: var(--bg);
    font-weight: 500;
  }

  .apply:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .items,
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }

  .items li {
    display: grid;
    grid-template-columns: 90px 1fr auto;
    align-items: center;
    gap: var(--s3);
    font-size: 12px;
  }

  .kind {
    color: var(--branch-2);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .summary {
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove {
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--text-secondary);
    width: 22px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
  }

  .remove:hover {
    color: var(--danger);
    border-color: var(--danger);
  }

  .results li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--s2) var(--s3);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    font-size: 12px;
  }

  .results li.ok .status {
    color: var(--success);
  }

  .results li.fail .status {
    color: var(--danger);
  }

  .err,
  .out {
    margin: 0;
    padding: var(--s2);
    background: var(--bg);
    border-radius: 3px;
    font-size: 11px;
    color: var(--text-secondary);
    white-space: pre-wrap;
    max-height: 120px;
    overflow: auto;
  }
</style>
