<script lang="ts">
  /**
   * Floating help overlay that follows the cursor while hovering an
   * interactive graph element. Renders nothing when content is null —
   * stays out of the layout entirely so it doesn't shift other elements.
   *
   * Position is offset slightly so the overlay doesn't sit directly under
   * the cursor (and trigger flicker when the mouse moves into it). It's
   * also pointer-events-none so the user can move through it back to the
   * underlying element.
   */
  export type HelpContent = {
    /** Short kind label, e.g. "commit", "branch ref". Shown as a small badge. */
    kind: string;
    title: string;
    /** Body explanation — what is this thing in plain language. */
    body: string;
    /** Optional affordance / call-to-action — what the user can do here. */
    hint?: string;
  };

  type Props = {
    content: HelpContent | null;
    x: number;
    y: number;
  };

  let { content, x, y }: Props = $props();

  // Clamp so the overlay doesn't fall off the right or bottom edges. The
  // numbers are conservative — we don't measure the panel because that
  // forces a layout on every mouse move; instead, we assume max ~360x140px.
  let pos = $derived.by(() => {
    if (typeof window === 'undefined') return { left: x + 16, top: y + 16 };
    const W = 360;
    const H = 160;
    let left = x + 16;
    let top = y + 16;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    if (top + H > window.innerHeight - 8) top = y - H - 8;
    return { left, top };
  });
</script>

{#if content}
  <div
    class="help"
    style="left: {pos.left}px; top: {pos.top}px;"
    role="tooltip"
    aria-live="polite"
  >
    <div class="hd">
      <span class="kind mono">{content.kind}</span>
      <span class="title mono">{content.title}</span>
    </div>
    <p class="body">{content.body}</p>
    {#if content.hint}
      <p class="hint">
        <span class="hint-glyph mono" aria-hidden="true">→</span>
        {content.hint}
      </p>
    {/if}
  </div>
{/if}

<style>
  .help {
    position: fixed;
    z-index: 150;
    pointer-events: none;
    width: 320px;
    max-width: calc(100vw - 32px);
    background: var(--bg-elevated);
    border: 1px solid var(--branch-2);
    border-radius: 6px;
    padding: var(--s3) var(--s4);
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    font-size: 12px;
    line-height: 1.45;
    /* Don't react to its own hover — pointer-events: none keeps the
       cursor "on" the underlying interactive element. */
  }

  .hd {
    display: flex;
    align-items: baseline;
    gap: var(--s2);
  }

  .kind {
    font-size: 9px;
    font-weight: 600;
    color: var(--branch-2);
    background: rgba(212, 165, 74, 0.12);
    border: 1px solid rgba(212, 165, 74, 0.3);
    border-radius: 2px;
    padding: 1px 5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .title {
    font-size: 12px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  p {
    margin: 0;
    color: var(--text-primary);
  }

  .hint {
    color: var(--branch-2);
    font-size: 11px;
    display: flex;
    gap: var(--s2);
    align-items: baseline;
  }

  .hint-glyph {
    color: var(--text-secondary);
  }
</style>
