# Multi-Agent Activity & Conflict Detection

**Status:** Design — approved 2026-04-26, ready for implementation plan
**Author:** d.werwein@gmail.com (in collaboration with Claude)
**Relation:** Additive feature on top of [PLAN.md](../../../PLAN.md) and
[ROADMAP.md](../../../ROADMAP.md). Does not modify the original spec —
extends §4.1.2 (session pills) and adds a 4th rucksack section to §5.2.

## 1. TL;DR

Surface, in real time, what each parallel CCD session is doing on
disk, and warn when two sessions are about to collide. Two sources of
warning:

- **Live concurrent edits (C1)** — two sessions touched the same file
  in the past few minutes. Amber pulse on the session pills, fired
  the moment the second touch happens.
- **Branch divergence (C3)** — two branches have committed edits to
  the same file since their merge-base. Latent badge on the branch
  ref pill, computed lazily and cached.

Plus a chronological activity feed living as a 4th rucksack section.

## 2. Why this isn't already in PLAN.md

PLAN.md addresses *which* AI sessions exist (§4.1.2 session pills:
provider badge, session id, title, age) and *that* they're live
(green dot, mtime < 2 min). It does not address *what* a session is
doing right now or *where two sessions will collide*. That's the gap
this spec fills.

Per the project's primary persona (PLAN.md §2.1 A — "Multi-Worktree
Power User"), running 3-6 worktrees with that many AI sessions is
already a stated daily workflow. Without activity visibility you have
to context-switch into each CCD instance to see what they're doing.
Without conflict warnings you find out about overlap at merge time,
not at edit time.

## 3. Goals

1. **Per-session inline activity** on the session pill: most recent
   touched file + age. File-centric so it doubles as the conflict
   signal.
2. **Activity feed** as a 4th rucksack section on the right rail
   (§5.2 family): chronological event list across all sessions in
   the active repo.
3. **C1 warning** when two live sessions touch the same file within
   a 5-minute window. Surfaced as an amber pulse on the affected
   pills.
4. **C3 warning** when two branches have committed edits to the same
   file since their merge-base. Surfaced as a small `⚠N` badge on
   the branch ref pill, with hover help listing the conflicting
   sibling branches.
5. **Sub-second latency** for live events. The user expressed a
   strong preference for "fühlt sich live an"; chokidar-based
   watching, not poll-based.

## 4. Non-goals

- **Conflict resolution UI** — out of scope per PLAN.md §1.3. We
  warn; we don't help merge.
- **Cross-repo activity feed** — current repo only. Multi-repo
  dashboards are a Phase 2 idea.
- **Function- or AST-level conflict detection** — file-level only.
  Catching "agents edited overlapping functions in the same file"
  needs heavy analysis; the file-level signal is good enough.
- **Persistent activity history** — events live in memory, ring
  buffer per session, lost on server restart. Long-term history is
  in the JSONL files themselves; no need to duplicate.
- **Activity for non-CCD providers (Aider, etc.)** — Aider stores
  one history file per repo and doesn't have tool-use granularity in
  the same way. The interface is generic, but only the Claude Code
  provider implements live tracking initially.

## 5. Data model

```ts
type ActivityKind = 'edit' | 'write' | 'read' | 'bash' | 'other';

interface ActivityEvent {
  /** Provider's session id (matches Session.id). */
  sessionId: string;
  /** Worktree path the session lives in — matches Worktree.path. */
  cwd: string;
  /** Unix milliseconds — derived from JSONL `timestamp` field. */
  ts: number;
  kind: ActivityKind;
  /** Absolute path. Present for edit / write / read; absent for bash. */
  file?: string;
  /** Short label — bash command (first 60 chars) or tool name. */
  label?: string;
}

interface ConcurrentConflict {
  kind: 'concurrent';
  file: string;
  /** Sessions that touched the file in the C1 window, newest first. */
  sessions: { sessionId: string; ts: number }[];
}

interface DivergenceConflict {
  kind: 'divergence';
  /** Local branch name, e.g. "feat/auth". */
  branch: string;
  /** Sibling branches that overlap on at least one file since merge-base. */
  siblings: string[];
  /** Files that overlap (max 20 surfaced — for hover-help readability). */
  overlap: string[];
}

interface ActivitySnapshot {
  /** Recent events across all currently-active sessions, newest first, capped at ~200. */
  events: ActivityEvent[];
  concurrent: ConcurrentConflict[];
  divergence: DivergenceConflict[];
}
```

