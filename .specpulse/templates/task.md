# Task Breakdown: {feature_name}

**Feature ID:** {feature_id}
**Plan:** `plan-{feature_id}.md`
**Created:** {created_date}
**Total Tasks:** {task_count}

---

## 📊 Task Summary

| Phase | Tasks | Estimated | Status |
|-------|-------|-----------|--------|
| Phase 1: Backend | X | Xh | 🔴 Not Started |
| Phase 2: Frontend | X | Xh | 🔴 Not Started |
| Phase 3: Testing | X | Xh | 🔴 Not Started |
| Phase 4: Deployment | X | Xh | 🔴 Not Started |
| **TOTAL** | **X** | **Xh** | **0% Complete** |

**Legend:**
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ⚠️ Blocked

---

## 📋 Phase 1: Database & Backend (Xh)

### Task 1.1: Create Database Migration
**File:** `backend/migrations/{timestamp}_create_{table}.ts`
**Estimated:** 1h
**Status:** 🔴

**Steps:**
1. [ ] Create migration file using Knex CLI
2. [ ] Define table schema
3. [ ] Add indexes
4. [ ] Add foreign keys
5. [ ] Test migration: `npm run migrate:latest`
6. [ ] Test rollback: `npm run migrate:rollback`

**Definition of Done:**
- [ ] Migration runs successfully
- [ ] Rollback works correctly
- [ ] Schema matches specification

**Command:**
```bash
cd backend
npx knex migrate:make create_{table}
```

---

### Task 1.2: Create TypeScript Types
**File:** `backend/src/types/{feature}.types.ts`
**Estimated:** 0.5h
**Status:** 🔴

**Steps:**
1. [ ] Define interfaces for entities
2. [ ] Define request/response types
3. [ ] Export all types
4. [ ] Add JSDoc comments

**Code Skeleton:**
```typescript
export interface Feature {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFeatureRequest {
  name: string;
}

export interface FeatureResponse {
  success: boolean;
  data?: Feature;
  error?: string;
}
```

---

### Task 1.3: Implement Backend Service
**File:** `backend/src/services/{feature}.service.ts`
**Estimated:** 3h
**Status:** 🔴

**Steps:**
1. [ ] Create service class
2. [ ] Implement `create()` method
3. [ ] Implement `findById()` method
4. [ ] Implement `findAll()` method
5. [ ] Implement `update()` method
6. [ ] Implement `delete()` method
7. [ ] Add error handling
8. [ ] Add logging

**Code Skeleton:**
```typescript
import { knex } from '../config/database';
import { Feature, CreateFeatureRequest } from '../types/{feature}.types';

export class FeatureService {
  private tableName = 'features';

  async create(data: CreateFeatureRequest): Promise<Feature> {
    const [feature] = await knex(this.tableName)
      .insert(data)
      .returning('*');
    return feature;
  }

  async findById(id: string): Promise<Feature | null> {
    return knex(this.tableName).where({ id }).first();
  }

  // ... other methods
}

export const featureService = new FeatureService();
```

---

### Task 1.4: Write Backend Tests
**File:** `backend/src/__tests__/{feature}.service.test.ts`
**Estimated:** 2h
**Status:** 🔴

**Steps:**
1. [ ] Set up test database
2. [ ] Write `create()` tests
3. [ ] Write `findById()` tests
4. [ ] Write `findAll()` tests
5. [ ] Write `update()` tests
6. [ ] Write `delete()` tests
7. [ ] Test error scenarios
8. [ ] Achieve >80% coverage

**Command:**
```bash
npm run test -- {feature}.service.test.ts
```

---

### Task 1.5: Create API Routes
**File:** `backend/src/routes/api/v2/{feature}.routes.ts`
**Estimated:** 2h
**Status:** 🔴

**Steps:**
1. [ ] Create router file
2. [ ] Define endpoints
3. [ ] Add authentication middleware
4. [ ] Add validation middleware
5. [ ] Add error handling
6. [ ] Register router in main app
7. [ ] Test with curl/Postman

