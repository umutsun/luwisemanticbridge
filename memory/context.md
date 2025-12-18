# SpecPulse Context

## Current Feature
- **ID**: 001
- **Name**: n8n-lsemb-integration
- **Status**: DRAFT - Awaiting Clarifications
- **Spec File**: specs/001-n8n-lsemb-integration/spec-001.md

## Recent Activity
- 2025-12-17: Spec created with 12 clarification markers
- 2025-12-17: n8n server installed at n8n.luwi.dev
- 2025-12-17: Malware removed from production server

## Pending Clarifications
1. Channel priority (Telegram, WhatsApp, REST API, Discord, Slack)
2. Data scraping frequency
3. Max response time
4. Concurrent user support
5. Rate limiting
6. Database schema changes
7. API key management
8. Embedding model choice
9. Chunk configuration
10. Target instances (EmlakAI only vs all)
11. Language support
12. Authentication method
13. Integration strategy with existing chat

## Next Steps
1. Run `/sp-clarify` to resolve all clarifications
2. Generate implementation plan with `/sp-plan`
3. Create tasks with `/sp-task`

## Notes
- n8n community nodes already exist in `luwi-semantic-bridge/n8n-community-node`
- Production n8n running at https://n8n.luwi.dev
- Detailed plan available in `docs/reports/N8N_LSEMB_INTEGRATION_PLAN.md`
