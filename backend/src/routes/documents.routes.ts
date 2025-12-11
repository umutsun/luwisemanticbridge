import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';
import { lsembPool } from '../config/database.config';
import documentProcessor from '../services/document-processor.service';
import contextualDocumentProcessor from '../services/contextual-document-processor.service';
import { ocrService } from '../services/ocr.service';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createUploadRateLimit } from '../middleware/rate-limit.middleware';
import { getUploadLimitBytes } from '../middleware/security.middleware';
import { unifiedEmbeddingsSync } from '../services/unified-embeddings-sync.service';
import importJobService from '../services/import-job.service';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import * as ExcelJS from 'exceljs';

/**
 * Strip BOM (Byte Order Mark) from buffer
 * Google Sheets/Excel exports CSV with BOM which breaks Turkish characters
 */
function stripBOM(buffer: Buffer): Buffer {
  // UTF-8 BOM: EF BB BF
  if (buffer.length >= 3 &&
      buffer[0] === 0xEF &&
      buffer[1] === 0xBB &&
      buffer[2] === 0xBF) {
    return buffer.slice(3);
  }
  // UTF-16 LE BOM: FF FE
  if (buffer.length >= 2 &&
      buffer[0] === 0xFF &&
      buffer[1] === 0xFE) {
    return buffer.slice(2);
  }
  // UTF-16 BE BOM: FE FF
  if (buffer.length >= 2 &&
      buffer[0] === 0xFE &&
      buffer[1] === 0xFF) {
    return buffer.slice(2);
  }
  return buffer;
}

/**
 * Decode buffer to UTF-8 string with automatic encoding detection
 * Handles Turkish characters properly regardless of source encoding
 */
