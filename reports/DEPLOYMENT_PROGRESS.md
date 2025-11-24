# 🚀 Deployment Progress Report

**Date**: 2025-11-24
**Status**: 🟢 READY FOR DEPLOYMENT
**Current Phase**: Phase 1 (Local Preparation Complete)

## 📋 Phase 1: Pre-deployment Verification (Local)

### 🔍 Configuration Check
- [x] Check Local Codebase
- [x] Verify Port Configurations
  - **Resolved**: Updated `python/luwi-devops.py` and `ecosystem.config.js` to match the requested ports:
    - **LSEMB**: 8080 / 3000 (Redis: 2)
    - **EMLAKAI**: 8081 / 3001 (Redis: 1)
    - **BOOKIE**: 8082 / 3002 (Redis: 4)
    - **SCRIPTUS**: 8086 / 3006 (Redis: 3)

## 🚀 Next Steps (Server-Side Execution)

Since I cannot directly access the production server, please execute the following steps:

1.  **Push Changes**: I will push the configuration updates to git.
2.  **Connect to Server**: SSH into `91.99.229.96`.
3.  **Update Code**: Run `git pull` in `/var/www/lsemb` (or use `luwi-devops.py` -> Option 5).
4.  **Sync Tenants**: Use `luwi-devops.py` -> GitHub Operations -> Sync all tenants.
5.  **Update Env**: Use `luwi-devops.py` -> Manage Tenant -> Update .env configuration (to apply new ports).
6.  **Restart Services**: Use `luwi-devops.py` -> Restart services.

### ⚠️ Critical Server-Side Tasks (Phase 8 & Cleanup)
Run these commands on the server to complete the request:

```bash
# 1. Backup Databases (Phase 8)
pg_dump -U postgres -h 91.99.229.96 -d lsemb > /var/backups/lsemb_$(date +%F).sql
pg_dump -U postgres -h 91.99.229.96 -d emlakai_lsemb > /var/backups/emlakai_$(date +%F).sql
pg_dump -U postgres -h 91.99.229.96 -d bookie_lsemb > /var/backups/bookie_$(date +%F).sql
pg_dump -U postgres -h 91.99.229.96 -d scriptus_lsemb > /var/backups/scriptus_$(date +%F).sql

# 2. Crawl Cleanup & Embeddings (User Request)
# Run these inside the respective backend directories or via a management script if available.
# Example for LSEMB:
cd /var/www/lsemb/backend
npx ts-node scripts/cleanup_crawls.ts
npx ts-node scripts/generate_embeddings.ts
```
