<script lang="ts">
  type Mode = 'soft' | 'mixed' | 'hard';
  type Props = {
    open: boolean;
    branch: string;
    sha: string;
    x: number;
    y: number;
    onChoose: (m: Mode) => void;
    onCancel: () => void;
  };
  let { open, branch, sha, x, y, onChoose, onCancel }: Props = $props();

  const options: { kind: Mode; label: string }[] = [
    { kind: 'mixed', label: 'mixed (default — keep changes unstaged)' },
    { kind: 'soft', label: 'soft (keep changes staged)' },
    { kind: 'hard', label: 'hard (DISCARD uncommitted changes)' },
  ];

  let cursor = $state(0);
  let rootEl = $state<HTMLDivElement | null>(null);
  $effect(() => { if (open && rootEl) rootEl.focus(); });
  $effect(() => { if (open) cursor = 0; });

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % options.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + options.length) % options.length; }
    else if (e.key === 'Enter') {
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
    aria-label="Reset mode"
    tabindex="-1"
    onkeydown={onKey}
  >
    <div class="hd mono">Reset {branch} &rarr; {sha.slice(0, 7)}</div>
    <ol class="opts">
      {#each options as o, i (o.kind)}
        <li>
          <button
            class:active={i === cursor}
            class:danger={o.kind === 'hard'}
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
    <div class="ft mono">Esc cancel · Enter ok</div>
  </div>
{/if}

<style>
  /* Mirrors DisambigPopup styles. */
  .popup { position: fixed; z-index: 180; width: 360px; background: var(--bg-elevated);
           border: 1px solid var(--branch-2); border-radius: 6px; padding: var(--s2);
           box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); outline: none; font-size: 12px; }
  .hd { padding: 4px var(--s2); color: var(--text-secondary);
        border-bottom: 1px solid var(--hairline); margin-bottom: 4px; font-size: 11px; }
  .opts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
  .opts button { display: grid; grid-template-columns: 14px 60px 1fr; gap: var(--s2);
                 align-items: baseline; width: 100%; background: transparent;
                 border: 1px solid transparent; border-radius: 4px; padding: 4px var(--s2);
                 color: var(--text-primary); text-align: left; cursor: pointer;
                 font: inherit; font-size: 12px; }
  .opts button.active { background: rgba(212, 165, 74, 0.1); border-color: var(--branch-2); }
  .opts button.danger.active { border-color: var(--danger); }
  .chev { color: var(--branch-2); }
  .kind { color: var(--branch-2); font-size: 11px; }
  .opts button.danger .kind { color: var(--danger); }
  .lbl { color: var(--text-secondary); }
  .ft { padding: 4px var(--s2); color: var(--text-secondary); font-size: 10px;
        border-top: 1px solid var(--hairline); margin-top: 4px; }
</style>