## 6. Server architecture

```
src/server/activity/
  watcher.ts       chokidar — one watcher per active JSONL
  extract.ts      JSONL line → ActivityEvent (filters tool_use)
  store.ts         ring buffer per session + per-file recent-touch index
  conflicts.ts     C1 (live) + C3 (branch divergence, cached)
  bus.ts           tiny pub/sub, one channel per repo
  index.ts         wiring + start/stop lifecycle
```

### 6.1 Watcher

- Uses `chokidar` (already in `package.json`).
- Watches `~/.claude/projects/<encoded-cwd>/*.jsonl`, scoped to
  files whose `mtime` is within the last 60 minutes — no point
  watching dead sessions.
- Tracks a byte-offset per file. On the watcher's `change` event,
  reads only `[offset, EOF]`, splits on newlines, parses each line
  as JSON, advances the offset.
- Buffers the trailing partial line per file (handles writes that
  span flushes).
- On `unlink`, releases the watcher and the offset.
- Periodic re-scan every 30 s to add JSONLs that became active
  while we weren't watching them yet.
- Per-repo cap: refuse to watch more than 50 sessions concurrently.
  Keeps memory predictable in a 400-session repo like SentryCall.

### 6.2 Extract

- Filters CCD's `message` records whose role is `assistant` and whose
  `content` includes `tool_use` blocks.
- Maps tool name to `ActivityKind`:
  - `Edit`, `MultiEdit` → `edit` + `file = input.file_path`
  - `Write` → `write` + `file = input.file_path`
  - `Read`, `NotebookRead` → `read` + `file = input.file_path`
  - `Bash` → `bash` + `label = input.command.slice(0, 60)`
  - anything else → `other` + `label = tool name`
- Resolves relative paths against the session's `cwd` so
  `file` is always absolute and comparable across sessions.

### 6.3 Store

- In-memory, per repo:
  - `Map<sessionId, RingBuffer<ActivityEvent>>` (capacity 50 per session).
  - `Map<absFilePath, { sessionId: string; ts: number }[]>` — the
    "who touched this recently" index. Each per-file list is also
    capped at the most recent 5 entries.
- Pruning: a 60 s sweeper drops file-index entries older than 5 min
  and ring-buffer entries older than 60 min.
- Restart-safe: on startup, read the *tail* of every active JSONL
  (~last 200 lines) so the user sees recent activity instead of an
  empty feed.

### 6.4 Conflict detection

**C1 (concurrent)** — runs synchronously on every new event:

```ts
onNewEvent(e: ActivityEvent) {
  if (!e.file) return;
  const recent = fileIndex.get(e.file) ?? [];
  const others = recent.filter(
    (r) => r.sessionId !== e.sessionId && Date.now() - r.ts < 5 * 60_000,
  );
  if (others.length > 0) emit({ kind: 'concurrent', file: e.file, sessions: [{...e}, ...others] });
  fileIndex.set(e.file, [{ sessionId: e.sessionId, ts: e.ts }, ...recent].slice(0, 5));
}
```

**C3 (divergence)** — runs on graph load and when refs change:

- For each local branch, compute `git diff --name-only
  <merge-base(branch, default)>..<branch-tip>`, cached as
  `Map<branchTipSha, Set<file>>`. Cache invalidates automatically
  because the key is the tip sha.
- Pairwise intersect the file sets. For each pair with non-empty
  intersection, emit a `DivergenceConflict` for both branches.
- Trigger for the initial render: invoked from `enrichWorktrees`
  (and the `/api/repos/:id/graph` path) when commits are loaded;
  divergence results attached to the `/api/repos/:id/worktrees`
  response under a new `divergence` field.
- Trigger for live updates: an `apply` of any command that mutates
  refs (merge / rebase / cherry-pick / reset / push) re-runs the
  divergence cache afterwards and republishes a `snapshot` on the
  bus. Subsequent C3 changes from external git activity (running
  git in a terminal) are caught only on the next reload — no
  filesystem watching of `.git/refs` in this phase. Documented as
  a phase-1 limitation.

