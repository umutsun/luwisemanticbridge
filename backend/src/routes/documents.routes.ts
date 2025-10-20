import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { lsembPool } from '../config/database.config';
import documentProcessor from '../services/document-processor.service';
import contextualDocumentProcessor from '../services/contextual-document-processor.service';
import { ocrService } from '../services/ocr.service';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createUploadRateLimit } from '../middleware/rate-limit.middleware';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /txt|pdf|json|md|csv|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only txt, pdf, json, md, csv, doc, docx, xls, xlsx files are allowed'));
    }
  }
});

// Initialize documents table
router.post('/init', async (req: Request, res: Response) => {
  try {
    // First drop the table if it exists to ensure clean state
    await lsembPool.query('DROP TABLE IF EXISTS documents CASCADE');
    
    // Create fresh table with proper structure
    await lsembPool.query(`
      CREATE TABLE documents (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        type VARCHAR(50),
        size INTEGER,
        file_path TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    res.json({ 
      success: true, 
      message: 'Documents table initialized' 
    });
  } catch (error) {
    console.error('Error initializing documents table:', error);
    res.status(500).json({ 
      error: 'Failed to initialize documents table' 
    });
  }
});

// Get all documents (with trailing slash) - REQUIRES AUTHENTICATION
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // First ensure table exists
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        type VARCHAR(50),
        size INTEGER,
        file_path TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Also ensure document_embeddings table exists
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const result = await lsembPool.query(
      `SELECT d.*,
              COALESCE(emb_stats.model_name, 'None') as embedding_model,
              COALESCE(emb_stats.total_tokens, 0) as total_tokens_used,
              COALESCE(emb_stats.chunk_count, 0) as chunk_count,
              CASE
                WHEN EXISTS(SELECT 1 FROM document_embeddings de WHERE de.document_id = d.id) THEN true
                ELSE false
              END as has_embeddings
       FROM documents d
       LEFT JOIN (
         SELECT
           document_id,
           model_name,
           SUM(tokens_used) as total_tokens,
           COUNT(*) as chunk_count
         FROM document_embeddings
         GROUP BY document_id, model_name
       ) emb_stats ON d.id = emb_stats.document_id
       ORDER BY d.created_at DESC`
    );

    const documents = result.rows.map(doc => ({
      id: doc.id.toString(),
      title: doc.title,
      content: doc.content || '',
      type: doc.type || 'text',
      size: doc.size || 0,
      hasEmbeddings: doc.has_embeddings,
      tokens_used: doc.tokens_used || 0,
      model_used: doc.model_used || null,
      cost_usd: doc.cost_usd || 0,
      verified_at: doc.verified_at || null,
      auto_verified: doc.auto_verified || false,
      metadata: {
        source: doc.file_path,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        chunks: doc.chunk_count || 0,
        embeddings: doc.chunk_count || 0,
        embedding_model: doc.embedding_model,
        total_tokens_used: doc.total_tokens_used,
        ...doc.metadata
      }
    }));

    res.json({ documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch documents',
      documents: [] 
    });
  }
});

// Upload document - REQUIRES AUTHENTICATION
router.post('/upload', createUploadRateLimit.middleware, upload.single('file'), authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, size, mimetype, path: filePath } = req.file;

    // Check for duplicate by filename and size (skip if force flag is set)
    if (!req.query.force) {
      const duplicateCheck = await lsembPool.query(
        'SELECT id, title FROM documents WHERE title = $1 AND size = $2',
        [originalname, size]
      );

      if (duplicateCheck.rows.length > 0) {
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        return res.status(409).json({
          error: 'Duplicate document',
          message: 'A document with the same name and size already exists',
          duplicateId: duplicateCheck.rows[0].id
        });
      }
    }

    // Process file based on type using contextual processor
    let processedDoc;
    try {
      processedDoc = await contextualDocumentProcessor.processFile(filePath, originalname, mimetype);
    } catch (err) {
      console.error('Error processing file with contextual processor:', err);
      // Fallback to standard processor
      try {
        processedDoc = await documentProcessor.processFile(filePath, originalname, mimetype);
      } catch (fallbackErr) {
        console.error('Error processing file with fallback:', fallbackErr);
        // Final fallback to simple text reading
        processedDoc = {
          title: originalname,
          content: fs.readFileSync(filePath, 'utf-8').substring(0, 100000),
          chunks: [],
          metadata: { error: 'Processing failed, stored as text' }
        };
      }
    }

    // Check for content-based duplicate using first 500 characters (skip if force flag is set)
    if (!req.query.force) {
      const contentPreview = processedDoc.content.substring(0, 500);
      const contentDuplicateCheck = await lsembPool.query(
        'SELECT id, title FROM documents WHERE LEFT(content, 500) = $1',
        [contentPreview]
      );

      if (contentDuplicateCheck.rows.length > 0) {
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        return res.status(409).json({
          error: 'Duplicate content detected',
          message: 'A document with similar content already exists',
          duplicateId: contentDuplicateCheck.rows[0].id,
          duplicateTitle: contentDuplicateCheck.rows[0].title
        });
      }
    }

    // Determine file type
    const ext = path.extname(originalname).toLowerCase().replace('.', '');
    const fileType = ext || 'text';

    // Generate content hash for additional duplicate checking
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(processedDoc.content).digest('hex');

    // Save to database
    const result = await lsembPool.query(
      `INSERT INTO documents (title, content, type, size, file_path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        originalname,
        processedDoc.content.substring(0, 100000), // Limit content to 100KB
        fileType,
        size,
        filePath,
        JSON.stringify({
          ...processedDoc.metadata,
          originalName: originalname,
          mimeType: mimetype,
          uploadDate: new Date(),
          chunks: processedDoc.chunks.length,
          contentHash: contentHash
        })
      ]
    );

    res.json({
      success: true,
      document: {
        id: result.rows[0].id.toString(),
        title: result.rows[0].title,
        type: result.rows[0].type,
        size: result.rows[0].size,
        metadata: {
          created_at: result.rows[0].created_at,
          ...result.rows[0].metadata
        }
      }
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    res.status(500).json({
      error: error.message || 'Failed to upload document'
    });
  }
});

// Add document manually - REQUIRES AUTHENTICATION
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, content, type = 'text' } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const size = Buffer.byteLength(content, 'utf8');

    const result = await lsembPool.query(
      `INSERT INTO documents (title, content, type, size, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        title,
        content,
        type,
        size,
        JSON.stringify({
          source: 'manual',
          createdBy: 'user',
          uploadDate: new Date()
        })
      ]
    );

    res.json({
      success: true,
      document: {
        id: result.rows[0].id.toString(),
        title: result.rows[0].title,
        content: result.rows[0].content,
        type: result.rows[0].type,
        size: result.rows[0].size,
        metadata: {
          created_at: result.rows[0].created_at,
          ...result.rows[0].metadata
        }
      }
    });
  } catch (error) {
    console.error('Error adding document:', error);
    res.status(500).json({
      error: 'Failed to add document'
    });
  }
});

// Get document statistics (must come before /:id route) - REQUIRES AUTHENTICATION
router.get('/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Ensure table exists first
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        type VARCHAR(50),
        size INTEGER,
        file_path TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const stats = await lsembPool.query(`
      SELECT
        COUNT(*) as total,
        SUM(size) as total_size,
        COUNT(CASE WHEN metadata->>'embeddings' = 'true' THEN 1 END) as with_embeddings,
        COUNT(DISTINCT type) as unique_types
      FROM documents
    `);

    const typeDistribution = await lsembPool.query(`
      SELECT type, COUNT(*) as count
      FROM documents
      GROUP BY type
      ORDER BY count DESC
    `);

    res.json({
      stats: stats.rows[0],
      typeDistribution: typeDistribution.rows
    });
  } catch (error) {
    console.error('Error fetching document stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics'
    });
  }
});

// Get single document - REQUIRES AUTHENTICATION
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await lsembPool.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];
    res.json({
      document: {
        id: doc.id.toString(),
        title: doc.title,
        content: doc.content,
        type: doc.type,
        size: doc.size,
        metadata: {
          source: doc.file_path,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          ...doc.metadata
        }
      }
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ 
      error: 'Failed to fetch document' 
    });
  }
});

// Update document - REQUIRES AUTHENTICATION
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, type } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (title) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (content) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
      updates.push(`size = $${paramIndex++}`);
      values.push(Buffer.byteLength(content, 'utf8'));
    }
    if (type) {
      updates.push(`type = $${paramIndex++}`);
      values.push(type);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await lsembPool.query(
      `UPDATE documents 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      success: true,
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ 
      error: 'Failed to update document' 
    });
  }
});