**Code Skeleton:**
```typescript
import { Router } from 'express';
import { featureService } from '../../services/{feature}.service';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validation';

const router = Router();

router.post('/', authenticate, validate(createSchema), async (req, res) => {
  try {
    const feature = await featureService.create(req.body);
    res.json({ success: true, data: feature });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ... other routes

export default router;
```

---

## 📋 Phase 2: Frontend Implementation (Xh)

### Task 2.1: Create TypeScript Types
**File:** `frontend/src/types/{feature}.types.ts`
**Estimated:** 0.5h
**Status:** 🔴

**Steps:**
1. [ ] Define interfaces matching backend
2. [ ] Add UI-specific types
3. [ ] Export all types

---

### Task 2.2: Create API Service
**File:** `frontend/src/services/{feature}.service.ts`
**Estimated:** 2h
**Status:** 🔴

**Steps:**
1. [ ] Create service class
2. [ ] Implement API calls
3. [ ] Add error handling
4. [ ] Add TypeScript types
5. [ ] Add request/response interceptors

**Code Skeleton:**
```typescript
import axios from 'axios';
import { Feature, CreateFeatureRequest } from '../types/{feature}.types';

const API_URL = import.meta.env.VITE_API_URL;

export class FeatureService {
  async fetchAll(): Promise<Feature[]> {
    const response = await axios.get(`${API_URL}/api/v2/features`);
    return response.data.data;
  }

  async create(data: CreateFeatureRequest): Promise<Feature> {
    const response = await axios.post(`${API_URL}/api/v2/features`, data);
    return response.data.data;
  }

  // ... other methods
}

export const featureService = new FeatureService();
```

---

### Task 2.3: Create Main Page
**File:** `frontend/src/app/dashboard/{feature}/page.tsx`
**Estimated:** 3h
**Status:** 🔴

**Steps:**
1. [ ] Create page component
2. [ ] Add layout structure
3. [ ] Implement data fetching
4. [ ] Add loading states
5. [ ] Add error handling
6. [ ] Add empty states
7. [ ] Style with Tailwind CSS

**Code Skeleton:**
```typescript
'use client';
import { useState, useEffect } from 'react';
import { featureService } from '../../../services/{feature}.service';
import { Feature } from '../../../types/{feature}.types';

export default function FeaturePage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFeatures();
  }, []);

  const loadFeatures = async () => {
    try {
      const data = await featureService.fetchAll();
      setFeatures(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Features</h1>
      {/* ... render components */}
    </div>
  );
}
```

---

### Task 2.4: Create List Component
**File:** `frontend/src/app/dashboard/{feature}/components/FeatureList.tsx`
**Estimated:** 2h
**Status:** 🔴

**Steps:**
1. [ ] Create component
2. [ ] Implement list rendering
3. [ ] Add action buttons
4. [ ] Add pagination (if needed)
5. [ ] Add sorting (if needed)
6. [ ] Style component

---

### Task 2.5: Create Form Component
**File:** `frontend/src/app/dashboard/{feature}/components/FeatureForm.tsx`
**Estimated:** 3h
**Status:** 🔴

**Steps:**
1. [ ] Create form component
2. [ ] Add form fields
3. [ ] Implement validation
4. [ ] Add submit handler
5. [ ] Add success/error messages
6. [ ] Style form

---

### Task 2.6: Create Detail Component
**File:** `frontend/src/app/dashboard/{feature}/components/FeatureDetail.tsx`
**Estimated:** 2h
**Status:** 🔴

**Steps:**
1. [ ] Create detail component
2. [ ] Display all fields
3. [ ] Add edit/delete actions
4. [ ] Style component

---

## 📋 Phase 3: Testing & Quality (Xh)

### Task 3.1: Write Frontend Tests
**File:** `frontend/src/app/dashboard/{feature}/__tests__/`
**Estimated:** 3h
**Status:** 🔴

