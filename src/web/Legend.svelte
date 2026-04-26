<script lang="ts">
  /**
   * Compact horizontal legend below the graph header. Always visible —
   * gives newcomers a quick read of the visual vocabulary in one strip
   * (commit / HEAD / preview / branch / remote / live session / task).
   *
   * The markers are SVG icons rather than CSS shapes so the visuals match
   * the actual graph rendering pixel-for-pixel where possible.
   */
</script>

<div class="legend" aria-label="Graph legend">
  <span class="item">
    <svg width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="4" fill="var(--branch-0)" />
    </svg>
    <span>commit</span>
  </span>

  <span class="item">
    <svg width="18" height="14" aria-hidden="true">
      <circle cx="9" cy="7" r="10" fill="var(--branch-2)" fill-opacity="0.18" />
      <circle cx="9" cy="7" r="6" fill="var(--branch-2)" />
    </svg>
    <span>head</span>
  </span>

  <span class="item">
    <svg width="14" height="14" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="4"
        fill="var(--bg)"
        stroke="var(--branch-9)"
        stroke-width="1.5"
        stroke-dasharray="2 2"
      />
    </svg>
    <span>preview</span>
  </span>

  <span class="sep" aria-hidden="true">·</span>

  <span class="item">
    <span class="legend-pill ref-branch mono">main</span>
    <span class="dim">drag to merge / drop a commit to cherry-pick</span>
  </span>

  <span class="item">
    <span class="legend-pill ref-remote mono">origin/main</span>
    <span class="dim">remote</span>
  </span>

  <span class="sep" aria-hidden="true">·</span>

  <span class="item">
    <span class="dot-live" aria-hidden="true"></span>
    <span>live session</span>
  </span>

  <span class="item">
    <span class="dot-idle" aria-hidden="true"></span>
    <span>idle</span>
  </span>

  <span class="item">
    <span class="task-marker mono">[scheduled]</span>
    <span class="dim">background task</span>
  </span>
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s4);
    padding: var(--s2) var(--s3);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--bg-elevated);
    font-size: 11px;
    color: var(--text-secondary);
  }

  .item {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
  }

  .sep {
    color: var(--hairline);
  }

  .dim {
    color: var(--text-secondary);
    font-size: 11px;
  }

  .legend-pill {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--hairline);
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  .legend-pill.ref-branch {
    background: rgba(212, 165, 74, 0.12);
    border-color: rgba(212, 165, 74, 0.4);
    color: var(--branch-2);
  }

  .legend-pill.ref-remote {
    color: var(--text-secondary);
    border-style: dashed;
  }

  .dot-live,
  .dot-idle {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot-live {
    background: var(--success);
    box-shadow: 0 0 0 2px rgba(109, 178, 109, 0.18);
  }

  .dot-idle {
    background: var(--text-secondary);
    opacity: 0.5;
  }

  .task-marker {
    color: var(--branch-7);
    background: rgba(138, 150, 168, 0.12);
    border: 1px dashed rgba(138, 150, 168, 0.3);
    border-radius: 2px;
    padding: 0 5px;
    font-size: 10px;
  }
</style>