### 6.5 EventBus

Trivial typed pub/sub:

```ts
class ActivityBus {
  private subs = new Map<string, Set<(msg: BusMsg) => void>>();
  subscribe(repoId: string, fn: (msg: BusMsg) => void): () => void;
  publish(repoId: string, msg: BusMsg): void;
}
```

`BusMsg` is a union of `{ kind: 'event', event: ActivityEvent }`,
`{ kind: 'conflict', conflict: ConcurrentConflict | DivergenceConflict }`,
and `{ kind: 'snapshot', snapshot: ActivitySnapshot }`.

### 6.6 API

Two new endpoints, both repo-scoped:

- `GET /api/repos/:id/activity` — JSON snapshot. Used for initial
  render before the SSE connection is up.
- `GET /api/repos/:id/activity/stream` — Server-Sent Events.
  Sends `event: snapshot` once on connect, then `event: activity`,
  `event: conflict`, and `event: heartbeat` (every 20 s, no payload,
  defeats proxy idle timeouts).

`Cache-Control: no-store`. CORS already handled by `app.use('/api/*',
cors())`.

## 7. Frontend integration

```
src/web/lib/sse.ts          tiny EventSource wrapper, auto-reconnect
src/web/ActivityFeed.svelte 4th rucksack section, chronological feed
src/web/SessionPill.svelte  + activity prop, + amber-pulse on conflict
src/web/Graph.svelte        + branch-pill ⚠N badge, + activity wiring
```

### 7.1 SSE client

`src/web/lib/sse.ts` exposes `subscribeActivity(repoId, handlers)`
that returns an unsubscribe function. Wraps `EventSource`, handles
auto-reconnect with exponential backoff up to 30 s, and forwards
parsed events to handler functions: `onSnapshot`, `onActivity`,
`onConflict`. Unsubscribing closes the EventSource.

### 7.2 App-level state

In `App.svelte`:

```ts
let activity = $state({
  bySession: new Map<string, ActivityEvent[]>(),
  events: [] as ActivityEvent[],            // flat chronological, capped 200
  concurrentByFile: new Map<string, ConcurrentConflict>(),
  divergenceByBranch: new Map<string, DivergenceConflict>(),
});
```

A single `$effect` watches `activeRepoId`. On change, unsubscribes
the previous SSE channel and subscribes the new one. On
`onSnapshot`, replaces state. On `onActivity` / `onConflict`,
mutates incrementally. On unmount or before unsubscribe, the
previous EventSource is closed.

### 7.3 SessionPill enhancement

New optional prop `activity?: { file: string; ageSec: number;
hasConflict: boolean }`. When present, the pill renders an extra
inline label `✎ {basename(file)} · {age}` after the title, dim
where the title is normal weight. When `hasConflict`, the pill's
border is amber and pulses (2 s loop, respects
`prefers-reduced-motion` — falls back to a static amber border).

The activity prop is computed in `Graph.svelte` from the App state:
the latest event per session whose age ≤ 5 min, paired with
`concurrentByFile.has(file)`.

### 7.4 ActivityFeed.svelte (4th rucksack section)

Slots into `Rucksacks.svelte` after Reflog. Default open. Renders
the most recent ~50 events from `activity.events`:

```
[CC] ef995a  ✎ src/auth.ts        2s
[CC] a1b2c3  🔧 bash               4s   $ npm test
[CC] ef995a  ▢ open  README.md    8s
```

Each row is clickable: scrolls the graph to that session's pill
(jump-and-flash, 600 ms gold pulse to draw the eye).

Conflict rows get a leading `⚠` and amber color. Format:
`⚠ ef995a + a1b2c3   src/auth.ts`.

### 7.5 Branch-pill ⚠N badge

In `Graph.svelte`'s ref-pill rendering, branches with a divergence
conflict get an additional small chip after the name: `⚠2`. Hover
help (`ContextHelp`) extends the existing branch help with a third
section: "Conflicts at merge: shares edits to N files with X, Y,
Z."

The badge is purely visual — not draggable, not a drop target.

### 7.6 CSS / motion

- `@keyframes warn-pulse`: 2 s ease-in-out, border colour and box
  shadow oscillate between hairline-amber and warning-amber. Single
  iteration count is `infinite` while the conflict is active.
