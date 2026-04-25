<script lang="ts">
  import type { Command } from '../shared/types.ts';
  import { COMMAND_BLURB } from './queue.ts';

  type Props = {
    open: boolean;
    branchSuggestions: string[];
    onClose: () => void;
    onAdd: (cmd: Command) => void;
  };

  let { open, branchSuggestions, onClose, onAdd }: Props = $props();

  type Kind = Command['kind'];
  let kind = $state<Kind>('reset');

  // Per-kind fields. Kept loose; we only validate on submit.
  let from = $state('');
  let into = $state('');
  let branch = $state('');
  let onto = $state('');
  let commits = $state('');
  let to = $state('');
  let mode = $state<'mixed' | 'soft' | 'hard'>('mixed');
  let ff = $state<'auto' | 'only' | 'no'>('auto');
  let remote = $state('origin');
  let force = $state<'none' | 'lease' | 'true'>('none');
  let error = $state<string | null>(null);

  let blurb = $derived(COMMAND_BLURB[kind]);

  function reset() {
    from = '';
    into = '';
    branch = '';
    onto = '';
    commits = '';
    to = '';
    mode = 'mixed';
    ff = 'auto';
    remote = 'origin';
    force = 'none';
    error = null;
  }

  function build(): Command | string {
    switch (kind) {
      case 'merge':
        if (!from.trim() || !into.trim()) return 'from and into are required';
        return { kind: 'merge', from: from.trim(), into: into.trim(), ff };
      case 'rebase':
        if (!branch.trim() || !onto.trim()) return 'branch and onto are required';
        return { kind: 'rebase', branch: branch.trim(), onto: onto.trim() };
      case 'cherry-pick': {
        const list = commits
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.length === 0 || !onto.trim()) return 'commits and onto are required';
        return { kind: 'cherry-pick', commits: list, onto: onto.trim() };
      }
      case 'reset':
        if (!branch.trim() || !to.trim()) return 'branch and target are required';
        return { kind: 'reset', branch: branch.trim(), to: to.trim(), mode };
      case 'push': {
        const cmd: Command = { kind: 'push', branch: branch.trim(), remote: remote.trim() || 'origin' };
        if (!cmd.branch) return 'branch is required';
        if (force === 'lease') cmd.force = 'lease';
        else if (force === 'true') cmd.force = true;
        return cmd;
      }
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const result = build();
    if (typeof result === 'string') {
      error = result;
      return;
    }
    onAdd(result);
    reset();
    onClose();
  }

  function cancel() {
    reset();
    onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel();
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true" onkeydown={onKey} tabindex="-1">
    <form class="modal" onsubmit={submit}>
      <h2>Queue command</h2>

      <label>
        <span class="label">Kind</span>
        <select bind:value={kind}>
          <option value="merge">merge</option>
          <option value="rebase">rebase</option>
          <option value="cherry-pick">cherry-pick</option>
          <option value="reset">reset</option>
          <option value="push">push</option>
        </select>
      </label>
      <p class="blurb">{blurb}</p>

      <datalist id="branch-suggestions">
        {#each branchSuggestions as b (b)}<option value={b}></option>{/each}
      </datalist>

      {#if kind === 'merge'}
        <label><span class="label">From</span><input type="text" bind:value={from} list="branch-suggestions" placeholder="feature-x" /></label>
        <label><span class="label">Into</span><input type="text" bind:value={into} list="branch-suggestions" placeholder="main" /></label>
        <label><span class="label">Fast-forward</span>
          <select bind:value={ff}>
            <option value="auto">auto</option>
            <option value="only">--ff-only</option>
            <option value="no">--no-ff</option>
          </select>
        </label>
      {:else if kind === 'rebase'}
        <label><span class="label">Branch</span><input type="text" bind:value={branch} list="branch-suggestions" placeholder="feature-x" /></label>
        <label><span class="label">Onto</span><input type="text" bind:value={onto} list="branch-suggestions" placeholder="main" /></label>
      {:else if kind === 'cherry-pick'}
        <label><span class="label">Commits (space or comma separated)</span><input type="text" bind:value={commits} placeholder="abc1234 def5678" /></label>
        <label><span class="label">Onto</span><input type="text" bind:value={onto} list="branch-suggestions" placeholder="main" /></label>
      {:else if kind === 'reset'}
        <label><span class="label">Branch</span><input type="text" bind:value={branch} list="branch-suggestions" placeholder="main" /></label>
        <label><span class="label">Target (sha or ref)</span><input type="text" bind:value={to} placeholder="HEAD~3" /></label>
        <label><span class="label">Mode</span>
          <select bind:value={mode}>
            <option value="mixed">--mixed</option>
            <option value="soft">--soft</option>
            <option value="hard">--hard (destructive)</option>
          </select>
        </label>
      {:else if kind === 'push'}
        <label><span class="label">Branch</span><input type="text" bind:value={branch} list="branch-suggestions" placeholder="main" /></label>
        <label><span class="label">Remote</span><input type="text" bind:value={remote} placeholder="origin" /></label>
        <label><span class="label">Force</span>
          <select bind:value={force}>
            <option value="none">no force</option>
            <option value="lease">--force-with-lease (safer)</option>
            <option value="true">--force (dangerous)</option>
          </select>
        </label>
      {/if}

      {#if error}<p class="error">{error}</p>{/if}

      <div class="actions">
        <button type="button" class="cancel" onclick={cancel}>Cancel</button>
        <button type="submit" class="submit">Queue</button>
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
    width: 460px;
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
  select {
    background: var(--bg);
    color: var(--text-primary);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    padding: var(--s2) var(--s3);
    font-family: var(--font-mono);
    font-size: 13px;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--branch-2);
  }

  .blurb {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
    font-family: var(--font-mono);
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
</style>
