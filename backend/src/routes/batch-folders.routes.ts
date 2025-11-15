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
  category: string;
  subcategory: string;
  mevzuatNo?: string;
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
 * Auto-detect category from folder structure
 */
const detectCategory = (filePath: string): { category: string; subcategory: string } => {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Category mapping based on folder structure
  const categoryMap: Record<string, string> = {
    '1-MEVZUAT/1-Kanun': 'Kanun',
    '1-MEVZUAT/2-GenelTeblig': 'Genel Tebliğ',
    '1-MEVZUAT/3-Kararname': 'Kararname',
    '1-MEVZUAT/4-Yonetmelik': 'Yönetmelik',
    '1-MEVZUAT/5-Sirkuler': 'Sirküler',
    '1-MEVZUAT/6-Genelge-GenelYazi': 'Genelge',
    '2-DANISTAY': 'Danıştay Kararı',
    '3-OZELGE': 'Özelge',
    '4-MAKALE': 'Makale',
    '5-EKITAP': 'E-Kitap'
  };

  // Find matching category
  for (const [pattern, category] of Object.entries(categoryMap)) {
    if (normalizedPath.includes(pattern)) {
      return {
        category: 'Vergi Hukuku',
        subcategory: category
      };
    }
  }

  return {
    category: 'Vergi Hukuku',
    subcategory: 'Mevzuat'
  };
};

/**
 * Extract mevzuat number from filename
 * Examples: 193.pdf → 193, 3065-1.pdf → 3065, 213-TOUZLASMA.pdf → 213
 */
const extractMevzuatNo = (filename: string): string | undefined => {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : undefined;
};

/**
 * Scan Murgan folder and list all PDFs
 */
