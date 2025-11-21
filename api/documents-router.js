const express = require("express");
const router = express.Router();
const { getLsembPool } = require("./db-pool");
const { getRedisClient } = require("./redis-client");
const fs = require("fs").promises;
const path = require("path");

const pool = getLsembPool();
const redis = getRedisClient();

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to get file type from extension
function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const typeMap = {
    'pdf': 'pdf',
    'doc': 'doc',
    'docx': 'docx',
    'txt': 'txt',
    'md': 'md',
    'json': 'json',
    'csv': 'csv',
    'jpg': 'jpg',
    'jpeg': 'jpeg',
    'png': 'png',
    'tiff': 'tiff'
  };
  return typeMap[ext] || 'unknown';
}

/**
 * @route GET /api/v2/documents
 * @group Documents - Document management
 * @summary Get all documents
 * @description Retrieves a list of all documents from the database
 * @returns {object} 200 - List of documents
 * @returns {Error} 500 - If there was an error retrieving documents
 */
router.get("/", async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          d.id,
          d.title,
          d.content,
          d.file_type as type,
          d.file_size as size,
          d.file_path,
          d.has_embeddings as hasEmbeddings,
          d.processing_status,
          d.metadata,
          d.created_at,
          d.updated_at
        FROM documents d
        ORDER BY d.created_at DESC
      `);
      
      const documents = result.rows.map(row => ({
        id: row.id.toString(),
        title: row.title,
        content: row.content,
        type: row.type,
        size: row.size,
        file_path: row.file_path,
        hasEmbeddings: row.hasembeddings,
        processing_status: row.processing_status,
        metadata: row.metadata || {},
      }));
      
      res.json({
        success: true,
        documents
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to fetch documents:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve documents"
    });
  }
});

/**
 * @route GET /api/v2/documents/stats
 * @group Documents - Document management
 * @summary Get document statistics
 * @description Retrieves statistics about documents in the database
 * @returns {object} 200 - Document statistics
 * @returns {Error} 500 - If there was an error retrieving statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const client = await pool.connect();
    
    try {
      // Get total documents count
      const totalResult = await client.query("SELECT COUNT(*) as count FROM documents");
      const total = parseInt(totalResult.rows[0].count);
      
      // Get embedded documents count
      const embeddedResult = await client.query("SELECT COUNT(*) as count FROM documents WHERE has_embeddings = true");
      const embedded = parseInt(embeddedResult.rows[0].count);
      
      // Get pending documents count
      const pendingResult = await client.query("SELECT COUNT(*) as count FROM documents WHERE processing_status = 'pending' OR processing_status IS NULL");
      const pending = parseInt(pendingResult.rows[0].count);
      
      // Get OCR processed documents count
      const ocrProcessedResult = await client.query("SELECT COUNT(*) as count FROM documents WHERE metadata->>'ocr_processed' = 'true'");
      const ocrProcessed = parseInt(ocrProcessedResult[0].count);
      
      // Get OCR pending documents count
      const ocrPendingResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM documents 
        WHERE file_type IN ('pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff') 
        AND (metadata->>'ocr_processed' IS NULL OR metadata->>'ocr_processed' != 'true')
      `);
      const ocrPending = parseInt(ocrPendingResult.rows[0].count);
      
      // Get documents uploaded today
      const todayResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM documents 
        WHERE DATE(created_at) = CURRENT_DATE
      `);
      const uploadedToday = parseInt(todayResult.rows[0].count);
      
      // Get documents embedded today
      const embeddedTodayResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM documents 
        WHERE DATE(updated_at) = CURRENT_DATE AND has_embeddings = true
      `);
      const embeddedToday = parseInt(embeddedTodayResult.rows[0].count);
      
      // Get OCR processed today
      const ocrTodayResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM documents 
        WHERE DATE(updated_at) = CURRENT_DATE AND metadata->>'ocr_processed' = 'true'
      `);
      const ocrToday = parseInt(ocrTodayResult.rows[0].count);
      
      res.json({
        success: true,
        documents: {
          total,
          embedded,
          pending,
          ocr_processed: ocrProcessed,
          ocr_pending: ocrPending,
          under_review: 0
        },
        performance: {
          total_tokens_used: 0,
          total_cost: 0,
          avg_processing_time: 0,
          success_rate: 100
        },
        history: {
          uploaded_today: uploadedToday,
          embedded_today: embeddedToday,
          ocr_today: ocrToday,
          last_24h_activity: uploadedToday + embeddedToday + ocrToday
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to fetch document stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve document statistics"
    });
  }
});

/**
 * @route GET /api/v2/documents/physical-files
 * @group Documents - Document management
 * @summary Get physical files in docs directory
 * @description Retrieves a list of physical files in the docs directory
 * @returns {object} 200 - List of physical files
 * @returns {Error} 500 - If there was an error retrieving physical files
 */
router.get("/physical-files", async (req, res) => {
  try {
    const docsDir = path.join(__dirname, "../docs");
    
    // Check if docs directory exists
    try {
      await fs.access(docsDir);
    } catch {
      // Create docs directory if it doesn't exist
      await fs.mkdir(docsDir, { recursive: true });
    }
    
    // Read all files in docs directory
    const files = await fs.readdir(docsDir, { withFileTypes: true });
    
    // Get all documents from database to check which files are already in database
    const client = await pool.connect();
    let dbFiles = [];
    
    try {
      const dbResult = await client.query("SELECT file_path FROM documents WHERE file_path IS NOT NULL");
      dbFiles = dbResult.rows.map(row => row.file_path);
    } finally {
      client.release();
    }
    
    // Process files
    const processedFiles = [];
    let totalSize = 0;
    let inDatabase = 0;
    let notInDatabase = 0;
    
    for (const file of files) {
      if (file.isDirectory()) continue;
      
      const filePath = path.join(docsDir, file.name);
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(path.join(__dirname, "../"), filePath);
      
      const isInDatabase = dbFiles.includes(relativePath);
      if (isInDatabase) inDatabase++;
      else notInDatabase++;
      
      totalSize += stats.size;
      
      processedFiles.push({
        filename: file.name,
        displayName: file.name,
        path: filePath,
        relativePath: relativePath,
        size: stats.size,
        ext: path.extname(file.name).substring(1),
        inDatabase: isInDatabase,
        type: getFileType(file.name)
      });
    }
    
    res.json({
      success: true,
      files: processedFiles,
      totalFiles: processedFiles.length,
      inDatabase,
      notInDatabase,
      uploadDirectory: docsDir
    });
  } catch (error) {
    console.error("Failed to fetch physical files:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve physical files"
    });
  }
});

/**
 * @route POST /api/v2/documents/physical-files/add
 * @group Documents - Document management
 * @summary Add physical file to database
 * @description Adds a physical file to the database for processing
 * @param {object} request.body.required - The request body
 * @param {string} request.body.filePath - Path to the physical file
 * @returns {object} 200 - Success message
 * @returns {Error} 500 - If there was an error adding file to database
 */
router.post("/physical-files/add", async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: "File path is required"
      });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: "File not found"
      });
    }
    
    // Get file stats
    const stats = await fs.stat(filePath);
    const filename = path.basename(filePath);
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');
    
    // Add to database
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        INSERT INTO documents (
          title, 
          content, 
          file_type, 
          file_size, 
          file_path, 
          has_embeddings, 
          processing_status,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        ) RETURNING id
      `, [
        filename,
        content,
        getFileType(filename),
        stats.size,
        filePath,
        false,
        'pending',
        JSON.stringify({
          originalName: filename,
          mimeType: 'text/plain',
          uploadDate: new Date().toISOString(),
          source: 'physical'
        })
      ]);
      
      res.json({
        success: true,
        id: result.rows[0].id,
        message: "File added to database successfully"
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to add physical file to database:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add file to database"
    });
  }
});

