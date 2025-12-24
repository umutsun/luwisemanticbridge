# Implementation Plan: Chat PDF Upload

**Feature ID**: 003-chat-pdf-upload
**Created**: 2025-12-25
**Estimated Effort**: Medium (1-2 days)

---

## Phase 1: Backend Settings (30 min)

### 1.1 Migration
Create migration file to add PDF settings:
```typescript
// backend/database/migrations/20251225_add_chat_pdf_settings.ts
export async function up(knex) {
  await knex.raw(`
    INSERT INTO settings (key, value) VALUES
      ('ragSettings.enablePdfUpload', 'false'),
      ('ragSettings.maxPdfSizeMB', '10'),
      ('ragSettings.maxPdfPages', '30')
    ON CONFLICT (key) DO NOTHING;
  `);
}
```

### 1.2 Run Migration
```bash
npm run migrate:latest
```

---

## Phase 2: Backend API (2-3 hours)

### 2.1 Chat Routes Update
File: `backend/src/routes/chat.routes.ts`

Add new endpoint:
```typescript
import multer from 'multer';
import { ocrRouterService } from '../services/ocr/ocr-router.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // Hard limit 50MB
});

router.post('/with-pdf',
  authenticateToken,
  upload.single('pdf'),
  async (req, res) => {
    // 1. Check if feature enabled
    // 2. Validate file (size, pages, magic bytes)
    // 3. Process OCR
    // 4. Add to LLM context
    // 5. Generate response
    // 6. Return with PDF metadata
  }
);
```

### 2.2 PDF Validation Helper
```typescript
async function validatePdf(file: Express.Multer.File, settings: PdfSettings) {
  // Check magic bytes
  const header = file.buffer.slice(0, 5).toString();
  if (!header.startsWith('%PDF-')) {
    throw new Error('Invalid PDF file');
  }

  // Check size
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > settings.maxPdfSizeMB) {
    throw new Error(`File size exceeds ${settings.maxPdfSizeMB} MB limit`);
  }

  // Check page count (via pdf-parse)
  const pdfData = await pdfParse(file.buffer);
  if (pdfData.numpages > settings.maxPdfPages) {
    throw new Error(`PDF exceeds ${settings.maxPdfPages} page limit`);
  }

  return { pageCount: pdfData.numpages };
}
```

### 2.3 RAG Chat Service Update
File: `backend/src/services/rag-chat.service.ts`

Add PDF context parameter:
```typescript
interface PdfContext {
  filename: string;
  extractedText: string;
  pageCount: number;
}

async processMessage(
  message: string,
  conversationId: string,
  options: {
    pdfContext?: PdfContext;
    // ... existing options
  }
) {
  // Build context with PDF
  let systemPrompt = this.getSystemPrompt();

  if (options.pdfContext) {
    systemPrompt += `\n\n[Yuklenen Belge: ${options.pdfContext.filename}]\n`;
    systemPrompt += options.pdfContext.extractedText;
    systemPrompt += '\n\n---\n\n';
  }

  // Continue with normal processing
}
```

---

## Phase 3: Frontend Types (15 min)

### 3.1 Update chat.ts
File: `frontend/src/types/chat.ts`

```typescript
export interface PdfAttachment {
  filename: string;
  size: number;
  pageCount?: number;
}

export interface Message {
  // ... existing fields
  pdfAttachment?: PdfAttachment;
}
```

---

## Phase 4: Frontend Components (2-3 hours)

### 4.1 PdfPreviewChip Component
File: `frontend/src/components/chat/pdf-preview-chip.tsx`

```typescript
interface PdfPreviewChipProps {
  filename: string;
  size: number;
  onRemove: () => void;
}

export function PdfPreviewChip({ filename, size, onRemove }: PdfPreviewChipProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20
                    border border-blue-200 dark:border-blue-800 rounded-lg max-w-[300px]">
      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
      <span className="text-sm text-blue-700 dark:text-blue-300 truncate">
        {filename}
      </span>
      <span className="text-xs text-blue-500 dark:text-blue-400 flex-shrink-0">
        ({formatSize(size)})
      </span>
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-blue-100 dark:hover:bg-blue-800 rounded"
      >
        <X className="w-3 h-3 text-blue-500" />
      </button>
    </div>
  );
}
```

