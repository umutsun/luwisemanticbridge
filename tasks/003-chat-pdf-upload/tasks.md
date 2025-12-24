# Task Breakdown: Chat PDF Upload

**Feature ID**: 003-chat-pdf-upload
**Created**: 2025-12-25

---

## Task Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Backend Settings | 1 | Pending |
| Phase 2: Backend API | 3 | Pending |
| Phase 3: Frontend Types | 1 | Pending |
| Phase 4: Frontend Components | 3 | Pending |
| Phase 5: Chat Hooks | 1 | Pending |
| Phase 6: Settings UI | 1 | Pending |
| Phase 7: Testing | 1 | Pending |
| **Total** | **11** | |

---

## Phase 1: Backend Settings

### Task 1.1: Create Migration
- [ ] Create `backend/database/migrations/20251225_add_chat_pdf_settings.ts`
- [ ] Add settings: enablePdfUpload, maxPdfSizeMB, maxPdfPages
- [ ] Run migration locally
- [ ] Verify settings in database

**Files**:
- `backend/database/migrations/20251225_add_chat_pdf_settings.ts` (new)

---

## Phase 2: Backend API

### Task 2.1: Add PDF Upload Endpoint
- [ ] Import multer with memory storage
- [ ] Create POST `/api/v2/chat/with-pdf` endpoint
- [ ] Add file validation (size, type, magic bytes)
- [ ] Check if feature enabled from settings
- [ ] Return proper error responses

**Files**:
- `backend/src/routes/chat.routes.ts` (modify)

### Task 2.2: Integrate OCR Processing
- [ ] Use existing ocrRouterService
- [ ] Use existing ocrCacheService
- [ ] Handle OCR errors gracefully
- [ ] Store cache key in response

**Files**:
- `backend/src/routes/chat.routes.ts` (modify)

### Task 2.3: Update RAG Chat Service
- [ ] Add pdfContext parameter to processMessage
- [ ] Build system prompt with PDF content
- [ ] Handle long content (truncation if needed)
- [ ] Add PDF metadata to response

**Files**:
- `backend/src/services/rag-chat.service.ts` (modify)

---

## Phase 3: Frontend Types

### Task 3.1: Update Chat Types
- [ ] Add PdfAttachment interface
- [ ] Add pdfAttachment to Message interface
- [ ] Export new types

**Files**:
- `frontend/src/types/chat.ts` (modify)

---

## Phase 4: Frontend Components

### Task 4.1: Create PdfPreviewChip
- [ ] Create new component file
- [ ] Add FileText icon, filename, size, X button
- [ ] Add proper styling (responsive)
- [ ] Export component

**Files**:
- `frontend/src/components/chat/pdf-preview-chip.tsx` (new)

### Task 4.2: Update ChatInput
- [ ] Add hidden file input with ref
- [ ] Add pdfFile state
- [ ] Add pdfEnabled state (from settings)
- [ ] Make Paperclip button functional
- [ ] Show/hide based on settings
- [ ] Show PdfPreviewChip when file selected
- [ ] Update handleSend for file upload
- [ ] **Mobile responsive**: Smaller icons (w-4 h-4)

**Files**:
- `frontend/src/components/chat/chat-input.tsx` (modify)

### Task 4.3: Update MessageItem
- [ ] Check for pdfAttachment in message
- [ ] Show PDF badge for user messages
- [ ] Style appropriately (small, subtle)

**Files**:
- `frontend/src/components/chat/message-item.tsx` (modify)

---

## Phase 5: Chat Hooks

### Task 5.1: Update use-chat-stream
- [ ] Add pdfFile parameter to sendMessage
- [ ] Use FormData when file present
- [ ] Handle multipart response
- [ ] Update message with PDF metadata

**Files**:
- `frontend/src/lib/hooks/use-chat-stream.ts` (modify)

---

## Phase 6: Settings UI

### Task 6.1: Add PDF Toggle to Settings
- [ ] Add new feature group for PDF Upload
- [ ] Add enablePdfUpload toggle
- [ ] Add configuration sliders (optional)
- [ ] Add translations

**Files**:
- `frontend/src/components/settings/FeatureToggles.tsx` (modify)

---

## Phase 7: Testing

### Task 7.1: Manual Testing
- [ ] Feature toggle works
- [ ] File selection works
- [ ] Validation errors show
- [ ] OCR processing works
- [ ] Response includes PDF context
- [ ] Message shows PDF badge
- [ ] Mobile responsive works
- [ ] Cache hit works

---

## Progress Tracking

```
[=========>                                        ] 10%
Phase 1 in progress...
```

Last Updated: 2025-12-25
