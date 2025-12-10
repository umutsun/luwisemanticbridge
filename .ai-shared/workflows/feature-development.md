# Feature Development Workflow
## Multi-AI Coordinated Development

---

## 🎯 Workflow Overview

```
PLANNING (Gemini) → IMPLEMENTATION (Claude Code) → OPTIMIZATION (Zai) → DEPLOY (Claude Code)
```

---

## Phase 1: Planning & Design (Gemini)

### Responsibilities
- Analyze feature requirements
- Research existing solutions
- Create SpecPulse specification
- Design system architecture
- Identify potential issues

### Steps

#### 1. Requirements Analysis
```bash
# Gemini command
/sp-feature {feature-name} {feature-id}
```

**Gemini should:**
- Analyze the feature request
- Ask clarifying questions
- Research similar implementations in codebase
- Document requirements

#### 2. Create Specification
```bash
# Gemini command
/sp-spec [core|standard|complete]
```

**Gemini should:**
- Choose appropriate spec level based on complexity
- Fill out ALL sections in spec template
- Consider multi-instance deployment
- Identify architectural impacts
- Flag [CLARIFY: ...] items for user

#### 3. Architecture Design
**Gemini should:**
- Design data models
- Plan API endpoints
- Consider database schema
- Identify dependencies
- Document security considerations

#### 4. Handoff to Claude Code
Create summary document:
```markdown
# Feature: {name}
## Ready for Implementation

**Spec:** `.specpulse/specs/spec-{id}.md`

**Key Files to Create:**
- backend/src/services/{feature}.service.ts
- backend/src/routes/api/v2/{feature}.routes.ts
- frontend/src/app/dashboard/{feature}/page.tsx
- ...

**Database Changes:**
- Migration: create_{table}.ts
- ...

**Dependencies:**
- npm packages: ...
- pip packages: ...

**Notes for Claude:**
- [Important implementation notes]
```

---

## Phase 2: Implementation (Claude Code)

### Responsibilities
- Write code
- Create tests
- Debug issues
- Follow coding standards

### Steps

#### 1. Generate Implementation Plan
```bash
# Claude command
/sp-plan
```

**Claude should:**
- Break down into concrete phases
- List all files to create/modify
- Define database migrations
- Plan deployment steps

#### 2. Create Task Breakdown
```bash
# Claude command
/sp-task
```

**Claude should:**
- Create detailed task list
- Estimate time per task
- Define "Definition of Done" per task
- Order tasks logically

#### 3. Execute Implementation
```bash
# Claude command
/sp-execute
```

**Claude should implement in this order:**

**Step 1: Database**
- [ ] Create migration file
- [ ] Define schema
- [ ] Test migration locally
- [ ] Verify rollback works

**Step 2: Backend**
- [ ] Create TypeScript types
- [ ] Implement service class
- [ ] Write unit tests for service
- [ ] Create API routes
- [ ] Add authentication/validation
- [ ] Test with curl/Postman

**Step 3: Frontend**
- [ ] Create TypeScript types
- [ ] Create API service
- [ ] Build main page
- [ ] Create components (List, Form, Detail)
- [ ] Add error handling
- [ ] Style with Tailwind CSS
- [ ] Test in browser

**Step 4: Testing**
- [ ] Run all tests: `npm test`
- [ ] Check test coverage
- [ ] Fix failing tests
- [ ] Integration testing

#### 4. Handoff to Zai (if needed)
```markdown
# Complex Problem Detected

**Issue:** [Description of complex problem]

**Context:**
- Feature: {name}
- Files affected: ...
- Current approach: ...

**Problem:**
- Performance bottleneck
- OR Complex algorithm needed
- OR Architectural decision required

**Request:**
Zai, please analyze and provide solution.
```

---

## Phase 3: Optimization (Zai) [Optional]

### When to Involve Zai
- Performance bottlenecks detected
- Complex algorithm required
- Architectural decisions needed
- System design questions
- Technical debt analysis

### Responsibilities
- Deep analysis
- Algorithm design
- Performance optimization
- Architectural guidance

### Steps

#### 1. Problem Analysis
Zai should:
- Analyze the codebase context
- Identify root cause
- Consider multiple solutions
- Evaluate trade-offs

#### 2. Solution Design
Zai should:
- Design optimal algorithm
- Consider Big-O complexity
- Plan implementation steps
- Document approach

