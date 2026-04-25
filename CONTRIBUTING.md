# Contributing to branchcraft

**Status: pre-MVP, in active design phase.** Code lands soon. Until then, the most valuable contribution is **feedback on the design**.

## Where to engage

- **Design feedback** → [Discussion #1 — Pre-MVP design review](https://github.com/nited-ai/branchcraft/discussions/1)
- **Bug reports** (once code lands) → [GitHub Issues](https://github.com/nited-ai/branchcraft/issues)
- **Feature requests / new ideas** → [Discussions / Ideas](https://github.com/nited-ai/branchcraft/discussions/categories/ideas)
- **Questions / how-tos** → [Discussions / Q&A](https://github.com/nited-ai/branchcraft/discussions/categories/q-a)

## Reading the spec first

Before opening an issue or PR, please skim:

- [`README.md`](./README.md) — what branchcraft is and how it differs from existing tools
- [`PLAN.md`](./PLAN.md) — full design spec, build plan, scope decisions, open questions

Most "why doesn't it do X" questions are answered there, often as explicit out-of-scope decisions.

## Development (once code lands)

This section will fill out as the codebase materializes. Expected workflow:

1. Fork and clone
2. `npm install` (or `bun install`)
3. `npm run dev` — starts backend + frontend with hot reload
4. Make changes, ensure `npm run check` passes (lint + typecheck + test)
5. Open PR with a focused description and a screenshot if visual

### Code style

- TypeScript strict mode
- Prettier + ESLint configs in repo (TBD which exact rules)
- One concern per PR. Refactors and features in separate PRs.
- Conventional commits preferred: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

### Tests

Test framework TBD (likely [Vitest](https://vitest.dev/)). Once code lands, every new feature should ship with at least one test that demonstrates the happy path.

## Code of conduct

See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). One-line summary: be kind, assume good faith. branchcraft targets people who don't yet know Git well — patience is part of the brief.

## License

By contributing, you agree your contributions will be licensed under the [MIT License](./LICENSE).
