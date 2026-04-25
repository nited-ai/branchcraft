<script lang="ts">
  import type { ApiRepoSummary } from '../shared/types.ts';

  type Props = {
    open: boolean;
    onClose: () => void;
    onAdded: (summary: ApiRepoSummary) => void;
  };

  let { open, onClose, onAdded }: Props = $props();

  let path = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Focus the path input when the modal opens. Manual focus avoids the
  // a11y rule about <input autofocus> while still giving a usable modal.
  $effect(() => {
    if (open && inputEl) {
      inputEl.focus();
    }
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!path.trim() || busy) return;
    busy = true;
    error = null;
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: path.trim() }),
      });
      if (!res.ok) {
        const e = (await res.json()) as { error: string };
        throw new Error(e.error);
      }
      const summary = (await res.json()) as ApiRepoSummary;
      onAdded(summary);
      path = '';
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if open}
  <div
    class="backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-repo-title"
    onkeydown={onKey}
    tabindex="-1"
  >
    <form class="modal" onsubmit={submit}>
      <h2 id="add-repo-title">Add repo</h2>
      <p class="hint">
        Paste an absolute path to a git repository. The repo must already
        exist on disk.
      </p>
      <label>
        <span class="label">Path</span>
        <input
          class="path-input mono"
          type="text"
          bind:value={path}
          bind:this={inputEl}
          placeholder="D:\Git\Repos\foo"
          spellcheck={false}
          autocomplete="off"
        />
      </label>
      {#if error}
        <p class="error mono">{error}</p>
      {/if}
      <div class="actions">
        <button type="button" class="cancel" onclick={onClose}>Cancel</button>
        <button type="submit" class="submit" disabled={busy || !path.trim()}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg-elevated);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: var(--s5);
    width: 480px;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-direction: column;
    gap: var(--s4);
  }

  .modal h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .hint {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }

  .label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .path-input {
    background: var(--bg);
    color: var(--text-primary);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    padding: var(--s2) var(--s3);
    font-size: 13px;
  }

  .path-input:focus {
    outline: none;
    border-color: var(--branch-2);
  }

  .error {
    color: var(--danger);
    font-size: 12px;
    margin: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s3);
  }

  .cancel,
  .submit {
    padding: var(--s2) var(--s4);
    border-radius: 4px;
    border: 1px solid var(--hairline);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .cancel:hover {
    border-color: var(--text-secondary);
  }

  .submit {
    background: var(--branch-2);
    border-color: var(--branch-2);
    color: var(--bg);
    font-weight: 500;
  }

  .submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