### 4.2 ChatInput Update
File: `frontend/src/components/chat/chat-input.tsx`

Key changes:
1. Add file input ref
2. Add PDF state
3. Make Paperclip functional
4. Show preview chip
5. Handle send with PDF

```typescript
// New state
const [pdfFile, setPdfFile] = useState<File | null>(null);
const [pdfEnabled, setPdfEnabled] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);

// Fetch PDF settings
useEffect(() => {
  fetchWithAuth(`${apiUrl}/api/v2/settings?category=rag`)
    .then(res => res.json())
    .then(data => {
      setPdfEnabled(data.enablePdfUpload === 'true');
    });
}, []);

// File selection handler
const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file && file.type === 'application/pdf') {
    setPdfFile(file);
  }
};

// Updated send handler
const handleSend = async () => {
  if (pdfFile) {
    // Call onSend with file
    onSend(message.trim(), pdfFile);
  } else {
    onSend(message.trim());
  }
  setMessage('');
  setPdfFile(null);
};
```

### 4.3 MessageItem Update
File: `frontend/src/components/chat/message-item.tsx`

Add PDF badge for user messages:
```typescript
{message.pdfAttachment && message.role === 'user' && (
  <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
    <FileText className="w-3 h-3" />
    <span>{message.pdfAttachment.filename}</span>
  </div>
)}
```

---

## Phase 5: Chat Hooks Update (1 hour)

### 5.1 use-chat-stream.ts Update
File: `frontend/src/lib/hooks/use-chat-stream.ts`

Update sendMessage to accept file:
```typescript
const sendMessage = async (
  content: string,
  pdfFile?: File,
  options: ChatStreamOptions = {}
) => {
  if (pdfFile) {
    // Use FormData for file upload
    const formData = new FormData();
    formData.append('message', content);
    formData.append('pdf', pdfFile);
    formData.append('conversationId', conversationId);

    const response = await fetchWithAuth(`${apiUrl}/api/v2/chat/with-pdf`, {
      method: 'POST',
      body: formData,
      // Note: Don't set Content-Type, browser will set it with boundary
    });

    // Process response
  } else {
    // Existing logic
  }
};
```

---

## Phase 6: Settings UI (30 min)

### 6.1 FeatureToggles Update
File: `frontend/src/components/settings/FeatureToggles.tsx`

Add PDF upload feature group:
```typescript
{
  title: t('settings.features.pdfUpload', 'PDF Upload'),
  icon: <FileText className="w-4 h-4" />,
  features: [
    {
      key: 'enablePdfUpload',
      label: t('settings.features.enablePdfUpload', 'Chat PDF Yukleme'),
      description: t('settings.features.enablePdfUploadDesc', 'Chat alaninda PDF yukleme ozelligi')
    }
  ]
}
```

---

## Phase 7: Testing (1 hour)

### 7.1 Manual Test Checklist
- [ ] Feature disabled - Paperclip hidden
- [ ] Feature enabled - Paperclip visible
- [ ] Select small PDF (<1MB) - Works
- [ ] Select large PDF (>10MB) - Error shown
- [ ] Select non-PDF file - Rejected
- [ ] Send message with PDF - OCR works
- [ ] Message shows PDF badge
- [ ] Re-upload same PDF - Cache hit

### 7.2 Edge Cases
- [ ] Upload then cancel (X button)
- [ ] Network error during upload
- [ ] OCR failure (fallback works)
- [ ] Very long PDF content (truncation)

---

## Deployment Steps

1. **Local test**
   ```bash
   npm run dev
   ```

2. **Commit**
   ```bash
   git add .
   git commit -m "feat(chat): Add PDF upload and OCR analysis"
   ```

3. **Push**
   ```bash
   git push origin main
   ```

4. **Deploy to production**
   ```bash
   ssh root@91.99.229.96 "cd /var/www/geolex && git pull && ..."
   # Repeat for vergilex, bookie
   ```

5. **Run migrations**
   ```bash
   npm run migrate:latest
   ```

6. **Enable feature** (via Settings UI)
