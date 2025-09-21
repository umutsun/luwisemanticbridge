# Frontend Task Division — Claude Code & Codex

Purpose: Clear, actionable split of frontend work so both agents can start immediately without architecture changes. Claude Code leads architecture/UX; Codex focuses on implementation and integrations.

API base: `http://localhost:3002` (from `.env` PORT)

Key backend endpoints to integrate
- Health: `GET /api/health`
- Backend Status: `GET /api/backend/status`
- RAG Search: `GET /api/rag/search?q=...&topK=...`, `POST /api/rag/search`
- LightRAG: `POST /api/lightrag/query`, `GET /api/lightrag/graph`, `POST /api/lightrag/build`
- Migration Status: `GET /api/migration/status`
- WebSocket: `socket.io` on same origin

Foundations (no architecture changes)
- State management, routing, and design system remain per existing patterns. Claude Code validates and documents decisions; Codex implements to spec.
- Env: `dashboard/` uses `NEXT_PUBLIC_API_URL` when needed; default to `http://localhost:3002` if unset.

Deliverables and Ownership

1) Information Architecture & UX Flows
- Owner: Claude Code
- Tasks:
  - Define sitemap and routes for: Home/Dashboard, Health, Status, RAG Search, LightRAG (Query, Graph, Build), Admin/Migration.
  - Provide wireframes with component blocks and interaction notes.
  - Document navigation structure, breadcrumbs, and empty states.
- Acceptance:
  - Route map and low‑fi wireframes attached in repo (`docs/`), reviewed by Codex.

2) Design System & Tokens
- Owner: Claude Code
- Tasks:
  - Color, spacing, typography tokens; light/dark mode guidance.
  - Component guidelines for: PageHeader, Card, Table, Form, Tag, Toast.
  - Accessibility criteria (contrast, focus ring, keyboard navigation).
- Acceptance:
  - Design tokens doc; component spec notes; a11y checklist.

3) App Shell, Layout, Navigation
- Owner: Codex
- Tasks:
  - Implement top‑level layout with header, left nav, content area.
  - Responsive breakpoints; persistent nav highlighting; active route state.
  - Hook `NEXT_PUBLIC_API_URL` into a small `lib/api.ts` helper.
- Acceptance:
  - Layout renders across routes; nav reflects current page; no CLS.

4) Health & Status Pages
- Owner: Codex
- Tasks:
  - Health page calls `GET /api/health` and renders service status (API/DB/Redis) with up/down badges.
  - Status page calls `GET /api/backend/status` and shows database/redis health, overall progress, timestamp.
  - Add auto‑refresh (polling 10s) and a manual refresh.
- Acceptance:
  - Loading, success, and error states covered; unit tests for parsers.

5) RAG Search Page
- Owner: Codex (impl), Claude Code (UX)
- Tasks:
  - UX: Search bar, topK selector, results list with title, snippet, similarity, source.
  - Impl: Wire `GET /api/rag/search` with debounced query; optional `POST` fallback.
  - Empty state and “no results” handling; copy‑to‑clipboard for result content.
- Acceptance:
  - E2E flow from input → results; error toasts; keyboard submit.

6) LightRAG Pages (Query, Graph, Build)
- Owner: Codex (impl), Claude Code (UX for graph)
- Tasks:
  - Query: `POST /api/lightrag/query` — show answer, sources, optional entities when `useGraph`.
  - Graph: `GET /api/lightrag/graph` — render simple force‑directed or static graph (Node, Edge lists OK initially).
  - Build: `POST /api/lightrag/build` — show “started” with job id (mock acceptable for now).
- Acceptance:
  - Pages load and render mock/prod responses; graph is readable on mobile and desktop.

7) Admin — Migration Status
- Owner: Codex
- Tasks:
  - Call `GET /api/migration/status`; table/cards for per‑table stats and totals.
  - Progress bars; timestamps; tokens/cost when provided.
- Acceptance:
  - Matches API structure; pagination not required; sorts by table name.

8) Realtime Indicators (Socket.io)
- Owner: Codex (impl), Claude Code (UX for toasts/indicators)
- Tasks:
  - Establish socket connection; implement a minimal channel subscribe utility.
  - Show non‑intrusive toast on key events (e.g., `config_update`, `migration_progress`).
- Acceptance:
  - Socket connects; toasts appear on published sample events.

9) Error Handling & Observability Hooks
- Owner: Codex
- Tasks:
  - Centralized API error mapper; retry/backoff for transient errors.
  - Console logs kept minimal; add placeholders for telemetry if enabled.
- Acceptance:
  - All pages display friendly error and recovery UI.

10) Accessibility & Performance Pass
- Owner: Codex (impl), Claude Code (sign‑off)
- Tasks:
  - a11y: Landmarks, labels, focus order, color contrast.
  - Perf: Avoid N+1 API calls, memoize heavy lists, image optimization.
- Acceptance:
  - Lighthouse a11y ≥ 90; perf ≥ 85 in dev environment.

11) Testing
- Owner: Codex
- Tasks:
  - Unit tests for API helpers and parsers; snapshot tests for core components.
  - Basic integration test for RAG flow.
- Acceptance:
  - Tests run in CI locally; coverage for helpers ≥ 80%.

12) Documentation
- Owner: Claude Code (overview), Codex (impl notes)
- Tasks:
  - Add quickstart and route map to `README.md` or `docs/`.
  - Component usage notes and API response shapes.
- Acceptance:
  - Up‑to‑date docs; links to backend endpoints and env vars.

Milestones (suggested)
- M1 (Today): IA/UX outline (Claude), layout + health/status pages (Codex).
- M2: RAG search complete; admin status page.
- M3: LightRAG pages; socket toasts; a11y/perf pass.

Coordination & Keys (Redis)
- Context key: `frontend-division-claude-codex` (db 2)
- Event channel: `asb:events` — message type `frontend_division` when updated.

Notes
- No architecture changes; Claude Code is the architect.
- Codex follows the provided specs and keeps diffs minimal.

