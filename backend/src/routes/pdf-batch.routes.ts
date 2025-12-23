/**
 * PDF Batch Processing Routes
 * 3-step workflow: OCR Queue → Metadata Analysis → Transform to SourceDB
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { lsembPool } from '../config/database.config';
import pdfAnalyzer from '../services/pdf/pdf-analyzer.service';
import metadataExtractor from '../services/pdf/metadata-extractor.service';
import pdfMetadataService from '../services/pdf/pdf-metadata.service';
import pdfTransform from '../services/pdf/pdf-transform.service';
import GeminiPDFService from '../services/pdf/gemini-pdf.service';
import { SettingsService } from '../services/settings.service';
import pdfSchemaService from '../services/pdf/pdf-schema.service';
import PDFProgressWSService from '../services/pdf/pdf-progress-ws.service';
import LLMManager from '../services/llm-manager.service';
import { getExperimentalCache } from '../services/pdf/experimental-cache.service';
import { OCRService } from '../services/ocr.service';
import { ocrRouterService } from '../services/ocr/ocr-router.service';

const router = Router();

// Get WebSocket Progress Service instance
function getProgressService(): any | null {
  // Get service from the global instance
  const service = (global as any).pdfProgressWSService;
  return service || null;
}

// Redis for job tracking (if available)
let redis: any = null;
try {
  const Redis = require('ioredis');
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    retryStrategy: () => null // Don't retry if Redis is down
  });
} catch (error) {
  console.warn('[PDF Batch] Redis not available, using in-memory tracking');
}

// In-memory job storage (fallback if Redis is not available)
const jobStorage = new Map<string, any>();

// Helper: Store job progress
async function storeJobProgress(jobId: string, data: any): Promise<void> {
  if (redis) {
    await redis.setex(`pdf_job:${jobId}`, 3600, JSON.stringify(data));
  } else {
    jobStorage.set(jobId, data);
  }
}

// Helper: Get job progress
async function getJobProgress(jobId: string): Promise<any | null> {
  if (redis) {
    const data = await redis.get(`pdf_job:${jobId}`);
    return data ? JSON.parse(data) : null;
  } else {
    return jobStorage.get(jobId) || null;
  }
}

// ==================== SINGLE DOCUMENT ANALYSIS ====================

/**
 * POST /api/v2/pdf/analyze-single
 * Analyze single document with template
 */