**Steps:**
1. [ ] Test page component
2. [ ] Test list component
3. [ ] Test form component
4. [ ] Test detail component
5. [ ] Test service calls
6. [ ] Achieve >70% coverage

---

### Task 3.2: Integration Testing
**Estimated:** 2h
**Status:** 🔴

**Steps:**
1. [ ] Test complete user workflows
2. [ ] Test error scenarios
3. [ ] Test edge cases
4. [ ] Test responsive design
5. [ ] Browser compatibility check

---

### Task 3.3: Code Review Checklist
**Estimated:** 1h
**Status:** 🔴

**Checklist:**
- [ ] Code follows project conventions
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] TypeScript types complete
- [ ] Comments where needed
- [ ] No security vulnerabilities
- [ ] Performance optimized

---

## 📋 Phase 4: Documentation & Deployment (Xh)

### Task 4.1: Write Feature Documentation
**File:** `docs/reports/FEATURE_{feature_id}_{feature_name}.md`
**Estimated:** 2h
**Status:** 🔴

**Sections:**
1. [ ] Feature overview
2. [ ] User guide
3. [ ] API documentation
4. [ ] Technical architecture
5. [ ] Deployment notes
6. [ ] Troubleshooting

---

### Task 4.2: Update README & Docs
**Estimated:** 0.5h
**Status:** 🔴

**Steps:**
1. [ ] Update main README if needed
2. [ ] Update API documentation
3. [ ] Update changelog

---

### Task 4.3: Local Testing
**Estimated:** 1h
**Status:** 🔴

**Checklist:**
- [ ] Feature works in local environment
- [ ] All tests pass
- [ ] No console errors
- [ ] Database migrations work
- [ ] Git commits clean

---

### Task 4.4: Deploy to EmlakAI
**Estimated:** 0.5h
**Status:** 🔴

**Commands:**
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
- [ ] Services restarted
- [ ] No errors in logs
- [ ] Feature accessible

---

### Task 4.5: Deploy to Vergilex
**Estimated:** 0.5h
**Status:** 🔴

**Commands:**
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
- [ ] Services restarted
- [ ] No errors in logs
- [ ] Feature accessible

---

### Task 4.6: Deploy to Bookie
**Estimated:** 0.5h
**Status:** 🔴

**Commands:**
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
- [ ] Services restarted
- [ ] No errors in logs
- [ ] Feature accessible

---

### Task 4.7: Post-Deployment Verification
**Estimated:** 1h
**Status:** 🔴

**Checklist:**
- [ ] All instances running
- [ ] No error logs
- [ ] Feature works in all instances
- [ ] Database schemas synced
- [ ] Performance acceptable
- [ ] User acceptance (if applicable)

---

## 📊 Progress Tracking

### Daily Updates
**Format:** YYYY-MM-DD - Tasks completed, blockers, next steps

---

**YYYY-MM-DD:**
- Completed: [List tasks]
- Blockers: [List blockers]
- Next: [List next tasks]

---

## 🚨 Blockers & Issues

### Active Blockers
1. **Blocker 1:** [Description]
   - **Impact:** High/Medium/Low
   - **Resolution:** [Plan]
   - **Owner:** [Name]

### Resolved Issues
1. **Issue 1:** [Description] - ✅ Resolved on YYYY-MM-DD

---

## 📝 Notes & Learnings

### Technical Decisions
- [Decision 1]: [Rationale]
- [Decision 2]: [Rationale]

### Lessons Learned
- [Lesson 1]
- [Lesson 2]

### Improvements for Next Time
- [Improvement 1]
- [Improvement 2]

---

**Related Documents:**
- Specification: `spec-{feature_id}.md`
- Implementation Plan: `plan-{feature_id}.md`
- Feature Documentation: `docs/reports/FEATURE_{feature_id}_{feature_name}.md`

---

*Generated by SpecPulse v2.6.0*
*Template optimized for LSEMB Multi-Instance Development*
