# Document Duplicate Prevention System

## Overview
This document describes the duplicate prevention system implemented for document uploads and embeddings in the ASB (Alice Semantic Bridge) project.

## Features

### 1. Document Upload Duplicate Detection
The system prevents duplicate document uploads through multiple checks:

#### Filename & Size Check
- Checks if a document with the same filename and exact file size already exists
- Returns a 409 Conflict error with details about the existing document
- Provides an option to force upload with a timestamped filename

#### Content-Based Duplicate Check
- Compares the first 500 characters of document content
- Uses MD5 hash for additional uniqueness verification
- Detects near-duplicates even with different filenames

#### Force Upload Option
- Users can bypass duplicate checks using `?force=true` parameter
- System automatically renames the file with `[DUPLICATE-timestamp]` prefix

### 2. Embeddings Duplicate Prevention
- Checks if embeddings already exist before creating new ones
- Returns detailed information about existing embeddings
- Prevents redundant processing and saves costs

## Implementation Details

### Backend Implementation

#### Document Routes (`backend/src/routes/documents.routes.ts`)
```typescript
// Check for duplicate by filename and size
const duplicateCheck = await lsembPool.query(
  'SELECT id, title FROM documents WHERE title = $1 AND size = $2',
  [originalname, size]
);

// Check for content-based duplicate using first 500 characters
const contentPreview = processedDoc.content.substring(0, 500);
const contentDuplicateCheck = await lsembPool.query(
  'SELECT id, title FROM documents WHERE LEFT(content, 500) = $1',
  [contentPreview]
);
```

#### Embeddings Prevention
```typescript
// Check if embeddings already exist
const existingEmbeddings = await lsembPool.query(
  'SELECT COUNT(*) as count FROM document_embeddings WHERE document_id = $1',
  [id]
);

if (parseInt(existingEmbeddings.rows[0].count) > 0) {
  return res.status(409).json({
    error: 'Embeddings already exist',
    message: 'This document already has embeddings created',
    documentId: id,
    existingCount: parseInt(existingEmbeddings.rows[0].count)
  });
}
```

### Frontend Implementation

#### Enhanced UI Feedback
- Toast notifications for duplicate warnings
- Detailed duplicate resolution modal
- Visual indicators for duplicate status

#### JavaScript Functions (`dashboard/documents.html`)
```javascript
// Handle duplicate errors
function handleDuplicateError(error, file) {
  if (error.error === 'Duplicate document') {
    showNotification(
      `Duplicate file detected: "${file.name}" already exists`,
      'warning'
    );
  } else if (error.error === 'Duplicate content detected') {
    // Show detailed warning with options
  }
}

// Force upload with new name
async function forceUpload(filename) {
  const response = await fetch('/api/documents/upload?force=true', {
    method: 'POST',
    body: formData
  });
}
```

## API Responses

### Duplicate Document Error (409)
```json
{
  "error": "Duplicate document",
  "message": "A document with the same name and size already exists",
  "duplicateId": "123"
}
```

### Duplicate Content Error (409)
```json
{
  "error": "Duplicate content detected",
  "message": "A document with similar content already exists",
  "duplicateId": "456",
  "duplicateTitle": "similar-document.pdf"
}
```

### Embeddings Already Exist Error (409)
```json
{
  "error": "Embeddings already exist",
  "message": "This document already has embeddings created",
  "documentId": "789",
  "existingCount": 15
}
```

## Benefits

1. **Storage Optimization**: Prevents redundant file storage
2. **Cost Savings**: Avoids duplicate embedding generation
3. **Clean Data**: Maintains a clean, unique document repository
4. **User Control**: Gives users options to handle duplicates
5. **Performance**: Reduces unnecessary processing

## Usage Examples

### 1. Standard Upload (Detects Duplicates)
```bash
curl -X POST http://localhost:8083/api/documents/upload \
  -F "file=@document.pdf"
```

### 2. Force Upload (Bypass Duplicates)
```bash
curl -X POST "http://localhost:8083/api/documents/upload?force=true" \
  -F "file=@document.pdf"
```

### 3. Check for Existing Embeddings
```bash
curl -X POST http://localhost:8083/api/documents/123/embeddings
```

## Future Enhancements

1. **Similarity Scoring**: Implement fuzzy matching for near-duplicates
2. **Batch Deduplication**: Process multiple documents at once
3. **Visual Diff Tool**: Show differences between duplicate documents
4. **Automatic Merging**: Merge similar documents with user approval
5. **Duplicate Dashboard**: Analytics view of duplicate patterns

## Configuration

### Environment Variables
```env
# Enable/disable duplicate checking
DUPLICATE_CHECK_ENABLED=true

# Content similarity threshold (0-1)
CONTENT_SIMILARITY_THRESHOLD=0.9

# Auto-rename duplicates
AUTO_RENAME_DUPLICATES=false
```

## Troubleshooting

### Common Issues

1. **False Positives**: Content-based detection might flag legitimate different documents with similar introductions
   - Solution: Adjust the content preview length or use similarity scoring

2. **Performance Impact**: Content checking adds overhead to uploads
   - Solution: Implement caching or use background processing

3. **Large Files**: Content preview might not be sufficient for large documents
   - Solution: Use sample-based comparison or hash-based checks

## Security Considerations

1. **Content Privacy**: Content is compared in plain text
   - Ensure proper access controls are in place
2. **Hash Storage**: Consider storing content hashes for privacy
3. **Access Logs**: Log all duplicate detection attempts for auditing

## Related Files

- `backend/src/routes/documents.routes.ts` - API endpoints
- `backend/src/services/document-processor.service.ts` - Document processing
- `dashboard/documents.html` - Frontend UI
- `frontend/src/app/dashboard/documents/page.tsx` - React component