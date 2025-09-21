# Production Readiness Checklist (ASEMB)

Use this checklist to harden the system and declare production readiness. All items should be measurable and repeatable.

## Data & Storage
- [ ] PostgreSQL version pinned (>=15) and pgvector extension enabled.
- [ ] Schema migrations versioned and reproducible (migrations/ tracked in CI).
- [ ] Critical indexes in place (vector, FK, search filters). List index DDL in migrations.
- [ ] VACUUM/ANALYZE strategy documented; `maintenance_work_mem` tuned for bulk ops.
- [ ] Backup/restore tested (point-in-time or daily snapshots). Recovery runbook exists.

## Cache & Messaging
- [ ] Redis deployment mode decided (standalone vs. cluster vs. managed).
- [ ] Cache hit‑rate ≥ 0.6 under typical load; metric exported to monitoring.
- [ ] Pub/Sub or queue consumers monitored; reconnection and backoff strategies verified.
- [ ] Key eviction policies defined and tested; memory ceilings configured.

## Performance & SLOs
- [ ] Latency SLOs defined (P50/P95 for search and API endpoints).
- [ ] Load tests executed against realistic datasets; baseline recorded.
- [ ] n8n workflow throughput targets documented; bottlenecks identified.
- [ ] Vector search recall/precision sampled for representative queries.

## Reliability & Ops
- [ ] Health checks implemented (API, DB, Redis). Liveness/readiness endpoints present.
- [ ] Observability in place (logs, metrics, traces). Dashboards linked.
- [ ] Alerting configured for error rate, latency, saturation, and cache hit‑rate.
- [ ] Error budget policy defined; rollbacks and feature freeze procedure documented.

## Security
- [ ] Secret management externalized (.env not committed; .env.example maintained).
- [ ] Input validation and output encoding audited.
- [ ] Rate limits and authn/authz enforced for admin/management endpoints.
- [ ] SBOM and dependency scan run in CI; critical vulns blocked.

## Testing & CI/CD
- [ ] Unit/integration tests cover critical paths; flaky tests quarantined.
- [ ] Coverage ≥ 75% (statements) and trending upward; branches coverage tracked.
- [ ] CI pipeline: build → test → coverage gate → (optional) publish artifacts.
- [ ] Rollout strategy documented (blue/green or canary) with rollback steps.

## Documentation & Runbooks
- [ ] Architecture diagram and data flow documented.
- [ ] On-call runbook for incidents (common failure modes and mitigations).
- [ ] Capacity planning guidelines (DB sizing, Redis memory, vector dims).
- [ ] Upgrade guide for Postgres/Redis/n8n and embeddings model changes.