router.post('/scan', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { folderPath = 'docs/murgan' } = req.body;

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
          const { category, subcategory } = detectCategory(relativePath);

          files.push({
            path: fullPath,
            category,
            subcategory,
            mevzuatNo: extractMevzuatNo(item),
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

    // Group files by category for better display
    const groupedFiles = filesWithStatus.reduce((acc, file) => {
      const key = file.subcategory;
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
      categories: Object.keys(groupedFiles)
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
router.post('/process', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { files, options = {} } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }

    const jobId = `murgan-batch-${uuidv4()}`;

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

    // Start async processing
    processFilesAsync(jobId, files, options);

    res.json({
      success: true,
      jobId,
      totalFiles: files.length,
      message: 'Batch processing started'
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
        message: `Processing ${file.filename} (${file.subcategory})`
      });

      // Read file
      const fileBuffer = fs.readFileSync(file.path);
      const base64 = fileBuffer.toString('base64');

      // 1. Save to documents table
      const docResult = await lsembPool.query(
        `INSERT INTO documents (title, content, type, size, file_path, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          file.filename,
          '', // Content will be filled after OCR
          'pdf',
          file.size,
          file.path,
          JSON.stringify({
            category: file.category,
            subcategory: file.subcategory,
            mevzuatNo: file.mevzuatNo,
            source: 'murgan-batch',
            uploadedAt: new Date()
          })
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

      // 3. Update document with OCR content
      if (ocrResult.text) {
        await lsembPool.query(
          `UPDATE documents
           SET content = $1,
               metadata = metadata || $2::jsonb,
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
      }

      // 4. Detect template from database
      const templateResponse = await fetch(`http://localhost:8083/api/v2/templates/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: file.path,
          content: ocrResult.text?.substring(0, 5000)
        })
      });

      let templateId = 'turkish_tax_law'; // Default
      let template = null;
      if (templateResponse.ok) {
        const templateData = await templateResponse.json();
        if (templateData.success && templateData.template) {
          template = templateData.template;
          templateId = template.template_id;
        }
      }

      console.log(`[Batch Folders] Using template: ${templateId}`);

      // 5. Apply template to extract metadata
      const metadataResponse = await fetch(`http://localhost:8083/api/v2/templates/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          documentId,
          content: ocrResult.text,
          createTables: false
        })
      });

      let metadata: any = {};
      if (metadataResponse.ok) {
        const metadataData = await metadataResponse.json();
        if (metadataData.success) {
          metadata = metadataData.metadata;

          // Add category info
          metadata.category = file.category;
          metadata.subCategory = file.subcategory;
          metadata.mevzuatNo = metadata.mevzuatNo || file.mevzuatNo;
        }
      }

      // 6. Extract structured madde-level data for Turkish Tax Law
      if (templateId === 'turkish_tax_law' && metadata.maddeler) {
        console.log(`[Batch Folders] Extracting madde-level data for ${file.filename}`);

        try {
          // Create vergi_mevzuati record
          const mevzuatResult = await lsembPool.query(
            `INSERT INTO vergi_mevzuati (
              document_id, mevzuat_no, mevzuat_adi, mevzuat_turu,
              resmi_gazete_tarihi, resmi_gazete_sayisi,
              yururluk_tarihi, yayim_tarihi,
              konu, amac, kapsam,
              toplam_madde_sayisi, gecici_madde_sayisi,
              kategori, alt_kategori, etiketler,
              tam_metin, ozet, anahtar_kelimeler,
              extraction_metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (mevzuat_no, mevzuat_turu)
            DO UPDATE SET
              updated_at = CURRENT_TIMESTAMP,
              extraction_metadata = vergi_mevzuati.extraction_metadata || $20::jsonb
            RETURNING id`,
            [
              documentId,
              metadata.mevzuatNo || file.mevzuatNo,
              metadata.mevzuatAdi || metadata.title,
              metadata.mevzuatTuru || file.subcategory,
              metadata.resmiGazete?.tarih ? new Date(metadata.resmiGazete.tarih) : null,
              metadata.resmiGazete?.sayi,
              metadata.yururlukTarihi ? new Date(metadata.yururlukTarihi) : null,
              metadata.yayimTarihi ? new Date(metadata.yayimTarihi) : null,
              metadata.summary,
              metadata.amac,
              metadata.kapsam,
              metadata.maddeSayisi || Object.keys(metadata.maddeler || {}).length,
              metadata.geciciMaddeSayisi || 0,
              file.category,
              file.subcategory,
              metadata.keywords || [],
              ocrResult.text,
              metadata.summary,
              metadata.keywords || [],
              JSON.stringify({
                extractedAt: new Date(),
                confidence: metadata.confidence,
                template: templateId
              })
            ]
          );

          const mevzuatId = mevzuatResult.rows[0].id;
          console.log(`[Batch Folders] Created vergi_mevzuati record: ${mevzuatId}`);

          // Parse and insert individual maddeler
          if (typeof metadata.maddeler === 'object') {
            for (const [maddeNo, maddeContent] of Object.entries(metadata.maddeler)) {
              try {
                // Handle both string and object content
                let maddeData: any = {};
                if (typeof maddeContent === 'string') {
                  maddeData = {
                    metin: maddeContent,
                    baslik: null,
                    bentler: [],
                    fikralar: [],
                    atiflar: []
                  };
                } else if (typeof maddeContent === 'object') {
                  maddeData = maddeContent as any;
                }

                // Extract madde number and type
                const maddeMatch = maddeNo.match(/^(Geçici |Ek |Mükerrer )?Madde (\d+)/i);
                const cleanMaddeNo = maddeMatch ? maddeMatch[2] : maddeNo.replace(/[^\d]/g, '');
                const maddeType = maddeMatch && maddeMatch[1] ?
                  (maddeMatch[1].toLowerCase().includes('geçici') ? 'gecici' :
                   maddeMatch[1].toLowerCase().includes('ek') ? 'ek' :
                   maddeMatch[1].toLowerCase().includes('mükerrer') ? 'mukerrer' : 'normal')
                  : 'normal';

                // Extract references from text
                const atifPattern = /(\d+)\s*(sayılı|numaralı)?\s*[A-ZÇĞİÖŞÜ][a-zçğıöşü]*\s*(Kanun|Tebliğ|Yönetmelik|Kararname)/g;
                const atiflar = maddeData.atiflar || [];
                let match;
                while ((match = atifPattern.exec(maddeData.metin || '')) !== null) {
                  atiflar.push(match[0]);
                }

                // Extract tax rates if mentioned
                const oranPattern = /(%\s*\d+|\d+\s*%)/g;
                const oranlar: any = {};
                const oranMatches = (maddeData.metin || '').match(oranPattern);
                if (oranMatches) {
                  oranlar.bulunanOranlar = oranMatches;
                }

                // Extract deadlines
                const surePattern = /(\d+)\s*(gün|ay|yıl|hafta)/g;
                const sureler: any = {};
                const sureMatches = (maddeData.metin || '').match(surePattern);
                if (sureMatches) {
                  sureler.bulunanSureler = sureMatches;
                }

                await lsembPool.query(
                  `INSERT INTO vergi_maddeler (
                    mevzuat_id, document_id, madde_no, madde_tipi,
                    baslik, metin, fikralar, bentler, atiflar,
                    degisiklik_durumu, degistiren_kanun, degisiklik_tarihi,
                    konu_basliklari, vergi_turleri, oranlar, sureler,
                    madde_ozeti, anahtar_kavramlar, extraction_confidence
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                  ON CONFLICT (mevzuat_id, madde_no, madde_tipi)
                  DO UPDATE SET
                    metin = EXCLUDED.metin,
                    updated_at = CURRENT_TIMESTAMP`,
                  [
                    mevzuatId,
                    documentId,
                    cleanMaddeNo,
                    maddeType,
                    maddeData.baslik || null,
                    maddeData.metin || maddeContent,
                    JSON.stringify(maddeData.fikralar || []),
                    JSON.stringify(maddeData.bentler || []),
                    JSON.stringify(atiflar),
                    maddeData.degisiklik || 'Original',
                    maddeData.degistiren_kanun || null,
                    null, // degisiklik_tarihi
                    [file.subcategory], // konu_basliklari
                    metadata.vergiTurleri || [],
                    JSON.stringify(oranlar),
                    JSON.stringify(sureler),
                    maddeData.ozet || null,
                    metadata.keywords || [],
                    metadata.confidence || 0.8
                  ]
                );
              } catch (maddeError) {
                console.error(`[Batch Folders] Error inserting madde ${maddeNo}:`, maddeError);
              }
            }
            console.log(`[Batch Folders] Inserted ${Object.keys(metadata.maddeler).length} articles`);
          }
        } catch (structuredError) {
          console.error(`[Batch Folders] Error in structured extraction:`, structuredError);
          // Continue with regular metadata save even if structured extraction fails
        }
      }

      // 7. Save metadata to documents table (original logic)
      await lsembPool.query(
        `UPDATE documents
         SET metadata = metadata || $1::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [
          JSON.stringify({
            ...metadata,
            lastAnalysis: {
              template: templateId,
              timestamp: new Date(),
              method: 'batch-processing'
            },
            template_id: templateId,
            extracted_at: new Date()
          }),
          documentId
        ]
      );

      // Add to results
      const jobDataUpdated = await redis.get(`job:${jobId}`);
      if (jobDataUpdated) {
        const jobUpdated: BatchJob = JSON.parse(jobDataUpdated);
        jobUpdated.results.push({
          documentId,
          filename: file.filename,
          category: file.subcategory,
          mevzuatNo: metadata.mevzuatNo || file.mevzuatNo,
          title: metadata.title || file.filename,
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
router.get('/status/:jobId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/documents', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/search-maddeler', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/mevzuat-overview', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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

export default router;