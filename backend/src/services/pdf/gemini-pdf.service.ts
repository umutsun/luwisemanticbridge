/**
 * Gemini PDF Service
 * Unified service for all PDF processing operations using Google Gemini API
 *
 * Features:
 * - OCR (PDF → Text) using Gemini Vision
 * - Translation using Gemini
 * - Entity Extraction using Gemini
 * - Embeddings using text-embedding-004
 * - Batch processing orchestrator
 */

import { GoogleGenerativeAI, GoogleAIFileManager } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// ==================== INTERFACES ====================

export interface GeminiConfig {
  apiKey: string;
  defaultModel?: string;
  embeddingModel?: string;
}

export interface OCRResult {
  documentId: string;
  text: string;
  confidence: number;
  pages: number;
  language: string;
  metadata: {
    processingTime: number;
    tokensUsed: number;
    fileUri: string;
  };
}

export interface TranslationResult {
  documentId: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  metadata: {
    processingTime: number;
    tokensUsed: number;
  };
}

export interface Entity {
  type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'PRODUCT' | 'EVENT';
  value: string;
  context?: string;
  confidence: number;
}

export interface EntityExtractionResult {
  documentId: string;
  entities: Entity[];
  metadata: {
    processingTime: number;
    tokensUsed: number;
    totalEntities: number;
  };
}

export interface EmbeddingResult {
  documentId: string;
  chunks: Array<{
    chunkIndex: number;
    text: string;
    embedding: number[];
  }>;
  metadata: {
    processingTime: number;
    totalChunks: number;
    embeddingDimension: number;
  };
}

export interface WorkflowStep {
  name: 'ocr' | 'translate' | 'entities' | 'embeddings';
  enabled: boolean;
  config?: any;
}

export interface WorkflowConfig {
  documentIds: string[];
  steps: WorkflowStep[];
  targetLanguage?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface WorkflowProgress {
  currentStep: string;
  currentDocument: number;
  totalDocuments: number;
  stepProgress: number;
  status: 'processing' | 'completed' | 'error';
  message?: string;
}

export interface WorkflowResult {
  documentId: string;
  ocrResult?: OCRResult;
  translationResult?: TranslationResult;
  entityResult?: EntityExtractionResult;
  embeddingResult?: EmbeddingResult;
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
}

// ==================== SERVICE CLASS ====================

class GeminiPDFService {
  private genAI: GoogleGenerativeAI;
  private fileManager: GoogleAIFileManager;
  private defaultModel: string;
  private embeddingModel: string;

  constructor(config: GeminiConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.fileManager = new GoogleAIFileManager(config.apiKey);
    this.defaultModel = config.defaultModel || 'gemini-2.0-flash-exp';
    this.embeddingModel = config.embeddingModel || 'text-embedding-004';
  }

  // ==================== 1. OCR (PDF → Text) ====================

  /**
   * Extract text from PDF using Gemini Vision
   * Uploads PDF to Gemini File API and extracts text
   */
  async extractText(pdfPath: string, documentId: string): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      console.log(`[Gemini OCR] Starting OCR for document ${documentId}`);

      // 1. Upload PDF to Gemini File API
      const uploadResponse = await this.fileManager.uploadFile(pdfPath, {
        mimeType: 'application/pdf',
        displayName: path.basename(pdfPath)
      });

      console.log(`[Gemini OCR] Uploaded to: ${uploadResponse.file.uri}`);

      // 2. Wait for file processing
      let file = await this.fileManager.getFile(uploadResponse.file.name);
      let attempts = 0;
      const maxAttempts = 30; // 30 * 2s = 60s max wait

      while (file.state === 'PROCESSING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        file = await this.fileManager.getFile(uploadResponse.file.name);
        attempts++;
      }

      if (file.state === 'FAILED') {
        throw new Error('PDF processing failed in Gemini File API');
      }

      if (file.state === 'PROCESSING') {
        throw new Error('PDF processing timeout');
      }

      console.log(`[Gemini OCR] File ready: ${file.state}`);

      // 3. Extract text with Gemini Vision
      const model = this.genAI.getGenerativeModel({ model: this.defaultModel });

