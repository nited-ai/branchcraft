# branchcraft

> Visual Git for solo devs and vibe-coding teams.

**branchcraft** is a local-first, web-based Git GUI that does what no other Git tool does:

1. **Sees your worktrees** — every checkout, which branch, which commit, which session is touching it, which are stale.
2. **Sees your AI sessions** — pulls live state from Claude Code, Codex CLI, Codex Desktop, Gemini CLI, and Aider, and ties each session to the branch and commit it's working on.
3. **Previews commands before you run them** — drag a branch onto another, see exactly what the graph will look like before you commit. Build a queue of operations, reorder, run them all when you're ready.

> ⚠️ **Status: pre-MVP, in active development.** Not usable yet. See [`PLAN.md`](./PLAN.md) for the design, scope, and build plan.

---

## Why branchcraft

The problem isn't that Git is hard. The problem is that **Git tools were built for a single person making a single change to a single working copy**, and that hasn't been the world for a while.

Today's reality:
- You have **3-6 worktrees** open at once because you're juggling parallel work.
- You run **multiple AI coding sessions** in parallel — Claude Code in one terminal, Cursor in another, Aider in a third.
- You and your teammates push to the **same branch** and one of you doesn't realize they're 4 commits behind.
- You're learning Git and you don't actually know what `git rebase --onto` does to your graph.

Existing tools either show the graph (GitKraken, Sourcetree, GitLens) **or** manage worktrees (Crystal, Nimbalyst, lazyworktree) **or** teach Git (Learn Git Branching) — but none combine all three with awareness of which AI session is on which branch.

branchcraft fills that gap.

---

## Quickstart (planned)

```bash
# In any local Git repo:
npx branchcraft

# Opens http://localhost:7777 in your browser.
```

Multi-repo mode:

```bash
# Anywhere:
npx branchcraft --hub

# Pin multiple repos in the sidebar, switch between them.
```

GitHub integration (optional):

```bash
npx branchcraft --connect-github
# Opens device-code flow, stores token in ~/.branchcraft/.
# Enables: PR overlay on the graph, push with HTTPS+token, pre-push lease check.
```

---

## How it differs from existing tools

|  | branchcraft | GitKraken | Sourcetree | Crystal/Nimbalyst | Learn Git Branching |
|---|:---:|:---:|:---:|:---:|:---:|
| Visual graph | ✓ | ✓ | ✓ | – | ✓ (sandbox) |
| Worktree-aware | ✓ | partial | – | ✓ | – |
| AI-session-aware | ✓ | – | – | partial | – |
| Multi-AI-tool support | ✓ | – | – | – | – |
| Drag-and-drop with **preview** | ✓ | drag-only (executes immediately) | – | – | ✓ (sandbox only) |
| Command queue + reorder | ✓ | – | – | – | – |
| Operates on real repos | ✓ | ✓ | ✓ | ✓ | – |
| Open source | ✓ MIT | – | – | ~~MIT (deprecated)~~ | ✓ |
| Free | ✓ | freemium | ✓ | freemium | ✓ |
| Distribution | npx (planned) | desktop app | desktop app | desktop app | web |

---

## Roadmap

**MVP (~9 evenings of work):**

| Evening | Scope |
|---|---|
| 1 | Status mode for one repo |
| 2 | Multi-repo hub |
| 3 | Plugin architecture for AI session providers (CCD, Claude CLI, Codex CLI, Codex Desktop, Gemini CLI, Aider) |
| 4 | Simulator core + command queue |
| 5 | Drag layer with hover preview |
| 6 | Stash / Tags / Reflog rucksacks |
| 7 | GitHub OAuth + PR overlay + push auth |
| 8 | Team features (pre-push warnings, onboarding tooltips) |
| 9 | Reorder-compare + polish + cross-platform validation |

**Post-MVP:**
- VS Code extension
- Tauri desktop builds
- Inline PR comments / webhooks
- Cursor / Continue / Cline session providers (app-data-stored)

Full design and scope: [`PLAN.md`](./PLAN.md).

---

## Tech stack

- **Backend:** Bun + Hono (single binary, native FS watching, native WebSocket)
- **Frontend:** Svelte 5 + Vite + native SVG (no graph library — full control over preview overlays)
- **Drag and drop:** svelte-dnd-action
- **Fonts:** Manrope (display) + IBM Plex Mono (code)
- **License:** MIT

---

## Contributing

Pre-alpha. Issues and discussions welcome to shape the design before we ship the MVP.

If you've got an opinion on the [open questions in PLAN.md §11](./PLAN.md), open a discussion.

---

## License

MIT — see [LICENSE](./LICENSE).