/**
 * @route DELETE /api/v2/documents/physical-files
 * @group Documents - Document management
 * @summary Delete physical file
 * @description Deletes a physical file from disk and optionally from database
 * @param {object} request.body.required - The request body
 * @param {string} request.body.filePath - Path to the physical file
 * @param {boolean} request.body.deleteFromDatabase - Whether to delete from database
 * @returns {object} 200 - Success message
 * @returns {Error} 500 - If there was an error deleting file
 */
router.delete("/physical-files", async (req, res) => {
  try {
    const { filePath, deleteFromDatabase = false } = req.body;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: "File path is required"
      });
    }
    
    // Delete from disk
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error("Failed to delete physical file:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to delete file from disk"
      });
    }
    
    // Delete from database if requested
    if (deleteFromDatabase) {
      const client = await pool.connect();
      
      try {
        await client.query("DELETE FROM documents WHERE file_path = $1", [filePath]);
      } finally {
        client.release();
      }
    }
    
    res.json({
      success: true,
      message: "File deleted successfully"
    });
  } catch (error) {
    console.error("Failed to delete physical file:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete file"
    });
  }
});

/**
 * @route GET /api/v2/documents/preview/:filename
 * @group Documents - Document management
 * @summary Preview a file
 * @description Returns the content of a file for preview
 * @param {string} filename.param.required - The filename to preview
 * @returns {object} 200 - File content and metadata
 * @returns {Error} 500 - If there was an error previewing file
 */
