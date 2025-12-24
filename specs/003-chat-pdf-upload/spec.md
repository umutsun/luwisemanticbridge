# Feature Specification: Chat PDF Upload

**Feature ID**: 003-chat-pdf-upload
**Version**: 1.0
**Created**: 2025-12-25
**Status**: Approved

---

## 1. Overview

### 1.1 Problem Statement
Kullanicilar chat interface'de soru sorarken bazen belge (kira kontrati, tapu, mevzuat belgesi vb.) hakkinda soru sormak istiyorlar. Su an bu mumkun degil - kullanici belgeyi manuel olarak okuyup ilgili kismi kopyalamak zorunda.

### 1.2 Solution
Chat input alanina PDF upload ozelligi eklenmesi. Kullanici PDF yukleyip soru sorabilecek, sistem OCR ile belgeyi analiz edip soruyu buna gore yanitlayacak.

### 1.3 User Stories
- **US-001**: Kullanici olarak, kira kontratimi yukleyip "Bu kontrat yasal mi?" diye sorabilmeliyim
- **US-002**: Kullanici olarak, tapu belgemi yukleyip mevzuat ile ilgili soru sorabilmeliyim
- **US-003**: Admin olarak, PDF upload ozelligini Settings'den acip kapayabilmeliyim
- **US-004**: Admin olarak, maksimum dosya boyutunu ve sayfa sayisini ayarlayabilmeliyim

---

## 2. Functional Requirements

### 2.1 Core Features

| ID | Feature | Priority | Status |
|----|---------|----------|--------|
| FR-001 | Paperclip butonu ile PDF secimi | P0 | Pending |
| FR-002 | PDF validasyonu (boyut, sayfa, format) | P0 | Pending |
| FR-003 | OCR ile metin cikarma | P0 | Pending |
| FR-004 | LLM context'e PDF icerigi ekleme | P0 | Pending |
| FR-005 | PDF preview chip gosterimi | P1 | Pending |
| FR-006 | Mesajda PDF badge gosterimi | P1 | Pending |
| FR-007 | Settings'den enable/disable | P1 | Pending |
| FR-008 | Settings'den limit ayarlama | P2 | Pending |

### 2.2 User Flow

```
1. Kullanici Paperclip ikonuna tiklar
2. Dosya secici acilir (sadece PDF)
3. PDF secilir → validasyon yapilir
4. Gecerli ise preview chip gosterilir
5. Kullanici sorusunu yazar
6. Send butonuna tiklar
7. PDF + soru birlikte backend'e gonderilir
8. OCR islenir → metin cikarilir
9. LLM'e soru + PDF icerigi gonderilir
10. Yanit kullaniciya gosterilir
11. Mesajda PDF badge gosterilir
```

### 2.3 Validation Rules

| Rule | Value | Error Message |
|------|-------|---------------|
| Max file size | Settings'den (default: 10 MB) | "Dosya boyutu {limit} MB'i gecemez" |
| Max pages | Settings'den (default: 30) | "PDF en fazla {limit} sayfa olabilir" |
| File type | application/pdf only | "Sadece PDF dosyalari desteklenir" |
| Magic bytes | %PDF-1. | "Gecersiz PDF dosyasi" |

---

## 3. Technical Specifications

### 3.1 Backend

#### New Endpoint
```
POST /api/v2/chat/with-pdf
Content-Type: multipart/form-data

Body:
- message: string (required)
- conversationId: string (optional)
- pdf: File (required)
- temperature: number (optional)
- model: string (optional)
```

#### Response
```json
{
  "response": "string",
  "sources": [],
  "conversationId": "uuid",
  "pdfAttachment": {
    "filename": "string",
    "pageCount": 5,
    "cacheKey": "string"
  }
}
```

### 3.2 OCR Integration

Mevcut OCR altyapisi kullanilacak:
- **Primary**: Gemini 2.0 Flash (ucuz, hizli)
- **Fallback 1**: OpenAI GPT-4o (reliable)
- **Fallback 2**: Tesseract (free)

Cache: Redis, 7 gun TTL, file hash ile deduplication

### 3.3 Frontend

#### New Components
- `PdfPreviewChip` - Secilen PDF'in preview'i

#### Modified Components
- `ChatInput` - File input + Paperclip click handler
- `MessageItem` - PDF badge gosterimi
- `FeatureToggles` - PDF upload toggle

### 3.4 Database

Settings tablosuna yeni satirlar:
```
ragSettings.enablePdfUpload = "false"
ragSettings.maxPdfSizeMB = "10"
ragSettings.maxPdfPages = "30"
```

