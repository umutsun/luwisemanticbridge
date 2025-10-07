import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';
import documentProcessor from '../services/document-processor.service';

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
    await pool.query('DROP TABLE IF EXISTS documents CASCADE');
    
    // Create fresh table with proper structure
    await pool.query(`
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

// Get all documents
router.get('/', async (req: Request, res: Response) => {
  try {
    // First ensure table exists
    await pool.query(`
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const result = await pool.query(
      `SELECT d.*,
              CASE
                WHEN EXISTS(SELECT 1 FROM document_embeddings de WHERE de.document_id = d.id) THEN true
                ELSE false
              END as has_embeddings
       FROM documents d
       ORDER BY d.created_at DESC`
    );

    const documents = result.rows.map(doc => ({
      id: doc.id.toString(),
      title: doc.title,
      content: doc.content || '',
      type: doc.type || 'text',
      size: doc.size || 0,
      hasEmbeddings: doc.has_embeddings,
      metadata: {
        source: doc.file_path,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        chunks: doc.has_embeddings ? 1 : 0, // Simplified for now
        embeddings: doc.has_embeddings ? 1 : 0,
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

// Upload document
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, size, mimetype, path: filePath } = req.file;
    
    // Process file based on type
    let processedDoc;
    try {
      processedDoc = await documentProcessor.processFile(filePath, originalname, mimetype);
    } catch (err) {
      console.error('Error processing file:', err);
      // Fallback to simple text reading
      processedDoc = {
        title: originalname,
        content: fs.readFileSync(filePath, 'utf-8').substring(0, 100000),
        chunks: [],
        metadata: { error: 'Processing failed, stored as text' }
      };
    }

    // Determine file type
    const ext = path.extname(originalname).toLowerCase().replace('.', '');
    const fileType = ext || 'text';

    // Save to database
    const result = await pool.query(
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
          chunks: processedDoc.chunks.length
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
    res.status(500).json({ 
      error: error.message || 'Failed to upload document' 
    });
  }
});

// Add document manually
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, content, type = 'text' } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const size = Buffer.byteLength(content, 'utf8');

    const result = await pool.query(
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

// Get document statistics (must come before /:id route)
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Ensure table exists first
    await pool.query(`
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

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(size) as total_size,
        COUNT(CASE WHEN metadata->>'embeddings' = 'true' THEN 1 END) as with_embeddings,
        COUNT(DISTINCT type) as unique_types
      FROM documents
    `);

    const typeDistribution = await pool.query(`
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

// Get single document
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
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

// Update document
router.put('/:id', async (req: Request, res: Response) => {
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

    const result = await pool.query(
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

// Delete document
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // First get the document to delete the file if exists
    const docResult = await pool.query(
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

    const result = await pool.query(
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

// Create embeddings for a document
router.post('/:id/embeddings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get document
    const docResult = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];
    
    // Create embeddings
    await documentProcessor.processAndEmbedDocument(
      doc.id,
      doc.content,
      doc.title
    );

    res.json({
      success: true,
      message: 'Embeddings created successfully',
      documentId: id
    });
  } catch (error: any) {
    console.error('Error creating embeddings:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create embeddings' 
    });
  }
});

// Delete embeddings for a document
router.delete('/:id/embeddings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await documentProcessor.deleteDocumentEmbeddings(parseInt(id));

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

// Search documents by similarity
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await documentProcessor.searchSimilarDocuments(query, limit);

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

export default router;
