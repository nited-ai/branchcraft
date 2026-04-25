<script lang="ts">
  // First-launch onboarding tip (PLAN.md §4.8). Disappears once dismissed
  // and the dismissal sticks in localStorage so the user only sees it once.
  type Props = { storageKey: string };
  let { storageKey }: Props = $props();

  let visible = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    try {
      const seen = localStorage.getItem(storageKey);
      if (seen !== '1') visible = true;
    } catch {
      // localStorage unavailable — show once per page load only
      visible = true;
    }
  });

  function dismiss() {
    visible = false;
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // no-op
    }
  }
</script>

{#if visible}
  <div class="coachmark" role="status" aria-live="polite">
    <div class="hd">
      <span class="badge mono">tip</span>
      <span class="title">First time here?</span>
    </div>
    <p>
      Drag a commit dot onto a branch label to queue a cherry-pick. Drag a
      branch onto another to queue a merge. Type any other command via
      <span class="mono">+ Command</span> in the header.
    </p>
    <p class="dim">
      Nothing runs against your repo until you click <span class="mono">Apply</span>.
    </p>
    <button class="dismiss" onclick={dismiss}>Got it</button>
  </div>
{/if}

<style>
  .coachmark {
    position: fixed;
    bottom: var(--s5);
    right: var(--s5);
    width: 320px;
    max-width: calc(100vw - 32px);
    background: var(--bg-elevated);
    border: 1px solid var(--branch-2);
    border-radius: 6px;
    padding: var(--s4);
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    z-index: 50;
    font-size: 13px;
    line-height: 1.45;
  }

  .hd {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }

  .badge {
    font-size: 9px;
    font-weight: 600;
    color: var(--branch-2);
    background: rgba(212, 165, 74, 0.12);
    border: 1px solid rgba(212, 165, 74, 0.3);
    border-radius: 2px;
    padding: 1px 6px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .title {
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    color: var(--text-primary);
  }

  p.dim {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .dismiss {
    align-self: flex-end;
    margin-top: var(--s2);
    padding: var(--s2) var(--s3);
    background: var(--branch-2);
    color: var(--bg);
    border: 1px solid var(--branch-2);
    border-radius: 4px;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
</style>
