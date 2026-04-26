<script lang="ts">
  import type { Session, SessionProviderId } from '../shared/types.ts';

  type ActivityHint = {
    file?: string;
    ageSec: number;
    hasConflict: boolean;
  };
  type Props = { session: Session; activity?: ActivityHint };
  let { session, activity }: Props = $props();

  const PROVIDER_BADGE: Record<SessionProviderId, string> = {
    'claude-code': 'CC',
    aider: 'AI',
    'codex-cli': 'CX',
    'codex-desktop': 'CD',
    'gemini-cli': 'GM',
  };

  function age(ts: number): string {
    const sec = Math.floor(Date.now() / 1000) - ts;
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  function basename(p: string): string {
    return p.split(/[/\\]/).filter(Boolean).at(-1) ?? p;
  }

  let badge = $derived(PROVIDER_BADGE[session.provider] ?? '??');
  let shortId = $derived(session.id.slice(0, 6));
  let ageLabel = $derived(age(session.lastActivity));
</script>

<div
  class="pill"
  class:live={session.isLive}
  class:warn={activity?.hasConflict}
  data-session-id={session.id}
  title={session.title}
>
  <span class={`dot ${session.isLive ? 'dot-live' : 'dot-idle'}`} aria-hidden="true"></span>
  <span class="badge mono">{badge}</span>
  <span class="sid mono">{shortId}</span>
  <span class="title">{session.title}</span>
  {#if activity?.file}
    <span class="now mono">✎ {basename(activity.file)}</span>
  {/if}
  <span class="age mono">{ageLabel}</span>
</div>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--s2);
    height: 22px;
    padding: 0 var(--s3);
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 11px;
    background: transparent;
    max-width: 100%;
    min-width: 0;
  }

  .pill.live {
    background: rgba(109, 178, 109, 0.06);
    border-color: rgba(109, 178, 109, 0.25);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-live {
    background: var(--success);
    box-shadow: 0 0 0 2px rgba(109, 178, 109, 0.18);
  }

  .dot-idle {
    background: var(--text-secondary);
    opacity: 0.5;
  }

  .badge {
    font-size: 9px;
    font-weight: 600;
    color: var(--branch-2);
    background: rgba(212, 165, 74, 0.12);
    border: 1px solid rgba(212, 165, 74, 0.3);
    border-radius: 2px;
    padding: 1px 4px;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .sid {
    color: var(--text-secondary);
    font-size: 10px;
    flex-shrink: 0;
  }

  .title {
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  .age {
    color: var(--text-secondary);
    font-size: 10px;
    flex-shrink: 0;
  }

  .pill .now {
    font-size: 10px;
    color: var(--branch-2);
    margin-left: var(--s2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 12ch;
  }

  .pill.warn {
    animation: warn-pulse 2s ease-in-out infinite;
    border-color: var(--warning);
  }

  @media (prefers-reduced-motion: reduce) {
    .pill.warn {
      animation: none;
      border-color: var(--warning);
      background: rgba(212, 165, 74, 0.08);
    }
  }
</style>