// Delete document - REQUIRES AUTHENTICATION
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // First get the document to delete the file if exists
    const docResult = await lsembPool.query(
      'SELECT file_path FROM documents WHERE id = $1',
      [id]
    );

    if (docResult.rows.length > 0 && docResult.rows[0].file_path) {
      try {
        fs.unlinkSync(docResult.rows[0].file_path);
      } catch (err) {
        console.log('Could not delete file:', err);
      }
    }

    const result = await lsembPool.query(
      'DELETE FROM documents WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ 
      error: 'Failed to delete document' 
    });
  }
});

// Create embeddings for a document - REQUIRES AUTHENTICATION
router.post('/:id/embeddings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get document
    const docResult = await lsembPool.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

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

    // Determine document type and create embeddings using contextual processor
    const documentType = doc.metadata?.document_type || 'text';
    const embeddingResult = await contextualDocumentProcessor.processAndEmbedDocumentEnhanced(
      doc.id,
      doc.content,
      doc.title,
      documentType
    );

    // Get embedding statistics to save model and token information
    const embeddingStats = await lsembPool.query(
      `SELECT
         model_name,
         SUM(tokens_used) as total_tokens,
         COUNT(*) as chunk_count,
         COALESCE((tokens_used * 0.000002), 0) as total_cost
       FROM document_embeddings
       WHERE document_id = $1
       GROUP BY model_name`,
      [id]
    );

    // Update document with model info, tokens used, cost, and verification timestamp
    if (embeddingStats.rows.length > 0) {
      const stats = embeddingStats.rows[0];
      await lsembPool.query(
        `UPDATE documents
         SET model_used = $1,
             tokens_used = $2,
             cost_usd = $3,
             verified_at = CURRENT_TIMESTAMP,
             auto_verified = true,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          stats.model_name || 'text-embedding-ada-002',
          stats.total_tokens || 0,
          stats.total_cost || 0.000000,
          doc.id
        ]
      );
    }

    // Get the count of created embeddings
    const newEmbeddings = await lsembPool.query(
      'SELECT COUNT(*) as count FROM document_embeddings WHERE document_id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Embeddings created successfully',
      documentId: id,
      embeddingCount: parseInt(newEmbeddings.rows[0].count)
    });
  } catch (error: any) {
    console.error('Error creating embeddings:', error);
    res.status(500).json({
      error: error.message || 'Failed to create embeddings'
    });
  }
});

// Delete embeddings for a document - REQUIRES AUTHENTICATION
router.delete('/:id/embeddings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Use contextual processor for deletion
    const docResult = await lsembPool.query(
      'SELECT metadata->>\'document_type\' as document_type FROM documents WHERE id = $1',
      [id]
    );

    const documentType = docResult.rows[0]?.document_type || 'text';
    await contextualDocumentProcessor.processAndEmbedDocumentEnhanced(
      parseInt(id),
      '', // Empty content to trigger deletion
      '',
      documentType
    );

    res.json({
      success: true,
      message: 'Embeddings deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting embeddings:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to delete embeddings' 
    });
  }
});

// Search documents by similarity - REQUIRES AUTHENTICATION
router.post('/search', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const contentType = req.body.contentType;
    const results = await contextualDocumentProcessor.searchSimilarDocumentsEnhanced(query, limit, contentType);

    res.json({
      success: true,
      results
    });
  } catch (error: any) {
    console.error('Error searching documents:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to search documents' 
    });
  }
});

// Bulk create embeddings - REQUIRES AUTHENTICATION
router.post('/bulk-embed', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await lsembPool.connect();

  try {
    const { documentIds } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Invalid document IDs' });
    }

    let embeddedCount = 0;
    const errors: string[] = [];

    for (const docId of documentIds) {
      try {
        await client.query('BEGIN');

        // Check if document exists and has no embeddings
        const docResult = await client.query(
          'SELECT id, title, content FROM documents WHERE id = $1',
          [docId]
        );

        if (docResult.rows.length === 0) {
          errors.push(`Document ${docId} not found`);
          await client.query('ROLLBACK');
          continue;
        }

        const document = docResult.rows[0];

        // Check if embeddings already exist
        const existingEmbeds = await client.query(
          'SELECT COUNT(*) FROM embeddings WHERE document_id = $1',
          [docId]
        );

        if (parseInt(existingEmbeds.rows[0].count) > 0) {
          errors.push(`Document ${docId} already has embeddings`);
          await client.query('ROLLBACK');
          continue;
        }

        // Process document and create embeddings
        const chunks = await documentProcessor.processDocument(document.content);

        // Insert chunks
        for (const chunk of chunks) {
          await client.query(
            `INSERT INTO embeddings (document_id, chunk_index, content, metadata)
             VALUES ($1, $2, $3, $4)`,
            [docId, chunk.index, chunk.text, JSON.stringify(chunk.metadata || {})]
          );
        }

        // Update document metadata
        await client.query(
          'UPDATE documents SET metadata = metadata || $1 WHERE id = $2',
          [JSON.stringify({ chunks: chunks.length, embeddings: true, last_embedded: new Date().toISOString() }), docId]
        );

        await client.query('COMMIT');
        embeddedCount++;

      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Failed to embed document ${docId}:`, error);
        errors.push(`Document ${docId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      embedded: embeddedCount,
      total: documentIds.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Bulk embed failed:', error);
    res.status(500).json({ error: 'Failed to create bulk embeddings' });
  } finally {
    client.release();
  }
});

// Get embedding statistics - REQUIRES AUTHENTICATION
router.get('/embeddings/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await contextualDocumentProcessor.getEmbeddingStatistics();
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error('Error fetching embedding statistics:', error);
    res.status(500).json({
      error: 'Failed to fetch embedding statistics'
    });
  }
});

// Re-index all documents with contextual processor - REQUIRES AUTHENTICATION
router.post('/reindex', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const client = await lsembPool.connect();

  try {
    await client.query('BEGIN');

    // Get all documents
    const documentsResult = await client.query(
      'SELECT id, title, content, metadata FROM documents ORDER BY created_at'
    );

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const doc of documentsResult.rows) {
      try {
        // Delete existing embeddings
        await client.query(
          'DELETE FROM document_embeddings WHERE document_id = $1',
          [doc.id]
        );

        // Determine document type
        const documentType = doc.metadata?.document_type ||
          (doc.title.match(/\.(csv|json)$/i) ? 'tabular' :
           doc.title.match(/\.(pdf|doc|docx|md)$/i) ? 'structured' : 'text');

        // Create new embeddings with contextual processor
        await contextualDocumentProcessor.processAndEmbedDocumentEnhanced(
          doc.id,
          doc.content,
          doc.title,
          documentType
        );

        results.processed++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${doc.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Re-indexed ${results.processed} documents`,
      results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error re-indexing documents:', error);
    res.status(500).json({
      error: 'Failed to re-index documents'
    });
  } finally {
    client.release();
  }
});