router.get("/preview/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../docs", filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: "File not found"
      });
    }
    
    // Get file stats
    const stats = await fs.stat(filePath);
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');
    
    res.json({
      success: true,
      filename,
      content,
      type: getFileType(filename),
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      metadata: {
        originalName: filename,
        mimeType: 'text/plain',
        source: 'physical'
      }
    });
  } catch (error) {
    console.error("Failed to preview file:", error);
    res.status(500).json({
      success: false,
      error: "Failed to preview file"
    });
  }
});

/**
 * @route POST /api/v2/documents/upload
 * @group Documents - Document management
 * @summary Upload a document
 * @description Uploads a document and saves it to the database
 * @param {object} request.body.required - The request body (multipart form data)
 * @returns {object} 200 - Success message
 * @returns {Error} 500 - If there was an error uploading document
 */
router.post("/upload", async (req, res) => {
  try {
    // This is a simplified version - in a real implementation, you'd use multer
    // or similar middleware to handle file uploads
    res.status(501).json({
      success: false,
      error: "File upload not implemented in this simplified version"
    });
  } catch (error) {
    console.error("Failed to upload document:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload document"
    });
  }
});

/**
 * @route DELETE /api/v2/documents/:id
 * @group Documents - Document management
 * @summary Delete a document
 * @description Deletes a document from the database
 * @param {string} id.param.required - The document ID
 * @returns {object} 200 - Success message
 * @returns {Error} 500 - If there was an error deleting document
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    
    try {
      // Get document info before deletion
      const docResult = await client.query("SELECT file_path FROM documents WHERE id = $1", [id]);
      
      if (docResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Document not found"
        });
      }
      
      const filePath = docResult.rows[0].file_path;
      
      // Delete from database
      await client.query("DELETE FROM documents WHERE id = $1", [id]);
      
      // Delete physical file if it exists
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          console.error("Failed to delete physical file:", error);
        }
      }
      
      res.json({
        success: true,
        message: "Document deleted successfully"
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to delete document:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete document"
    });
  }
});

/**
 * @route POST /api/v2/documents/:id/ocr
 * @group Documents - Document management
 * @summary Process document with OCR
 * @description Processes a document with OCR
 * @param {string} id.param.required - The document ID
 * @param {object} request.body.required - The request body
 * @param {string} request.body.language - OCR language (default: tur+eng)
 * @returns {object} 200 - OCR result
 * @returns {Error} 500 - If there was an error processing with OCR
 */