- `@media (prefers-reduced-motion: reduce)`: drops the keyframes
  rule and replaces with a static border colour.
- Activity rows use the same monospace + grid layout as reflog
  entries — keeps the rucksack visually coherent.

## 8. Implementation phases

Each phase ends in a verifiable, independently committed slice.

### Phase 1 — server data layer

- `src/server/activity/{watcher,extract,store,conflicts,bus}.ts` plus tests.
- New endpoints `/api/repos/:id/activity` and `/activity/stream`.
- Hand-verifiable with `curl` against a running CCD session — should
  see live events streamed.
- DoD: events appear in the SSE stream within ~200 ms of a CCD tool
  use; C1 conflict appears within ~200 ms of the second touch; C3
  conflicts present in the snapshot for branches that overlap.

### Phase 2 — frontend wiring

- `src/web/lib/sse.ts` + state in `App.svelte`.
- `ActivityFeed.svelte` added as 4th rucksack section.
- DoD: the feed in the right rail updates live without a manual
  reload; reconnect after server restart works without a page
  refresh.

### Phase 3 — pill + branch badges

- `SessionPill` activity prop + amber-pulse class.
- Branch-pill `⚠N` badge in `Graph.svelte` plus the extended
  hover help.
- DoD: editing a file in a CCD session attached to a worktree
  renders the file path on its pill within 1 s. A second CCD session
  editing the same file lights both pills amber.

### Phase 4 — motion + accessibility polish

- `@keyframes warn-pulse` animation plus reduced-motion fallback.
- Click-to-scroll-and-flash on activity rows.
- Heartbeat keepalive verified through a 5-minute idle window.
- DoD: matches §3.5 motion characteristics; passes Lighthouse
  reduced-motion check.

## 9. Testing strategy

### 9.1 Unit (vitest)

- `extract.ts`: synthetic JSONL lines → expected `ActivityEvent`s.
  Covers each tool kind, malformed lines, missing fields.
- `store.ts`: ring-buffer eviction, file-index pruning, cross-session
  isolation.
- `conflicts.ts`: C1 inside-window vs outside-window, multi-session
  pile-up, ignores same-session re-touches; C3 with synthetic
  fixtures, intersection correctness, cache hit / miss.

### 9.2 Integration

- One full vitest case spinning up a temp git repo with two synthetic
  JSONL files and asserting that the bus publishes the expected
  events when bytes are appended (chokidar-driven).

### 9.3 Live manual

- Start branchcraft, open a CCD session in branchcraft itself, run
  an Edit tool. Pill should update within 1 s. Open a second CCD
  session targeting the same file — both pills go amber.

## 10. Open questions

- **Heartbeat period.** 20 s is conservative against proxies but
  chatty. If the user runs branchcraft over a non-proxied loopback
  only (the common case), 60 s is fine. Decision: 20 s default, tunable
  via env var `BRANCHCRAFT_SSE_HEARTBEAT_SEC`.
- **C3 default base.** Right now I propose merge-base against the
  repo's default branch (origin/HEAD). If the user works in a
  non-trunk-based flow (e.g. develop / main split) that's wrong;
  see if a per-repo configurable default is needed once the basic
  C3 lands.
- **Branch badge density.** `⚠N` is small but adds clutter when many
  branches have conflicts. Consider a global "conflicts: 3" indicator
  in the legend strip if the per-pill badges turn out to be too noisy.

## 11. Out of scope, explicitly

The following are deliberately *not* in this spec, even though they
sound related:

- Activity for command-source sessions (`/foo` invocations) — these
  also produce tool_use events and will flow through the same pipe
  unchanged. No special handling.
- Activity for scheduled-task sessions — already filtered to a
  separate fold in the existing UI; activity events on those
  sessions feed into the same store but are excluded from C1
  conflict detection (a scheduled task editing the same file as a
  human session is not a conflict; the human task wins implicitly).
- Aider live activity — the provider's `scanSessions` returns one
  pseudo-session per repo with no tool-use granularity. Out of
  scope until Aider's storage format is reverse-engineered for
  per-event detail.
- Alerts to other systems (desktop notifications, email, Slack) —
  the bus is internal; integrations are Phase 2.