router.post('/analyze-single', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  console.log('[PDF Analysis] POST /analyze-single - Request received');

  try {
    const { documentId, templateId } = req.body;

    if (!documentId || !templateId) {
      return res.status(400).json({ error: 'documentId and templateId are required' });
    }

    // Get document from database
    const docResult = await lsembPool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];
    console.log(`[PDF Analysis] Analyzing document: ${document.title} with template: ${templateId}`);

    // Get template
    const fs = require('fs').promises;
    const path = require('path');
    const templatesPath = path.join(__dirname, '../../data/analysis-templates.json');
    const templatesData = await fs.readFile(templatesPath, 'utf8');
    const templates = JSON.parse(templatesData);
    const template = templates.templates.find(t => t.id === templateId);

    if (!template) {
      return res.status(400).json({ error: 'Template not found' });
    }

    // Get API keys from settings
    const settingsService = SettingsService.getInstance();
    const geminiApiKey = await settingsService.getSetting('google.apiKey');
    const deepseekApiKey = await settingsService.getSetting('deepseek.apiKey');

    // Use metadata extractor service
    const startTime = Date.now();
    const result = await pdfMetadataService.extractMetadata(
      document.metadata?.source || document.file_path || '',
      document.id,
      document.title,
      {
        apiKey: geminiApiKey,
        deepseekApiKey: deepseekApiKey,
        template: templateId,
        templateData: template,
        analysisPrompt: template.extraction_prompt
      }
    );

    const processingTime = Date.now() - startTime;

    // Update document metadata in database
    if (result.metadata) {
      try {
        // Clean metadata: remove undefined, NaN, Infinity values
        const cleanMetadata = JSON.parse(JSON.stringify({
          ...result.metadata,
          lastAnalysis: {
            template: templateId,
            timestamp: new Date().toISOString(),
            tokensUsed: result.tokensUsed,
            processingTime: processingTime
          }
        }));

        await lsembPool.query(
          `UPDATE documents
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            documentId,
            JSON.stringify(cleanMetadata)
          ]
        );
      } catch (dbError: any) {
        console.error('[PDF Analyze] Failed to save metadata to database:', dbError.message);
        console.error('[PDF Analyze] Metadata that failed:', result.metadata);
        // Continue anyway - don't fail the whole request
      }
    }

    // Return analysis result
    res.json({
      success: true,
      documentId,
      template: templateId,
      metadata: result.metadata,
      statistics: {},
      processingInfo: {
        tokensUsed: result.tokensUsed || 0,
        processingTime: processingTime,
        method: 'LLM'
      }
    });

  } catch (error: any) {
    console.error('[PDF Analysis] Error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

// ==================== ANALYSIS TEMPLATES ====================

/**
 * GET /api/v2/pdf/analysis-templates
 * Get available analysis templates for document enrichment
 */
router.get('/analysis-templates', async (req: Request, res: Response) => {
  console.log('[PDF Templates] GET /analysis-templates - Request received');

  try {
    // Read templates from file
    const fs = require('fs').promises;
    const path = require('path');

    const templatesPath = path.join(__dirname, '../../data/analysis-templates.json');
    console.log('[PDF Templates] Templates path:', templatesPath);

    try {
      const templatesData = await fs.readFile(templatesPath, 'utf8');
      const templates = JSON.parse(templatesData);

      res.json({
        success: true,
        templates: templates.templates || []
      });
    } catch (fileError) {
      // Fallback to default templates if file doesn't exist
      const defaultTemplates = {
        templates: [
          {
            id: "general",
            name: "General Document",
            description: "Standard document analysis",
            category: "General",
            icon: "",
            focus_keywords: [],
            target_fields: [
              "title", "summary", "keywords", "main_topics",
              "entities", "document_type", "creation_date"
            ],
            extraction_prompt: "Provide a comprehensive analysis of the document including summary, key topics, and entities"
          },
          {
            id: "legal",
            name: "Legal Document (Kanun/Mevzuat)",
            description: "Turkish laws, regulations, articles",
            category: "Legal",
            icon: "️",
            focus_keywords: ["kanun", "madde", "yasa", "mevzuat", "tüzük", "yönetmelik", "kararname"],
            target_fields: [
              "kanunNo", "maddeler", "yürürlükTarihi", "mevzuatTuru",
              "maddeSayisi", "degisiklikler", "yaptirimlar", "YetkiliKurum"
            ],
            extraction_prompt: "Extract Turkish legal document details including law number, articles, law type, sanctions, and authority"
          },
          {
            id: "novel",
            name: "Novel/Fiction",
            description: "Characters, narrative style, plot",
            category: "Literature",
            icon: "",
            focus_keywords: ["character", "plot", "narrative", "theme", "protagonist", "antagonist"],
            target_fields: [
              "mainCharacters", "narrativeStyle", "genre", "plotThemes", "setting"
            ],
            extraction_prompt: "Analyze the novel including main characters, narrative style, genre, plot themes, and setting"
          },
          {
            id: "research",
            name: "Research Paper",
            description: "Methodology, findings, citations",
            category: "Academic",
            icon: "",
            focus_keywords: ["methodology", "research", "findings", "hypothesis", "conclusion", "citations"],
            target_fields: [
              "methodology", "researchDomain", "keyFindings", "citations", "hypothesis", "conclusion"
            ],
            extraction_prompt: "Extract research paper details including methodology, domain, key findings, and citations"
          },
          {
            id: "invoice",
            name: "Invoice",
            description: "Invoice number, amounts, vendors",
            category: "Financial",
            icon: "",
            focus_keywords: ["invoice", "bill", "total", "amount", "vendor", "due date"],
            target_fields: [
              "invoice_number", "vendor_name", "invoice_date", "due_date",
              "total_amount", "tax_amount", "line_items", "payment_terms", "currency"
            ],
            extraction_prompt: "Extract invoice details including invoice number, vendor information, dates, amounts, and line items"
          },
          {
            id: "contract",
            name: "Contract",
            description: "Parties, terms, obligations",
            category: "Legal",
            icon: "",
            focus_keywords: ["agreement", "contract", "terms", "obligations", "liability", "termination"],
            target_fields: [
              "contract_title", "parties", "effective_date", "termination_date",
              "key_obligations", "payment_terms", "liability_clauses", "jurisdiction"
            ],
            extraction_prompt: "Extract contract details including parties, dates, obligations, and key legal terms"
          }
        ]
      };

      res.json({
        success: true,
        templates: defaultTemplates.templates
      });
    }
  } catch (error) {
    console.error('[PDF Templates] Error fetching templates:', error);
    res.status(500).json({
      error: 'Failed to fetch analysis templates',
      message: error.message
    });
  }
});

/**
 * POST /api/v2/pdf/analysis-templates
 * Create or update an analysis template
 */
router.post('/analysis-templates', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = req.body;

    if (!template.name || !template.category) {
      return res.status(400).json({ error: 'Template name and category are required' });
    }

    // Generate ID if not provided
    if (!template.id) {
      template.id = template.name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    }

    // Read existing templates
    const fs = require('fs').promises;
    const path = require('path');
    const templatesPath = path.join(__dirname, '../../data/analysis-templates.json');

    let templatesData: any = { templates: [] };

    try {
      const existingData = await fs.readFile(templatesPath, 'utf8');
      templatesData = JSON.parse(existingData);
    } catch (fileError) {
      // File doesn't exist, will create new
    }

    // Check if template with same ID exists and update, otherwise add new
    const existingIndex = templatesData.templates.findIndex((t: any) => t.id === template.id);
    if (existingIndex >= 0) {
      templatesData.templates[existingIndex] = { ...template, updated_at: new Date().toISOString() };
    } else {
      templatesData.templates.push({ ...template, created_at: new Date().toISOString() });
    }

    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../../data');
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (mkdirError) {
      // Directory might already exist
    }

    // Save templates
    await fs.writeFile(templatesPath, JSON.stringify(templatesData, null, 2));

    res.json({
      success: true,
      template,
      message: 'Template saved successfully'
    });
  } catch (error) {
    console.error('[PDF Templates] Error saving template:', error);
    res.status(500).json({
      error: 'Failed to save analysis template',
      message: error.message
    });
  }
});

/**
 * POST /api/v2/pdf/detect-language
 * Detect the language of document text using LLM
 *
 * Body: { text: string }
 * Response: { success: boolean, language: { code: string, name: string, confidence: number } }
 */
router.post('/detect-language', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text content is required'
      });
    }

    console.log('[Language Detection] API request received, text length:', text.length);

    // Get LLM Manager
    const llmManager = LLMManager.getInstance();
    // const activeLLM = llmManager.getActiveLLM();

    // Use first 2000 characters for language detection
    const sample = text.substring(0, 2000);

    const prompt = `Analyze the following text and detect its primary language. Respond with ONLY a JSON object in this exact format:
{
  "code": "language_code",
  "name": "Language Name",
  "confidence": 95
}

Valid language codes: tr (Turkish), en (English), ar (Arabic), de (German), fr (French), es (Spanish), ru (Russian), zh (Chinese), ja (Japanese), ko (Korean), it (Italian), pt (Portuguese), nl (Dutch), pl (Polish), sv (Swedish), etc.

Text sample:
${sample}`;

    try {
      const response = await llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 100
      });

      console.log('[Language Detection] LLM raw response:', response);

      // Parse JSON from response
      let languageData;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          languageData = JSON.parse(jsonMatch[0]);
        } else {
          languageData = JSON.parse(response);
        }
      } catch (parseError) {
        console.error('[Language Detection] Failed to parse JSON:', parseError);
        // Fallback: try to extract language from text
        const lowerResponse = response.toLowerCase();
        if (lowerResponse.includes('turkish') || lowerResponse.includes('türkçe')) {
          languageData = { code: 'tr', name: 'Turkish', confidence: 80 };
        } else if (lowerResponse.includes('english') || lowerResponse.includes('ingilizce')) {
          languageData = { code: 'en', name: 'English', confidence: 80 };
        } else {
          languageData = { code: 'unknown', name: 'Unknown', confidence: 50 };
        }
      }

      console.log('[Language Detection] Detected:', languageData);

      res.json({
        success: true,
        language: languageData
      });

    } catch (llmError) {
      console.error('[Language Detection] LLM error:', llmError);
      // Fallback: simple heuristic-based detection
      const languageData = detectLanguageHeuristic(sample);
      res.json({
        success: true,
        language: languageData,
        fallback: true
      });
    }

  } catch (error) {
    console.error('[Language Detection] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect language',
      message: error.message
    });
  }
});

/**
 * Fallback heuristic-based language detection
 */
function detectLanguageHeuristic(text: string): { code: string; name: string; confidence: number } {
  const lowerText = text.toLowerCase();

  // Turkish-specific characters and common words
  const turkishChars = /[ğüşıöç]/i;
  const turkishWords = ['bir', 'bu', 've', 'için', 'ile', 'olan', 'madde', 'kanun', 'ise'];

  // English common words
  const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'for', 'with', 'that'];

  // Count matches
  let turkishScore = turkishChars.test(text) ? 30 : 0;
  turkishScore += turkishWords.filter(w => lowerText.includes(w)).length * 10;

  let englishScore = englishWords.filter(w => lowerText.includes(` ${w} `)).length * 10;

  if (turkishScore > englishScore && turkishScore > 20) {
    return { code: 'tr', name: 'Turkish', confidence: Math.min(50 + turkishScore, 90) };
  } else if (englishScore > 20) {
    return { code: 'en', name: 'English', confidence: Math.min(50 + englishScore, 90) };
  }

  return { code: 'unknown', name: 'Unknown', confidence: 30 };
}

/**
 * POST /api/v2/pdf/detect-template
 * Automatically detect the best template for a document using LLM
 *
 * Body: { text: string, visualElements?: array, language?: { code: string, name: string } }
 */
router.post('/detect-template', async (req: Request, res: Response) => {
  try {
    const { text, visualElements } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text content is required'
      });
    }

    console.log('[Template Detection] API request received, text length:', text.length);
    if (visualElements && visualElements.length > 0) {
      console.log('[Template Detection] Visual elements provided:', visualElements.length);
      console.log('[Template Detection] Visual element types:', visualElements.map((v: any) => v.type).join(', '));
    }

    // Get LLM Manager for API keys
    const llmManager = LLMManager.getInstance();
    const geminiKey = llmManager.getApiKey('gemini') || llmManager.getApiKey('google');
    const deepseekKey = llmManager.getApiKey('deepseek');

    // Call the detection service
    const detection = await pdfMetadataService.detectTemplate(text, {
      apiKey: geminiKey,
      deepseekApiKey: deepseekKey,
      visualElements: visualElements || []
    });

    console.log('[Template Detection] Result:', detection);

    res.json({
      success: true,
      detection
    });

  } catch (error) {
    console.error('[Template Detection] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect template',
      message: error.message
    });
  }
});

// ==================== STEP 1: ANALYZE BATCH (Detect Scanned PDFs) ====================

/**
 * POST /api/v2/pdf/analyze-batch
 * Analyze PDFs to detect which ones need OCR
 *
 * Body: { documentIds: string[] }
 */
router.post('/analyze-batch', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    console.log(`[PDF Batch] Analyzing ${documentIds.length} PDFs`);

    // Get documents from database
    const documentsResult = await lsembPool.query(
      `SELECT id, title, file_path
       FROM documents
       WHERE id = ANY($1::int[])
       AND file_path IS NOT NULL`,
      [documentIds]
    );

    if (documentsResult.rows.length === 0) {
      return res.status(404).json({ error: 'No documents found with valid file paths' });
    }

    // Analyze batch
    const analysisResult = await pdfAnalyzer.analyzeBatch(
      documentsResult.rows.map(row => ({
        id: row.id.toString(),
        file_path: row.file_path
      }))
    );

    res.json({
      success: true,
      analysis: {
        scannedPDFs: analysisResult.scannedPDFs.map(pdf => ({
          documentId: pdf.documentId,
          filename: pdf.filename,
          recommendation: pdf.recommendation,
          confidence: pdf.confidence,
          stats: pdf.stats
        })),
        textPDFs: analysisResult.textPDFs.map(pdf => ({
          documentId: pdf.documentId,
          filename: pdf.filename,
          recommendation: pdf.recommendation,
          confidence: pdf.confidence,
          stats: pdf.stats
        })),
        uncertainPDFs: analysisResult.uncertainPDFs.map(pdf => ({
          documentId: pdf.documentId,
          filename: pdf.filename,
          recommendation: pdf.recommendation,
          confidence: pdf.confidence,
          stats: pdf.stats
        })),
        summary: analysisResult.summary
      }
    });
  } catch (error) {
    console.error('[PDF Batch] Error analyzing batch:', error);
    res.status(500).json({
      error: 'Failed to analyze PDFs',
      message: error.message
    });
  }
});

// ==================== STEP 2: TEXT EXTRACTION & OCR ====================

/**
 * POST /api/v2/pdf/extract-text
 * Extract text from text-based PDFs using pdf-parse (fast, local)
 *
 * Body: { documentIds: string[] } OR { filePath: string }
 */
router.post('/extract-text', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds, filePath } = req.body;

    // Single file extraction from path
    if (filePath) {
      const ocrService = OCRService.getInstance();
      const path = require('path');
      const fs = require('fs');

      // Normalize path
      let normalizedPath = filePath.replace(/\\/g, '/');
      const docsPath = process.env.DOCUMENTS_PATH || process.env.UPLOAD_DIR || './docs';

      // If path doesn't exist, try different variations
      if (!fs.existsSync(normalizedPath)) {
        // Strategy 1: Try filename only in docs root
        let tryPath = path.join(docsPath, path.basename(normalizedPath));
        if (fs.existsSync(tryPath)) {
          normalizedPath = tryPath;
        } else {
          // Strategy 2: Try to find in subdirectories (e.g., docs/neyzen/filename)
          const filename = path.basename(normalizedPath);
          const subdirs = ['neyzen', 'emlakai', 'imsdb', 'yky', 'iskultur', 'can'];

          for (const subdir of subdirs) {
            tryPath = path.join(docsPath, subdir, filename);
            if (fs.existsSync(tryPath)) {
              normalizedPath = tryPath;
              break;
            }
          }

          // Strategy 3: Try relative to project root
          if (!fs.existsSync(normalizedPath)) {
            normalizedPath = path.resolve(filePath);
          }
        }
      }

      console.log(`[PDF Extract] Attempting to extract text from: ${normalizedPath}`);

      if (!fs.existsSync(normalizedPath)) {
        return res.status(404).json({
          error: 'File not found',
          path: filePath,
          tried: normalizedPath
        });
      }

      try {
        console.log('[PDF Extract] Starting extraction for:', normalizedPath);
        console.log('[PDF Extract] File exists:', require('fs').existsSync(normalizedPath));

        // Try simple pdf-parse first (fastest, works for text-based PDFs)
        try {
          console.log('[PDF Extract] Trying pdf-parse...');
          const pdfParse = require('pdf-parse');
          const dataBuffer = require('fs').readFileSync(normalizedPath);
          const pdfData = await pdfParse(dataBuffer);

          console.log('[PDF Extract] pdf-parse result - text length:', pdfData.text?.length || 0, 'pages:', pdfData.numpages);

          if (pdfData.text && pdfData.text.trim().length > 50) {
            console.log('[PDF Extract] ✓ Extracted with pdf-parse:', pdfData.text.length, 'chars');

            // Format as markdown
            let markdown = pdfData.text.trim();

            // Clean up multiple newlines
            markdown = markdown.replace(/\n{3,}/g, '\n\n');

            // Add markdown formatting for better readability
            const lines = markdown.split('\n');
            const formatted = lines.map(line => {
              const trimmed = line.trim();
              // If line is all caps and short, make it a header
              if (trimmed.length > 0 && trimmed.length < 50 && trimmed === trimmed.toUpperCase()) {
                return `## ${trimmed}`;
              }
              return line;
            }).join('\n');

            return res.json({
              success: true,
              text: formatted,
              pages: pdfData.numpages || 1,
              confidence: 95,
              method: 'pdf-parse',
              path: normalizedPath
            });
          } else {
            console.log('[PDF Extract] pdf-parse returned insufficient text, will try OCR...');
          }
        } catch (pdfParseError) {
          console.log('[PDF Extract] pdf-parse failed:', pdfParseError.message);
        }

        // Fallback to OCR Router (Gemini/OpenAI/Tesseract)
        console.log('[PDF Extract] Trying OCR Router Service...');
        const result = await ocrRouterService.processDocument(normalizedPath, {
          fileType: 'pdf',
          language: 'tur+eng',
          prompt: 'Extract all text from this PDF and format it as clean markdown. Preserve structure and formatting.'
        });

        console.log('[PDF Extract] OCR Router result - text length:', result.text?.length || 0, 'method:', result.metadata?.provider);

        return res.json({
          success: true,
          text: result.text || '',
          pages: result.pages || 1,
          confidence: result.confidence || 0,
          method: result.metadata?.provider || 'ocr',
          path: normalizedPath
        });
      } catch (extractError) {
        console.error('[PDF Extract] Error:', extractError);
        console.error('[PDF Extract] Stack:', extractError.stack);
        return res.status(500).json({
          error: 'Failed to extract text',
          message: extractError.message,
          path: normalizedPath
        });
      }
    }

    // Batch processing with documentIds
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array or filePath is required' });
    }

    const jobId = require('crypto').randomUUID();
    console.log(`[PDF Text Extract] Starting job ${jobId} for ${documentIds.length} documents`);

    // Initialize job status
    await storeJobProgress(jobId, {
      type: 'text-extract',
      status: 'processing',
      current: 0,
      total: documentIds.length,
      percentage: 0,
      startedAt: new Date().toISOString()
    });

    // Start background processing
    processTextExtractionQueue(jobId, documentIds);

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: `Text extraction job started for ${documentIds.length} documents`
    });
  } catch (error) {
    console.error('[PDF Text Extract] Error starting job:', error);
    res.status(500).json({
      error: 'Failed to start text extraction job',
      message: error.message
    });
  }
});

