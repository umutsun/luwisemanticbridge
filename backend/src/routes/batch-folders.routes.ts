/**
 * Batch Folder Processing Routes
 * Generic batch PDF processing for any folder (murgan, books, legal, custom)
 */

import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../server';
import { io } from '../server';
import { ocrService } from '../services/ocr.service';
import documentProcessor from '../services/document-processor.service';

const router = Router();

interface BatchFile {
  path: string;
  relativePath: string;
  folderStructure: string[];  // ['parent', 'child', 'filename.pdf']
  filename: string;
  size: number;
  inDatabase?: boolean;
  documentId?: number;
  documentTitle?: string;
}

interface BatchJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  files: BatchFile[];
  results: any[];
  errors: any[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extract folder structure from file path (generic, no hardcoded categories)
 * Returns array of folder names from root to file
 */
const extractFolderStructure = (relativePath: string): string[] => {
  // Normalize path separators
  const normalizedPath = relativePath.replace(/\\/g, '/');
  // Split by separator and filter empty strings
  return normalizedPath.split('/').filter(part => part.length > 0);
};

/**
 * Scan any folder and list all PDFs (generic, works with any folder structure)
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { folderPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({
        success: false,
        error: 'folderPath is required'
      });
    }

    console.log(`[Batch Folders] Scanning folder: ${folderPath}`);

    // Resolve absolute path
    const absolutePath = path.isAbsolute(folderPath)
      ? folderPath
      : path.join(process.cwd(), '..', folderPath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(400).json({
        success: false,
        error: `Folder not found: ${folderPath}`
      });
    }

    // Recursively find all PDF files
    const files: BatchFile[] = [];

    const scanDirectory = (dirPath: string) => {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.toLowerCase().endsWith('.pdf')) {
          const relativePath = path.relative(absolutePath, fullPath);
          const folderStructure = extractFolderStructure(relativePath);

          files.push({
            path: fullPath,
            relativePath,
            folderStructure,
            filename: item,
            size: stat.size
          });
        }
      }
    };

    scanDirectory(absolutePath);

    // Check which files are already in database
    const filePaths = files.map(f => f.path);
    const dbCheckResult = await lsembPool.query(
      `SELECT file_path, id, title FROM documents WHERE file_path = ANY($1::text[])`,
      [filePaths]
    );

    const dbFiles = new Set(dbCheckResult.rows.map(row => row.file_path));
    const dbFileMap = new Map(dbCheckResult.rows.map(row => [row.file_path, { id: row.id, title: row.title }]));

    // Add inDatabase flag to each file
    const filesWithStatus = files.map(file => ({
      ...file,
      inDatabase: dbFiles.has(file.path),
      documentId: dbFileMap.get(file.path)?.id,
      documentTitle: dbFileMap.get(file.path)?.title
    }));

    // Group files by first-level folder (optional, for better display)
    const groupedFiles = filesWithStatus.reduce((acc, file) => {
      // Use first folder in structure as grouping key, or 'root' if none
      const key = file.folderStructure.length > 1 ? file.folderStructure[0] : 'root';
      if (!acc[key]) acc[key] = [];
      acc[key].push(file);
      return acc;
    }, {} as Record<string, any[]>);

    console.log(`[Batch Folders] Found ${files.length} PDF files (${dbFiles.size} already in DB)`);

    res.json({
      success: true,
      totalFiles: files.length,
      inDatabaseCount: dbFiles.size,
      newFilesCount: files.length - dbFiles.size,
      files: filesWithStatus,
      groupedFiles,
      folderGroups: Object.keys(groupedFiles)
    });

  } catch (error: any) {
    console.error('[Batch Folders] Scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start batch processing job
 */
// TEST: Removed authenticateToken for development
router.post('/process', async (req: Request, res: Response) => {
  try {
    const { files, options = {}, folderConfig } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }

    const jobId = `batch-${uuidv4()}`;

    // Create batch job
    const batchJob: BatchJob = {
      jobId,
      status: 'pending',
      totalFiles: files.length,
      processedFiles: 0,
      files,
      results: [],
      errors: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store job in Redis
    await redis.set(`job:${jobId}`, JSON.stringify(batchJob), 'EX', 86400); // 24 hours

    // Start async processing with folder_config
    processFilesAsync(jobId, files, { ...options, folderConfig });

    res.json({
      success: true,
      jobId,
      totalFiles: files.length,
      message: 'Batch processing started',
      folderConfig: folderConfig || null
    });

  } catch (error: any) {
    console.error('[Batch Folders] Process error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Async file processing
 */
async function processFilesAsync(jobId: string, files: BatchFile[], options: any) {
  console.log(`[Batch Folders] Starting async processing for job ${jobId}`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      // Update job status
      const jobData = await redis.get(`job:${jobId}`);
      if (!jobData) continue;

      const job: BatchJob = JSON.parse(jobData);
      job.status = 'processing';
      job.processedFiles = i;
      job.currentFile = file.filename;
      job.updatedAt = new Date();

      await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400);

      // Emit progress via WebSocket
      io.emit(`job-progress-${jobId}`, {
        jobId,
        status: 'processing',
        current: i + 1,
        total: files.length,
        percentage: Math.round(((i + 1) / files.length) * 100),
        currentFile: file.filename,
        message: `Processing ${file.filename}`
      });

      // ═══════════════════════════════════════════════════════════════
      // DUPLICATE CHECK: Skip if file_path already exists in documents
      // ═══════════════════════════════════════════════════════════════
      const duplicateCheck = await lsembPool.query(
        `SELECT id, title, processing_status FROM documents WHERE file_path = $1 LIMIT 1`,
        [file.path]
      );

      if (duplicateCheck.rows.length > 0) {
        const existing = duplicateCheck.rows[0];
        console.log(`⏭️  DUPLICATE SKIPPED: ${file.filename}`);
        console.log(`   → Already exists as Document ID ${existing.id}`);
        console.log(`   → Status: ${existing.processing_status}`);

        // Record skip in job results
        job.results.push({
          documentId: existing.id,
          filename: file.filename,
          relativePath: file.relativePath,
          skipped: true,
          reason: 'duplicate_file_path',
          existingStatus: existing.processing_status,
          success: true
        });
        await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400);
        continue; // Skip to next file
      }

      // Read file
      const fileBuffer = fs.readFileSync(file.path);
      const base64 = fileBuffer.toString('base64');

      // 1. Save to documents table with generic metadata
      const metadata: any = {
        source: 'batch-folders',
        uploadedAt: new Date(),
        relativePath: file.relativePath,
        folderStructure: file.folderStructure
      };

      // Add folder_config if provided (contains detected template and fields)
      if (options.folderConfig) {
        metadata.folder_config = options.folderConfig;
      }

      const docResult = await lsembPool.query(
        `INSERT INTO documents (title, content, file_type, file_size, file_path, metadata, processing_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          file.filename,
          '', // Content will be filled after OCR
          'pdf',
          file.size,
          file.path,
          JSON.stringify(metadata),
          'waiting' // Initial status: waiting for processing
        ]
      );

      const documentId = docResult.rows[0].id;
      console.log(`[Batch Folders] Document saved with ID: ${documentId}`);

      // 2. OCR Processing
      console.log(`[Batch Folders] Starting OCR for ${file.filename}`);
      const ocrResult = await ocrService.processOCR({
        base64,
        filename: file.filename,
        documentId,
        type: 'pdf'
      });

      // 3. Update document with OCR content + set status to 'analyzed'
      if (ocrResult.text) {
        await lsembPool.query(
          `UPDATE documents
           SET content = $1,
               metadata = metadata || $2::jsonb,
               processing_status = 'analyzed',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [
            ocrResult.text,
            JSON.stringify({
              ocr_processed: true,
              ocr_confidence: ocrResult.confidence,
              ocr_type: ocrResult.type,
              ocr_pages: ocrResult.pages
            }),
            documentId
          ]
        );
        console.log(`[Batch Folders] Document ${documentId} status: waiting → analyzed`);
      }

      // 4. Detect template from database (use folder_config if available)
      let templateId = options.folderConfig?.detected_template || null;
      let template = null;

      // If no template from folder_config, try auto-detection
      if (!templateId) {
        try {
          const templateResponse = await fetch(`http://localhost:8083/api/v2/templates/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: file.path,
              content: ocrResult.text?.substring(0, 5000)
            })
          });

          if (templateResponse.ok) {
            const templateData = await templateResponse.json();
            if (templateData.success && templateData.template) {
              template = templateData.template;
              templateId = template.template_id;
            }
          }
        } catch (templateError: any) {
          console.warn(`[Batch Folders] Template detection failed: ${templateError.message}`);
        }
      }

      console.log(`[Batch Folders] Using template: ${templateId || 'none'}`);

      // 5. Apply template to extract metadata (if template detected)
      let extractedMetadata: any = {};
      if (templateId) {
        try {
          const metadataResponse = await fetch(`http://localhost:8083/api/v2/templates/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId,
              documentId,
              content: ocrResult.text,
              createTables: false  // Don't create tables here - transform pipeline will handle it
            })
          });

          if (metadataResponse.ok) {
            const metadataData = await metadataResponse.json();
            if (metadataData.success) {
              extractedMetadata = metadataData.metadata;

              // Update document metadata with extracted fields
              await lsembPool.query(
                `UPDATE documents
                 SET metadata = metadata || $1::jsonb,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [
                  JSON.stringify({
                    extracted_metadata: extractedMetadata,
                    template_id: templateId
                  }),
                  documentId
                ]
              );

              // Transform to source table if template detected AND user opted-in
              const autoTransform = options.autoTransform === true;
              if (autoTransform && extractedMetadata && Object.keys(extractedMetadata).length > 0) {
                try {
                  console.log(`[Batch Folders] Starting transform to source DB for document ${documentId}`);

                  // Call transform service (uses pdf-batch routes transform logic)
                  const transformResponse = await fetch(`http://localhost:8083/api/v2/pdf/metadata-transform`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${process.env.SYSTEM_TOKEN || 'internal'}`
                    },
                    body: JSON.stringify({
                      documentId,
                      selectedFields: Object.keys(extractedMetadata),
                      tableName: templateId || 'batch_documents',
                      useExistingTable: false,
                      sourceDbId: process.env.SOURCE_DB_NAME || 'scriptus_lsemb'
                    })
                  });

                  if (transformResponse.ok) {
                    const transformData = await transformResponse.json();
                    console.log(`[Batch Folders] Transform job started: ${transformData.jobId}`);

                    // Update status to transformed
                    await lsembPool.query(
                      `UPDATE documents
                       SET metadata = metadata || $1::jsonb,
                           processing_status = 'transformed',
                           updated_at = CURRENT_TIMESTAMP
                       WHERE id = $2`,
                      [
                        JSON.stringify({
                          transform_job_id: transformData.jobId,
                          transformed_at: new Date().toISOString()
                        }),
                        documentId
                      ]
                    );
                    console.log(`[Batch Folders] Document ${documentId} status: analyzed → transformed`);
                  }
                } catch (transformError: any) {
                  console.warn(`[Batch Folders] Transform failed (non-critical): ${transformError.message}`);
                  // Don't fail the whole batch if transform fails - just log it
                }
              }
            }
          }
        } catch (metadataError: any) {
          console.warn(`[Batch Folders] Metadata extraction failed: ${metadataError.message}`);
        }
      }

      // 6. Record successful processing in job results
      const jobDataUpdated = await redis.get(`job:${jobId}`);
      if (jobDataUpdated) {
        const jobUpdated: BatchJob = JSON.parse(jobDataUpdated);
        jobUpdated.results.push({
          documentId,
          filename: file.filename,
          relativePath: file.relativePath,
          folderStructure: file.folderStructure,
          templateId: templateId || 'none',
          success: true
        });
        await redis.set(`job:${jobId}`, JSON.stringify(jobUpdated), 'EX', 86400);
      }

      console.log(`[Batch Folders] Successfully processed ${file.filename}`);

    } catch (error: any) {
      console.error(`[Batch Folders] Error processing ${file.filename}:`, error);

      // Add to errors
      const jobData = await redis.get(`job:${jobId}`);
      if (jobData) {
        const job: BatchJob = JSON.parse(jobData);
        job.errors.push({
          filename: file.filename,
          error: error.message
        });
        await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400);
      }
    }
  }

  // Mark job as completed
  const finalJobData = await redis.get(`job:${jobId}`);
  if (finalJobData) {
    const finalJob: BatchJob = JSON.parse(finalJobData);
    finalJob.status = 'completed';
    finalJob.processedFiles = files.length;
    finalJob.updatedAt = new Date();
    await redis.set(`job:${jobId}`, JSON.stringify(finalJob), 'EX', 86400);

    // Final progress emit
    io.emit(`job-progress-${jobId}`, {
      jobId,
      status: 'completed',
      current: files.length,
      total: files.length,
      percentage: 100,
      message: `Batch processing completed. ${finalJob.results.length} successful, ${finalJob.errors.length} errors.`
    });
  }

  console.log(`[Batch Folders] Job ${jobId} completed`);
}