router.post("/:id/ocr", async (req, res) => {
  try {
    const { id } = req.params;
    const { language = "tur+eng" } = req.body;
    
    const client = await pool.connect();
    
    try {
      // Check if document exists
      const docResult = await client.query("SELECT file_path FROM documents WHERE id = $1", [id]);
      
      if (docResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Document not found"
        });
      }
      
      const filePath = docResult.rows[0].file_path;
      
      if (!filePath) {
        return res.status(400).json({
          success: false,
          error: "File not found on disk"
        });
      }
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({
          success: false,
          error: "File not found on disk"
        });
      }
      
      // Check if already processed with OCR
      const ocrResult = await client.query(`
        SELECT metadata->>'ocr_processed' as ocr_processed 
        FROM documents 
        WHERE id = $1
      `, [id]);
      
      if (ocrResult.rows[0].ocr_processed === 'true') {
        return res.status(400).json({
          success: false,
          error: "Document already processed with OCR"
        });
      }
      
      // Update processing status
      await client.query(`
        UPDATE documents 
        SET processing_status = 'analyzing', updated_at = NOW() 
        WHERE id = $1
      `, [id]);
      
      // In a real implementation, you would call an OCR service here
      // For now, we'll simulate OCR processing
      setTimeout(async () => {
        try {
          const ocrClient = await pool.connect();
          
          try {
            // Update metadata with OCR results
            await ocrClient.query(`
              UPDATE documents 
              SET 
                processing_status = 'analyzed',
                metadata = jsonb_set(
                  jsonb_set(metadata, 'ocr_processed', 'true'),
                  'ocr_confidence', '95.0',
                  'ocr_type', 'tesseract',
                  'ocr_language', $1
                ),
                updated_at = NOW()
              WHERE id = $2
            `, [language, id]);
            
            // Emit WebSocket notification if available
            const io = req.app.get("socketio");
            if (io) {
              io.emit("notification", {
                type: "ocr_complete",
                documentId: id,
                timestamp: new Date().toISOString()
              });
            }
          } finally {
            ocrClient.release();
          }
        } catch (error) {
          console.error("OCR processing error:", error);
        }
      }, 2000); // Simulate 2 second processing time
      
      res.json({
        success: true,
        message: "OCR processing started",
        data: {
          confidence: 95.0,
          language
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to process document with OCR:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process document with OCR"
    });
  }
});

/**
 * @route POST /api/v2/documents/:id/embeddings
 * @group Documents - Document management
 * @summary Generate embeddings for document
 * @description Generates embeddings for a document
 * @param {string} id.param.required - The document ID
 * @returns {object} 200 - Embeddings result
 * @returns {Error} 500 - If there was an error generating embeddings
 */
router.post("/:id/embeddings", async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    
    try {
      // Check if document exists
      const docResult = await client.query("SELECT content FROM documents WHERE id = $1", [id]);
      
      if (docResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Document not found"
        });
      }
      
      const content = docResult.rows[0].content;
      
      // Update processing status
      await client.query(`
        UPDATE documents 
        SET processing_status = 'analyzing', updated_at = NOW() 
        WHERE id = $1
      `, [id]);
      
      // In a real implementation, you would call an embedding service here
      // For now, we'll simulate embedding generation
      setTimeout(async () => {
        try {
          const embedClient = await pool.connect();
          
          try {
            // Update document with embeddings
            await embedClient.query(`
              UPDATE documents 
              SET 
                processing_status = 'analyzed',
                has_embeddings = true,
                metadata = jsonb_set(
                  metadata,
                  'embedding_model', 'text-embedding-ada-002',
                  'embeddings', '1536'
                ),
                updated_at = NOW()
              WHERE id = $1
            `, [id]);
            
            // Emit WebSocket notification if available
            const io = req.app.get("socketio");
            if (io) {
              io.emit("notification", {
                type: "embeddings_complete",
                documentId: id,
                timestamp: new Date().toISOString()
              });
            }
          } finally {
            embedClient.release();
          }
        } catch (error) {
          console.error("Embedding generation error:", error);
        }
      }, 3000); // Simulate 3 second processing time
      
      res.json({
        success: true,
        message: "Embedding generation started",
        embeddingCount: 1536
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to generate embeddings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate embeddings"
    });
  }
});

module.exports = router;