/**
 * Background text extraction processor
 */
async function processTextExtractionQueue(jobId: string, documentIds: string[]): Promise<void> {
  const ocrService = OCRService.getInstance();
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < documentIds.length; i++) {
    const docId = documentIds[i];

    try {
      // Get document
      const docResult = await lsembPool.query(
        `SELECT id, title, file_path FROM documents WHERE id = $1`,
        [docId]
      );

      if (docResult.rows.length === 0) {
        console.error(`[Text Extract] Document ${docId} not found`);
        errorCount++;
        continue;
      }

      const doc = docResult.rows[0];

      // Update progress
      const percentage = Math.round(((i + 1) / documentIds.length) * 100);
      await storeJobProgress(jobId, {
        type: 'text-extract',
        status: 'processing',
        current: i + 1,
        total: documentIds.length,
        percentage,
        message: `Extracting text from ${doc.title}...`,
        currentFile: doc.title,
        successCount,
        errorCount
      });

      console.log(`[Text Extract] Processing ${doc.title} (${i + 1}/${documentIds.length})`);

      // Extract text using OCRService (pdf-parse)
      const result = await ocrService.extractFromPDF(doc.file_path);

      if (result.text && result.text.trim().length > 0 && result.confidence > 0) {
        // Save to database and update processing_status to analyzed
        await lsembPool.query(
          `UPDATE documents
           SET content = $1,
               processing_status = 'analyzed',
               metadata = jsonb_set(
                 COALESCE(metadata, '{}'),
                 '{textExtract}',
                 $2::jsonb
               ),
               updated_at = NOW()
           WHERE id = $3`,
          [
            result.text,
            JSON.stringify({
              extracted: true,
              confidence: result.confidence,
              method: 'pdf-parse',
              extractedAt: new Date().toISOString()
            }),
            docId
          ]
        );

        successCount++;
        console.log(`[Text Extract] ✓ ${doc.title} completed (${result.text.length} chars)`);
      } else {
        console.log(`[Text Extract] ⚠ ${doc.title} - no text found, may need OCR`);
        errorCount++;
      }
    } catch (error) {
      console.error(`[Text Extract] ✗ Error processing document ${docId}:`, error);
      errorCount++;
    }

    // Small delay between documents
    if (i < documentIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Mark job as complete
  await storeJobProgress(jobId, {
    type: 'text-extract',
    status: 'completed',
    current: documentIds.length,
    total: documentIds.length,
    percentage: 100,
    message: `Completed: ${successCount} success, ${errorCount} failed`,
    successCount,
    errorCount,
    completedAt: new Date().toISOString()
  });

  console.log(`[Text Extract] Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);
}

/**
 * POST /api/v2/pdf/batch-ocr
 * Process scanned PDFs through OCR queue (Gemini Vision)
 *
 * Body: { documentIds: string[] }
 */
router.post('/batch-ocr', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    const user = req.user;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    const jobId = require('crypto').randomUUID();

    console.log(`[PDF Batch] Starting OCR job ${jobId} for ${documentIds.length} documents`);

    // Initialize job status
    await storeJobProgress(jobId, {
      type: 'ocr',
      status: 'processing',
      current: 0,
      total: documentIds.length,
      percentage: 0,
      startedAt: new Date().toISOString()
    });

    // Start background processing (using OCR Router with active provider from settings)
    processOCRQueue(jobId, documentIds);

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: `OCR job started for ${documentIds.length} documents`
    });
  } catch (error) {
    console.error('[PDF Batch] Error starting OCR job:', error);
    res.json({
      error: 'Failed to start OCR job',
      message: error.message
    });
  }
});

/**
 * Background OCR processor (using OCR Router with settings-based provider)
 */
async function processOCRQueue(jobId: string, documentIds: string[]): Promise<void> {
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < documentIds.length; i++) {
    const docId = documentIds[i];

    try {
      // Get document
      const docResult = await lsembPool.query(
        `SELECT id, title, file_path FROM documents WHERE id = $1`,
        [docId]
      );

      if (docResult.rows.length === 0) {
        console.error(`[OCR Queue] Document ${docId} not found`);
        errorCount++;
        continue;
      }

      const doc = docResult.rows[0];

      // Update progress
      await storeJobProgress(jobId, {
        type: 'ocr',
        status: 'processing',
        current: i + 1,
        total: documentIds.length,
        percentage: ((i + 1) / documentIds.length) * 100,
        currentFile: doc.title,
        message: `Processing ${doc.title}...`,
        successCount,
        errorCount
      });

      console.log(`[OCR Queue] Processing ${doc.title} (${i + 1}/${documentIds.length})`);

      // Perform OCR using OCR Router (automatically uses active provider from settings)
      const ocrResult = await ocrRouterService.processDocument(doc.file_path, {
        provider: 'auto', // Let OCR Router choose based on settings
        detailLevel: 'high'
      });

      // Save to database and update processing_status to analyzed
      await lsembPool.query(
        `UPDATE documents
         SET content = $1,
             processing_status = 'analyzed',
             metadata = jsonb_set(
               COALESCE(metadata, '{}'),
               '{ocr}',
               $2::jsonb
             ),
             updated_at = NOW()
         WHERE id = $3`,
        [
          ocrResult.text,
          JSON.stringify({
            processed: true,
            confidence: ocrResult.confidence,
            provider: ocrResult.metadata?.provider || 'auto',
            model: ocrResult.metadata?.model,
            tokensUsed: ocrResult.metadata?.tokensUsed,
            processedAt: new Date().toISOString()
          }),
          docId
        ]
      );

      successCount++;
      console.log(`[OCR Queue] ✓ ${doc.title} completed (provider: ${ocrResult.metadata?.provider || 'auto'})`);

    } catch (error) {
      console.error(`[OCR Queue]  Error processing document ${docId}:`, error);
      errorCount++;
    }

    // Small delay between documents
    if (i < documentIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Mark job as complete
  await storeJobProgress(jobId, {
    type: 'ocr',
    status: 'completed',
    current: documentIds.length,
    total: documentIds.length,
    percentage: 100,
    successCount,
    errorCount,
    completedAt: new Date().toISOString()
  });

  console.log(`[OCR Queue] Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);
}

// ==================== STEP 3: METADATA ANALYSIS ====================

/**
 * POST /api/v2/pdf/batch-metadata
 * Extract metadata from PDFs using local libraries (pdf-parse, pdf-lib)
 * Gemini integration optional if API key is available
 *
 * Body: { documentIds: string[] }
 */
router.post('/batch-metadata', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds, template, focusKeywords, analysisPrompt } = req.body;
    const user = req.user;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    // Get Gemini API key from settings (optional)
    const settingsService = SettingsService.getInstance();
    const geminiApiKey = await settingsService.getSetting('google.apiKey');

    const jobId = require('crypto').randomUUID();

    console.log(`[PDF Batch] Starting metadata job ${jobId} for ${documentIds.length} documents`);
    console.log(`[PDF Batch] Template: ${template || 'none'}, Custom Prompt: ${analysisPrompt ? 'yes' : 'no'}`);
    console.log(`[PDF Batch] Using local extraction${geminiApiKey ? ' with Gemini enhancement' : ''}`);

    // Initialize job status
    await storeJobProgress(jobId, {
      type: 'metadata',
      status: 'processing',
      current: 0,
      total: documentIds.length,
      percentage: 0,
      startedAt: new Date().toISOString()
    });

    // Combine template keywords with custom focus keywords
    const allKeywords = [
      ...(template?.focus_keywords || []),
      ...(focusKeywords || [])
    ];

    // Enhanced options with template
    // Extract template type (id/template_id) if template is an object, otherwise use as-is
    const templateType = typeof template === 'object' ? (template.template_id || template.id) : template;
    const fullTemplateData = typeof template === 'object' ? template : null;

    console.log(`[PDF Batch] Template type: ${templateType}`);
    console.log(`[PDF Batch] Template data:`, fullTemplateData);
    console.log(`[PDF Batch] Target fields:`, fullTemplateData?.target_fields);
    console.log(`[PDF Batch] Focus keywords:`, allKeywords);

    const enhancedOptions = {
      apiKey: geminiApiKey,
      template: templateType,  // Pass template type string ('legal', 'novel', etc.)
      templateData: fullTemplateData,  // Pass full template object with target_fields
      analysisPrompt: analysisPrompt || template?.extraction_prompt,
      focusKeywords: allKeywords
    };

    // Start background processing
    processMetadataQueue(jobId, documentIds, enhancedOptions);

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: `Metadata extraction started for ${documentIds.length} documents`
    });
  } catch (error) {
    console.error('[PDF Batch] Error starting metadata job:', error);
    res.status(500).json({
      error: 'Failed to start metadata job',
      message: error.message
    });
  }
});

/**
 * Background metadata processor
 * Uses local PDF extraction (pdf-parse, pdf-lib) for offline metadata analysis
 * Enhanced with template-driven analysis and focus keywords
 */
