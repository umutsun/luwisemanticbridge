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
import { getUploadLimitBytes } from '../middleware/security.middleware';

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
    console.log(`📁 Created documents directory: ${fullPath}`);
  }

  console.log(`📂 Using documents directory: ${fullPath}`);
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
      console.log(`📝 Overwriting existing file: ${file.originalname}`);
      // Delete old file before upload
      try {
        fs.unlinkSync(targetPath);
        console.log(`🗑️ Deleted old file: ${file.originalname}`);
      } catch (err) {
        console.error(`⚠️ Failed to delete old file:`, err);
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
      type: doc.file_type || 'text',
      size: doc.size || 0,
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

    console.log(`📤 File uploaded: ${originalname} -> ${filename}`);
    console.log(`📂 Saved to: ${filePath}`);
    console.log(`🔧 Skip DB: ${skipDb}`);

    // If skipDb is true, just return success without saving to database
    if (skipDb) {
      console.log(`✅ Physical upload only - not saving to database`);
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
      console.log(`📝 Found existing document with same filename, will update it`);
      // Delete old physical file if it's different from new one
      const oldFilePath = existingCheck.rows[0].file_path;
      if (oldFilePath && oldFilePath !== filePath && fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
          console.log(`🗑️ Deleted old physical file: ${oldFilePath}`);
        } catch (err) {
          console.warn(`⚠️ Could not delete old file: ${oldFilePath}`, err);
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
        // Final fallback to simple text reading
        processedDoc = {
          title: originalname,
          content: fs.readFileSync(filePath, 'utf-8').substring(0, 100000),
          chunks: [],
          metadata: { error: 'Processing failed, stored as text' }
        };
      }
    }

    // Determine file type - prioritize file extension to avoid incorrect types
    // File extension is the most reliable source for file type
    const ext = path.extname(originalname).toLowerCase().replace('.', '');
    const fileType = ext || processedDoc.metadata?.type || 'text';

    // Generate content hash for additional duplicate checking
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(processedDoc.content).digest('hex');

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
        }),
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
        COUNT(DISTINCT type) as unique_types,
        COUNT(CASE WHEN transform_status = 'completed' THEN 1 END) as transformed_count,
        COUNT(CASE WHEN transform_status = 'pending' THEN 1 END) as pending_transform,
        COUNT(CASE WHEN transform_status = 'failed' THEN 1 END) as failed_transform
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

// List physical files in upload directory - REQUIRES AUTHENTICATION
// NOTE: This route MUST come before /:id to avoid route matching issues
router.get('/physical-files', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('📂 Physical files endpoint called');
    const uploadDir = getUploadDirectory();
    console.log('📁 Upload directory:', uploadDir);

    // Check if directory exists
    if (!fs.existsSync(uploadDir)) {
      console.error('❌ Upload directory does not exist:', uploadDir);
      return res.status(404).json({
        error: 'Upload directory not found',
        path: uploadDir
      });
    }

    // Read all files from upload directory
    const files = fs.readdirSync(uploadDir);
    console.log(`📄 Found ${files.length} files in directory`);

    // Get database file paths to compare (optional - continue if DB is down)
    let dbFilePaths: Set<string> = new Set();
    let dbAvailable = false;

    try {
      if (lsembPool) {
        const dbFilesResult = await lsembPool.query('SELECT file_path FROM documents WHERE file_path IS NOT NULL');
        dbFilePaths = new Set(dbFilesResult.rows.map(row => row.file_path));
        dbAvailable = true;
        console.log(`💾 Found ${dbFilePaths.size} files in database`);
      }
    } catch (dbError: any) {
      console.warn('⚠️ Database not available - showing all files as "not in DB"');
      console.warn('   Error:', dbError.code || dbError.message);
    }

    // Process each file
    const physicalFiles = files.map(filename => {
      const filePath = path.join(uploadDir, filename);
      const stats = fs.statSync(filePath);

      // Check if file is in database
      const inDatabase = dbFilePaths.has(filePath);

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
    console.error('❌ Error listing physical files:', error);
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
      // Fallback to simple text reading
      processedDoc = {
        title: filename,
        content: fs.readFileSync(filePath, 'utf-8').substring(0, 100000),
        chunks: [],
        metadata: { error: 'Processing failed, stored as text' }
      };
    }

    // Generate content hash
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(processedDoc.content).digest('hex');

    // Save to database
    const result = await lsembPool.query(
      `INSERT INTO documents (title, content, type, size, file_path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        filename,
        processedDoc.content.substring(0, 100000),
        ext,
        stats.size,
        filePath,
        JSON.stringify({
          ...processedDoc.metadata,
          originalName: filename,
          mimeType: mimetype,
          uploadDate: new Date(),
          chunks: processedDoc.chunks.length,
          contentHash: contentHash,
          addedFrom: 'physical-files'
        })
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

// Preview physical file content - REQUIRES AUTHENTICATION
// NOTE: This route MUST come before /:id to avoid route matching issues
router.get('/preview/:filename', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename } = req.params;
    const uploadDir = getUploadDirectory();
    const filePath = path.join(uploadDir, filename);

    console.log(`📖 Preview request for: ${filename}`);
    console.log(`📂 Looking in: ${filePath}`);

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

    if (['.csv', '.txt', '.json', '.log', '.md'].includes(path.extname(filename).toLowerCase())) {
      // Text-based files - read directly
      content = fs.readFileSync(filePath, 'utf-8');

      // For CSV files, parse and provide stats
      if (ext === 'csv') {
        const lines = content.split('\n').filter(line => line.trim());

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
            } else if (char === ',' && !inQuotes) {
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

        console.log('📊 CSV Parse Debug:', {
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
    console.error('❌ Error previewing file:', error);
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

    const progressKey = `table_creation:${jobId}`;
    const progressData = await redis.get(progressKey);

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

export default router;