function decodeBufferToUTF8(buffer: Buffer): string {
  // First strip any BOM
  const cleanBuffer = stripBOM(buffer);

  // Detect encoding using jschardet
  const detected = jschardet.detect(cleanBuffer);
  const encoding = detected.encoding || 'UTF-8';
  const confidence = detected.confidence || 0;

  console.log(`[Encoding] Detected: ${encoding} (confidence: ${(confidence * 100).toFixed(1)}%)`);

  // Map common encoding names to iconv-lite compatible names
  const encodingMap: Record<string, string> = {
    'ascii': 'utf-8',
    'ASCII': 'utf-8',
    'UTF-8': 'utf-8',
    'utf-8': 'utf-8',
    'ISO-8859-1': 'iso-8859-1',
    'ISO-8859-9': 'iso-8859-9', // Turkish
    'windows-1252': 'win1252',
    'windows-1254': 'win1254', // Turkish Windows
    'WINDOWS-1252': 'win1252',
    'WINDOWS-1254': 'win1254',
    'MacRoman': 'macroman',
    'UTF-16LE': 'utf-16le',
    'UTF-16BE': 'utf-16be',
  };

  const normalizedEncoding = encodingMap[encoding] || encoding.toLowerCase();

  // If detected as UTF-8 or ASCII with high confidence, try it first but verify
  if ((normalizedEncoding === 'utf-8' || normalizedEncoding === 'ascii') && confidence > 0.8) {
    const utf8Result = cleanBuffer.toString('utf-8');
    // Check for broken characters that indicate wrong encoding
    const hasBrokenChars = /[\uFFFD�]|Ã¼|Ã¶|Ã§|Ã°|Ä±|Å|Ä|Ãœ|Å|Ã‡|Ã–|Ä°/.test(utf8Result);
    if (!hasBrokenChars) {
      console.log('[Encoding] UTF-8 decode successful, no broken characters');
      return utf8Result;
    }
    console.log('[Encoding] UTF-8 has broken characters, trying Turkish encodings...');
  }

  // Try to decode with detected encoding
  try {
    if (iconv.encodingExists(normalizedEncoding)) {
      const decoded = iconv.decode(cleanBuffer, normalizedEncoding);
      // Verify Turkish characters are preserved
      if (decoded.includes('ü') || decoded.includes('ş') || decoded.includes('ğ') ||
          decoded.includes('ı') || decoded.includes('ö') || decoded.includes('ç') ||
          decoded.includes('Ü') || decoded.includes('Ş') || decoded.includes('Ğ') ||
          decoded.includes('İ') || decoded.includes('Ö') || decoded.includes('Ç')) {
        console.log('[Encoding] Turkish characters found, using detected encoding');
        return decoded;
      }
    }
  } catch (e) {
    console.log(`[Encoding] Failed to decode with ${normalizedEncoding}, trying fallbacks`);
  }

  // Check for common mojibake patterns that indicate wrong encoding
  // İ (0xDD in Win-1254) → Ý in Latin-1, ı (0xFD in Win-1254) → ý in Latin-1
  const utf8Attempt = cleanBuffer.toString('utf-8');
  const hasTurkishMojibake = /[ÝýÞþ]/.test(utf8Attempt); // Ý=İ, ý=ı, Þ=Ş, þ=ş in mojibake

  // If mojibake detected, prioritize Windows-1254
  const turkishEncodings = hasTurkishMojibake
    ? ['win1254', 'iso-8859-9', 'win1252', 'iso-8859-1', 'utf-8']
    : ['win1254', 'iso-8859-9', 'utf-8', 'win1252', 'iso-8859-1'];

  if (hasTurkishMojibake) {
    console.log('[Encoding] Turkish mojibake detected (Ý/ý patterns), prioritizing win1254');
  }

  for (const enc of turkishEncodings) {
    try {
      if (iconv.encodingExists(enc)) {
        const decoded = iconv.decode(cleanBuffer, enc);
        // Check if Turkish characters are properly decoded (not replacement chars)
        if (!decoded.includes('�') && !decoded.includes('\uFFFD')) {
          // Additional check: look for valid Turkish chars or common patterns
          const hasTurkish = /[üşğıöçÜŞĞİÖÇ]/.test(decoded);
          const hasReplacementOrBroken = /[\uFFFD�]|Ã¼|Ã¶|Ã§|Ã°|Ä±|Å|Ä|Ý|ý/.test(decoded);

          if (hasTurkish && !hasReplacementOrBroken) {
            console.log(`[Encoding] Successfully decoded with ${enc}`);
            return decoded;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  // Last resort: UTF-8
  console.log('[Encoding] Using UTF-8 as last resort');
  return cleanBuffer.toString('utf-8');
}

const router = Router();

// Get upload directory from environment or settings
const getUploadDirectory = (): string => {
  // Priority: ENV variable > settings config > default
  const uploadDir = process.env.DOCUMENTS_PATH || process.env.UPLOAD_DIR || './docs';

  // Normalize path (convert forward slashes to OS-specific)
  const normalizedPath = uploadDir.replace(/\//g, path.sep);

  // If relative path, resolve from project root (parent of backend folder)
  let fullPath: string;
  if (path.isAbsolute(normalizedPath)) {
    fullPath = normalizedPath;
  } else {
    // Go up one level from backend to project root
    fullPath = path.join(process.cwd(), '..', normalizedPath);
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(` Created documents directory: ${fullPath}`);
  }

  console.log(` Using documents directory: ${fullPath}`);
  return fullPath;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadDir = getUploadDirectory();
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, '');
    }
  },
  filename: (req, file, cb) => {
    // Use original filename directly (overwrite if exists)
    // This allows duplicate uploads to replace the existing file
    const uploadDir = getUploadDirectory();
    const targetPath = path.join(uploadDir, file.originalname);

    // Check if file exists
    if (fs.existsSync(targetPath)) {
      console.log(` Overwriting existing file: ${file.originalname}`);
      // Delete old file before upload
      try {
        fs.unlinkSync(targetPath);
        console.log(`️ Deleted old file: ${file.originalname}`);
      } catch (err) {
        console.error(`️ Failed to delete old file:`, err);
      }
    }

    // Use original filename as-is
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: getUploadLimitBytes() // Dynamic limit from settings (default 100MB)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /txt|pdf|json|md|csv|doc|docx|xls|xlsx|markdown/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

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
        model_name VARCHAR(100),
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns to existing table (migration)
    await lsembPool.query(`
      ALTER TABLE document_embeddings
      ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0
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
      type: doc.type || doc.file_type || 'text',
      size: doc.size || doc.file_size || 0,
      file_path: doc.file_path || null,
      processing_status: doc.processing_status || null,
      hasEmbeddings: doc.has_embeddings,
      tokens_used: doc.tokens_used || 0,
      model_used: doc.model_used || null,
      cost_usd: doc.cost_usd || 0,
      verified_at: doc.verified_at || null,
      auto_verified: doc.auto_verified || false,
      // Transform metadata (NEW)
      transform_status: doc.transform_status || 'pending',
      transform_progress: doc.transform_progress || 0,
      target_table_name: doc.target_table_name || null,
      transformed_at: doc.transformed_at || null,
      last_transform_row_count: doc.last_transform_row_count || null,
      column_count: doc.column_count || null,
      row_count: doc.row_count || null,
      column_headers: doc.column_headers || [],
      original_filename: doc.original_filename || doc.title,
      upload_count: doc.upload_count || 1,
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

    const { originalname, size, mimetype, path: filePath, filename } = req.file;
    const skipDb = req.query.skipDb === 'true';

    console.log(` File uploaded: ${originalname} -> ${filename}`);
    console.log(` Saved to: ${filePath}`);
    console.log(` Skip DB: ${skipDb}`);

    // If skipDb is true, just return success without saving to database
    if (skipDb) {
      console.log(` Physical upload only - not saving to database`);
      return res.json({
        success: true,
        message: 'File uploaded to physical storage only',
        file: {
          filename: originalname,
          size: size,
          path: filePath
        }
      });
    }

    // Check for existing document with same original filename
    const existingCheck = await lsembPool.query(
      'SELECT id, title, file_path FROM documents WHERE title = $1',
      [originalname]
    );

    if (existingCheck.rows.length > 0) {
      console.log(` Found existing document with same filename, will update it`);
      // Delete old physical file if it's different from new one
      const oldFilePath = existingCheck.rows[0].file_path;
      if (oldFilePath && oldFilePath !== filePath && fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
          console.log(`️ Deleted old physical file: ${oldFilePath}`);
        } catch (err) {
          console.warn(`️ Could not delete old file: ${oldFilePath}`, err);
        }
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
        // Final fallback - return minimal metadata for binary files (like PDFs)
        processedDoc = {
          title: originalname,
          content: '', // Empty content for binary files that failed processing
          chunks: [],
          metadata: {
            error: 'Processing failed - binary file needs OCR/analysis',
            needsOCR: mimetype.includes('pdf'),
            size: size
          }
        };
      }
    }

    // Determine file type - prioritize file extension to avoid incorrect types
    // File extension is the most reliable source for file type
    const ext = path.extname(originalname).toLowerCase().replace('.', '');
    const fileType = ext || processedDoc.metadata?.type || 'text';

    // Generate content hash for additional duplicate checking
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(processedDoc.content || '').digest('hex');

    // Clean metadata - remove problematic characters that cause encoding issues
    const cleanMetadata = (obj: any): any => {
      if (typeof obj === 'string') {
        // Remove null bytes and other problematic characters
        return obj.replace(/\0/g, '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
      } else if (Array.isArray(obj)) {
        return obj.map(cleanMetadata);
      } else if (obj && typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
          cleaned[key] = cleanMetadata(obj[key]);
        }
        return cleaned;
      }
      return obj;
    };

    const cleanedMetadata = cleanMetadata({
      ...processedDoc.metadata,
      originalName: originalname,
      mimeType: mimetype,
      uploadDate: new Date(),
      chunks: processedDoc.chunks.length,
    });

    // UPSERT to database - overwrite if same filename exists
    // Use filename as unique key (original filename)
    const result = await lsembPool.query(
      `INSERT INTO documents (
        filename, title, content, file_type, size, file_path, metadata,
        original_filename, upload_count, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())
       ON CONFLICT (filename)
       DO UPDATE SET
         content = EXCLUDED.content,
         file_type = EXCLUDED.file_type,
         size = EXCLUDED.size,
         file_path = EXCLUDED.file_path,
         metadata = EXCLUDED.metadata,
         original_filename = EXCLUDED.original_filename,
         updated_at = NOW(),
         -- Increment upload count
         upload_count = COALESCE(documents.upload_count, 0) + 1,
         -- Reset transform status on re-upload
         transform_status = 'pending',
         transform_progress = 0
       RETURNING *`,
      [
        originalname, // filename
        originalname, // title
        (processedDoc.content || '').substring(0, 100000), // Limit content to 100KB
        fileType,
        size,
        filePath,
        JSON.stringify(cleanedMetadata),
        originalname // original_filename
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
      `INSERT INTO documents (title, content, file_type, file_size, metadata)
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
    // Get document counts
    const docStats = await lsembPool.query(`
      SELECT
        COUNT(*)::int as total,
        COUNT(CASE WHEN (metadata->'analysis'->>'embeddings')::int > 0
                   OR metadata->>'hasEmbeddings' = 'true'
                   OR (SELECT COUNT(*) FROM chunks WHERE chunks.document_id = documents.id) > 0
              THEN 1 END)::int as embedded,
        COUNT(CASE WHEN metadata->'visionOCR' IS NOT NULL
                   OR metadata->>'ocr_processed' = 'true'
              THEN 1 END)::int as ocr_processed,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END)::int as uploaded_today,
        SUM(CASE WHEN metadata->'analysis'->>'tokensUsed' IS NOT NULL
                THEN (metadata->'analysis'->>'tokensUsed')::int ELSE 0 END)::bigint as total_tokens
      FROM documents
    `);

    const doc = docStats.rows[0];
    const total = parseInt(doc.total) || 0;
    const embedded = parseInt(doc.embedded) || 0;
    const ocrProcessed = parseInt(doc.ocr_processed) || 0;

    // Get transform statistics (tables created and records inserted)
    let transformStats = {
      tables_created: 0,
      total_records: 0
    };

    try {
      // Get database settings from settings table
      const settingsResult = await lsembPool.query(
        `SELECT key, value FROM settings WHERE key LIKE 'database.%'`
      );

      const dbSettings: any = {};
      settingsResult.rows.forEach((row: any) => {
        const key = row.key.replace('database.', '');
        try {
          dbSettings[key] = JSON.parse(row.value);
        } catch {
          dbSettings[key] = row.value;
        }
      });

      // Build connection string from settings
      const username = dbSettings.user || dbSettings.username;
      const database = dbSettings.name || dbSettings.database;

      if (username && database && dbSettings.password && dbSettings.host && dbSettings.port) {
        const sourceConnectionString = `postgresql://${username}:${dbSettings.password}@${dbSettings.host}:${dbSettings.port}/${database}`;
        const sourcePool = new Pool({ connectionString: sourceConnectionString });

        try {
          // Get all tables from source database (exclude system tables)
          const tablesResult = await sourcePool.query(`
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            AND tablename NOT IN ('spatial_ref_sys', 'embedding_progress', 'embedding_history', 'unified_embeddings', 'skipped_embeddings')
            ORDER BY tablename
          `);

          transformStats.tables_created = tablesResult.rows.length;

          // Get total records across all tables
          let totalRecords = 0;
          for (const row of tablesResult.rows) {
            try {
              const countResult = await sourcePool.query(`SELECT COUNT(*) as count FROM public."${row.tablename}"`);
              totalRecords += parseInt(countResult.rows[0].count) || 0;
            } catch (countError) {
              console.warn(`Could not count records in table ${row.tablename}:`, countError);
            }
          }
          transformStats.total_records = totalRecords;

        } finally {
          await sourcePool.end();
        }
      }
    } catch (transformError) {
      console.warn('Could not fetch transform statistics:', transformError);
    }

    // Get physical files count
    const uploadDir = getUploadDirectory();
    let physicalFilesTotal = 0;
    let physicalFilesNotInDB = 0;

    try {
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        physicalFilesTotal = files.length;

        // Get DB file paths
        const dbFilesResult = await lsembPool.query('SELECT file_path FROM documents WHERE file_path IS NOT NULL');
        const dbFilePaths = new Set(dbFilesResult.rows.map((row: any) => row.file_path));
        const dbFileNames = new Set(dbFilesResult.rows.map((row: any) => path.basename(row.file_path)));

        // Count files not in DB (check by full path OR by filename)
        files.forEach(filename => {
          const filePath = path.join(uploadDir, filename);
          if (!dbFilePaths.has(filePath) && !dbFileNames.has(filename)) {
            physicalFilesNotInDB++;
          }
        });
      }
    } catch (fsError) {
      console.warn('Could not read physical files:', fsError);
    }

    // Calculate performance metrics
    const successRate = total > 0 ? ((embedded / total) * 100) : 0;
    const avgProcessingTime = 0; // TODO: Calculate from processing logs
    const totalCost = (parseInt(doc.total_tokens) || 0) * 0.00014 / 1000; // $0.00014 per 1K tokens

    res.json({
      documents: {
        total: total,
        embedded: embedded,
        pending: Math.max(0, total - embedded),
        ocr_processed: ocrProcessed,
        ocr_pending: Math.max(0, total - ocrProcessed),
        under_review: 0
      },
      transform: {
        tables_created: transformStats.tables_created,
        total_records: transformStats.total_records
      },
      performance: {
        total_tokens_used: parseInt(doc.total_tokens) || 0,
        total_cost: totalCost,
        avg_processing_time: avgProcessingTime,
        success_rate: Math.round(successRate * 10) / 10
      },
      history: {
        uploaded_today: parseInt(doc.uploaded_today) || 0,
        embedded_today: embedded, // Approximate
        ocr_today: ocrProcessed, // Approximate
        last_24h_activity: parseInt(doc.uploaded_today) || 0
      },
      physicalFiles: {
        total: physicalFilesTotal,
        inDatabase: physicalFilesTotal - physicalFilesNotInDB,
        notInDatabase: physicalFilesNotInDB,
        uploadDirectory: uploadDir
      }
    });
  } catch (error) {
    console.error('Error fetching document stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

// List physical files in upload directory - REQUIRES AUTHENTICATION
// NOTE: This route MUST come before /:id to avoid route matching issues
router.get('/physical-files', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(' Physical files endpoint called');
    const uploadDir = getUploadDirectory();
    console.log(' Upload directory:', uploadDir);

    // Check if directory exists
    if (!fs.existsSync(uploadDir)) {
      console.error(' Upload directory does not exist:', uploadDir);
      return res.status(404).json({
        error: 'Upload directory not found',
        path: uploadDir
      });
    }

    // Read all files from upload directory
    const files = fs.readdirSync(uploadDir);
    console.log(` Found ${files.length} files in directory`);

    // Get database file paths to compare (optional - continue if DB is down)
    let dbFilePaths: Set<string> = new Set();
    let dbFileNames: Set<string> = new Set(); // Also track by filename for flexible matching
    let dbAvailable = false;

    try {
      if (lsembPool) {
        const dbFilesResult = await lsembPool.query('SELECT file_path FROM documents WHERE file_path IS NOT NULL');
        dbFilePaths = new Set(dbFilesResult.rows.map(row => row.file_path));
        // Also extract just filenames for flexible matching (handles path format differences)
        dbFileNames = new Set(dbFilesResult.rows.map(row => path.basename(row.file_path)));
        dbAvailable = true;
        console.log(` Found ${dbFilePaths.size} files in database`);
      }
    } catch (dbError: any) {
      console.warn('️ Database not available - showing all files as "not in DB"');
      console.warn('   Error:', dbError.code || dbError.message);
    }

    // Process each file
    const physicalFiles = files.map(filename => {
      const filePath = path.join(uploadDir, filename);
      const stats = fs.statSync(filePath);

      // Check if file is in database
      const inDatabase = dbFilePaths.has(filePath) || dbFileNames.has(filename);

      // Extract original filename from timestamp-originalname.ext format
      let displayName = filename;
      if (filename.match(/^\d+-/)) {
        // Remove timestamp prefix (e.g., "1234567890-ozelgeler.csv" -> "ozelgeler.csv")
        displayName = filename.replace(/^\d+-/, '');
      }

      return {
        filename,
        displayName, // Original name for display
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        inDatabase,
        ext: path.extname(filename).toLowerCase().replace('.', '') || 'unknown'
      };
    }).filter(file => {
      // Only return actual files (not directories)
      try {
        return fs.statSync(file.path).isFile();
      } catch {
        return false;
      }
    }).sort((a, b) => {
      // Sort by modified date DESC (newest first)
      return b.modified.getTime() - a.modified.getTime();
    });

    res.json({
      success: true,
      uploadDirectory: uploadDir,
      totalFiles: physicalFiles.length,
      inDatabase: physicalFiles.filter(f => f.inDatabase).length,
      notInDatabase: physicalFiles.filter(f => !f.inDatabase).length,
      files: physicalFiles,
      dbAvailable: dbAvailable,
      warning: !dbAvailable ? 'Database not available - all files shown as not in database' : undefined
    });
  } catch (error: any) {
    console.error(' Error listing physical files:', error);
    res.status(500).json({
      error: 'Failed to list physical files',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add physical file to database - REQUIRES AUTHENTICATION
router.post('/physical-files/add', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filePath } = req.body;

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Check if file already in database
    const existingFile = await lsembPool.query(
      'SELECT id FROM documents WHERE file_path = $1',
      [filePath]
    );

    if (existingFile.rows.length > 0) {
      return res.status(409).json({
        error: 'File already in database',
        documentId: existingFile.rows[0].id
      });
    }

    const filename = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase().replace('.', '') || 'text';
    const mimetype = `application/${ext}`;

    // Process file
    let processedDoc;
    try {
      processedDoc = await contextualDocumentProcessor.processFile(filePath, filename, mimetype);
    } catch (err) {
      console.error('Error processing file:', err);
      // Fallback for binary files - do not try to read as UTF-8
      processedDoc = {
        title: filename,
        content: '', // Empty content for binary files that failed processing
        chunks: [],
        metadata: {
          error: 'Processing failed - binary file needs OCR/analysis',
          needsOCR: mimetype.includes('pdf'),
          size: stats.size
        }
      };
    }

    // Generate content hash
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(processedDoc.content).digest('hex');

    // Clean metadata - remove problematic characters that cause encoding issues
    const cleanMetadata = (obj: any): any => {
      if (typeof obj === 'string') {
        // Remove null bytes and other problematic characters
        return obj.replace(/\0/g, '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
      } else if (Array.isArray(obj)) {
        return obj.map(cleanMetadata);
      } else if (obj && typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
          cleaned[key] = cleanMetadata(obj[key]);
        }
        return cleaned;
      }
      return obj;
    };

    const cleanedMetadata = cleanMetadata({
      ...processedDoc.metadata,
      originalName: filename,
      mimeType: mimetype,
      uploadDate: new Date(),
      chunks: processedDoc.chunks.length,
      contentHash: contentHash,
      addedFrom: 'physical-files'
    });

    // Save to database
    const result = await lsembPool.query(
      `INSERT INTO documents (title, content, file_type, file_size, file_path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        filename,
        processedDoc.content.substring(0, 100000),
        ext,
        stats.size,
        filePath,
        JSON.stringify(cleanedMetadata)
      ]
    );

    res.json({
      success: true,
      message: 'File added to database',
      document: {
        id: result.rows[0].id.toString(),
        title: result.rows[0].title,
        type: result.rows[0].type,
        size: result.rows[0].size
      }
    });
  } catch (error: any) {
    console.error('Error adding physical file to database:', error);
    res.status(500).json({
      error: error.message || 'Failed to add file to database'
    });
  }
});

// Delete physical file (from disk and database) - REQUIRES AUTHENTICATION
router.delete('/physical-files', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filePath, deleteFromDatabase = true } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const results = {
      fileDeleted: false,
      databaseDeleted: false,
      errors: [] as string[]
    };

    // Delete from database if requested
    if (deleteFromDatabase) {
      try {
        const dbResult = await lsembPool.query(
          'DELETE FROM documents WHERE file_path = $1 RETURNING id',
          [filePath]
        );
        results.databaseDeleted = dbResult.rowCount > 0;
      } catch (err) {
        results.errors.push(`Database deletion failed: ${err.message}`);
      }
    }

    // Delete physical file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        results.fileDeleted = true;
      } else {
        results.errors.push('File does not exist on disk');
      }
    } catch (err) {
      results.errors.push(`File deletion failed: ${err.message}`);
    }

    res.json({
      success: results.fileDeleted || results.databaseDeleted,
      message: 'Physical file deletion completed',
      results
    });
  } catch (error: any) {
    console.error('Error deleting physical file:', error);
    res.status(500).json({
      error: error.message || 'Failed to delete physical file'
    });
  }
});

// Bulk delete physical files - REQUIRES AUTHENTICATION
router.post('/physical-files/bulk-delete', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filePaths } = req.body;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ error: 'File paths array is required' });
    }

    let filesDeleted = 0;
    let databaseDeleted = 0;
    const errors: string[] = [];

    for (const filePath of filePaths) {
      try {
        // Delete from database
        const dbResult = await lsembPool.query(
          'DELETE FROM documents WHERE file_path = $1 RETURNING id',
          [filePath]
        );
        if (dbResult.rowCount > 0) {
          databaseDeleted++;
        }

        // Delete physical file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          filesDeleted++;
        }
      } catch (err: any) {
        errors.push(`Failed to delete ${filePath}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      deletedCount: filesDeleted,
      databaseDeletedCount: databaseDeleted,
      totalRequested: filePaths.length,
      message: `Successfully deleted ${filesDeleted} file(s)`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('Error in bulk delete physical files:', error);
    res.status(500).json({
      error: error.message || 'Failed to bulk delete physical files'
    });
  }
});

// Bulk add physical files to database - REQUIRES AUTHENTICATION
router.post('/physical-files/bulk-add-to-database', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filePaths } = req.body;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ error: 'File paths array is required' });
    }

    let filesAdded = 0;
    let filesSkipped = 0;
    const errors: string[] = [];

    for (const filePath of filePaths) {
      try {
        // Check if file already exists in database
        const existsInDb = await lsembPool.query(
          'SELECT id FROM documents WHERE file_path = $1',
          [filePath]
        );

        if (existsInDb.rowCount > 0) {
          filesSkipped++;
          continue;
        }

        // Check if file exists on disk
        if (!fs.existsSync(filePath)) {
          errors.push(`File not found: ${filePath}`);
          continue;
        }

        // Read file
        const stats = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase().substring(1);
        const filename = path.basename(filePath);

        // Determine file type
        const fileType = ['pdf', 'docx', 'doc', 'txt', 'md', 'csv', 'xlsx', 'xls'].includes(ext) ? ext : 'other';

        // Process document (extract content)
        let content = '';
        let metadata: any = {
          source: 'physical_file',
          added_at: new Date().toISOString()
        };

        try {
          const processedDoc = await processDocument(filePath);
          content = processedDoc.content || '';

          // Merge metadata
          if (processedDoc.metadata) {
            metadata = { ...metadata, ...processedDoc.metadata };
          }
        } catch (procError: any) {
          console.warn(`⚠️ Failed to process ${filename}: ${procError.message}`);
          content = `[Processing failed: ${procError.message}]`;
        }

        // Clean metadata - remove sensitive info
        const cleanedMetadata = { ...metadata };
        if (cleanedMetadata.credentials) delete cleanedMetadata.credentials;
        if (cleanedMetadata.tokens) delete cleanedMetadata.tokens;

        // Insert into database
        const result = await lsembPool.query(
          `INSERT INTO documents (title, content, type, size, file_path, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, title, type, size`,
          [
            filename,
            content.substring(0, 100000),
            ext,
            stats.size,
            filePath,
            JSON.stringify(cleanedMetadata)
          ]
        );

        filesAdded++;
      } catch (err: any) {
        errors.push(`Failed to add ${filePath}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      addedCount: filesAdded,
      skippedCount: filesSkipped,
      totalRequested: filePaths.length,
      message: `Successfully added ${filesAdded} file(s) to database${filesSkipped > 0 ? `, ${filesSkipped} already existed` : ''}`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('Error in bulk add to database:', error);
    res.status(500).json({
      error: error.message || 'Failed to bulk add files to database'
    });
  }
});

// Preview physical file content - REQUIRES AUTHENTICATION
// NOTE: This route MUST come before /:id to avoid route matching issues
router.get('/preview/:filename', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename } = req.params;
    const uploadDir = getUploadDirectory();
    const filePath = path.join(uploadDir, filename);

    console.log(` Preview request for: ${filename}`);
    console.log(` Looking in: ${filePath}`);

    // Security check - ensure file is within upload directory
    const normalizedFilePath = path.normalize(filePath);
    const normalizedUploadDir = path.normalize(uploadDir);

    if (!normalizedFilePath.startsWith(normalizedUploadDir)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Cannot access files outside upload directory'
      });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        message: `File ${filename} does not exist`
      });
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase().replace('.', '');

    // Read file content based on type
    let content = '';
    let preview = '';
    let metadata: any = {};

    const fileExt = path.extname(filename).toLowerCase();

    if (['.xlsx', '.xls'].includes(fileExt)) {
      // Excel files - parse with ExcelJS and convert to CSV-like format
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const sheet = workbook.worksheets[0]; // Get first sheet
        if (!sheet) {
          content = '';
          preview = '';
        } else {
          const rows: string[][] = [];
          const headers: string[] = [];

          sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            const rowValues: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              let value = '';
              if (cell.value !== null && cell.value !== undefined) {
                if (typeof cell.value === 'object' && 'result' in cell.value) {
                  // Formula cell - use result
                  value = String(cell.value.result || '');
                } else if (typeof cell.value === 'object' && 'text' in cell.value) {
                  // Rich text cell
                  value = String(cell.value.text || '');
                } else {
                  value = String(cell.value);
                }
              }
              rowValues.push(value);
            });

            if (rowNumber === 1) {
              headers.push(...rowValues);
            }
            rows.push(rowValues);
          });

          // Convert to CSV format for display
          content = rows.map(row => row.join(',')).join('\n');
          preview = rows.slice(0, 11).map(row => row.join(',')).join('\n');

          // Add CSV-like stats for table viewer
          const dataRows = rows.slice(1);
          const columnIsNumeric = new Array(headers.length).fill(true);

          dataRows.slice(0, 10).forEach(row => {
            row.forEach((val, idx) => {
              if (columnIsNumeric[idx] && val && isNaN(Number(val))) {
                columnIsNumeric[idx] = false;
              }
            });
          });

          metadata.csvStats = {
            totalRows: dataRows.length,
            totalColumns: headers.length,
            headers: headers,
            numericColumns: headers.filter((_, idx) => columnIsNumeric[idx]),
            columnTypes: headers.map((name, idx) => ({
              name,
              type: columnIsNumeric[idx] ? 'numeric' : 'text'
            }))
          };
          metadata.sheetName = sheet.name;
          metadata.sheetCount = workbook.worksheets.length;
        }
      } catch (excelError: any) {
        console.error('Error parsing Excel file:', excelError);
        content = '[Error reading Excel file]';
        preview = content;
      }
    } else if (['.csv', '.txt', '.json', '.log', '.md', '.doc', '.docx'].includes(fileExt)) {
      // Text-based files - read directly with encoding detection
      // ⚡ PERFORMANCE: For large CSV files (>1MB), only read preview portion
      const PREVIEW_BYTES = 100 * 1024; // 100KB for preview
      const fileSize = stats.size;

      if (ext === 'csv' && fileSize > 1_000_000) {
        // Large CSV file - stream only first 100KB
        console.log(`⚡ [Preview] Large CSV file (${(fileSize / 1024 / 1024).toFixed(1)}MB) - reading first ${PREVIEW_BYTES / 1024}KB only`);
        const buffer = Buffer.alloc(PREVIEW_BYTES);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, PREVIEW_BYTES, 0);
        fs.closeSync(fd);
        content = decodeBufferToUTF8(buffer);

        // Estimate total rows from sample
        const sampleNewlines = (content.match(/\n/g) || []).length;
        const estimatedTotalRows = Math.round((sampleNewlines / PREVIEW_BYTES) * fileSize);
        metadata.estimatedTotalRows = estimatedTotalRows;
        metadata.isPartialPreview = true;
        metadata.previewBytes = PREVIEW_BYTES;
        metadata.totalBytes = fileSize;
        console.log(`⚡ [Preview] Estimated ${estimatedTotalRows} total rows from ${sampleNewlines} sample rows`);
      } else {
        // Small file - read entirely
        const fileBuffer = fs.readFileSync(filePath);
        content = decodeBufferToUTF8(fileBuffer);
      }

      // For CSV files, parse and provide stats
      if (ext === 'csv') {
        const lines = content.split('\n').filter(line => line.trim());

        // Auto-detect delimiter (comma, semicolon, or tab)
        const detectDelimiter = (line: string): string => {
          const delimiters = [',', ';', '\t'];
          const counts = delimiters.map(d => {
            let count = 0;
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              if (line[i] === '"') inQuotes = !inQuotes;
              if (line[i] === d && !inQuotes) count++;
            }
            return { delimiter: d, count };
          });

          // Return delimiter with highest count (minimum 1)
          const best = counts.reduce((a, b) => b.count > a.count ? b : a);
          return best.count > 0 ? best.delimiter : ','; // Default to comma
        };

        const delimiter = detectDelimiter(lines[0] || '');
        console.log(` Detected delimiter: "${delimiter}" (${delimiter === '\t' ? 'TAB' : delimiter === ';' ? 'SEMICOLON' : 'COMMA'})`);

        // Proper CSV parsing function that handles quoted fields
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          let i = 0;

          while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
              if (!inQuotes) {
                // Start of quoted field
                inQuotes = true;
              } else if (nextChar === '"') {
                // Escaped quote inside quoted field
                current += '"';
                i++; // Skip next quote
              } else {
                // End of quoted field
                inQuotes = false;
              }
            } else if (char === delimiter && !inQuotes) {
              // Field delimiter outside quotes
              result.push(current);
              current = '';
            } else {
              // Regular character
              current += char;
            }
            i++;
          }

          // Add last field
          result.push(current);

          // Clean up fields - remove leading/trailing quotes and whitespace
          return result.map(field => {
            field = field.trim();
            // Remove surrounding quotes if present
            if (field.startsWith('"') && field.endsWith('"')) {
              field = field.slice(1, -1);
            }
            return field;
          });
        };

        const headers = lines[0] ? parseCSVLine(lines[0]) : [];

        console.log(' CSV Parse Debug:', {
          filename,
          headerCount: headers.length,
          headers: headers.slice(0, 10),
          firstLineRaw: lines[0]?.substring(0, 200)
        });

        metadata.csvStats = {
          totalRows: lines.length - 1, // Exclude header
          totalColumns: headers.length,
          headers: headers,
          numericColumns: [],
          columnTypes: headers.map(h => ({ name: h, type: 'text' }))
        };

        // Analyze column types from first 10 rows
        if (lines.length > 1) {
          const sampleSize = Math.min(10, lines.length - 1);
          const columnIsNumeric = new Array(headers.length).fill(true);

          for (let i = 1; i <= sampleSize; i++) {
            const values = parseCSVLine(lines[i]);
            values.forEach((val, idx) => {
              if (columnIsNumeric[idx] && val && isNaN(Number(val))) {
                columnIsNumeric[idx] = false;
              }
            });
          }

          metadata.csvStats.numericColumns = headers.filter((_, idx) => columnIsNumeric[idx]);
          metadata.csvStats.columnTypes = headers.map((name, idx) => ({
            name,
            type: columnIsNumeric[idx] ? 'numeric' : 'text'
          }));
        }

        preview = lines.slice(0, 11).join('\n'); // Header + 10 rows
      } else if (ext === 'json') {
        // For JSON, provide structure stats
        try {
          const jsonData = JSON.parse(content);
          metadata.jsonStats = {
            depth: getJsonDepth(jsonData),
            objectCount: countObjects(jsonData),
            arrayCount: countArrays(jsonData)
          };
        } catch (e) {
          console.error('Failed to parse JSON for stats:', e);
        }
        preview = content.substring(0, 1000); // First 1000 chars
      } else {
        preview = content.substring(0, 1000);
      }
    } else {
      // Binary or unsupported files
      content = '[Binary file - preview not available]';
      preview = content;
    }

    res.json({
      success: true,
      filename: filename,
      path: filePath,
      size: stats.size,
      type: ext || 'unknown',
      modified: stats.mtime,
      created: stats.birthtime,
      content: content,
      preview: preview,
      metadata: metadata
    });

  } catch (error: any) {
    console.error(' Error previewing file:', error);
    res.status(500).json({
      error: 'Failed to preview file',
      details: error.message
    });
  }
});

// Helper functions for JSON stats
function getJsonDepth(obj: any, currentDepth = 0): number {
  if (obj === null || typeof obj !== 'object') return currentDepth;
  const depths = Object.values(obj).map(val => getJsonDepth(val, currentDepth + 1));
  return depths.length > 0 ? Math.max(...depths) : currentDepth;
}

function countObjects(obj: any): number {
  if (typeof obj !== 'object' || obj === null) return 0;
  let count = Array.isArray(obj) ? 0 : 1;
  Object.values(obj).forEach(val => {
    count += countObjects(val);
  });
  return count;
}

function countArrays(obj: any): number {
  if (typeof obj !== 'object' || obj === null) return 0;
  let count = Array.isArray(obj) ? 1 : 0;
  Object.values(obj).forEach(val => {
    count += countArrays(val);
  });
  return count;
}

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

    console.log(`[Documents GET] Document ${id} - Has metadata?`, !!doc.metadata);
    console.log(`[Documents GET] Document ${id} - Has metadata.analysis?`, !!doc.metadata?.analysis);
    if (doc.metadata) {
      console.log(`[Documents GET] Document ${id} - Metadata keys:`, Object.keys(doc.metadata));
    }

    res.json({
      document: {
        id: doc.id.toString(),
        title: doc.title,
        content: doc.content,
        type: doc.file_type || 'text',
        size: doc.size,
        // Transform metadata (NEW)
        transform_status: doc.transform_status || 'pending',
        transform_progress: doc.transform_progress || 0,
        target_table_name: doc.target_table_name || null,
        transformed_at: doc.transformed_at || null,
        last_transform_row_count: doc.last_transform_row_count || null,
        column_count: doc.column_count || null,
        row_count: doc.row_count || null,
        column_headers: doc.column_headers || [],
        original_filename: doc.original_filename || doc.title,
        upload_count: doc.upload_count || 1,
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

// Bulk delete documents - REQUIRES AUTHENTICATION
router.post('/bulk-delete', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds } = req.body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Document IDs array is required' });
    }

    // Delete from database only (physical files remain on disk)
    const result = await lsembPool.query(
      'DELETE FROM documents WHERE id = ANY($1::int[]) RETURNING id, file_path',
      [documentIds]
    );

    res.json({
      success: true,
      message: `Deleted ${result.rows.length} documents from database (physical files preserved)`,
      deletedCount: result.rows.length,
      deletedIds: result.rows.map(r => r.id),
      preservedFiles: result.rows.map(r => r.file_path).filter(Boolean)
    });
  } catch (error) {
    console.error('Error bulk deleting documents:', error);
    res.status(500).json({
      error: 'Failed to bulk delete documents'
    });
  }
});

// Delete document - REQUIRES AUTHENTICATION
// NOTE: This endpoint only deletes from database, NOT the physical file
// Use DELETE /physical-files to delete physical files from disk
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Delete from database only (physical file remains on disk)
    const result = await lsembPool.query(
      'DELETE FROM documents WHERE id = $1 RETURNING id, file_path',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      success: true,
      message: 'Document deleted from database (physical file preserved)',
      deletedId: result.rows[0].id,
      preservedFile: result.rows[0].file_path
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

    // Sync to unified_embeddings for unified search
    const syncResult = await unifiedEmbeddingsSync.syncDocumentEmbeddings(parseInt(id));
    console.log(`[Documents] Synced ${syncResult.synced} embeddings to unified_embeddings`);

    res.json({
      success: true,
      message: 'Embeddings created and synced successfully',
      documentId: id,
      embeddingCount: parseInt(newEmbeddings.rows[0].count),
      syncedToUnified: syncResult.synced
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

    // Delete embeddings directly from database
    const result = await lsembPool.query(
      'DELETE FROM document_embeddings WHERE document_id = $1 RETURNING id',
      [id]
    );

    // Update document metadata to remove embedding info and reset status to pending
    await lsembPool.query(
      `UPDATE documents
       SET metadata = metadata - 'embeddings',
           processing_status = 'pending'
       WHERE id = $1`,
      [id]
    );

    console.log(`Deleted ${result.rowCount} embeddings for document ${id}, status reset to pending`);

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} embeddings successfully`,
      deleted: result.rowCount
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
// ✅ Uses document_embeddings table (vector store)
router.post('/bulk-embed', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Invalid document IDs' });
    }

    let embeddedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    const results: any[] = [];

    for (const docId of documentIds) {
      try {
        // Get document details
        const docResult = await lsembPool.query(
          'SELECT id, title, content, file_type, metadata FROM documents WHERE id = $1',
          [docId]
        );

        if (docResult.rows.length === 0) {
          errors.push(`Document ${docId} not found`);
          continue;
        }

        const document = docResult.rows[0];

        // Check if embeddings already exist in document_embeddings table
        const existingEmbeds = await lsembPool.query(
          'SELECT COUNT(*) as count FROM document_embeddings WHERE document_id = $1',
          [docId]
        );

        if (parseInt(existingEmbeds.rows[0].count) > 0) {
          console.log(`⏭️ Document ${docId} (${document.title}) already has embeddings, skipping`);
          skippedCount++;
          results.push({
            id: docId,
            title: document.title,
            status: 'skipped',
            reason: 'Already has embeddings'
          });
          continue;
        }

        // ===== SMART EMBED: Check for empty content and try auto-extraction =====
        if (!document.content || document.content.trim().length === 0) {
          console.log(`[Bulk Embed] Document ${docId} has no content, attempting auto-extraction...`);

          const fileType = (document.file_type || '').toLowerCase();
          const fs = require('fs');

          // Try to get file_path from document
          const pathResult = await lsembPool.query('SELECT file_path FROM documents WHERE id = $1', [docId]);
          const filePath = pathResult.rows[0]?.file_path;

          if (fileType === 'pdf' && filePath && fs.existsSync(filePath)) {
            try {
              const pdfParse = require('pdf-parse');
              const dataBuffer = fs.readFileSync(filePath);
              const pdfData = await pdfParse(dataBuffer);

              if (pdfData.text && pdfData.text.trim().length > 50) {
                document.content = pdfData.text.trim();

                // Update database with extracted content
                await lsembPool.query(
                  `UPDATE documents SET content = $1, processing_status = 'analyzed', updated_at = NOW() WHERE id = $2`,
                  [document.content, docId]
                );

                console.log(`[Bulk Embed] ✓ Auto-extracted ${document.content.length} chars for ${document.title}`);
              }
            } catch (extractError: any) {
              console.warn(`[Bulk Embed] Auto-extraction failed for ${docId}:`, extractError.message);
            }
          }

          // If still no content, report error with helpful message
          if (!document.content || document.content.trim().length === 0) {
            errors.push(`Document ${docId} (${document.title}): No content available. Use "Analyze" button first to extract text.`);
            results.push({
              id: docId,
              title: document.title,
              status: 'error',
              error: 'No content - needs analysis first'
            });
            continue;
          }
        }
        // ===== END SMART EMBED =====

        // Determine document type
        const documentType = document.metadata?.document_type ||
          (document.title.match(/\.(csv|json)$/i) ? 'tabular' :
           document.title.match(/\.(pdf|doc|docx|md)$/i) ? 'structured' : 'text');

        console.log(`📄 Embedding document ${docId}: ${document.title} (type: ${documentType})`);

        // Extract analysis metadata from document if available (from PDF analyze)
        const docMetadata = document.metadata || {};
        const analysis = docMetadata.analysis || {};
        const analysisMetadata = {
          category: analysis.category || docMetadata.category,
          keywords: analysis.keywords || docMetadata.keywords,
          topics: analysis.topics || docMetadata.topics,
          entities: analysis.entities || docMetadata.entities,
          language: analysis.language || docMetadata.language,
          summary: analysis.summary || docMetadata.summary,
          templateId: analysis.templateId || docMetadata.templateId,
        };

        // Check if we have any meaningful analysis data
        const hasAnalysisData = analysisMetadata.category ||
          (analysisMetadata.keywords && analysisMetadata.keywords.length > 0) ||
          (analysisMetadata.entities && Object.keys(analysisMetadata.entities).length > 0);

        if (hasAnalysisData) {
          console.log(`📊 Found analysis metadata for document ${docId}: category=${analysisMetadata.category}, keywords=${analysisMetadata.keywords?.length || 0}`);
        }

        // Create embeddings using contextual processor with enriched metadata
        await contextualDocumentProcessor.processAndEmbedDocumentEnhanced(
          document.id,
          document.content,
          document.title,
          documentType,
          hasAnalysisData ? analysisMetadata : undefined
        );

        // Get embedding statistics
        const embeddingStats = await lsembPool.query(
          `SELECT
             model_name,
             SUM(tokens_used) as total_tokens,
             COUNT(*) as chunk_count,
             COALESCE(SUM(tokens_used) * 0.000002, 0) as total_cost
           FROM document_embeddings
           WHERE document_id = $1
           GROUP BY model_name`,
          [docId]
        );

        // Update document with model info, tokens and embedding status
        if (embeddingStats.rows.length > 0) {
          const stats = embeddingStats.rows[0];
          await lsembPool.query(
            `UPDATE documents
             SET model_used = $1,
                 tokens_used = $2,
                 cost_usd = $3,
                 verified_at = CURRENT_TIMESTAMP,
                 auto_verified = true,
                 processing_status = 'embedded',
                 metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{embeddings}',
                   to_jsonb($5::integer)
                 ),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [
              stats.model_name || 'text-embedding-ada-002',
              stats.total_tokens || 0,
              stats.total_cost || 0,
              docId,
              stats.chunk_count || 1
            ]
          );
        }

        // Sync to unified_embeddings
        const syncResult = await unifiedEmbeddingsSync.syncDocumentEmbeddings(docId);

        embeddedCount++;
        results.push({
          id: docId,
          title: document.title,
          status: 'success',
          chunks: embeddingStats.rows[0]?.chunk_count || 0,
          tokens: embeddingStats.rows[0]?.total_tokens || 0,
          syncedToUnified: syncResult.synced
        });

        console.log(`✅ Embedded document ${docId}: ${document.title} (${embeddingStats.rows[0]?.chunk_count || 0} chunks, ${syncResult.synced} synced)`);

      } catch (error) {
        console.error(`❌ Failed to embed document ${docId}:`, error);
        errors.push(`Document ${docId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        results.push({
          id: docId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      embedded: embeddedCount,
      skipped: skippedCount,
      failed: errors.length,
      total: documentIds.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Bulk embed failed:', error);
    res.status(500).json({ error: 'Failed to create bulk embeddings' });
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

/**
 * GET /api/documents/table-creation/progress/:jobId
 * Get table creation progress from Redis
 */
router.get('/table-creation/progress/:jobId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Get progress from Redis
    const redis = req.app.locals.redis;
    if (!redis) {
      return res.status(503).json({ error: 'Redis not available' });
    }

    // Try table_creation key first (used by TableCreationService)
    let progressKey = `table_creation:${jobId}`;
    let progressData = await redis.get(progressKey);

    // If not found, try transform_progress pattern (used by DocumentTransformService)
    if (!progressData) {
      const transformKeys = await redis.keys(`transform_progress:${jobId}:*`);
      if (transformKeys && transformKeys.length > 0) {
        // Aggregate progress from all documents in the transform job
        const allProgress: any[] = [];
        for (const key of transformKeys) {
          const data = await redis.get(key);
          if (data) {
            allProgress.push(JSON.parse(data));
          }
        }

        if (allProgress.length > 0) {
          // Calculate aggregated progress
          const totalProgress = allProgress.reduce((sum, p) => sum + (p.progress || 0), 0);
          const avgProgress = totalProgress / allProgress.length;
          const totalRows = allProgress.reduce((sum, p) => sum + (p.totalRows || 0), 0);
          const rowsInserted = allProgress.reduce((sum, p) => sum + (p.rowsProcessed || 0), 0);
          const anyFailed = allProgress.some(p => p.status === 'failed');
          const allCompleted = allProgress.every(p => p.status === 'completed');

          const aggregatedProgress = {
            jobId,
            status: anyFailed ? 'FAILED' : allCompleted ? 'COMPLETED' : 'INSERTING_DATA',
            progress: Math.round(avgProgress),
            totalRows,
            rowsInserted,
            currentBatch: 1,
            totalBatches: allProgress.length,
            startedAt: allProgress[0]?.startedAt || new Date().toISOString(),
          };

          return res.json({ progress: aggregatedProgress });
        }
      }
    }

    if (!progressData) {
      return res.status(404).json({ error: 'Progress data not found' });
    }

    const progress = JSON.parse(progressData);
    res.json({ progress });
  } catch (error) {
    console.error('Error getting table creation progress:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

/**
 * POST /api/documents/table-creation/cancel/:jobId
 * Pause table creation job (can be resumed later)
 */
router.post('/table-creation/cancel/:jobId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Get progress from Redis
    const redis = req.app.locals.redis;
    if (!redis) {
      return res.status(503).json({ error: 'Redis not available' });
    }

    const progressKey = `table_creation:${jobId}`;
    const progressData = await redis.get(progressKey);

    if (!progressData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const progress = JSON.parse(progressData);

    // Mark as cancelled (paused)
    progress.status = 'CANCELLED';
    progress.completedAt = new Date();
    await redis.setex(progressKey, 3600, JSON.stringify(progress));

    console.log(`[TableCreation] Job ${jobId} paused by user`);
    res.json({ message: 'Job paused successfully' });
  } catch (error) {
    console.error('Error pausing table creation job:', error);
    res.status(500).json({ error: 'Failed to pause job' });
  }
});

// Sync document statuses with their actual embedding and transformation states
router.post('/sync-statuses', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await lsembPool.connect();
    try {
      // Get all documents
      const docsResult = await client.query('SELECT id, file_path FROM documents');
      const documents = docsResult.rows;

      let updated = 0;
      const updates = [];

      for (const doc of documents) {
        const fileExt = path.extname(doc.file_path || '').toLowerCase();

        // Check if document has embeddings
        const embedResult = await client.query(
          'SELECT COUNT(*) as count FROM document_embeddings WHERE document_id = $1',
          [doc.id]
        );
        const hasEmbeddings = parseInt(embedResult.rows[0].count) > 0;

        let newStatus = 'waiting';

        // Determine status based on file type and embeddings
        if (fileExt === '.csv') {
          // CSV files should be marked as transformed
          newStatus = 'transformed';
        } else if (hasEmbeddings) {
          // Documents with embeddings should be marked as embedded
          newStatus = 'embedded';
        } else if (fileExt === '.pdf' || fileExt === '.doc' || fileExt === '.docx') {
          // Documents that have content but no embeddings are pending
          newStatus = 'pending';
        }

        // Update the document status
        const updateResult = await client.query(
          'UPDATE documents SET processing_status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, file_path, processing_status',
          [newStatus, doc.id]
        );

        if (updateResult.rows.length > 0) {
          updated++;
          updates.push({
            id: doc.id,
            file_path: doc.file_path,
            newStatus: newStatus,
            hasEmbeddings: hasEmbeddings
          });
        }
      }

      console.log(`[DocumentSync] Updated ${updated} document statuses`);
      res.json({
        success: true,
        message: `Updated ${updated} documents`,
        updated: updates
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error syncing document statuses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync document statuses',
      details: error.message
    });
  }
});

/**
 * Suggest column headers for CSV data using LLM
 * POST /api/documents/suggest-headers
 */
router.post('/suggest-headers', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sampleData, columnCount, currentHeaders } = req.body;

    if (!sampleData || !Array.isArray(sampleData) || sampleData.length === 0) {
      return res.status(400).json({
        error: 'Sample data is required',
        message: 'Please provide at least a few rows of sample data'
      });
    }

    // Prepare sample data for LLM analysis
    const sampleRows = sampleData.slice(0, 5); // Use first 5 rows
    const numColumns = columnCount || (sampleRows[0] ? Object.keys(sampleRows[0]).length : 0);

    // Create data summary for LLM
    const dataSummary = sampleRows.map((row, idx) => {
      if (Array.isArray(row)) {
        return `Row ${idx + 1}: ${row.join(' | ')}`;
      }
      return `Row ${idx + 1}: ${Object.values(row).join(' | ')}`;
    }).join('\n');

    const prompt = `Analyze this CSV data and suggest appropriate column headers in Turkish.

DATA SAMPLE (${numColumns} columns):
${dataSummary}

${currentHeaders ? `Current headers (may be auto-generated): ${currentHeaders.join(', ')}` : 'No headers provided.'}

Based on the data content, suggest ${numColumns} descriptive column headers.
Consider:
- Data types (text, number, date, etc.)
- Turkish business context
- Common patterns (ID, Name, Date, Amount, etc.)

IMPORTANT: Return ONLY a JSON array of strings, no other text.
Example: ["Sıra No", "Ad Soyad", "Tarih", "Tutar"]

Your response (JSON array only):`;

    // Use LLM manager to get suggestions
    const { LLMManager } = require('../services/llm-manager.service');
    const llmManager = LLMManager.getInstance();

    const response = await llmManager.generateChatResponse(prompt, {
      temperature: 0.3,
      maxTokens: 500,
      systemPrompt: 'Sen bir veri analisti olarak CSV dosyalarının kolon başlıklarını analiz ediyorsun. Sadece JSON array formatında cevap ver.'
    });

    // Parse the LLM response
    let suggestedHeaders: string[] = [];
    try {
      // Extract JSON array from response
      const jsonMatch = response.content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        suggestedHeaders = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('[SuggestHeaders] Failed to parse LLM response:', parseError);
      // Generate fallback headers
      suggestedHeaders = Array.from({ length: numColumns }, (_, i) => `Kolon_${i + 1}`);
    }

    // Ensure we have the right number of headers
    while (suggestedHeaders.length < numColumns) {
      suggestedHeaders.push(`Kolon_${suggestedHeaders.length + 1}`);
    }
    suggestedHeaders = suggestedHeaders.slice(0, numColumns);

    console.log(`[SuggestHeaders] Suggested ${suggestedHeaders.length} headers using ${response.provider}`);

    res.json({
      success: true,
      headers: suggestedHeaders,
      provider: response.provider,
      model: response.model
    });

  } catch (error: any) {
    console.error('[SuggestHeaders] Error:', error);
    res.status(500).json({
      error: 'Failed to suggest headers',
      message: error.message
    });
  }
});

/**
 * Upload file with background processing and progress tracking
 * Returns job ID immediately, processes file in background
 */
router.post('/upload-with-progress', createUploadRateLimit.middleware, upload.single('file'), authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, size, mimetype, path: filePath } = req.file;
    const userId = req.user?.userId;

    console.log(`[Upload Job] File uploaded: ${originalname} (${size} bytes)`);

    // Create import job
    const job = await importJobService.createJob({
      userId,
      jobType: 'local_upload',
      totalFiles: 1,
      metadata: {
        filename: originalname,
        size,
        mimetype,
        filePath
      }
    });

    // Process file in background
    processFileInBackground(job.id, filePath, originalname, mimetype, size).catch(err => {
      console.error(`[Upload Job ${job.id}] Background processing failed:`, err);
    });

    res.json({
      success: true,
      jobId: job.id,
      message: 'File upload started. Processing in background.'
    });
  } catch (error: any) {
    console.error('[Upload with progress] Error:', error);
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('[Upload with progress] Cleanup error:', cleanupError);
      }
    }
    res.status(500).json({
      error: error.message || 'Failed to upload document'
    });
  }
});

/**
 * Background file processing function
 */
async function processFileInBackground(
  jobId: number,
  filePath: string,
  originalname: string,
  mimetype: string,
  size: number
): Promise<void> {
  try {
    console.log(`[Upload Job ${jobId}] Starting background processing...`);

    await importJobService.updateJobStatus(jobId, 'in_progress');
    await importJobService.updateProgress({
      jobId,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      currentFile: originalname
    });

    // Check for existing document
    const existingCheck = await lsembPool.query(
      'SELECT id, title, file_path FROM documents WHERE title = $1',
      [originalname]
    );

    if (existingCheck.rows.length > 0) {
      const oldFilePath = existingCheck.rows[0].file_path;
      if (oldFilePath && oldFilePath !== filePath && fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
          console.log(`[Upload Job ${jobId}] Deleted old file: ${oldFilePath}`);
        } catch (err) {
          console.warn(`[Upload Job ${jobId}] Could not delete old file:`, err);
        }
      }
    }

    // Process file
    let processedDoc;
    try {
      processedDoc = await contextualDocumentProcessor.processFile(filePath, originalname, mimetype);
    } catch (err) {
      console.error(`[Upload Job ${jobId}] Contextual processor failed, trying fallback:`, err);
      try {
        processedDoc = await documentProcessor.processFile(filePath, originalname, mimetype);
      } catch (fallbackErr) {
        console.error(`[Upload Job ${jobId}] Fallback processor failed:`, fallbackErr);
        processedDoc = {
          title: originalname,
          content: '',
          chunks: [],
          metadata: {
            error: 'Processing failed',
            needsOCR: mimetype.includes('pdf'),
            size: size
          }
        };
      }
    }

    const ext = path.extname(originalname).toLowerCase().replace('.', '');
    const fileType = ext || processedDoc.metadata?.type || 'text';

    const cleanMetadata = (obj: any): any => {
      if (typeof obj === 'string') {
        return obj.replace(/\0/g, '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
      } else if (Array.isArray(obj)) {
        return obj.map(cleanMetadata);
      } else if (obj && typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
          cleaned[key] = cleanMetadata(obj[key]);
        }
        return cleaned;
      }
      return obj;
    };

    const cleanedMetadata = cleanMetadata({
      ...processedDoc.metadata,
      originalName: originalname,
      mimeType: mimetype,
      uploadDate: new Date(),
      chunks: processedDoc.chunks.length,
    });

    // Save to database
    await lsembPool.query(
      `INSERT INTO documents (
        filename, title, content, file_type, size, file_path, metadata,
        original_filename, upload_count, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())
       ON CONFLICT (filename)
       DO UPDATE SET
         content = EXCLUDED.content,
         file_type = EXCLUDED.file_type,
         size = EXCLUDED.size,
         file_path = EXCLUDED.file_path,
         metadata = EXCLUDED.metadata,
         original_filename = EXCLUDED.original_filename,
         updated_at = NOW(),
         upload_count = COALESCE(documents.upload_count, 0) + 1,
         transform_status = 'pending',
         transform_progress = 0
       RETURNING *`,
      [
        originalname,
        originalname,
        (processedDoc.content || '').substring(0, 100000),
        fileType,
        size,
        filePath,
        JSON.stringify(cleanedMetadata),
        originalname
      ]
    );

    console.log(`[Upload Job ${jobId}] File processed and saved successfully`);

    await importJobService.updateProgress({
      jobId,
      processedFiles: 1,
      successfulFiles: 1,
      failedFiles: 0
    });

    await importJobService.updateJobStatus(jobId, 'completed');
  } catch (error: any) {
    console.error(`[Upload Job ${jobId}] Processing error:`, error);
    await importJobService.updateProgress({
      jobId,
      processedFiles: 1,
      successfulFiles: 0,
      failedFiles: 1,
      currentError: error.message
    });
    await importJobService.updateJobStatus(jobId, 'failed');
  }
}

/**
 * GET /api/v2/documents/pdf/:documentId
 * Serve PDF file for viewing
 */
router.get('/pdf/:documentId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentId } = req.params;

    // Get document from database
    const result = await lsembPool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Check if it's a PDF
    const isPDF = doc.type === 'pdf' ||
                  doc.file_type === 'application/pdf' ||
                  doc.title?.toLowerCase().endsWith('.pdf');

    if (!isPDF) {
      return res.status(400).json({ error: 'Document is not a PDF' });
    }

    // Check if file_path exists
    if (!doc.file_path) {
      return res.status(404).json({ error: 'PDF file path not found in database' });
    }

    // Check if file exists on disk
    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({
        error: 'PDF file not found on disk',
        path: doc.file_path
      });
    }

    // Serve PDF file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.title || 'document.pdf'}"`);

    const fileStream = fs.createReadStream(doc.file_path);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('[Documents] Error streaming PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream PDF file' });
      }
    });

  } catch (error: any) {
    console.error('[Documents] Error serving PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/documents/:id/update-csv-headers
 * Update CSV file headers (first row)
 */
router.post('/:id/update-csv-headers', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { headers } = req.body;

    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({ error: 'Headers array is required' });
    }

    // Get document from database
    const result = await lsembPool.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Check if it's a CSV
    const isCSV = doc.type === 'csv' || doc.file_type === 'text/csv' || doc.title?.toLowerCase().endsWith('.csv');
    if (!isCSV) {
      return res.status(400).json({ error: 'Document is not a CSV file' });
    }

    // Check if file exists
    if (!doc.file_path || !fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'CSV file not found on disk' });
    }

    // Read CSV file
    const fileBuffer = fs.readFileSync(doc.file_path);
    const csvContent = decodeBufferToUTF8(fileBuffer);
    const lines = csvContent.split('\n');

    if (lines.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    // Replace first line with new headers
    const newHeaderLine = headers.join(',');
    lines[0] = newHeaderLine;

    // Write back to file
    const updatedCSV = lines.join('\n');
    fs.writeFileSync(doc.file_path, updatedCSV, 'utf-8');

    console.log(`[Documents] Updated CSV headers for document ${id}:`, headers);

    res.json({
      success: true,
      message: 'CSV headers updated successfully',
      headers
    });

  } catch (error: any) {
    console.error('[Documents] Error updating CSV headers:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