async function processMetadataQueue(
  jobId: string,
  documentIds: string[],
  options?: {
    apiKey?: string;
    template?: any;  // Template ID (string) or template object
    templateData?: any;  // Full template object with target_fields, focus_keywords, extraction_prompt
    focusKeywords?: string[];  // Additional custom keywords
    analysisPrompt?: string;
  }
): Promise<void> {
  let successCount = 0;
  let errorCount = 0;

  try {
    // Get documents with file paths
    const documentsResult = await lsembPool.query(
      `SELECT id, title, file_path
       FROM documents
       WHERE id = ANY($1::int[])
       AND file_path IS NOT NULL`,
      [documentIds]
    );

    if (documentsResult.rows.length === 0) {
      console.error('[Metadata Queue] No documents found with valid file paths');
      await storeJobProgress(jobId, {
        type: 'metadata',
        status: 'error',
        error: 'No documents found with valid file paths',
        completedAt: new Date().toISOString()
      });
      return;
    }

    const documents = documentsResult.rows;
    console.log(`[Metadata Queue] Processing ${documents.length} documents with local extraction`);

    // Process each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      try {
        // Update progress - starting document
        await storeJobProgress(jobId, {
          type: 'metadata',
          status: 'processing',
          current: i + 1,
          total: documents.length,
          percentage: ((i + 1) / documents.length) * 100,
          currentFile: doc.title,
          message: `Analyzing ${doc.title} with LLM enrichment...`,
          currentDocument: doc.id.toString()
        });

        // Send WebSocket update
        const progressService = getProgressService();
        if (progressService) {
          await progressService.updateProgress(jobId, {
            type: 'metadata',
            status: 'processing',
            current: i + 1,
            total: documents.length,
            percentage: ((i + 1) / documents.length) * 100,
            currentFile: doc.title,
            message: `Analyzing ${doc.title} with LLM enrichment...`,
            currentDocument: doc.id.toString()
          });
        }

        console.log(`[Metadata Queue] Processing ${doc.title} (${i + 1}/${documents.length})`);
        console.log(`[Metadata Queue] Template: ${options.template?.name || 'none'}, Keywords:`, options.template?.focus_keywords || []);

        // Update progress - LLM enrichment starting
        if (options.template || options.focusKeywords?.length > 0) {
          await storeJobProgress(jobId, {
            type: 'metadata',
            status: 'processing',
            current: i + 1,
            total: documents.length,
            percentage: ((i + 1) / documents.length) * 100,
            currentFile: doc.title,
            message: `LLM enrichment in progress for ${doc.title}...`,
            currentDocument: doc.id.toString()
          });

          if (progressService) {
            await progressService.updateProgress(jobId, {
              type: 'metadata',
              status: 'processing',
              current: i + 1,
              total: documents.length,
              percentage: ((i + 1) / documents.length) * 100,
              currentFile: doc.title,
              message: `LLM enrichment in progress... Extracting entities and insights`,
              currentDocument: doc.id.toString()
            });
          }
        }

        // Get API keys from LLM Manager for enrichment
        const llmManager = LLMManager.getInstance();

        // Check for DeepSeek key in multiple places (LLM Manager, environment, settings)
        let deepseekKey = llmManager.getApiKey('deepseek');

        if (!deepseekKey) {
          // Try environment variable
          deepseekKey = process.env.DEEPSEEK_API_KEY;
        }

        if (!deepseekKey) {
          // Try to get from settings database
          try {
            const settingsService = new SettingsService();
            const deepseekSettings = await settingsService.getSetting('deepseek');
            deepseekKey = deepseekSettings as any;
          } catch (error) {
            console.warn('[Metadata Queue] Could not fetch DeepSeek key from settings:', error.message);
          }
        }

        const enrichedOptions = {
          ...options,
          apiKey: llmManager.getApiKey('google') || llmManager.getApiKey('gemini'),
          deepseekApiKey: deepseekKey,
          templateData: options.templateData  // Pass full template object
        };

        console.log(`[Metadata Queue] LLM keys available:`, {
          hasGoogleKey: !!enrichedOptions.apiKey,
          hasDeepSeekKey: !!enrichedOptions.deepseekApiKey
        });
        console.log(`[Metadata Queue] Template:`, options.template);
        console.log(`[Metadata Queue] Template target fields:`, options.templateData?.target_fields);

        // Extract metadata using local libraries (with LLM enrichment)
        const result = await pdfMetadataService.extractMetadata(
          doc.file_path,
          doc.id.toString(),
          doc.title,
          enrichedOptions
        );

        console.log(`[Metadata Queue] Extracted metadata:`, JSON.stringify(result.metadata, null, 2));

        // Add template information to metadata
        const metadataWithTemplate = {
          ...result.metadata,
          template: options.template || 'general',  // Save template type
          analyzedAt: new Date().toISOString()
        };

        console.log(`[Metadata Queue] Saving metadata with template: ${options.template}`);

        // Save to experimental cache (for comparison and iteration)
        try {
          const experimentalCache = getExperimentalCache();
          const isConnected = await experimentalCache.isConnected();

          if (isConnected) {
            const nextVersion = await experimentalCache.getNextVersion(doc.id.toString());
            await experimentalCache.saveExperiment(
              doc.id.toString(),
              nextVersion,
              options.template || 'general',
              result.metadata,  // Grouped structure: { common: {...}, templateData: {...} }
              {
                templateId: options.template,
                focusKeywords: options.templateData?.focus_keywords || [],
                customPrompt: options.analysisPrompt,
                llmProvider: enrichedOptions.apiKey ? 'gemini' : (enrichedOptions.deepseekApiKey ? 'deepseek' : 'unknown')
              }
            );
            console.log(`[Metadata Queue] Saved to experimental cache: ${doc.id} ${nextVersion}`);
          }
        } catch (cacheError) {
          console.warn(`[Metadata Queue] Experimental cache save failed (non-critical):`, cacheError.message);
        }

        // Save metadata to database
        // Clean metadata: remove undefined, NaN, Infinity values
        const cleanMetadata = JSON.parse(JSON.stringify(metadataWithTemplate));

        const updateResult = await lsembPool.query(
          `UPDATE documents
           SET metadata = jsonb_set(
             COALESCE(metadata, '{}'),
             '{analysis}',
             $1::jsonb
           ),
           updated_at = NOW()
           WHERE id = $2
           RETURNING id, metadata`,
          [JSON.stringify(cleanMetadata), doc.id]
        );

        console.log(`[Metadata Queue] Database update result:`, {
          rowCount: updateResult.rowCount,
          hasMetadata: !!updateResult.rows[0]?.metadata,
          hasAnalysis: !!updateResult.rows[0]?.metadata?.analysis,
          metadataKeys: updateResult.rows[0]?.metadata ? Object.keys(updateResult.rows[0].metadata) : []
        });

        successCount++;
        console.log(`[Metadata Queue]  ${doc.title} completed (${result.processingTime}ms)`);

      } catch (error) {
        console.error(`[Metadata Queue]  Error processing ${doc.title}:`, error);
        errorCount++;

        // Continue with next document
      }

      // Small delay between documents
      if (i < documents.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Mark job as complete
    await storeJobProgress(jobId, {
      type: 'metadata',
      status: 'completed',
      current: documents.length,
      total: documents.length,
      percentage: 100,
      successCount,
      errorCount,
      message: `Completed analysis of ${successCount} documents`,
      completedAt: new Date().toISOString()
    });

    // Send WebSocket completion update
    const progressService = getProgressService();
    if (progressService) {
      await progressService.completeJob(jobId, {
        message: `Successfully analyzed ${successCount} documents with LLM enrichment`,
        successCount,
        errorCount
      });
    }

    console.log(`[Metadata Queue] Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);

  } catch (error) {
    console.error(`[Metadata Queue] Job ${jobId} failed:`, error);

    await storeJobProgress(jobId, {
      type: 'metadata',
      status: 'error',
      error: error.message,
      successCount,
      errorCount,
      completedAt: new Date().toISOString()
    });

    // Send WebSocket error update
    const progressService = getProgressService();
    if (progressService) {
      await progressService.failJob(jobId, error.message);
    }
  }
}

// ==================== STEP 4: TRANSFORM TO SOURCE DB ====================

/**
 * POST /api/v2/pdf/transform-to-sourcedb
 * Transform PDF metadata to user's source database
 *
 * Body: {
 *   documentIds: string[],
 *   sourceDbId: string,
 *   tableName: string,
 *   tableStructure: 'entity-based' | 'document-based',
 *   createNewTable?: boolean
 * }
 */
router.post('/transform-to-sourcedb', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds, sourceDbId, tableName, tableStructure, createNewTable = true } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    if (!sourceDbId || !tableName || !tableStructure) {
      return res.status(400).json({
        error: 'sourceDbId, tableName, and tableStructure are required'
      });
    }

    if (!['entity-based', 'document-based'].includes(tableStructure)) {
      return res.status(400).json({
        error: 'tableStructure must be "entity-based" or "document-based"'
      });
    }

    const jobId = require('crypto').randomUUID();

    console.log(`[PDF Batch] Starting transform job ${jobId}`);

    // Initialize job status
    await storeJobProgress(jobId, {
      type: 'transform',
      status: 'processing',
      current: 0,
      total: documentIds.length,
      percentage: 0,
      rowsInserted: 0,
      tableName,
      startedAt: new Date().toISOString()
    });

    // Start background processing
    processTransform(jobId, {
      documentIds,
      sourceDbId,
      tableName,
      tableStructure,
      createNewTable
    });

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: `Transform job started for ${documentIds.length} documents`
    });
  } catch (error) {
    console.error('[PDF Batch] Error starting transform job:', error);
    res.status(500).json({
      error: 'Failed to start transform job',
      message: error.message
    });
  }
});

/**
 * Background transform processor
 */
async function processTransform(jobId: string, config: any): Promise<void> {
  try {
    const result = await pdfTransform.transformToSourceDb(config, (progress) => {
      storeJobProgress(jobId, {
        type: 'transform',
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percentage: progress.percentage,
        rowsInserted: progress.rowsInserted,
        currentDocument: progress.currentDocument,
        tableName: config.tableName
      });
    });

    // Mark job as complete
    await storeJobProgress(jobId, {
      type: 'transform',
      status: 'completed',
      current: config.documentIds.length,
      total: config.documentIds.length,
      percentage: 100,
      rowsInserted: result.rowsInserted,
      tableName: result.tableName,
      completedAt: new Date().toISOString(),
      result
    });

    console.log(`[Transform Queue] Job ${jobId} completed`);
  } catch (error) {
    console.error(`[Transform Queue] Job ${jobId} failed:`, error);

    await storeJobProgress(jobId, {
      type: 'transform',
      status: 'error',
      error: error.message,
      completedAt: new Date().toISOString()
    });
  }
}

// ==================== PREVIEW TRANSFORM ====================

/**
 * POST /api/v2/pdf/preview-transform
 * Preview transform data before executing
 *
 * Body: {
 *   documentIds: string[],
 *   tableStructure: 'entity-based' | 'document-based'
 * }
 */
router.post('/preview-transform', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds, tableStructure } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    if (!['entity-based', 'document-based'].includes(tableStructure)) {
      return res.status(400).json({
        error: 'tableStructure must be "entity-based" or "document-based"'
      });
    }

    const preview = await pdfTransform.previewTransform(documentIds, tableStructure);

    res.json({
      success: true,
      preview
    });
  } catch (error) {
    console.error('[PDF Batch] Error previewing transform:', error);
    res.status(500).json({
      error: 'Failed to preview transform',
      message: error.message
    });
  }
});

// ==================== JOB STATUS ====================

/**
 * GET /api/v2/pdf/job-status/:jobId
 * Get job progress/status
 */
router.get('/job-status/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    console.log(`[PDF Batch] Job status requested for: ${jobId}`);

    const progress = await getJobProgress(jobId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    // Send WebSocket update as well (for real-time updates)
    const progressService = getProgressService();
    if (progressService) {
      await progressService.updateProgress(jobId, {
        type: progress.type,
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percentage: progress.percentage,
        currentFile: progress.currentFile,
        message: progress.message,
        currentDocument: progress.currentDocument
      });
    }

    res.json({
      success: true,
      jobId,
      progress
    });
  } catch (error) {
    console.error('[PDF Batch] Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      message: error.message
    });
  }
});

// ==================== CANCEL JOB ====================

/**
 * POST /api/v2/pdf/cancel-job/:jobId
 * Cancel a running job
 */
router.post('/cancel-job/:jobId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    const progress = await getJobProgress(jobId);

    if (!progress) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Mark as cancelled
    await storeJobProgress(jobId, {
      ...progress,
      status: 'cancelled',
      cancelledAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
  } catch (error) {
    console.error('[PDF Batch] Error cancelling job:', error);
    res.status(500).json({
      error: 'Failed to cancel job',
      message: error.message
    });
  }
});

// ==================== METADATA FIELD TRANSFORM ====================

/**
 * POST /api/v2/pdf/metadata-transform
 * Transform selected PDF metadata fields to database table
 *
 * Body: {
 *   documentId: string,
 *   selectedFields: string[],
 *   tableName: string,
 *   useExistingTable: boolean,
 *   sourceDbId: string
 * }
 */
router.post('/metadata-transform', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      documentId,
      selectedFields,
      tableName,
      useExistingTable,
      sourceDbId,
      fieldMappings,
      isCustomSchema,
      customSchema,
      createTableSQL
    } = req.body;

    // Custom schema mode validation
    if (isCustomSchema) {
      if (!documentId || !tableName || !customSchema || !createTableSQL) {
        return res.status(400).json({ error: 'documentId, tableName, customSchema, and createTableSQL are required for custom schema mode' });
      }
    } else {
      // Template-based mode validation
      if (!documentId || !selectedFields || !Array.isArray(selectedFields) || selectedFields.length === 0) {
        return res.status(400).json({ error: 'documentId and selectedFields array are required' });
      }
    }

    if (!tableName) {
      return res.status(400).json({ error: 'tableName is required' });
    }

    if (!sourceDbId) {
      return res.status(400).json({ error: 'sourceDbId is required (database name)' });
    }

    // Validate field mappings if using existing table
    if (useExistingTable && (!fieldMappings || Object.keys(fieldMappings).length === 0)) {
      return res.status(400).json({ error: 'fieldMappings are required when using existing table' });
    }

    const jobId = require('crypto').randomUUID();

    console.log(`[PDF Metadata Transform] Starting job ${jobId}`);
    console.log(`[PDF Metadata Transform] Document: ${documentId}`);
    console.log(`[PDF Metadata Transform] Mode: ${isCustomSchema ? 'Custom Schema' : 'Template-based'}`);

    if (isCustomSchema) {
      console.log(`[PDF Metadata Transform] Custom table: ${tableName}`);
      console.log(`[PDF Metadata Transform] Fields:`, customSchema.fields?.map(f => f.name).join(', '));
    } else {
      console.log(`[PDF Metadata Transform] Fields: ${selectedFields.join(', ')}`);
      console.log(`[PDF Metadata Transform] Table: ${tableName} (${useExistingTable ? 'existing' : 'new'})`);
      if (useExistingTable) {
        console.log(`[PDF Metadata Transform] Field mappings:`, fieldMappings);
      }
    }

    // Initialize job status
    await storeJobProgress(jobId, {
      type: 'metadata-transform',
      status: 'processing',
      current: 0,
      total: 1,
      percentage: 0,
      tableName,
      startedAt: new Date().toISOString()
    });

    // Start background processing
    processMetadataTransform(jobId, {
      documentId,
      selectedFields: selectedFields || [],
      tableName,
      useExistingTable,
      sourceDbId,
      fieldMappings: fieldMappings || {},
      isCustomSchema,
      customSchema,
      createTableSQL
    });

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: `Metadata transform job started for document ${documentId}`
    });
  } catch (error) {
    console.error('[PDF Metadata Transform] Error starting job:', error);
    res.status(500).json({
      error: 'Failed to start metadata transform',
      message: error.message
    });
  }
});

/**
 * Background metadata transform processor
 */
async function processMetadataTransform(jobId: string, config: any): Promise<void> {
  const { Pool } = require('pg');
  let sourceDb: any = null;

  try {
    // Sanitize table name: PostgreSQL table names cannot start with a number
    if (config.tableName && /^\d/.test(config.tableName)) {
      config.tableName = `pdf_${config.tableName}`;
    }

    console.log(`[Metadata Transform] Job ${jobId} starting`);

    // Update progress
    await storeJobProgress(jobId, {
      type: 'metadata-transform',
      status: 'processing',
      current: 0,
      total: 1,
      percentage: 10,
      currentStep: 'Fetching document metadata',
      tableName: config.tableName
    });

    // Get document with metadata
    const docResult = await lsembPool.query(
      `SELECT id, title, metadata FROM documents WHERE id = $1`,
      [config.documentId]
    );

    if (docResult.rows.length === 0) {
      throw new Error(`Document ${config.documentId} not found`);
    }

    const doc = docResult.rows[0];
    const metadata = doc.metadata?.analysis;

    if (!metadata) {
      throw new Error(`Document ${config.documentId} has no metadata analysis`);
    }

    console.log(`[Metadata Transform] Document: ${doc.title}`);
    console.log(`[Metadata Transform] Metadata keys:`, Object.keys(metadata));

    // Update progress
    await storeJobProgress(jobId, {
      type: 'metadata-transform',
      status: 'processing',
      current: 0,
      total: 1,
      percentage: 30,
      currentStep: 'Connecting to database',
      tableName: config.tableName
    });

    // Get database settings from settings table
    const dbSettingsResult = await lsembPool.query(
      `SELECT key, value FROM settings WHERE key LIKE 'database.%'`
    );

    const dbSettings: any = {};
    dbSettingsResult.rows.forEach((row: any) => {
      const key = row.key.replace('database.', '');
      try {
        dbSettings[key] = JSON.parse(row.value);
      } catch {
        dbSettings[key] = row.value;
      }
    });

    if (!dbSettings.host || !dbSettings.user) {
      throw new Error('Database settings not configured');
    }

    // Create source database connection
    sourceDb = new Pool({
      host: dbSettings.host,
      port: parseInt(dbSettings.port) || 5432,
      database: config.sourceDbId,
      user: dbSettings.user,
      password: dbSettings.password || '',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    // Test connection
    await sourceDb.query('SELECT 1');
    console.log(`[Metadata Transform] Connected to database: ${config.sourceDbId}`);

    // Update progress
    await storeJobProgress(jobId, {
      type: 'metadata-transform',
      status: 'processing',
      current: 0,
      total: 1,
      percentage: 50,
      currentStep: config.useExistingTable ? 'Preparing insert' : 'Creating table',
      tableName: config.tableName
    });

    // Handle custom schema mode
    if (config.isCustomSchema) {
      console.log(`[Metadata Transform] Using custom schema mode`);

      // Create table using provided SQL
      if (config.createTableSQL) {
        console.log(`[Metadata Transform] Creating custom table with SQL:\n${config.createTableSQL}`);
        await sourceDb.query(config.createTableSQL);
        console.log(`[Metadata Transform] Custom table ${config.tableName} created`);
      }
    } else {
      // Template-based mode (existing logic)
      const sqlSchema = generateSQLFromFields(config.selectedFields, metadata, config.tableName, config.useExistingTable);

      console.log(`[Metadata Transform] SQL Schema:\n${sqlSchema.createTableSQL || sqlSchema.comment}`);

      // Create table if needed
      if (!config.useExistingTable && sqlSchema.createTableSQL) {
        await sourceDb.query(sqlSchema.createTableSQL);
        console.log(`[Metadata Transform] Table ${config.tableName} created`);
      }
    }

    // Update progress
    await storeJobProgress(jobId, {
      type: 'metadata-transform',
      status: 'processing',
      current: 0,
      total: 1,
      percentage: 70,
      currentStep: 'Inserting data',
      tableName: config.tableName
    });

    // Prepare insert values
    const insertValues: any = {};

    if (config.isCustomSchema && config.customSchema) {
      // Custom schema mode - extract data based on field definitions
      console.log(`[Metadata Transform] Extracting data for custom schema`);

      // Get document content
      const contentResult = await lsembPool.query(
        `SELECT content FROM documents WHERE id = $1`,
        [config.documentId]
      );
      const content = contentResult.rows[0]?.content || '';

      // Use LLM to extract values for custom fields
      const llmManager = require('../services/llm-manager.service').default;
      const extractionPrompt = `Extract the following information from this document:

${config.customSchema.fields.map(f => `- ${f.name}: ${f.description || f.name}`).join('\n')}

Document content:
${content.substring(0, 8000)}

Return the extracted data as a JSON object with field names as keys. For fields not found, use null.`;

      try {
        const extractionResponse = await llmManager.generateText(extractionPrompt, {
          temperature: 0.1,
          maxTokens: 2000
        });

        const extractedData = JSON.parse(extractionResponse.replace(/```json\n?|\n?```/g, '').trim());

        // Map extracted data to insert values
        for (const field of config.customSchema.fields) {
          insertValues[field.name] = extractedData[field.name] || null;
        }
      } catch (extractError) {
        console.error(`[Metadata Transform] LLM extraction error:`, extractError);
        // Fall back to empty values
        for (const field of config.customSchema.fields) {
          insertValues[field.name] = null;
        }
      }

      // Add document reference
      insertValues.document_id = doc.id;

    } else if (config.useExistingTable && config.fieldMappings) {
      // Use field mappings for existing table
      console.log(`[Metadata Transform] Using field mappings for existing table`);

      for (const [metadataField, targetColumn] of Object.entries(config.fieldMappings)) {
        const value = getNestedValue(metadata, metadataField);
        insertValues[targetColumn] = value as any;
      }
    } else {
      // Create new table - use automatic column names
      insertValues.document_id = doc.id;
      insertValues.document_title = doc.title;

      for (const field of config.selectedFields) {
        const value = getNestedValue(metadata, field);
        const columnName = field.replace(/\./g, '_');
        insertValues[columnName] = value;
      }
    }

    // Generate and execute INSERT
    const columns = Object.keys(insertValues);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map(col => {
      const val = insertValues[col];
      // Convert arrays to PostgreSQL array format
      if (Array.isArray(val)) {
        return val;
      }
      // Convert objects to JSON string for JSONB/JSON columns
      if (val !== null && typeof val === 'object') {
        return JSON.stringify(val);
      }
      // If string looks like JSON, try to parse and re-stringify to ensure valid JSON
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try {
          const parsed = JSON.parse(val);
          return JSON.stringify(parsed);
        } catch {
          // Not valid JSON, return as-is
          return val;
        }
      }
      return val;
    });

    const insertSQL = `
      INSERT INTO ${config.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
    `;

    console.log(`[Metadata Transform] Inserting data to columns:`, Object.keys(insertValues));
    await sourceDb.query(insertSQL, values);
    console.log(`[Metadata Transform] Data inserted successfully`);

    // Save transform template to document metadata for future batch processing
    try {
      // Extract CREATE TABLE and INSERT SQL from the generated schema
      const fullSQL = '';
      const createTableSQL = fullSQL.split('-- Insert with')[0]?.trim() || '';
      const insertSQL = fullSQL.includes('-- Insert with') ?
        fullSQL.substring(fullSQL.indexOf('-- Insert with')) : '';

      const transformTemplate = {
        selectedFields: config.selectedFields,
        tableName: config.tableName,
        sourceDatabase: config.sourceDbId,
        createTableSQL: createTableSQL,
        insertSQL: insertSQL,
        createdAt: new Date().toISOString()
      };

      await lsembPool.query(
        `UPDATE documents
         SET metadata = jsonb_set(
           jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{selectedFields}',
             $1::jsonb
           ),
           '{transformTemplate}',
           $2::jsonb
         )
         WHERE id = $3`,
        [
          JSON.stringify(config.selectedFields),
          JSON.stringify(transformTemplate),
          config.documentId
        ]
      );
      console.log(`[Metadata Transform] Saved transform template to document metadata`);
    } catch (metadataError) {
      console.error(`[Metadata Transform] Failed to save transform template:`, metadataError);
      // Don't fail the job if metadata update fails
    }

    // Complete
    await storeJobProgress(jobId, {
      type: 'metadata-transform',
      status: 'completed',
      current: 1,
      total: 1,
      percentage: 100,
      rowsInserted: 1,
      tableName: config.tableName,
      completedAt: new Date().toISOString()
    });

    console.log(`[Metadata Transform] Job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`[Metadata Transform] Job ${jobId} failed:`, error);

    await storeJobProgress(jobId, {
      type: 'metadata-transform',
      status: 'error',
      error: error.message,
      completedAt: new Date().toISOString()
    });
  } finally {
    if (sourceDb) {
      await sourceDb.end();
      console.log(`[Metadata Transform] Database connection closed`);
    }
  }
}

