<script lang="ts">
  /**
   * Generic apply-modal for commands that need free-text input before
   * they can run. PLAN.md §4.5. Triggered when the queue's apply step
   * encounters a placeholder command — NOT on hover or drop.
   *
   * Caller passes `fields` describing the input shape; the modal calls
   * `onApply(values)` with a `Record<string, string>` once Apply is hit.
   */
  type Field = {
    name: string;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    required?: boolean;
    initial?: string;
  };
  type Props = {
    open: boolean;
    title: string;
    intro?: string;
    fields: Field[];
    confirmLabel?: string;
    danger?: boolean;
    onApply: (values: Record<string, string>) => void;
    onCancel: () => void;
  };
  let { open, title, intro, fields, confirmLabel = 'Apply', danger = false, onApply, onCancel }: Props = $props();

  let values = $state<Record<string, string>>({});
  let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Svelte 5 rejects the conditional `bind:this={i === 0 ? inputEl : null}`
  // form, so we capture the first field's element via an inline action
  // instead. The action receives the element on mount and the field index
  // as a parameter; we only stash the ref when the index is 0.
  function maybeRef(node: HTMLInputElement | HTMLTextAreaElement, idx: number) {
    if (idx === 0) inputEl = node;
    return {};
  }

  // Reset values when the modal opens with a new field set.
  $effect(() => {
    if (open) {
      const next: Record<string, string> = {};
      for (const f of fields) next[f.name] = f.initial ?? '';
      values = next;
      // Focus the first field shortly after mount.
      queueMicrotask(() => inputEl?.focus());
    }
  });

  let canApply = $derived(fields.every((f) => !f.required || (values[f.name] ?? '').trim().length > 0));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canApply) return;
    onApply(values);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
</script>

{#if open}
  <div
    class="backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="apply-modal-title"
    tabindex="-1"
    onkeydown={onKey}
  >
    <form class="modal" onsubmit={submit}>
      <h2 id="apply-modal-title">{title}</h2>
      {#if intro}<p class="intro">{intro}</p>{/if}
      {#each fields as f, i (f.name)}
        <label>
          <span class="label">{f.label}</span>
          {#if f.multiline}
            <textarea
              placeholder={f.placeholder ?? ''}
              bind:value={values[f.name]}
              use:maybeRef={i}
              rows="3"
              spellcheck={false}
              autocomplete="off"
            ></textarea>
          {:else}
            <input
              type="text"
              placeholder={f.placeholder ?? ''}
              bind:value={values[f.name]}
              use:maybeRef={i}
              spellcheck={false}
              autocomplete="off"
            />
          {/if}
        </label>
      {/each}
      <div class="actions">
        <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
        <button type="submit" class="submit" class:danger disabled={!canApply}>{confirmLabel}</button>
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
    z-index: 110;
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
  }
  .intro {
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
  input,
  textarea {
    background: var(--bg);
    color: var(--text-primary);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    padding: var(--s2) var(--s3);
    font: inherit;
    font-family: var(--font-mono);
    font-size: 13px;
    resize: vertical;
  }
  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--branch-2);
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
  .submit {
    background: var(--branch-2);
    border-color: var(--branch-2);
    color: var(--bg);
    font-weight: 500;
  }
  .submit.danger {
    background: var(--danger);
    border-color: var(--danger);
  }
  .submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
