<script lang="ts">
  import type { ApiRucksacks } from '../shared/types.ts';

  type Props = {
    data: ApiRucksacks | null;
    loading: boolean;
  };
  let { data, loading }: Props = $props();

  // Each section is independently collapsible — state remembered in
  // localStorage per-section so a user's layout survives reloads. Stash is
  // open by default since it's the most actionable; tags/reflog stay closed
  // unless populated to keep the panel compact.
  type SectionKey = 'stash' | 'tags' | 'reflog';
  const STORAGE_KEY = 'branchcraft.rucksacks.open';

  let open = $state<Record<SectionKey, boolean>>({
    stash: true,
    tags: false,
    reflog: false,
  });

  // Hydrate from localStorage on mount via $effect — runs once and on
  // subsequent state writes for persistence.
  let hydrated = $state(false);
  $effect(() => {
    if (typeof window === 'undefined') return;
    if (!hydrated) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Record<SectionKey, boolean>>;
          if (typeof parsed.stash === 'boolean') open.stash = parsed.stash;
          if (typeof parsed.tags === 'boolean') open.tags = parsed.tags;
          if (typeof parsed.reflog === 'boolean') open.reflog = parsed.reflog;
        }
      } catch {
        // ignore — fall back to defaults
      }
      hydrated = true;
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(open));
      } catch {
        // ignore
      }
    }
  });

  function age(ts: number): string {
    const sec = Math.floor(Date.now() / 1000) - ts;
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  function shortSha(s: string): string {
    return s.slice(0, 7);
  }

  let stashCount = $derived(data?.stash.length ?? 0);
  let tagCount = $derived(data?.tags.length ?? 0);
  let reflogCount = $derived(data?.reflog.length ?? 0);
</script>

<aside class="rucksacks" aria-label="Stash, tags, reflog">
  <div class="hd">
    <span class="title">Rucksacks</span>
  </div>

  <section class="rucksack" class:open={open.stash}>
    <button
      class="section-toggle"
      onclick={() => (open.stash = !open.stash)}
      aria-expanded={open.stash}
    >
      <span class="chev" aria-hidden="true">{open.stash ? '▾' : '▸'}</span>
      <span class="label">Stash</span>
      <span class="count mono">{stashCount}</span>
    </button>
    {#if open.stash}
      <div class="body">
        {#if loading}
          <p class="dim">…</p>
        {:else if stashCount === 0}
          <p class="dim">No stash entries.</p>
        {:else}
          <ol>
            {#each data!.stash as s (s.sha)}
              <li>
                <span class="idx mono">stash@&#123;{s.index}&#125;</span>
                <span class="msg" title={s.message}>{s.message}</span>
                <span class="meta mono">{age(s.authorDate)}</span>
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/if}
  </section>

  <section class="rucksack" class:open={open.tags}>
    <button
      class="section-toggle"
      onclick={() => (open.tags = !open.tags)}
      aria-expanded={open.tags}
    >
      <span class="chev" aria-hidden="true">{open.tags ? '▾' : '▸'}</span>
      <span class="label">Tags</span>
      <span class="count mono">{tagCount}</span>
    </button>
    {#if open.tags}
      <div class="body">
        {#if loading}
          <p class="dim">…</p>
        {:else if tagCount === 0}
          <p class="dim">No tags.</p>
        {:else}
          <ol>
            {#each data!.tags as t (t.name)}
              <li>
                <span class="idx mono">{t.name}</span>
                <span class="msg" title={t.message || t.sha}>
                  {t.message || shortSha(t.sha)}
                </span>
                {#if t.date > 0}
                  <span class="meta mono">{age(t.date)}</span>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/if}
  </section>

  <section class="rucksack" class:open={open.reflog}>
    <button
      class="section-toggle"
      onclick={() => (open.reflog = !open.reflog)}
      aria-expanded={open.reflog}
    >
      <span class="chev" aria-hidden="true">{open.reflog ? '▾' : '▸'}</span>
      <span class="label">Reflog</span>
      <span class="count mono">{reflogCount}</span>
    </button>
    {#if open.reflog}
      <div class="body">
        {#if loading}
          <p class="dim">…</p>
        {:else if reflogCount === 0}
          <p class="dim">No reflog entries.</p>
        {:else}
          <ol>
            {#each data!.reflog as r, i (i + ':' + r.sha)}
              <li>
                <span class="idx mono">{r.action}</span>
                <span class="msg" title={r.message}>{r.message}</span>
                <span class="meta mono">{shortSha(r.sha)}</span>
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    {/if}
  </section>
</aside>

<style>
  .rucksacks {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding: var(--s5) var(--s4);
    border-left: 1px solid var(--hairline);
    height: 100vh;
    box-sizing: border-box;
    background: var(--bg);
    position: sticky;
    top: 0;
    overflow-y: auto;
  }

  .hd {
    padding-bottom: var(--s2);
    border-bottom: 1px solid var(--hairline);
    margin-bottom: var(--s2);
  }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--branch-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .rucksack {
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

  .section-toggle .label {
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

  .body ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s1);
  }

  .body li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s2);
    align-items: baseline;
    font-size: 11px;
  }

  .idx {
    color: var(--branch-2);
    font-size: 10px;
  }

  .msg {
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .meta {
    color: var(--text-secondary);
    font-size: 10px;
  }
</style>