/**
 * Generate SQL schema from selected metadata fields
 */
function generateSQLFromFields(
  selectedFields: string[],
  metadata: any,
  tableName: string,
  useExistingTable: boolean
): { createTableSQL?: string; comment?: string } {
  if (useExistingTable) {
    return {
      comment: `-- Insert into existing table: ${tableName}\n-- Selected fields will be mapped to table columns`
    };
  }

  // Generate columns based on selected fields
  const columns: string[] = [
    '  id SERIAL PRIMARY KEY',
    '  document_id INTEGER',
    '  document_title TEXT'
  ];

  for (const field of selectedFields) {
    const columnName = field.replace(/\./g, '_');
    let sqlType = 'TEXT';

    // Detect SQL type based on field name and value
    if (field.includes('Count') || field.includes('pageCount') || field.includes('wordCount')) {
      sqlType = 'INTEGER';
    } else if (field.includes('Minutes') || field.includes('average') || field.includes('score')) {
      sqlType = 'NUMERIC';
    } else if (field.match(/(keywords|topics|chapters|sections|headings|mainCharacters|people|organizations|locations|dates|money)/)) {
      sqlType = 'TEXT[]';
    } else if (field.includes('has') || field === 'hasTableOfContents') {
      sqlType = 'BOOLEAN';
    } else if (typeof getNestedValue(metadata, field) === 'object') {
      sqlType = 'JSONB';
    }

    columns.push(`  ${columnName} ${sqlType}`);
  }

  columns.push('  created_at TIMESTAMP DEFAULT NOW()');

  const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (\n${columns.join(',\n')}\n);`;

  return { createTableSQL };
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Get database configuration from settings
 */
function getDatabaseConfig(sourceDbId: string): any {
  // For localhost development, use environment variables
  // In production, this should fetch from settings table
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'Semsiye!22',
    database: sourceDbId || process.env.POSTGRES_DB || 'scriptus_lsemb'
  };
}

// ==================== SAVE TRANSFORM SCHEMA ====================

/**
 * POST /api/v2/pdf/save-transform-schema
 * Save transform schema for reuse in batch processing
 */
router.post('/save-transform-schema', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      templateId,
      tableName,
      selectedFields,
      fieldMappings,
      sqlInsert,
      documentId
    } = req.body;

    if (!templateId || !tableName || !selectedFields) {
      return res.status(400).json({
        error: 'templateId, tableName and selectedFields are required'
      });
    }

    console.log(`[Transform Schema] Saving schema for template ${templateId} -> table ${tableName}`);

    // Save to database for reuse
    const result = await lsembPool.query(
      `INSERT INTO transform_schemas (
        template_id,
        table_name,
        selected_fields,
        field_mappings,
        sql_insert,
        sample_document_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (template_id, table_name)
      DO UPDATE SET
        selected_fields = $3,
        field_mappings = $4,
        sql_insert = $5,
        sample_document_id = $6,
        updated_at = NOW()
      RETURNING id`,
      [
        templateId,
        tableName,
        JSON.stringify(selectedFields),
        JSON.stringify(fieldMappings || {}),
        sqlInsert,
        documentId
      ]
    );

    console.log(`[Transform Schema] Schema saved with id: ${result.rows[0].id}`);

    res.json({
      success: true,
      schemaId: result.rows[0].id,
      message: 'Transform schema saved successfully'
    });

  } catch (error) {
    console.error('[Transform Schema] Error saving schema:', error);
    res.status(500).json({
      error: 'Failed to save transform schema',
      message: error.message
    });
  }
});

/**
 * GET /api/v2/pdf/transform-schemas/:templateId
 * Get saved transform schemas for a template
 */
router.get('/transform-schemas/:templateId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId } = req.params;

    const result = await lsembPool.query(
      `SELECT * FROM transform_schemas
       WHERE template_id = $1
       ORDER BY updated_at DESC`,
      [templateId]
    );

    res.json({
      success: true,
      schemas: result.rows.map(row => ({
        ...row,
        selected_fields: JSON.parse(row.selected_fields || '[]'),
        field_mappings: JSON.parse(row.field_mappings || '{}')
      }))
    });

  } catch (error) {
    // Table might not exist yet
    if (error.code === '42P01') {
      // Create table
      await lsembPool.query(`
        CREATE TABLE IF NOT EXISTS transform_schemas (
          id SERIAL PRIMARY KEY,
          template_id VARCHAR(100) NOT NULL,
          table_name VARCHAR(255) NOT NULL,
          selected_fields JSONB,
          field_mappings JSONB,
          sql_insert TEXT,
          sample_document_id INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(template_id, table_name)
        )
      `);

      res.json({
        success: true,
        schemas: []
      });
    } else {
      console.error('[Transform Schemas] Error:', error);
      res.status(500).json({
        error: 'Failed to fetch transform schemas',
        message: error.message
      });
    }
  }
});

// ==================== GET SOURCE TABLES ====================

/**
 * GET /api/v2/pdf/source-tables
 * Get list of tables from source database
 */
router.get('/source-tables', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { Pool } = require('pg');
  let sourceDb: any = null;

  try {
    // Get database settings from settings table
    const dbSettingsResult = await lsembPool.query(
      `SELECT key, value FROM settings WHERE key LIKE 'database.%'`
    );

    const dbSettings: any = {};
    dbSettingsResult.rows.forEach((row: any) => {
      const key = row.key.replace('database.', '');
      try {
        dbSettings[key] = JSON.parse(row.value);
      } catch {
        dbSettings[key] = row.value;
      }
    });

    const sourceDbId = dbSettings.name || 'scriptus_lsemb';

    if (!dbSettings.host || !dbSettings.user) {
      return res.status(500).json({ error: 'Database settings not configured' });
    }

    // Create connection to source database
    sourceDb = new Pool({
      host: dbSettings.host || 'localhost',
      port: parseInt(dbSettings.port) || 5432,
      database: sourceDbId,
      user: dbSettings.user || 'postgres',
      password: dbSettings.password || '',
      max: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    // Get public tables (excluding system tables)
    const result = await sourceDb.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns', 'raster_columns', 'raster_overviews')
      ORDER BY table_name
    `);

    console.log(`[Source Tables] Found ${result.rows.length} tables in ${sourceDbId}`);

    res.json({
      success: true,
      database: sourceDbId,
      tables: result.rows.map(row => row.table_name)
    });

  } catch (error) {
    console.error('[Source Tables] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch tables',
      message: error.message
    });
  } finally {
    if (sourceDb) {
      await sourceDb.end();
    }
  }
});

