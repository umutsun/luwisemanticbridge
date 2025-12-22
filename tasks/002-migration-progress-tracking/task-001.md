# Tasks: Migration Progress Tracking

**Feature ID**: 002
**Feature Name**: migration-progress-tracking
**Status**: COMPLETED
**Created**: 2025-12-22

## Phase 0: Critical Path (COMPLETED)

### T001: Fix Polling-Based Progress
- [x] Replace SSE with HTTP polling
- [x] Store progress in Redis
- [x] Poll every 2 seconds during active migration
- [x] Stop polling when status is 'idle'

### T002: Fix Progress Metrics
- [x] Change `current` to show per-table progress (not cumulative)
- [x] Keep `total` as current table's total
- [x] Add `cumulativeTotal` for overall progress
- [x] Calculate percentage from current/total

## Phase 1: UI Improvements (COMPLETED)

### T003: Create Animated Counter Hook
- [x] Create `use-animated-counter.ts` hook
- [x] Use requestAnimationFrame for 60fps
- [x] Implement ease-out cubic easing
- [x] Add `useAnimatedPercentage` variant for 0-100 values

### T004: Create AnimatedNumber Component
- [x] Create `animated-number.tsx` component
- [x] Support locale formatting (1,234)
- [x] Configurable duration parameter

### T005: Update ProgressCircle
- [x] Import and use `useAnimatedPercentage`
- [x] Animate both circle arc and percentage number
- [x] Remove duplicate transition CSS (hook handles it)

### T006: Update Migrations Page
- [x] Import AnimatedNumber component
- [x] Update Records row to use AnimatedNumber
- [x] Update Tokens row to use AnimatedNumber
- [x] Update Processed row (completed state)

### T007: Remove Duplicate Progress Card
- [x] Remove top progress card (lines 1127-1192)
- [x] Keep only left column progress card

## Phase 2: Database Cleanup (COMPLETED)

### T008: Fix Orphan Embeddings
- [x] Query for orphan records (source_id > max in source table)
- [x] Delete 1,978 orphans from csv_makale_arsiv_2021
- [x] Delete 3 orphans from csv_hukdkk
- [x] Verify counts match source tables

### T009: Add Missing Column
- [x] Add `embedding_provider` column to unified_embeddings
- [x] Run ALTER TABLE on production (vergilex_lsemb)

### T010: Patch Missing Embeddings
- [x] Create `patch_missing_embeddings.py` script
- [x] Fix API key loading from .env
- [x] Fix column name mapping
- [x] Handle token limit (MAX_CHARS = 20000)
- [x] Embed 700 missing csv_danistaykararlari records
- [x] Embed 2 missing csv_sorucevap records

## Phase 3: Redis Cleanup (COMPLETED)

### T011: Clear Stuck Progress
- [x] Delete `migration:progress` key
- [x] Delete `embedding:progress` key
- [x] Delete `embedding:status` key
- [x] Restart backend to refresh state

## Summary

| Phase | Tasks | Completed | Progress |
|-------|-------|-----------|----------|
| Phase 0 | 2 | 2 | 100% |
| Phase 1 | 5 | 5 | 100% |
| Phase 2 | 3 | 3 | 100% |
| Phase 3 | 1 | 1 | 100% |
| **Total** | **11** | **11** | **100%** |

## Deployment Checklist

- [x] All changes committed to git
- [x] Pushed to origin/main
- [ ] Deploy to vergilex production
- [ ] Deploy to geolex production
- [ ] Deploy to bookie production
- [ ] Verify smooth animations in production