#### 3. Handoff Back to Claude
```markdown
# Optimization Solution

**Problem:** [Original problem]

**Solution:** [Detailed solution]

**Implementation Steps:**
1. [Step 1]
2. [Step 2]
...

**Code Sketch:**
```typescript
// High-level implementation
```

**Expected Improvements:**
- Performance: X% faster
- Memory: Y% less
- Other benefits: ...

**Claude:** Please implement this solution.
```

---

## Phase 4: Review & Deploy (Claude Code)

### Responsibilities
- Code quality check
- Integration testing
- Multi-instance deployment
- Post-deployment verification

### Steps

#### 1. Code Review
```bash
# Claude checks
- [ ] All tests pass
- [ ] No console.log statements
- [ ] TypeScript types complete
- [ ] Error handling implemented
- [ ] Security vulnerabilities checked
- [ ] Performance acceptable
- [ ] Documentation complete
```

#### 2. Local Testing
```bash
# Test in lsemb environment
cd c:\xampp\htdocs\lsemb

# Backend
cd backend
npm run migrate:latest
npm test
npm run dev

# Frontend
cd frontend
npm run dev

# Verify feature works
```

#### 3. Git Workflow
```bash
# Create feature branch (SpecPulse auto-creates)
git checkout -b {feature-id}-{feature-name}

# Commit changes
git add .
git commit -m "feat: {description}

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to remote
git push -u origin {feature-id}-{feature-name}
```

#### 4. Multi-Instance Deployment

**Deploy to EmlakAI:**
```bash
ssh root@91.99.229.96 "
cd /var/www/emlakai
git pull
cd backend && npm run migrate:latest && npm install && pm2 restart emlakai-backend
cd ../frontend && npm run build && pm2 restart emlakai-frontend
"

# Verify
ssh root@91.99.229.96 "pm2 logs emlakai-backend --lines 50 | grep -i error"
```

**Deploy to Vergilex:**
```bash
# Same commands with vergilex paths
```

**Deploy to Bookie:**
```bash
# Same commands with bookie paths
```

#### 5. Post-Deployment Verification
```bash
# Check all instances
ssh root@91.99.229.96 "pm2 list | grep -E '(emlakai|vergilex|bookie)'"

# Check for errors
ssh root@91.99.229.96 "pm2 logs --lines 100 | grep -i error"

# Test feature in production
# - Visit https://emlakai.luwi.dev
# - Visit https://vergilex.luwi.dev
# - Visit https://bookie.luwi.dev
```

---

## 🔄 Collaboration Points

### Gemini → Claude Handoff
**Gemini provides:**
- Complete specification
- Architecture design
- File list
- Implementation notes

**Claude expects:**
- Clear requirements
- Design decisions made
- Open questions resolved

### Claude → Zai Handoff
**Claude provides:**
- Problem description
- Current code context
- Attempted solutions
- Performance metrics

**Zai expects:**
- Specific problem
- Measurable goals
- Context files

### Zai → Claude Handoff
**Zai provides:**
- Solution design
- Algorithm explanation
- Implementation steps
- Expected improvements

**Claude expects:**
- Clear implementation path
- Code sketches
- Success criteria

---

## 📊 Success Metrics

### Planning Phase (Gemini)
- [ ] All spec sections completed
- [ ] Architecture clearly defined
- [ ] Dependencies identified
- [ ] Risks documented

### Implementation Phase (Claude)
- [ ] All tasks completed
- [ ] Tests pass (>70% coverage)
- [ ] Code follows standards
- [ ] Documentation complete

### Optimization Phase (Zai)
- [ ] Performance improved
- [ ] Algorithm documented
- [ ] Trade-offs considered

### Deployment Phase (Claude)
- [ ] All instances deployed
- [ ] No errors in logs
- [ ] Feature works in production
- [ ] User acceptance confirmed

---

## ⚠️ Common Pitfalls

1. **Incomplete Specs** - Gemini must complete ALL sections
2. **Skipping Tests** - Claude must write tests DURING implementation
3. **Premature Optimization** - Only involve Zai for real problems
4. **Deployment Rush** - Always test locally first
5. **Poor Documentation** - Update docs as you code, not after

---

## 📚 Related Workflows

- **Bug Fixing:** `bug-fixing.md`
- **Code Review:** `code-review.md`
- **Deployment:** `deployment.md`

---

*Follow this workflow for consistent, high-quality feature development.*