// ==================== GET TABLE COLUMNS ====================

/**
 * GET /api/v2/pdf/table-columns/:sourceDbId/:tableName
 * Get columns of a table in source database
 */
router.get('/table-columns/:sourceDbId/:tableName', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { Pool } = require('pg');
  let sourceDb: any = null;

  try {
    const { sourceDbId, tableName } = req.params;

    console.log(`[PDF Table Columns] Getting columns for ${sourceDbId}.${tableName}`);

    // Get database settings
    const dbSettingsResult = await lsembPool.query(
      `SELECT key, value FROM settings WHERE key LIKE 'database.%'`
    );

    const dbSettings: any = {};
    dbSettingsResult.rows.forEach((row: any) => {
      const key = row.key.replace('database.', '');
      try {
        dbSettings[key] = JSON.parse(row.value);
      } catch {
        dbSettings[key] = row.value;
      }
    });

    if (!dbSettings.host || !dbSettings.user) {
      return res.status(500).json({ error: 'Database settings not configured' });
    }

    // Create connection
    sourceDb = new Pool({
      host: dbSettings.host,
      port: parseInt(dbSettings.port) || 5432,
      database: sourceDbId,
      user: dbSettings.user,
      password: dbSettings.password || '',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    // Test connection
    await sourceDb.query('SELECT 1');

    // Get table columns
    const columnsResult = await sourceDb.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    const columns = columnsResult.rows.map((row: any) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      hasDefault: !!row.column_default
    }));

    console.log(`[PDF Table Columns] Found ${columns.length} columns`);

    res.json({
      success: true,
      columns
    });
  } catch (error) {
    console.error('[PDF Table Columns] Error:', error);
    res.status(500).json({
      error: 'Failed to get table columns',
      message: error.message
    });
  } finally {
    if (sourceDb) {
      await sourceDb.end();
    }
  }
});