Message metadata'ya PDF bilgisi:
```json
{
  "pdfAttachment": {
    "filename": "kontrat.pdf",
    "size": 1234567,
    "pageCount": 5,
    "cacheKey": "pdf:abc123"
  }
}
```

---

## 4. UI/UX Specifications

### 4.1 Paperclip Button
- Konum: Chat input sol tarafi
- Boyut:
  - Desktop: w-5 h-5
  - Mobile: w-4 h-4 (daha minimal)
- Renk: gray-400 → blue-500 (hover)
- Disabled durumu: Feature kapaliysa gizle

### 4.2 PDF Preview Chip
- Konum: Input alaninin ustunde
- Icerik: FileText icon + filename (truncated) + size + X butonu
- Stil: Rounded, border, subtle background
- Max width: 300px

### 4.3 Message PDF Badge
- Konum: User mesajinin altinda
- Icerik: PDF icon + filename
- Stil: Small, muted, inline

### 4.4 Mobile Responsive
- Ikonlar daha kucuk (w-4 h-4)
- Preview chip full-width
- Touch-friendly X butonu

---

## 5. Settings Configuration

### 5.1 New Settings Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| ragSettings.enablePdfUpload | boolean | false | Feature toggle |
| ragSettings.maxPdfSizeMB | number | 10 | Max file size in MB |
| ragSettings.maxPdfPages | number | 30 | Max page count |

### 5.2 Settings UI

FeatureToggles'a yeni grup:
```
PDF Upload
├── Enable PDF Upload (toggle)
└── (Expanded when enabled)
    ├── Max File Size: [slider 1-50 MB]
    └── Max Pages: [slider 1-100]
```

---

## 6. Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| File too large | "Dosya boyutu {limit} MB'i gecemez" | Toast, reject upload |
| Too many pages | "PDF en fazla {limit} sayfa olabilir" | Toast, reject upload |
| Invalid format | "Sadece PDF dosyalari desteklenir" | Toast, reject upload |
| OCR failure | "Dosya okunamadi, lutfen tekrar deneyin" | Toast, allow retry |
| Feature disabled | (Button hidden) | N/A |
| Network error | "Baglanti hatasi" | Toast, allow retry |

---

## 7. Security Considerations

### 7.1 File Validation
- Magic bytes kontrolu (%PDF-1.)
- MIME type kontrolu (application/pdf)
- Size limit enforcement

### 7.2 Rate Limiting
- Mevcut API rate limiter kullanilacak
- Dakikada max upload sayisi sinirlanabilir

### 7.3 Temporary Files
- Memory storage kullan (disk'e yazma)
- Islem bitince temizle
- Cache TTL: 7 gun

---

## 8. Performance Considerations

### 8.1 OCR Optimization
- Cache hit durumunda OCR atla
- Gemini (ucuz) → OpenAI (reliable) → Tesseract (free) fallback

### 8.2 Upload Progress
- Client-side progress indicator
- OCR durumu: "Belge isleniyor..."

### 8.3 Context Size
- LLM context limit'e dikkat
- Cok uzun PDF'lerde truncation

---

## 9. Deployment

### 9.1 Rollout Plan
1. Migration'i calistir (settings ekle)
2. Backend deploy
3. Frontend deploy
4. Feature default olarak disabled
5. Test sonrasi enable

### 9.2 Feature Flags
- `ragSettings.enablePdfUpload` ile kontrol
- Her instance icin ayri ayarlanabilir

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Upload success rate | > 95% |
| OCR accuracy | > 90% |
| Average processing time | < 10 saniye |
| User satisfaction | Positive feedback |

---

## Appendix A: File Paths

### Backend
- `backend/database/migrations/YYYYMMDD_add_chat_pdf_settings.ts`
- `backend/src/routes/chat.routes.ts`
- `backend/src/services/rag-chat.service.ts`

### Frontend
- `frontend/src/components/chat/chat-input.tsx`
- `frontend/src/components/chat/pdf-preview-chip.tsx`
- `frontend/src/components/chat/message-item.tsx`
- `frontend/src/types/chat.ts`
- `frontend/src/lib/hooks/use-chat-stream.ts`
- `frontend/src/components/settings/FeatureToggles.tsx`

### Existing (Reuse)
- `backend/src/services/ocr/ocr-router.service.ts`
- `backend/src/services/ocr/ocr-cache.service.ts`
- `backend/src/services/vision-ocr.service.ts`
