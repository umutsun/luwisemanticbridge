# Multi-AI Shared Context
## LSEMB Development Environment

**Last Updated:** 2025-12-10

This directory contains shared context and guidelines for all AI assistants working on the LSEMB project.

---

## 🤖 AI Team Roles

### Claude Sonnet (Lead Developer)
**Primary Role:** Implementation, Coding, Testing
**Config:** `.claude/`
**Responsibilities:**
- ✅ Feature implementation (primary coder)
- ✅ Bug fixes
- ✅ Code reviews
- ✅ SpecPulse execution
- ✅ Testing & debugging
- ✅ Git operations & deployment approval requests

---

### Claude Opus (Architecture Consultant)
**Primary Role:** System Architecture & Design Decisions
**Config:** `.claude/`
**Responsibilities:**
- ✅ High-level architecture design
- ✅ System design decisions
- ✅ Technical strategy
- ✅ Complex refactoring planning
- ✅ Scalability & performance architecture

---

### Gemini (DevOps, Testing & Localization)
**Primary Role:** Test Automation, DevOps, i18n
**Config:** `.gemini/`
**Responsibilities:**
- ✅ Test automation & QA
- ✅ DevOps pipelines & deployment scripts
- ✅ Localization (i18n/l10n)
- ✅ Infrastructure as code
- ✅ CI/CD workflows
- ✅ Documentation generation

---

### Zai (Quick Assistant)
**Primary Role:** Claude's Helper for Quick Tasks
**Config:** `.zai/`
**Responsibilities:**
- ✅ Quick code snippets
- ✅ Simple bug investigations
- ✅ Code formatting & cleanup
- ✅ Research & documentation lookup
- ✅ Fast prototyping
- ⚡ Works like Haiku - fast and efficient

---

## 📁 Shared Resources

### Project Context
- **File:** `project-context.md`
- **Purpose:** High-level project overview
- **Update:** When major changes occur

### Coding Standards
- **File:** `coding-standards.md`
- **Purpose:** Consistent code quality across all AIs
- **Update:** When standards evolve

### Architecture Overview
- **File:** `architecture-overview.md`
- **Purpose:** System architecture reference
- **Update:** When architecture changes

### Workflows
- **Directory:** `workflows/`
- **Purpose:** Common development workflows
- **Contents:**
  - `feature-development.md`
  - `bug-fixing.md`
  - `deployment.md`
  - `code-review.md`

---

## 🔄 Collaboration Pattern

### Example: New Feature Development

```
1. PLANNING (Gemini)
   - Analyze requirements
   - Create SpecPulse spec
   - Design architecture
   ↓
2. IMPLEMENTATION (Claude Code)
   - Write code
   - Create tests
   - Debug issues
   ↓
3. OPTIMIZATION (Zai - if needed)
   - Analyze performance
   - Optimize algorithms
   - Solve complex problems
   ↓
4. REVIEW & DEPLOY (Claude Code)
   - Code review
   - Integration tests
   - Deploy to production
```

---

## 📝 Usage Guidelines

### For AI Assistants

1. **Read shared context first** before starting work
2. **Follow coding standards** defined in this directory
3. **Update context** when you make significant changes
4. **Coordinate** with other AIs by documenting your work
5. **Use workflows** for common tasks

### For Developers

1. **Keep context up to date** - AIs rely on this
2. **Document AI-specific instructions** in individual config dirs
3. **Use appropriate AI** for each task type
4. **Review AI outputs** - they're tools, not oracles

---

## 🎯 Quick Start

### New AI Session Checklist

- [ ] Read `project-context.md`
- [ ] Review `coding-standards.md`
- [ ] Check `architecture-overview.md`
- [ ] Identify appropriate workflow in `workflows/`
- [ ] Review AI-specific config in `.claude/`, `.gemini/`, or `.zai/`
- [ ] Start work

---

## 🔗 Related Resources

- **Project Instructions:** `.claude/CLAUDE.md`
- **Git Workflow:** `.claude/GIT_WORKFLOW.md`
- **SpecPulse Config:** `.specpulse/config.yaml`
- **Documentation:** `docs/`

---

*This is a living document. Update as the project evolves.*