/**
 * GET /api/v2/pdf/available-tables/:sourceDbId
 * Get list of available tables in source database
 */
router.get('/available-tables/:sourceDbId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { Pool } = require('pg');
  let sourceDb: any = null;

  try {
    const { sourceDbId } = req.params;

    console.log(`[PDF Available Tables] Getting tables for ${sourceDbId}`);

    // Get database settings
    const dbSettingsResult = await lsembPool.query(
      `SELECT key, value FROM settings WHERE key LIKE 'database.%'`
    );

    const dbSettings: any = {};
    dbSettingsResult.rows.forEach((row: any) => {
      const key = row.key.replace('database.', '');
      try {
        dbSettings[key] = JSON.parse(row.value);
      } catch {
        dbSettings[key] = row.value;
      }
    });

    if (!dbSettings.host || !dbSettings.user) {
      return res.status(500).json({ error: 'Database settings not configured' });
    }

    // Create connection
    sourceDb = new Pool({
      host: dbSettings.host,
      port: parseInt(dbSettings.port) || 5432,
      database: sourceDbId,
      user: dbSettings.user,
      password: dbSettings.password || '',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    // Test connection
    await sourceDb.query('SELECT 1');

    // Get tables
    const tablesResult = await sourceDb.query(`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map((row: any) => row.tablename);

    console.log(`[PDF Available Tables] Found ${tables.length} tables`);

    res.json({
      success: true,
      tables
    });
  } catch (error) {
    console.error('[PDF Available Tables] Error:', error);
    res.status(500).json({
      error: 'Failed to get available tables',
      message: error.message
    });
  } finally {
    if (sourceDb) {
      await sourceDb.end();
    }
  }
});

// ==================== PDF SCHEMA MANAGEMENT ====================

/**
 * GET /api/v2/pdf/schemas
 * Get all PDF schemas
 */
router.get('/schemas', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schemas = await pdfSchemaService.getAll();

    res.json({
      success: true,
      schemas
    });
  } catch (error) {
    console.error('[PDF Schemas] Error getting schemas:', error);
    res.status(500).json({
      error: 'Failed to get schemas',
      message: error.message
    });
  }
});

/**
 * GET /api/v2/pdf/schemas/:id
 * Get schema by ID
 */
router.get('/schemas/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const schema = await pdfSchemaService.getById(id);

    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    console.error('[PDF Schemas] Error getting schema:', error);
    res.status(500).json({
      error: 'Failed to get schema',
      message: error.message
    });
  }
});

/**
 * POST /api/v2/pdf/schemas
 * Create new PDF schema
 *
 * Body: {
 *   name: string,
 *   description?: string,
 *   documentType?: string,
 *   category?: string,
 *   fieldSelections: string[],
 *   sqlSchema: { tableName, columns },
 *   analyzeConfig?: object,
 *   targetTableName?: string,
 *   sourceDatabase?: string,
 *   sampleJson?: object
 * }
 */
router.post('/schemas', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schemaData = req.body;

    if (!schemaData.name || !schemaData.fieldSelections || !schemaData.sqlSchema) {
      return res.status(400).json({
        error: 'name, fieldSelections, and sqlSchema are required'
      });
    }

    const schema = await pdfSchemaService.create(schemaData);

    console.log(`[PDF Schemas] Created schema: ${schema.name}`);

    res.json({
      success: true,
      schema,
      message: `Schema "${schema.name}" created successfully`
    });
  } catch (error) {
    console.error('[PDF Schemas] Error creating schema:', error);

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Schema name already exists',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create schema',
      message: error.message
    });
  }
});

/**
 * PUT /api/v2/pdf/schemas/:id
 * Update existing schema
 */
router.put('/schemas/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const schema = await pdfSchemaService.update(id, updates);

    console.log(`[PDF Schemas] Updated schema: ${schema.name}`);

    res.json({
      success: true,
      schema,
      message: `Schema "${schema.name}" updated successfully`
    });
  } catch (error) {
    console.error('[PDF Schemas] Error updating schema:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Schema not found',
        message: error.message
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Schema name already exists',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to update schema',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v2/pdf/schemas/:id
 * Delete schema
 */
router.delete('/schemas/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await pdfSchemaService.delete(id);

    console.log(`[PDF Schemas] Deleted schema: ${id}`);

    res.json({
      success: true,
      message: 'Schema deleted successfully'
    });
  } catch (error) {
    console.error('[PDF Schemas] Error deleting schema:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Schema not found',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to delete schema',
      message: error.message
    });
  }
});

/**
 * POST /api/v2/pdf/batch-metadata-transform
 * Transform multiple PDFs using a saved schema
 *
 * Body: {
 *   documentIds: string[],
 *   schemaId?: string,  // Use saved schema
 *   OR
 *   schema: {           // Use custom schema
 *     fieldSelections: string[],
 *     tableName: string,
 *     useExistingTable: boolean,
 *     sourceDbId: string,
 *     fieldMappings?: object
 *   }
 * }
 */
router.post('/batch-metadata-transform', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentIds, schemaId, schema: customSchema } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    let schema: any;

    // Load schema (either saved or custom)
    if (schemaId) {
      schema = await pdfSchemaService.getById(schemaId);
      if (!schema) {
        return res.status(404).json({ error: 'Schema not found' });
      }

      // Increment usage count
      await pdfSchemaService.incrementUsage(schemaId);
    } else if (customSchema) {
      schema = customSchema;
    } else {
      return res.status(400).json({ error: 'Either schemaId or schema is required' });
    }

    const jobId = require('crypto').randomUUID();

    console.log(`[PDF Batch Transform] Starting job ${jobId}`);
    console.log(`[PDF Batch Transform] Documents: ${documentIds.length}`);
    console.log(`[PDF Batch Transform] Table: ${schema.targetTableName || schema.tableName}`);

    // Initialize job status
    await storeJobProgress(jobId, {
      type: 'batch-metadata-transform',
      status: 'processing',
      current: 0,
      total: documentIds.length,
      percentage: 0,
      tableName: schema.targetTableName || schema.tableName,
      startedAt: new Date().toISOString()
    });

    // Start background processing
    processBatchMetadataTransform(jobId, {
      documentIds,
      schema,
      schemaId
    });

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: `Batch metadata transform job started for ${documentIds.length} documents`
    });
  } catch (error) {
    console.error('[PDF Batch Transform] Error starting job:', error);
    res.status(500).json({
      error: 'Failed to start batch metadata transform',
      message: error.message
    });
  }
});

/**
 * Background batch metadata transform processor
 */
async function processBatchMetadataTransform(jobId: string, config: any): Promise<void> {
  const { Pool } = require('pg');
  let sourceDb: any = null;

  try {
    const { documentIds, schema, schemaId } = config;
    let tableName = schema.targetTableName || schema.tableName || schema.sqlSchema?.tableName;

    // Sanitize table name: PostgreSQL table names cannot start with a number
    if (/^\d/.test(tableName)) {
      tableName = `pdf_${tableName}`;
    }

    const sourceDbId = schema.sourceDatabase || schema.sourceDbId || 'source_db';
    const selectedFields = schema.fieldSelections || schema.selectedFields;
    const useExistingTable = schema.useExistingTable !== undefined ? schema.useExistingTable : true;
    const fieldMappings = schema.fieldMappings || {};

    console.log(`[Batch Transform] Processing ${documentIds.length} documents`);

    // Connect to source database
    const { host, port, user, password, database } = getDatabaseConfig(sourceDbId);

    sourceDb = new Pool({
      host,
      port,
      user,
      password,
      database,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    // Create table if needed
    if (!useExistingTable && schema.sqlSchema) {
      const columns = schema.sqlSchema.columns.map((col: any) => {
        let colDef = `${col.name} ${col.type}`;
        if (col.isPrimary) colDef += ' PRIMARY KEY';
        if (col.nullable === false) colDef += ' NOT NULL';
        if (col.default) colDef += ` DEFAULT ${col.default}`;
        return colDef;
      }).join(',\n  ');

      const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns}\n);`;

      console.log(`[Batch Transform] Creating table: ${tableName}`);
      await sourceDb.query(createTableSQL);
    }

    // Process each document
    for (let i = 0; i < documentIds.length; i++) {
      const documentId = documentIds[i];

      try {
        // Get document info first
        const documentResult = await lsembPool.query(
          `SELECT id, title, metadata
           FROM documents
           WHERE id = $1`,
          [documentId]
        );

        if (documentResult.rows.length === 0) {
          console.warn(`[Batch Transform] Document ${documentId} not found, skipping`);
          continue;
        }

        const doc = documentResult.rows[0];
        const metadata = doc.metadata?.analysis || {};
        const docTitle = doc.title || `Document ${documentId}`;

        // Update progress
        await storeJobProgress(jobId, {
          type: 'batch-metadata-transform',
          status: 'processing',
          current: i + 1,
          total: documentIds.length,
          percentage: Math.round(((i + 1) / documentIds.length) * 100),
          currentDocument: documentId,
          currentFile: docTitle,
          tableName,
          message: `Processing ${docTitle} (${i + 1}/${documentIds.length})`
        });

        // Send WebSocket progress update
        const progressService = getProgressService();
        if (progressService) {
          await progressService.updateProgress(jobId, {
            type: 'batch-metadata-transform',
            status: 'processing',
            current: i + 1,
            total: documentIds.length,
            percentage: Math.round(((i + 1) / documentIds.length) * 100),
            currentFile: docTitle,
            message: `Processing ${docTitle} (${i + 1}/${documentIds.length})`,
            currentDocument: documentId
          });
        }

        // Extract values for selected fields
        const values: any = {};
        const insertColumns: string[] = [];
        const insertValues: any[] = [];
        let placeholderIndex = 1;

        for (const field of selectedFields) {
          const value = getNestedValue(metadata, field);
          const columnName = useExistingTable && fieldMappings[field]
            ? fieldMappings[field]
            : field.replace(/\./g, '_');

          if (value !== undefined && value !== null) {
            insertColumns.push(columnName);
            insertValues.push(value);
          }
        }

        // Insert into table
        if (insertColumns.length > 0) {
          const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(', ');
          const insertSQL = `INSERT INTO ${tableName} (${insertColumns.join(', ')})
                             VALUES (${placeholders})`;

          await sourceDb.query(insertSQL, insertValues);

          console.log(`[Batch Transform] Inserted document ${documentId} into ${tableName}`);
        }
      } catch (error) {
        console.error(`[Batch Transform] Error processing document ${documentId}:`, error);
        // Continue with next document
      }
    }

    // Mark job as complete
    await storeJobProgress(jobId, {
      type: 'batch-metadata-transform',
      status: 'completed',
      current: documentIds.length,
      total: documentIds.length,
      percentage: 100,
      tableName,
      message: `Successfully processed ${documentIds.length} documents`
    });

    // Send WebSocket completion update
    const progressService = getProgressService();
    if (progressService) {
      await progressService.completeJob(jobId, {
        message: `Successfully processed ${documentIds.length} documents`,
        tableName
      });
    }

    console.log(`[Batch Transform] Job ${jobId} completed`);
  } catch (error) {
    console.error(`[Batch Transform] Job ${jobId} failed:`, error);

    await storeJobProgress(jobId, {
      type: 'batch-metadata-transform',
      status: 'error',
      error: error.message,
      message: `Batch transform failed: ${error.message}`
    });

    // Send WebSocket error update
    const progressService = getProgressService();
    if (progressService) {
      await progressService.failJob(jobId, error.message);
    }
  } finally {
    if (sourceDb) {
      await sourceDb.end();
    }
  }
}

// ==================== BATCH ANALYZE FOR EMBEDDING ====================

/**
 * POST /api/v2/pdf/batch-analyze
 * Batch analyze PDFs: detect if OCR needed, extract text, update documents.content
 * This prepares documents for embedding by ensuring content is populated.
 *
 * Body: { documentIds: string[] }
 * Response: { success, jobId, status }
 */
router.post('/batch-analyze', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  console.log('[Batch Analyze] POST /batch-analyze - Request received');

  try {
    const { documentIds } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    const crypto = require('crypto');
    const jobId = crypto.randomUUID();

    // Initialize job status
    await storeJobProgress(jobId, {
      type: 'batch-analyze',
      status: 'processing',
      current: 0,
      total: documentIds.length,
      percentage: 0,
      results: [],
      successCount: 0,
      errorCount: 0,
      startedAt: new Date().toISOString()
    });

    // Start background processing (don't await)
    processBatchAnalyzeQueue(jobId, documentIds);

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: `Batch analyze started for ${documentIds.length} documents`
    });
  } catch (error: any) {
    console.error('[Batch Analyze] Error:', error);
    res.status(500).json({ error: 'Failed to start batch analyze', message: error.message });
  }
});

