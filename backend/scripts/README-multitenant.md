# Multi-Tenant Management & Testing Scripts

Comprehensive test and maintenance scripts for multi-tenant LSEMB deployments (emlakai_lsemb, bookie_lsemb).

## Quick Start

```bash
# Full health check (recommended daily)
npm run test:tenants

# Fix all issues automatically
npm run fix:tenants

# PM2 services check
npm run check:pm2
```

## Available Scripts

### 1. Check Tenant Databases

**File:** `check-tenant-databases.js`

Check the health and integrity of tenant databases.

```bash
# Check all tenant databases
node scripts/check-tenant-databases.js

# Check specific tenant
node scripts/check-tenant-databases.js emlakai_lsemb
node scripts/check-tenant-databases.js bookie_lsemb
```

**What it checks:**
- ✅ Database connectivity
- ✅ user_sessions table structure (all required columns)
- ✅ Settings count and app.name value
- ✅ Admin users existence

**Example output:**
```
============================================================
EmlakAI (emlakai_lsemb)
============================================================
  ✅ Database: Connected
  ✅ user_sessions: All required columns present
  Settings count: 601
  ✅ App name: "EmlakAI" (correct)
  ✅ Admin users: 1 found
     - admin (admin@emlakai.com) [✓]

Overall Status: ✅ HEALTHY
```

---

### 2. Fix Tenant Databases

**File:** `fix-multitenant-databases.js`

Automatically fix common issues in tenant databases.

```bash
# Fix all tenant databases
node scripts/fix-multitenant-databases.js

# Fix specific tenant
node scripts/fix-multitenant-databases.js emlakai_lsemb
node scripts/fix-multitenant-databases.js bookie_lsemb
```

**What it fixes:**
- ✅ Adds missing columns to user_sessions table:
  - `refresh_token`
  - `updated_at`
  - `last_accessed`
  - `session_token`
  - `ip_address`
  - `user_agent`
- ✅ Copies all settings from main LSEMB database
- ✅ Updates tenant-specific branding:
  - `app.name`
  - `app_name`
  - `app_title`
  - `app_description`

**Example output:**
```
============================================================
Fixing database: emlakai_lsemb
App Name: EmlakAI
============================================================

=== Fixing user_sessions table for emlakai_lsemb ===
✅ Added missing columns to user_sessions

=== Copying settings from LSEMB to emlakai_lsemb ===
Found 601 settings in LSEMB
Cleared tenant settings
✅ Copied 601 settings to emlakai_lsemb
emlakai_lsemb now has 601 settings

✅ Successfully fixed emlakai_lsemb!
```

---

## Tenant Configuration

Current tenants configured in scripts:

| Tenant | Database | App Name | Description |
|--------|----------|----------|-------------|
| EmlakAI | `emlakai_lsemb` | EmlakAI | AI-powered real estate analysis |
| Bookie | `bookie_lsemb` | Bookie AI | AI-powered book discovery |
| LSEMB | `lsemb` | Mali Müşavir Asistanı | Main/prototype system |

---

## Common Issues & Solutions

### Issue: Settings not loading in frontend

**Symptoms:**
- Frontend shows default "ASB Assistant" or "Mali Müşavir Asistanı"
- Settings page is empty
- Can't save settings

**Solution:**
```bash
node scripts/fix-multitenant-databases.js <tenant_name>
pm2 restart <tenant>-backend
```

### Issue: Login fails with "refresh_tokens" error

**Symptoms:**
- 500 error on login
- Backend logs show: `column "refresh_token" does not exist`

**Solution:**
```bash
node scripts/fix-multitenant-databases.js <tenant_name>
pm2 restart <tenant>-backend
```

### Issue: Database schema incomplete

**Symptoms:**
- Missing tables or columns
- 500 errors on various API endpoints

**Solution:**
```bash
# First, check what's missing
node scripts/check-tenant-databases.js <tenant_name>

# Then fix
node scripts/fix-multitenant-databases.js <tenant_name>
```

---

## Adding New Tenants

To add a new tenant, update both scripts:

1. **check-tenant-databases.js:**
```javascript
const TENANTS = {
  // ... existing tenants ...
  'newtenant_lsemb': {
    database: 'newtenant_lsemb',
    displayName: 'New Tenant',
    expectedAppName: 'New Tenant App'
  }
};
```

2. **fix-multitenant-databases.js:**
```javascript
const TENANTS = {
  // ... existing tenants ...
  'newtenant_lsemb': {
    database: 'newtenant_lsemb',
    appName: 'New Tenant App',
    appTitle: 'New Tenant - Description',
    appDescription: 'Brief description of the app'
  }
};
```

---

## Environment Variables

Scripts use these environment variables (from `.env` or `.env.lsemb`):

```bash
POSTGRES_HOST=91.99.229.96
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Semsiye!22
```

**Note:** Scripts default to production values if env vars are not set.

---

## Maintenance Workflow

Recommended workflow when deploying tenant updates:

```bash
# 1. Check status before changes
node scripts/check-tenant-databases.js

# 2. Apply fixes if needed
node scripts/fix-multitenant-databases.js

# 3. Restart backends
pm2 restart emlakai-backend bookie-backend

# 4. Verify fixes
node scripts/check-tenant-databases.js

# 5. Test in browser
# - Login
# - Check settings page
# - Save settings
```

---

## Related Documentation

- Multi-tenant setup: `/setup-microservice/README.md`
- Deployment guide: `/DEPLOYMENT.md`
- PM2 management: `/.claude/skills/pm2-process-management.md`

---

## Troubleshooting

### Script fails with "password authentication failed"

Check that `.env.lsemb` exists and has correct PostgreSQL credentials.

### "Cannot find module 'pg'"

Install dependencies:
```bash
cd backend
npm install
```

### Settings copied but app name still wrong

Clear browser cache or do a hard refresh (Ctrl+Shift+R).
Settings are cached in frontend.