/**
 * Get job status
 */
// TEST: Removed authenticateToken for development
router.get('/status/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const jobData = await redis.get(`job:${jobId}`);

    if (!jobData) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const job: BatchJob = JSON.parse(jobData);

    res.json({
      success: true,
      job: {
        jobId: job.jobId,
        status: job.status,
        totalFiles: job.totalFiles,
        processedFiles: job.processedFiles,
        currentFile: job.currentFile,
        percentage: Math.round((job.processedFiles / job.totalFiles) * 100),
        results: job.results,
        errors: job.errors,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      }
    });

  } catch (error: any) {
    console.error('[Batch Folders] Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get processed documents for review
 */
// TEST: Removed authenticateToken for development
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query(
      `SELECT
        d.id,
        d.title,
        d.file_path,
        d.metadata,
        d.created_at,
        CASE
          WHEN d.metadata->>'template_id' IS NOT NULL THEN true
          ELSE false
        END as has_metadata,
        d.metadata->>'category' as category,
        d.metadata->>'subCategory' as subcategory,
        d.metadata->>'mevzuatNo' as mevzuat_no,
        d.metadata->>'title' as extracted_title,
        d.metadata->>'summary' as summary
      FROM documents d
      WHERE d.metadata->>'source' = 'murgan-batch'
      ORDER BY d.created_at DESC
      LIMIT 100`
    );

    const documents = result.rows.map(doc => ({
      id: doc.id,
      title: doc.extracted_title || doc.title,
      originalFilename: doc.title,
      category: doc.category,
      subcategory: doc.subcategory,
      mevzuatNo: doc.mevzuat_no,
      summary: doc.summary,
      hasMetadata: doc.has_metadata,
      metadata: doc.metadata,
      createdAt: doc.created_at
    }));

    res.json({
      success: true,
      documents,
      total: documents.length
    });

  } catch (error: any) {
    console.error('[Batch Folders] Documents error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Search articles by reference or content
 */
// TEST: Removed authenticateToken for development
router.get('/search-maddeler', async (req: Request, res: Response) => {
  try {
    const { query, mevzuatNo, maddeNo, searchType = 'content' } = req.query;

    let querySQL = '';
    let params: any[] = [];

    if (searchType === 'reference' && query) {
      // Search for articles that reference specific laws
      querySQL = `
        SELECT
          m.id,
          m.madde_no,
          m.madde_tipi,
          m.baslik,
          m.metin,
          m.atiflar,
          v.mevzuat_no,
          v.mevzuat_adi
        FROM vergi_maddeler m
        JOIN vergi_mevzuati v ON m.mevzuat_id = v.id
        WHERE m.atiflar::text ILIKE $1
        ORDER BY v.mevzuat_no, m.madde_no
        LIMIT 50`;
      params = [`%${query}%`];
    } else if (maddeNo && mevzuatNo) {
      // Get specific article
      querySQL = `
        SELECT
          m.*,
          v.mevzuat_no,
          v.mevzuat_adi,
          v.mevzuat_turu
        FROM vergi_maddeler m
        JOIN vergi_mevzuati v ON m.mevzuat_id = v.id
        WHERE v.mevzuat_no = $1 AND m.madde_no = $2`;
      params = [mevzuatNo, maddeNo];
    } else if (query) {
      // Full text search in articles
      querySQL = `
        SELECT
          m.id,
          m.madde_no,
          m.madde_tipi,
          m.baslik,
          SUBSTRING(m.metin, 1, 200) as metin_excerpt,
          v.mevzuat_no,
          v.mevzuat_adi,
          ts_rank(to_tsvector('turkish', m.metin), plainto_tsquery('turkish', $1)) as rank
        FROM vergi_maddeler m
        JOIN vergi_mevzuati v ON m.mevzuat_id = v.id
        WHERE to_tsvector('turkish', m.metin) @@ plainto_tsquery('turkish', $1)
        ORDER BY rank DESC
        LIMIT 50`;
      params = [query];
    } else {
      return res.status(400).json({
        success: false,
        error: 'Query parameter required'
      });
    }

    const result = await lsembPool.query(querySQL, params);

    res.json({
      success: true,
      results: result.rows,
      count: result.rowCount
    });

  } catch (error: any) {
    console.error('[Batch Folders Search] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get mevzuat overview with article counts
 */
// TEST: Removed authenticateToken for development
router.get('/mevzuat-overview', async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query(`
      SELECT
        m.id,
        m.mevzuat_no,
        m.mevzuat_adi,
        m.mevzuat_turu,
        m.kategori,
        m.yururluk_tarihi,
        m.toplam_madde_sayisi,
        COUNT(DISTINCT md.id) as extracted_madde_sayisi,
        m.created_at,
        m.updated_at
      FROM vergi_mevzuati m
      LEFT JOIN vergi_maddeler md ON m.id = md.mevzuat_id
      GROUP BY m.id
      ORDER BY m.mevzuat_no`);

    res.json({
      success: true,
      mevzuat: result.rows,
      total: result.rowCount
    });

  } catch (error: any) {
    console.error('[Mevzuat Overview] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List all folders in docs directory with metadata
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const docsPath = path.join(process.cwd(), '..', 'docs');

    if (!fs.existsSync(docsPath)) {
      return res.status(404).json({
        success: false,
        error: 'Docs directory not found'
      });
    }

    const items = fs.readdirSync(docsPath);
    const folders: any[] = [];

    for (const item of items) {
      const itemPath = path.join(docsPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        // Count PDFs in folder
        let pdfCount = 0;
        let totalSize = 0;

        const scanFolder = (dirPath: string) => {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const fileStat = fs.statSync(filePath);

            if (fileStat.isDirectory()) {
              scanFolder(filePath);
            } else if (file.toLowerCase().endsWith('.pdf')) {
              pdfCount++;
              totalSize += fileStat.size;
            }
          }
        };

        scanFolder(itemPath);

        // Check how many files from this folder are in database
        const folderPattern = `${itemPath}%`;
        const dbCheckResult = await lsembPool.query(
          `SELECT COUNT(*) as count FROM documents WHERE file_path LIKE $1`,
          [folderPattern]
        );

        const inDatabaseCount = parseInt(dbCheckResult.rows[0]?.count || '0');

        folders.push({
          name: item,
          path: itemPath,
          pdfCount,
          totalSize,
          inDatabaseCount,
          newFilesCount: pdfCount - inDatabaseCount,
          lastModified: stat.mtime
        });
      }
    }

    res.json({
      success: true,
      folders: folders.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()),
      totalFolders: folders.length
    });

  } catch (error: any) {
    console.error('[Batch Folders List] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Analyze folder structure by sampling PDFs and detecting template
 */
router.post('/:folderName/analyze', async (req: Request, res: Response) => {
  try {
    const { folderName } = req.params;
    const { sampleSize = 3 } = req.body;

    const folderPath = path.join(process.cwd(), '..', 'docs', folderName);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({
        success: false,
        error: `Folder not found: ${folderName}`
      });
    }

    console.log(`[Batch Folders] Analyzing folder: ${folderName}`);

    // Collect all PDFs
    const allPdfs: string[] = [];
    const scanFolder = (dirPath: string) => {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          scanFolder(filePath);
        } else if (file.toLowerCase().endsWith('.pdf')) {
          allPdfs.push(filePath);
        }
      }
    };

    scanFolder(folderPath);

    if (allPdfs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No PDF files found in folder'
      });
    }

    // Sample random PDFs (max sampleSize)
    const samplesToAnalyze = Math.min(sampleSize, allPdfs.length);
    const sampledPdfs: string[] = [];
    const sampledIndices = new Set<number>();

    while (sampledPdfs.length < samplesToAnalyze) {
      const randomIndex = Math.floor(Math.random() * allPdfs.length);
      if (!sampledIndices.has(randomIndex)) {
        sampledIndices.add(randomIndex);
        sampledPdfs.push(allPdfs[randomIndex]);
      }
    }

    console.log(`[Batch Folders] Sampling ${samplesToAnalyze} PDFs from ${allPdfs.length} total`);

    // Analyze each sample
    const sampleAnalysis: any[] = [];
    const templateCounts: Record<string, number> = {};
    const commonFields: Record<string, number> = {};

    for (const pdfPath of sampledPdfs) {
      try {
        // OCR the PDF
        const fileBuffer = fs.readFileSync(pdfPath);
        const base64 = fileBuffer.toString('base64');

        const ocrResult = await ocrService.processOCR({
          base64,
          filename: path.basename(pdfPath),
          type: 'pdf'
        });

        // Detect template
        const templateResponse = await fetch(`http://localhost:8083/api/v2/templates/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: pdfPath,
            content: ocrResult.text?.substring(0, 5000)
          })
        });

        let templateId = 'unknown';
        let templateName = 'Unknown';
        if (templateResponse.ok) {
          const templateData = await templateResponse.json();
          if (templateData.success && templateData.template) {
            templateId = templateData.template.template_id;
            templateName = templateData.template.name;
            templateCounts[templateId] = (templateCounts[templateId] || 0) + 1;

            // Count common fields
            if (templateData.template.fields) {
              for (const field of templateData.template.fields) {
                commonFields[field.name] = (commonFields[field.name] || 0) + 1;
              }
            }
          }
        }

        sampleAnalysis.push({
          filename: path.basename(pdfPath),
          path: pdfPath,
          templateId,
          templateName,
          contentPreview: ocrResult.text?.substring(0, 200)
        });

      } catch (error: any) {
        console.error(`[Batch Folders] Error analyzing ${pdfPath}:`, error.message);
        sampleAnalysis.push({
          filename: path.basename(pdfPath),
          path: pdfPath,
          error: error.message
        });
      }
    }

    // Determine dominant template
    let dominantTemplate = 'unknown';
    let maxCount = 0;
    for (const [templateId, count] of Object.entries(templateCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantTemplate = templateId;
      }
    }

    // Filter common fields (present in majority of samples)
    const majorityThreshold = Math.ceil(samplesToAnalyze / 2);
    const detectedFields = Object.entries(commonFields)
      .filter(([_, count]) => count >= majorityThreshold)
      .map(([name, _]) => name);

    // Generate folder_config
    const folderConfig = {
      folder_path: folderPath,
      folder_name: folderName,
      detected_template: dominantTemplate,
      template_confidence: maxCount / samplesToAnalyze,
      common_fields: detectedFields,
      total_pdfs: allPdfs.length,
      sampled_pdfs: samplesToAnalyze,
      template_distribution: templateCounts,
      analyzed_at: new Date()
    };

    console.log(`[Batch Folders] Analysis complete - Template: ${dominantTemplate} (${Math.round(folderConfig.template_confidence * 100)}%)`);

    res.json({
      success: true,
      folderConfig,
      sampleAnalysis,
      recommendation: {
        template: dominantTemplate,
        confidence: folderConfig.template_confidence,
        message: folderConfig.template_confidence >= 0.7
          ? `Strong match detected: ${dominantTemplate}`
          : 'Mixed templates detected - manual review recommended'
      }
    });

  } catch (error: any) {
    console.error('[Batch Folders Analyze] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;