      const prompt = `Extract ALL text from this PDF document.
Preserve the original formatting and structure as much as possible.
Include ALL pages.
If you see tables, preserve them in a readable format.
Output ONLY the extracted text, no explanations or markdown formatting.`;

      const result = await model.generateContent([
        {
          fileData: {
            mimeType: uploadResponse.file.mimeType,
            fileUri: uploadResponse.file.uri
          }
        },
        { text: prompt }
      ]);

      const extractedText = result.response.text();

      // 4. Detect language
      const language = this.detectLanguage(extractedText);

      // 5. Clean up - delete uploaded file
      await this.fileManager.deleteFile(uploadResponse.file.name);

      const processingTime = Date.now() - startTime;

      console.log(`[Gemini OCR] Completed in ${processingTime}ms`);

      return {
        documentId,
        text: extractedText,
        confidence: 0.95, // Gemini Vision is highly accurate
        pages: file.videoMetadata?.videoDuration ? 1 : 1, // TODO: Get actual page count
        language,
        metadata: {
          processingTime,
          tokensUsed: result.response.usageMetadata?.totalTokenCount || 0,
          fileUri: uploadResponse.file.uri
        }
      };
    } catch (error) {
      console.error(`[Gemini OCR] Error:`, error);
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  // ==================== 2. TRANSLATION ====================

  /**
   * Translate text using Gemini
   */
  async translate(
    text: string,
    targetLang: string,
    documentId: string,
    sourceLang?: string
  ): Promise<TranslationResult> {
    const startTime = Date.now();

    try {
      console.log(`[Gemini Translate] Translating document ${documentId} to ${targetLang}`);

      const detectedSourceLang = sourceLang || this.detectLanguage(text);

      // Skip if already in target language
      if (detectedSourceLang === targetLang) {
        console.log(`[Gemini Translate] Already in target language, skipping`);
        return {
          documentId,
          originalText: text,
          translatedText: text,
          sourceLang: detectedSourceLang,
          targetLang,
          metadata: {
            processingTime: 0,
            tokensUsed: 0
          }
        };
      }

      const model = this.genAI.getGenerativeModel({ model: this.defaultModel });

      const langNames: Record<string, string> = {
        en: 'English',
        tr: 'Turkish',
        de: 'German',
        fr: 'French',
        es: 'Spanish',
        it: 'Italian',
        pt: 'Portuguese',
        ru: 'Russian',
        zh: 'Chinese',
        ja: 'Japanese'
      };

      const prompt = `Translate the following text from ${langNames[detectedSourceLang] || detectedSourceLang} to ${langNames[targetLang] || targetLang}.

IMPORTANT:
- Preserve the original meaning and tone
- Maintain formatting (paragraphs, line breaks)
- Keep technical terms accurate
- Output ONLY the translated text, no explanations

TEXT TO TRANSLATE:
${text}`;

      const result = await model.generateContent(prompt);
      const translatedText = result.response.text();

      const processingTime = Date.now() - startTime;

      console.log(`[Gemini Translate] Completed in ${processingTime}ms`);

      return {
        documentId,
        originalText: text,
        translatedText,
        sourceLang: detectedSourceLang,
        targetLang,
        metadata: {
          processingTime,
          tokensUsed: result.response.usageMetadata?.totalTokenCount || 0
        }
      };
    } catch (error) {
      console.error(`[Gemini Translate] Error:`, error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  // ==================== 3. ENTITY EXTRACTION ====================

  /**
   * Extract entities from text using Gemini
   */
  async extractEntities(text: string, documentId: string): Promise<EntityExtractionResult> {
    const startTime = Date.now();

    try {
      console.log(`[Gemini Entities] Extracting entities from document ${documentId}`);

      const model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const prompt = `Extract entities from this text and output as JSON.

TEXT:
${text.substring(0, 8000)} // Limit to first 8000 chars for token management

Extract the following entity types:
- PERSON: Names of individuals
- ORGANIZATION: Company names, institutions
- LOCATION: Cities, countries, addresses
- DATE: Dates and time references
- MONEY: Financial figures, prices, amounts
- PRODUCT: Product names, services
- EVENT: Conferences, meetings, events

OUTPUT FORMAT (JSON):
{
  "entities": [
    {
      "type": "PERSON",
      "value": "extracted name",
      "context": "surrounding sentence or phrase",
      "confidence": 0.95
    }
  ]
}

Be precise and only extract entities that are clearly mentioned.
Assign confidence scores based on how certain you are (0.0 to 1.0).`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Parse JSON response
      let entities: Entity[] = [];
      try {
        const parsed = JSON.parse(responseText);
        entities = parsed.entities || [];
      } catch (parseError) {
        console.error('[Gemini Entities] JSON parse error:', parseError);
        // Try to extract entities from text response
        entities = this.fallbackEntityExtraction(responseText);
      }

      const processingTime = Date.now() - startTime;

      console.log(`[Gemini Entities] Found ${entities.length} entities in ${processingTime}ms`);

      return {
        documentId,
        entities,
        metadata: {
          processingTime,
          tokensUsed: result.response.usageMetadata?.totalTokenCount || 0,
          totalEntities: entities.length
        }
      };
    } catch (error) {
      console.error(`[Gemini Entities] Error:`, error);
      throw new Error(`Entity extraction failed: ${error.message}`);
    }
  }

  // ==================== 4. EMBEDDINGS ====================

  /**
   * Create embeddings for text chunks using text-embedding-004
   */
  async createEmbeddings(
    text: string,
    documentId: string,
    chunkSize: number = 1000,
    chunkOverlap: number = 200
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();

    try {
      console.log(`[Gemini Embeddings] Creating embeddings for document ${documentId}`);

      // 1. Split text into chunks
      const chunks = this.splitTextIntoChunks(text, chunkSize, chunkOverlap);
      console.log(`[Gemini Embeddings] Created ${chunks.length} chunks`);

      // 2. Create embeddings for each chunk
      const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
      const embeddedChunks = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const result = await model.embedContent(chunk);
        const embedding = result.embedding.values;

        embeddedChunks.push({
          chunkIndex: i,
          text: chunk,
          embedding
        });

        // Rate limiting - small delay between chunks
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const processingTime = Date.now() - startTime;

      console.log(`[Gemini Embeddings] Completed ${embeddedChunks.length} embeddings in ${processingTime}ms`);

      return {
        documentId,
        chunks: embeddedChunks,
        metadata: {
          processingTime,
          totalChunks: embeddedChunks.length,
          embeddingDimension: embeddedChunks[0]?.embedding.length || 0
        }
      };
    } catch (error) {
      console.error(`[Gemini Embeddings] Error:`, error);
      throw new Error(`Embedding creation failed: ${error.message}`);
    }
  }

  // ==================== 5. BATCH WORKFLOW ORCHESTRATOR ====================

  /**
   * Process multiple documents through workflow
   * Executes steps in order: OCR → Translate → Entities → Embeddings
   */
  async processBatch(
    config: WorkflowConfig,
    progressCallback?: (progress: WorkflowProgress) => void
  ): Promise<WorkflowResult[]> {
    console.log(`[Gemini Batch] Starting batch processing for ${config.documentIds.length} documents`);

    const results: WorkflowResult[] = [];

    for (let i = 0; i < config.documentIds.length; i++) {
      const documentId = config.documentIds[i];
      const result: WorkflowResult = {
        documentId,
        status: 'success',
        errors: []
      };

      try {
        // Report progress
        if (progressCallback) {
          progressCallback({
            currentStep: 'starting',
            currentDocument: i + 1,
            totalDocuments: config.documentIds.length,
            stepProgress: 0,
            status: 'processing',
            message: `Processing document ${i + 1}/${config.documentIds.length}`
          });
        }

        // Get document path from database (would be injected in real implementation)
        const documentPath = await this.getDocumentPath(documentId);

        // Step 1: OCR (if enabled)
        const ocrStep = config.steps.find(s => s.name === 'ocr');
        if (ocrStep?.enabled) {
          try {
            if (progressCallback) {
              progressCallback({
                currentStep: 'ocr',
                currentDocument: i + 1,
                totalDocuments: config.documentIds.length,
                stepProgress: 25,
                status: 'processing',
                message: 'Extracting text with OCR...'
              });
            }

            result.ocrResult = await this.extractText(documentPath, documentId);
          } catch (error) {
            result.errors?.push(`OCR failed: ${error.message}`);
            result.status = 'partial';
          }
        }

        const currentText = result.ocrResult?.text || '';

        // Step 2: Translation (if enabled)
        const translateStep = config.steps.find(s => s.name === 'translate');
        if (translateStep?.enabled && config.targetLanguage && currentText) {
          try {
            if (progressCallback) {
              progressCallback({
                currentStep: 'translate',
                currentDocument: i + 1,
                totalDocuments: config.documentIds.length,
                stepProgress: 50,
                status: 'processing',
                message: 'Translating text...'
              });
            }

            result.translationResult = await this.translate(
              currentText,
              config.targetLanguage,
              documentId
            );
          } catch (error) {
            result.errors?.push(`Translation failed: ${error.message}`);
            result.status = 'partial';
          }
        }

        const textForAnalysis = result.translationResult?.translatedText || currentText;

        // Step 3: Entity Extraction (if enabled)
        const entitiesStep = config.steps.find(s => s.name === 'entities');
        if (entitiesStep?.enabled && textForAnalysis) {
          try {
            if (progressCallback) {
              progressCallback({
                currentStep: 'entities',
                currentDocument: i + 1,
                totalDocuments: config.documentIds.length,
                stepProgress: 75,
                status: 'processing',
                message: 'Extracting entities...'
              });
            }

            result.entityResult = await this.extractEntities(textForAnalysis, documentId);
          } catch (error) {
            result.errors?.push(`Entity extraction failed: ${error.message}`);
            result.status = 'partial';
          }
        }

        // Step 4: Embeddings (if enabled)
        const embeddingsStep = config.steps.find(s => s.name === 'embeddings');
        if (embeddingsStep?.enabled && textForAnalysis) {
          try {
            if (progressCallback) {
              progressCallback({
                currentStep: 'embeddings',
                currentDocument: i + 1,
                totalDocuments: config.documentIds.length,
                stepProgress: 90,
                status: 'processing',
                message: 'Creating embeddings...'
              });
            }

            result.embeddingResult = await this.createEmbeddings(
              textForAnalysis,
              documentId,
              config.chunkSize,
              config.chunkOverlap
            );
          } catch (error) {
            result.errors?.push(`Embedding creation failed: ${error.message}`);
            result.status = 'partial';
          }
        }

        // Complete
        if (progressCallback) {
          progressCallback({
            currentStep: 'completed',
            currentDocument: i + 1,
            totalDocuments: config.documentIds.length,
            stepProgress: 100,
            status: 'completed',
            message: `Document ${i + 1}/${config.documentIds.length} completed`
          });
        }

        if (result.errors && result.errors.length === 0) {
          delete result.errors;
          result.status = 'success';
        }
      } catch (error) {
        result.status = 'failed';
        result.errors = [error.message];
      }

      results.push(result);

      // Small delay between documents
      if (i < config.documentIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`[Gemini Batch] Completed batch processing`);
    return results;
  }

  // ==================== HELPER METHODS ====================

  /**
   * Detect language from text (simple heuristic)
   */
  private detectLanguage(text: string): string {
    const turkishChars = /[ğüşıöçĞÜŞİÖÇ]/g;
    const matches = text.match(turkishChars);

    if (matches && matches.length > 10) {
      return 'tr';
    }

    // Add more language detection logic here
    return 'en';
  }

  /**
   * Split text into chunks with overlap
   */
  private splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start += chunkSize - overlap;
    }

    return chunks;
  }

  /**
   * Fallback entity extraction from text (if JSON parsing fails)
   */
  private fallbackEntityExtraction(text: string): Entity[] {
    // Simple pattern matching as fallback
    const entities: Entity[] = [];

    // Extract capitalized words as potential entities
    const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = text.match(capitalizedPattern);

    if (matches) {
      matches.slice(0, 20).forEach(match => {
        entities.push({
          type: 'PERSON', // Default to PERSON
          value: match,
          confidence: 0.5 // Low confidence for fallback
        });
      });
    }

    return entities;
  }

  /**
   * Get document file path from database
   * This would be implemented to query the database
   */
  private async getDocumentPath(documentId: string): Promise<string> {
    // TODO: Implement database query to get file path
    // For now, return a placeholder
    throw new Error('getDocumentPath not implemented - needs database integration');
  }
}

// ==================== EXPORT ====================

export default GeminiPDFService;