// OCR endpoint for processing documents - REQUIRES AUTHENTICATION
router.post('/ocr/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { language = 'tur+eng' } = req.body;

    // Get document from database
    const docResult = await lsembPool.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];

    if (!document.file_path || !fs.existsSync(document.file_path)) {
      return res.status(400).json({ error: 'File not found on disk' });
    }

    // Check if document already has OCR content
    if (document.title.includes('[OCR]')) {
      return res.status(400).json({ error: 'Document already processed with OCR' });
    }

    console.log(`Starting OCR processing for document: ${document.title}`);

    // Perform OCR
    const ocrResult = await ocrService.processDocument(document.file_path, document.type);

    if (ocrResult.confidence < 30) {
      console.warn(`Low OCR confidence: ${ocrResult.confidence}% for document ${document.title}`);
    }

    // Update document with OCR content
    await lsembPool.query(
      `UPDATE documents
       SET content = COALESCE($1, content),
           title = $2,
           metadata = jsonb_set(
             jsonb_set(
               jsonb_set(COALESCE(metadata, '{}'), '$.ocr_processed', 'true'),
               '$.ocr_confidence', $3::text::jsonb
             ),
             '$.ocr_type', $4
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        ocrResult.text || document.content,
        `[OCR] ${document.title}`,
        ocrResult.confidence,
        ocrResult.type,
        id
      ]
    );

    console.log(`OCR completed for document: ${document.title} (Confidence: ${ocrResult.confidence}%)`);

    res.json({
      success: true,
      message: 'OCR processing completed',
      data: {
        id,
        title: `[OCR] ${document.title}`,
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        type: ocrResult.type
      }
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    res.status(500).json({
      error: 'Failed to process document with OCR',
      details: error.message
    });
  }
});

// Get supported OCR languages - REQUIRES AUTHENTICATION
router.get('/ocr/languages', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const languages = ocrService.getSupportedLanguages();
    res.json({
      languages,
      default: 'tur+eng'
    });
  } catch (error) {
    console.error('Error getting OCR languages:', error);
    res.status(500).json({ error: 'Failed to get supported languages' });
  }
});

export default router;
