# Alice Semantic Bridge (ASEMB)

Multi-tenant RAG for n8n using pgvector, Redis, and LightRAG-style retrieval. This repository contains n8n nodes, helpers, and supporting scripts to build a pragmatic, production‑oriented semantic bridge.

Status: not production ready yet. This README consolidates prior docs and reflects actual metrics.

## Current State

- Test coverage: 51.5% (statements). Branch coverage not yet tracked.
- Latency: not measured. No SLOs defined or validated.
- Cache hit‑rate: not measured in CI; only ad‑hoc.
- CI: GitHub Actions added to run build, tests, and enforce minimal coverage on PRs.

If you need a stable release, consider this repository pre‑release. See PRODUCTION_CHECKLIST.md for the hardening path.

## Quick Start

Prerequisites
- Node.js 18+
- PostgreSQL 15+ with pgvector
- Redis 7+
- n8n 1.0+

Install and test
```bash
npm ci
npm run build
npm test
```

Optional: start local stack
```bash
npm run docker:up
npm start
```

Windows convenience
- `scripts\start_unified.bat` — stops known ports, brings up docker, then starts the app
- `scripts\stop_unified.bat` — kills processes on common dev ports

## Repository Layout (Proposed)

This repo has grown organically. The target structure is:

```
apps/
  api/             # API or server apps
  dashboard/       # UI or status dashboards
packages/
  shared/          # Reusable libs (db, embeddings, chunking)
  agents/          # CLI agent workspaces (.claude, .gemini, .codex)
scripts/           # Dev/CI helpers, SQL, wrappers
migrations/        # SQL migrations
docs/              # Documentation
workflows/         # n8n workflow templates
_archive/          # Old experiments, backups
```

During this pass, agent folders were relocated under `packages/agents/`.

## n8n + Nodes

- Source code for nodes and helpers lives under `src/` and `shared/` (TypeScript).
- Tests live under `test/` mirroring `src/`.
- Build: `npm run build` produces artifacts for publishing to n8n.

## CI & Quality Gates

- GitHub Actions workflow at `.github/workflows/ci.yml` runs build, tests, and coverage.
- PRs must meet minimum coverage: ≥60% statements and ≥40% branches (temporary lower gates; will be raised).
- Local coverage report: `npm run test:coverage`.

## Production Readiness

See PRODUCTION_CHECKLIST.md for the full gating list (indexes, cache hit‑rate ≥0.6, Redis stability, coverage ≥75%, latency SLOs, etc.). Until those are met with repeatable metrics, do not treat this as production‑ready.

## License

MIT — see LICENSE.

---

Notes
- Earlier “production‑ready” claims were removed in favor of measured, reproducible metrics.
- If you find outdated docs, open an issue or PR.

