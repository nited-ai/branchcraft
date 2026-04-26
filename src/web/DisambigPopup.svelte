<script lang="ts">
  /**
   * Compact disambiguation popup at a drop point. PLAN.md §4.4.
   *
   * Three options — rebase (default), merge, squash-merge — keyboard-
   * navigable (arrow keys), Enter confirms, Escape cancels.
   */
  type Choice = 'rebase' | 'merge' | 'squash';
  type Props = {
    open: boolean;
    fromName: string;
    intoName: string;
    x: number;
    y: number;
    onChoose: (c: Choice) => void;
    onCancel: () => void;
  };
  let { open, fromName, intoName, x, y, onChoose, onCancel }: Props = $props();

  const options: { kind: Choice; label: string }[] = [
    { kind: 'rebase', label: 'rebase (linear, rewrites SHAs)' },
    { kind: 'merge', label: 'merge (preserves history, may add merge commit)' },
    { kind: 'squash', label: 'squash-merge (one combined commit)' },
  ];

  let cursor = $state(0);
  let rootEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (open && rootEl) rootEl.focus();
  });
  $effect(() => {
    if (open) cursor = 0;
  });

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = (cursor + 1) % options.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = (cursor - 1 + options.length) % options.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[cursor];
      if (opt) onChoose(opt.kind);
    }
  }
</script>

{#if open}
  <div
    class="popup"
    style="left: {x}px; top: {y}px;"
    bind:this={rootEl}
    role="menu"
    aria-label="Choose branch combination"
    tabindex="-1"
    onkeydown={onKey}
  >
    <div class="hd mono">Drop {fromName} &rarr; {intoName}</div>
    <ol class="opts">
      {#each options as o, i (o.kind)}
        <li>
          <button
            class:active={i === cursor}
            onmouseenter={() => (cursor = i)}
            onclick={() => onChoose(o.kind)}
            role="menuitem"
          >
            <span class="chev mono" aria-hidden="true">{i === cursor ? '▸' : ' '}</span>
            <span class="kind mono">{o.kind}</span>
            <span class="lbl">{o.label}</span>
          </button>
        </li>
      {/each}
    </ol>
    <div class="ft mono">Esc cancel · Enter ok · ↑↓ navigate</div>
  </div>
{/if}

<style>
  .popup {
    position: fixed;
    z-index: 180;
    width: 320px;
    background: var(--bg-elevated);
    border: 1px solid var(--branch-2);
    border-radius: 6px;
    padding: var(--s2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    outline: none;
    font-size: 12px;
  }

  .hd {
    padding: 4px var(--s2);
    color: var(--text-secondary);
    border-bottom: 1px solid var(--hairline);
    margin-bottom: 4px;
    font-size: 11px;
  }

  .opts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .opts button {
    display: grid;
    grid-template-columns: 14px 80px 1fr;
    gap: var(--s2);
    align-items: baseline;
    width: 100%;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 4px var(--s2);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }

  .opts button.active {
    background: rgba(212, 165, 74, 0.1);
    border-color: var(--branch-2);
  }

  .chev {
    color: var(--branch-2);
  }

  .kind {
    color: var(--branch-2);
    font-size: 11px;
  }

  .lbl {
    color: var(--text-secondary);
  }

  .ft {
    padding: 4px var(--s2);
    color: var(--text-secondary);
    font-size: 10px;
    border-top: 1px solid var(--hairline);
    margin-top: 4px;
  }
</style>