/**
 * Background batch analyze processor
 * For each document: analyze → extract text (pdf-parse or OCR) → update content
 */
async function processBatchAnalyzeQueue(jobId: string, documentIds: string[]): Promise<void> {
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const results: any[] = [];

  console.log(`[Batch Analyze] Job ${jobId} started for ${documentIds.length} documents`);

  for (let i = 0; i < documentIds.length; i++) {
    const docId = documentIds[i];

    try {
      // Get document
      const docResult = await lsembPool.query(
        `SELECT id, title, file_path, content, file_type, processing_status FROM documents WHERE id = $1`,
        [docId]
      );

      if (docResult.rows.length === 0) {
        errorCount++;
        results.push({ id: docId, status: 'error', error: 'Document not found' });
        continue;
      }

      const doc = docResult.rows[0];
      const currentFile = doc.title || `Document ${docId}`;

      // Update job progress
      const progressData = {
        type: 'batch-analyze',
        status: 'processing',
        current: i + 1,
        total: documentIds.length,
        percentage: Math.round(((i + 1) / documentIds.length) * 100),
        currentFile,
        successCount,
        errorCount,
        skippedCount,
        results
      };

      await storeJobProgress(jobId, progressData);

      // Emit WebSocket progress update
      const progressService = getProgressService();
      if (progressService) {
        await progressService.updateProgress(jobId, progressData);
      }

      // Skip if already analyzed (has sufficient content or status is already 'analyzed')
      const isAlreadyAnalyzed = doc.processing_status === 'analyzed' || doc.processing_status === 'embedded';
      const hasContent = doc.content && doc.content.trim().length > 100;

      if (isAlreadyAnalyzed || hasContent) {
        skippedCount++;
        results.push({
          id: docId,
          status: 'skipped',
          reason: isAlreadyAnalyzed ? 'Already analyzed' : 'Content already exists',
          textLength: doc.content?.length || 0,
          processingStatus: doc.processing_status
        });

        // Ensure status is at least 'analyzed' if not already
        if (hasContent && (doc.processing_status === 'pending' || doc.processing_status === 'waiting')) {
          await lsembPool.query(
            `UPDATE documents SET processing_status = 'analyzed', updated_at = NOW() WHERE id = $1`,
            [docId]
          );
        }
        continue;
      }

      // Update document status to 'analyzing'
      await lsembPool.query(
        `UPDATE documents SET processing_status = 'analyzing', updated_at = NOW() WHERE id = $1`,
        [docId]
      );

      let extractedText = '';
      let method = 'none';
      const fileType = (doc.file_type || '').toLowerCase();

      // Only process PDFs
      if (fileType !== 'pdf') {
        // For non-PDF files, try to read content directly
        if (['txt', 'md', 'text'].includes(fileType) && doc.file_path) {
          try {
            const fs = require('fs');
            if (fs.existsSync(doc.file_path)) {
              extractedText = fs.readFileSync(doc.file_path, 'utf-8');
              method = 'direct-read';
            }
          } catch (readError) {
            console.warn(`[Batch Analyze] Could not read file ${doc.file_path}:`, readError);
          }
        }

        if (!extractedText) {
          errorCount++;
          results.push({ id: docId, status: 'error', error: `Unsupported file type: ${fileType}` });
          await lsembPool.query(
            `UPDATE documents SET processing_status = 'failed', updated_at = NOW() WHERE id = $1`,
            [docId]
          );
          continue;
        }
      } else {
        // PDF Processing
        const fs = require('fs');

        if (!doc.file_path || !fs.existsSync(doc.file_path)) {
          errorCount++;
          results.push({ id: docId, status: 'error', error: 'File not found on disk' });
          await lsembPool.query(
            `UPDATE documents SET processing_status = 'failed', updated_at = NOW() WHERE id = $1`,
            [docId]
          );
          continue;
        }

        // Step 1: Analyze PDF to detect if OCR needed
        let needsOCR = false;
        let analysisResult: any = null;

        try {
          analysisResult = await pdfAnalyzer.analyzePDF(doc.file_path, docId);
          needsOCR = analysisResult.recommendation === 'needs_ocr';
          console.log(`[Batch Analyze] PDF ${docId} analysis: ${analysisResult.recommendation}, chars/page: ${analysisResult.stats?.charsPerPage || 0}`);
        } catch (analysisError) {
          console.warn(`[Batch Analyze] PDF analysis failed for ${docId}, will try extraction anyway:`, analysisError);
        }

        // Step 2: Extract text based on analysis
        if (!needsOCR) {
          // Try pdf-parse first (fast, local)
          try {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(doc.file_path);
            const pdfData = await pdfParse(dataBuffer);

            if (pdfData.text && pdfData.text.trim().length > 50) {
              extractedText = pdfData.text.trim();
              method = 'pdf-parse';
              console.log(`[Batch Analyze] Extracted ${extractedText.length} chars via pdf-parse for ${docId}`);
            }
          } catch (parseError) {
            console.warn(`[Batch Analyze] pdf-parse failed for ${docId}:`, parseError);
          }
        }

        // If pdf-parse failed or returned insufficient text, try OCR
        if (!extractedText || extractedText.length < 50) {
          try {
            console.log(`[Batch Analyze] Trying OCR for ${docId}...`);
            const result = await ocrRouterService.processDocument(doc.file_path, {
              fileType: 'pdf',
              language: 'tur+eng'
            });

            if (result.text && result.text.trim().length > 0) {
              extractedText = result.text.trim();
              method = result.metadata?.provider || 'ocr';
              console.log(`[Batch Analyze] OCR extracted ${extractedText.length} chars via ${method} for ${docId}`);
            }
          } catch (ocrError: any) {
            console.warn(`[Batch Analyze] OCR failed for ${docId}:`, ocrError.message);
          }
        }
      }

      // Step 3: Update document with extracted content
      if (extractedText && extractedText.length > 0) {
        await lsembPool.query(
          `UPDATE documents
           SET content = $1,
               processing_status = 'analyzed',
               metadata = jsonb_set(
                 COALESCE(metadata, '{}'),
                 '{analysis}',
                 $2::jsonb
               ),
               updated_at = NOW()
           WHERE id = $3`,
          [
            extractedText,
            JSON.stringify({
              extracted: true,
              method: method,
              textLength: extractedText.length,
              analyzedAt: new Date().toISOString()
            }),
            docId
          ]
        );

        successCount++;
        results.push({
          id: docId,
          status: 'success',
          method: method,
          textLength: extractedText.length
        });
        console.log(`[Batch Analyze] ✓ Document ${docId} analyzed: ${extractedText.length} chars via ${method}`);
      } else {
        await lsembPool.query(
          `UPDATE documents SET processing_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [docId]
        );
        errorCount++;
        results.push({ id: docId, status: 'error', error: 'No text could be extracted' });
        console.log(`[Batch Analyze] ✗ Document ${docId} failed: no text extracted`);
      }

    } catch (error: any) {
      console.error(`[Batch Analyze] Error processing ${docId}:`, error);
      await lsembPool.query(
        `UPDATE documents SET processing_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [docId]
      ).catch(() => {});
      errorCount++;
      results.push({ id: docId, status: 'error', error: error.message });
    }

    // Small delay between documents to prevent overload
    if (i < documentIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Mark job complete
  const completionData = {
    type: 'batch-analyze',
    status: 'completed',
    current: documentIds.length,
    total: documentIds.length,
    percentage: 100,
    successCount,
    errorCount,
    skippedCount,
    results,
    completedAt: new Date().toISOString()
  };

  await storeJobProgress(jobId, completionData);

  // Emit WebSocket completion update
  const progressService = getProgressService();
  if (progressService) {
    await progressService.completeJob(jobId, {
      type: 'batch-analyze',
      successCount,
      errorCount,
      skippedCount,
      results
    });
  }

  console.log(`[Batch Analyze] Job ${jobId} completed: ${successCount} success, ${skippedCount} skipped, ${errorCount} errors`);
}

export default router;
