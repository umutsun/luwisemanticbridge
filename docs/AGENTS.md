# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript sources for n8n nodes, credentials, helpers.
- `shared/`: Reusable utilities (chunking, search, db, embeddings).
- `test/`: Jest tests mirroring `src/` paths (`*.test.ts`).
- `workflows/`: n8n workflow templates (`workflows/templates/*.json`).
- `scripts/`: Dev/CI helpers (deploy prep, DB SQL, wrappers).
- `tools/asb-cli/`: ASB CLI config (`asb.config.json`).

Example: `src/nodes/PgvectorQuery.node.ts` → tests in `test/nodes/pgvector-query.node.test.ts`.

## Build, Test, and Development Commands
- `npm ci`: Install dependencies (Node 18+).
- `npm run build`: Compile TypeScript to `dist/`.
- `npm run dev`: Watch/compile during development.
- `npm test` / `npm run test:watch`: Run Jest tests (ts-jest).
- `npm run test:coverage`: Generate coverage report.
- Optional: `npm run asb` to run the ASB orchestrator; `npm run deploy:prepare` to bundle for publishing.

## Coding Style & Naming Conventions
- Language: TypeScript, strict types where practical.
- Indentation: 2 spaces; UTF-8; LF endings.
- Naming: Files `camelCase` or `kebab-case`; classes `PascalCase`; variables/methods `camelCase`; constants `UPPER_SNAKE_CASE`.
- Keep nodes self-contained; share logic via `shared/`. Avoid hidden globals; use dependency injection where possible.

## Testing Guidelines
- Framework: Jest with `ts-jest`.
- Location: Place tests under `test/` mirroring `src/`; name files `*.test.ts`.
- Scope: Focus on public behavior, edge cases, and error handling. Use data-driven tests where helpful.
- Run `npm test` before pushing; aim for meaningful coverage on changes.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Keep diffs focused and messages imperative.
- PRs: Provide a clear description, linked issues (e.g., `Closes #123`), screenshots for UI, steps to verify, and call out migrations or breaking changes.
- Keep PRs small; update docs and tests with code changes.

## Security & Configuration Tips
- Never commit secrets. Use `.env` locally and maintain `.env.example` with required keys.
- Validate and sanitize all external inputs; escape/encode outputs appropriately.
- Review dependency updates; after changes, run `npm test` and relevant integration checks.
