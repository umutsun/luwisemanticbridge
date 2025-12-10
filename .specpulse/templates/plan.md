# Implementation Plan: {feature_name}

**Feature ID:** {feature_id}
**Specification:** `spec-{feature_id}.md`
**Created:** {created_date}
**Estimated Duration:** {estimated_hours} hours

---

## 🎯 Implementation Overview

### Objectives
1. [Primary objective]
2. [Secondary objective]
3. [Tertiary objective]

### Success Metrics
- [ ] Metric 1
- [ ] Metric 2
- [ ] Metric 3

---

## 📋 Prerequisites

### Required Knowledge
- [ ] Understanding of [technology/concept]
- [ ] Familiarity with [existing system]

### Environment Setup
```bash
# Local development
cd c:\xampp\htdocs\lsemb
npm install
# ... other setup commands
```

### Dependencies Check
- [ ] Node.js 20.x installed
- [ ] Python 3.12 installed
- [ ] PostgreSQL running
- [ ] Redis running
- [ ] Git configured

---

## 🏗️ Architecture Strategy

### File Structure
```
lsemb/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── dashboard/
│   │   │       └── {feature}/
│   │   │           ├── page.tsx
│   │   │           └── components/
│   │   └── services/
│       └── {feature}.service.ts
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── api/
│   │   │       └── v2/
│   │   │           └── {feature}.routes.ts
│   │   └── services/
│   │       └── {feature}.service.ts
└── backend/python-services/
    └── {feature}/
        └── {feature}_service.py
```

### Component Diagram
```
[User Interface]
      ↓
[API Layer (Express)]
      ↓
[Business Logic (Services)]
      ↓
[Data Layer (PostgreSQL + Redis)]
      ↓
[Python Services (Optional)]
```

---

## 📅 Implementation Phases

### Phase 1: Database & Backend Foundation (X hours)

#### 1.1 Database Schema
**Files:** `backend/migrations/{timestamp}_create_{feature}.ts`

```typescript
// Migration sketch
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('table_name', (table) => {
    table.uuid('id').primary();
    // ...
  });
}
```

**Tasks:**
- [ ] Create migration file
- [ ] Test migration locally
- [ ] Verify schema in `lsemb` DB

**Estimated:** X hours

---

#### 1.2 Backend Service Layer
**Files:**
- `backend/src/services/{feature}.service.ts`
- `backend/src/types/{feature}.types.ts`

**Tasks:**
- [ ] Create service class
- [ ] Implement CRUD operations
- [ ] Add error handling
- [ ] Write unit tests

**Estimated:** X hours

---

#### 1.3 API Routes
**Files:** `backend/src/routes/api/v2/{feature}.routes.ts`

**Tasks:**
- [ ] Define route endpoints
- [ ] Add authentication middleware
- [ ] Add validation middleware
- [ ] Test with Postman/curl

**Estimated:** X hours

---

### Phase 2: Frontend Implementation (X hours)

#### 2.1 Service Layer
**Files:** `frontend/src/services/{feature}.service.ts`

```typescript
// Service sketch
export class FeatureService {
  async fetchData() {
    // Implementation
  }
}
```

**Tasks:**
- [ ] Create service class
- [ ] Implement API calls
- [ ] Add error handling
- [ ] Add TypeScript types

**Estimated:** X hours

---

#### 2.2 UI Components
**Files:** `frontend/src/app/dashboard/{feature}/`

**Components:**
- `page.tsx` - Main page
- `components/FeatureList.tsx`
- `components/FeatureForm.tsx`
- `components/FeatureDetail.tsx`

**Tasks:**
- [ ] Create page structure
- [ ] Build components
- [ ] Add styling (Tailwind CSS)
- [ ] Implement state management

**Estimated:** X hours

---

#### 2.3 Integration & Testing
**Tasks:**
- [ ] Connect frontend to backend
- [ ] Test user workflows
- [ ] Handle edge cases
- [ ] Add loading states
- [ ] Add error messages

**Estimated:** X hours

---

### Phase 3: Python Services (Optional) (X hours)

#### 3.1 Python Service Implementation
**Files:** `backend/python-services/{feature}/`

**Tasks:**
- [ ] Create FastAPI service
- [ ] Implement business logic
- [ ] Add Redis integration
- [ ] Test independently

**Estimated:** X hours

---

### Phase 4: Testing & Quality Assurance (X hours)

#### 4.1 Unit Tests
```bash
# Backend
npm run test -- {feature}.service.test.ts

# Frontend
npm run test -- {feature}.test.tsx
```

**Tasks:**
- [ ] Backend service tests
- [ ] Frontend component tests
- [ ] Python service tests
- [ ] Achieve >80% coverage

**Estimated:** X hours

---

#### 4.2 Integration Tests
**Tasks:**
- [ ] API endpoint tests
- [ ] Database transaction tests
- [ ] Cross-service tests

**Estimated:** X hours

---

### Phase 5: Documentation (X hours)

**Files:** `docs/reports/FEATURE_{feature_id}_{feature_name}.md`

**Tasks:**
- [ ] Write user guide
- [ ] Document API endpoints
- [ ] Add code comments
- [ ] Create README updates

**Estimated:** X hours

---

## 🌐 Multi-Instance Deployment Plan

### Step 1: Local Testing (lsemb)
```bash
# Run migrations
cd backend
npm run migrate:latest

# Test locally
npm run dev
```

**Verification:**
- [ ] Feature works in local environment
- [ ] All tests pass
- [ ] No console errors

---

### Step 2: Git Workflow
```bash
# Create feature branch
git checkout -b {feature_id}-{feature_name}

# Commit changes
git add .
git commit -m "feat: {feature_name}

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to remote
git push -u origin {feature_id}-{feature_name}
```

---

### Step 3: Production Deployment

#### EmlakAI Instance
```bash
ssh root@91.99.229.96 "
cd /var/www/emlakai
git pull
cd backend && npm run migrate:latest && npm install && pm2 restart emlakai-backend
cd ../frontend && npm run build && pm2 restart emlakai-frontend
"
```

**Verification:**
- [ ] Migration successful
- [ ] Backend restarted
- [ ] Frontend built and deployed
- [ ] No errors in PM2 logs

---

#### Vergilex Instance
```bash
ssh root@91.99.229.96 "
cd /var/www/vergilex
git pull
cd backend && npm run migrate:latest && npm install && pm2 restart vergilex-backend
cd ../frontend && npm run build && pm2 restart vergilex-frontend
"
```

**Verification:**
- [ ] Migration successful
- [ ] Backend restarted
- [ ] Frontend built and deployed
- [ ] No errors in PM2 logs

---

#### Bookie Instance
```bash
ssh root@91.99.229.96 "
cd /var/www/bookie
git pull
cd backend && npm run migrate:latest && npm install && pm2 restart bookie-backend
cd ../frontend && npm run build && pm2 restart bookie-frontend
"
```

**Verification:**
- [ ] Migration successful
- [ ] Backend restarted
- [ ] Frontend built and deployed
- [ ] No errors in PM2 logs

---

### Step 4: Post-Deployment Verification
```bash
# Check PM2 status
ssh root@91.99.229.96 "pm2 list"

# Check logs for errors
ssh root@91.99.229.96 "pm2 logs emlakai-backend --lines 50 | grep -i error"
ssh root@91.99.229.96 "pm2 logs vergilex-backend --lines 50 | grep -i error"
ssh root@91.99.229.96 "pm2 logs bookie-backend --lines 50 | grep -i error"
```

**Final Checks:**
- [ ] All instances running
- [ ] No error logs
- [ ] Feature accessible in production
- [ ] Database migrations synced

---

## 🚨 Rollback Plan

### If Deployment Fails:

```bash
# Rollback git
git revert HEAD
git push

# Or rollback to specific commit
git reset --hard {previous_commit_hash}
git push --force

# Rollback migration (if needed)
ssh root@91.99.229.96 "
cd /var/www/{instance}/backend
npm run migrate:rollback
pm2 restart {instance}-backend
"
```

---

## 🔍 Critical Files Checklist

### Backend Files
- [ ] `backend/src/services/{feature}.service.ts`
- [ ] `backend/src/routes/api/v2/{feature}.routes.ts`
- [ ] `backend/src/types/{feature}.types.ts`
- [ ] `backend/migrations/{timestamp}_create_{feature}.ts`
- [ ] `backend/src/__tests__/{feature}.service.test.ts`

### Frontend Files
- [ ] `frontend/src/app/dashboard/{feature}/page.tsx`
- [ ] `frontend/src/services/{feature}.service.ts`
- [ ] `frontend/src/types/{feature}.types.ts`
- [ ] `frontend/src/components/{feature}/`

### Python Files (if applicable)
- [ ] `backend/python-services/{feature}/{feature}_service.py`
- [ ] `backend/python-services/{feature}/requirements.txt`

### Documentation
- [ ] `docs/reports/FEATURE_{feature_id}_{feature_name}.md`
- [ ] Updated `README.md` (if needed)

---

## 📊 Progress Tracking

### Daily Checklist
- [ ] Code committed daily
- [ ] Tests written for new code
- [ ] Documentation updated
- [ ] No blocking issues

### Weekly Review
- [ ] Phase completion status
- [ ] Blocker resolution
- [ ] Timeline adjustment

---

## 🤝 Dependencies & Blockers

### External Dependencies
- [ ] Dependency 1
- [ ] Dependency 2

### Known Blockers
- [ ] Blocker 1: [Description + Resolution plan]
- [ ] Blocker 2: [Description + Resolution plan]

---

## 📝 Notes & Decisions

### Technical Decisions
1. **Decision 1:** [Rationale]
2. **Decision 2:** [Rationale]

### Trade-offs
1. **Trade-off 1:** [Description]
2. **Trade-off 2:** [Description]

---

**Related Documents:**
- Specification: `spec-{feature_id}.md`
- Task Breakdown: `task-{feature_id}.md`
- Feature Documentation: `docs/reports/FEATURE_{feature_id}_{feature_name}.md`

---

*Generated by SpecPulse v2.6.0*
*Template optimized for LSEMB Multi-Instance Deployment*
