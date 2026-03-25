import fs from 'fs';
import path from 'path';
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import { Readable } from 'stream';
import OpenAI from 'openai';
import pool from '../config/database';
import claudeService from './claude.service';
import { SettingsService } from './settings.service';

interface ProcessedDocument {
  title: string;
  content: string;
  chunks: string[];
  metadata: any;
  documentType: 'tabular' | 'text' | 'structured';
}

interface ChunkMetadata {
  chunk_index: number;
  total_chunks: number;
  document_id: number;
  document_title: string;
  chunk_size: number;
  document_type: 'tabular' | 'text' | 'structured';
  content_type: string;
  model_used?: string;
  tokens_used?: number;
}

interface EmbeddingInfo {
  embedding: number[];
  tokens: number;
  model: string;
  content_type: string;
  chunk_metadata: ChunkMetadata;
}

export class ContextualDocumentProcessorService {
  private openai: OpenAI | null;
  private chunkSize: number = 1000;
  private chunkOverlap: number = 200;

  constructor() {
    this.openai = null;
  }

  private async getOpenAIClient(): Promise<OpenAI | null> {
    if (this.openai) {
      return this.openai;
    }

    try {
      const result = await pool.query(
        'SELECT value FROM settings WHERE key = $1',
        ['openai.apiKey']
      );

      if (result.rows.length > 0 && result.rows[0].value) {
        const apiKey = result.rows[0].value;
        let key = apiKey;
        try {
          const parsed = JSON.parse(apiKey);
          if (typeof parsed === 'object' && parsed.apiKey) {
            key = parsed.apiKey;
          }
        } catch {
          // Use as-is if not JSON
        }

        this.openai = new OpenAI({ apiKey: key });
        return this.openai;
      }
    } catch (error) {
      console.error('Error fetching OpenAI API key from settings:', error);
    }

    console.warn('OpenAI API key not found in settings. OpenAI features will be disabled.');
    return null;
  }

  private async getEmbeddingModel(): Promise<string> {
    try {
      const result = await pool.query(
        "SELECT value FROM settings WHERE key IN ($1, $2, $3) ORDER BY key",
        ['embedding_model', 'embeddings.model', 'llmSettings.embeddingModel']
      );

      if (result.rows.length > 0 && result.rows[0].value) {
        let model = result.rows[0].value;
        try {
          const parsed = JSON.parse(model);
          if (typeof parsed === 'string') {
            model = parsed;
          } else if (parsed.model) {
            model = parsed.model;
          }
        } catch {}
        console.log(`Using embedding model from settings: ${model}`);
        return model;
      }
    } catch (error) {
      console.error('Error fetching embedding model from settings:', error);
    }

    return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
  }

  // Document type categorization
  private categorizeDocumentType(filePath: string, mimeType: string): 'tabular' | 'text' | 'structured' {
    const ext = path.extname(filePath).toLowerCase();

    // Tabular data types
    if (['.csv', '.json'].includes(ext)) {
      return 'tabular';
    }

    // Structured text documents
    if (['.pdf', '.doc', '.docx', '.md'].includes(ext)) {
      return 'structured';
    }

    // Plain text
    if (['.txt'].includes(ext)) {
      return 'text';
    }

    // Default to text for unknown types
    return 'text';
  }

  async processFile(filePath: string, originalName: string, mimeType: string): Promise<ProcessedDocument> {
    const ext = path.extname(originalName).toLowerCase();
    const documentType = this.categorizeDocumentType(filePath, mimeType);

    let content = '';
    let metadata: any = {
      originalName,
      mimeType,
      fileType: ext.replace('.', ''),
      documentType,
      processedAt: new Date()
    };

    try {
      switch (ext) {
        case '.pdf':
          content = await this.processPDF(filePath);

          // Analyze PDF to detect if OCR is needed
          const pdfAnalysis = await this.analyzePDFForOCR(filePath);
          metadata.type = 'pdf';
          metadata.content_type = pdfAnalysis.contentType;
          metadata.needsOCR = pdfAnalysis.needsOCR;
          metadata.pdfStats = {
            numPages: pdfAnalysis.numPages,
            textLength: pdfAnalysis.textLength,
            charsPerPage: pdfAnalysis.charsPerPage
          };

          console.log(` PDF Analysis: ${originalName}`, {
            pages: pdfAnalysis.numPages,
            chars: pdfAnalysis.textLength,
            charsPerPage: pdfAnalysis.charsPerPage,
            needsOCR: pdfAnalysis.needsOCR,
            contentType: pdfAnalysis.contentType
          });

          // Auto-trigger Vision OCR for image-heavy documents
          if (pdfAnalysis.needsOCR && process.env.GEMINI_API_KEY) {
            try {
              console.log(` [Auto-OCR] Triggering Vision OCR for: ${originalName}`);
              const { visionOCRService } = await import('./vision-ocr.service');

              const visionResult = await visionOCRService.processPDFWithVision(filePath, {
                template: 'general',
                language: 'auto'
              });

              // Enhance content with Vision OCR results
              content = visionResult.text;
              metadata.visionOCR = {
                processed: true,
                confidence: visionResult.confidence,
                visualElements: visionResult.visualElements,
                analysis: visionResult.analysis
              };

              console.log(` [Auto-OCR] Vision OCR completed`);
              console.log(`   Extracted: ${visionResult.text.length} chars`);
              console.log(`   Visual elements: ${visionResult.visualElements.length}`);
            } catch (error) {
              console.error(` [Auto-OCR] Vision OCR failed:`, error.message);
              metadata.visionOCR = {
                processed: false,
                error: error.message
              };
            }
          }
          break;

        case '.csv':
          const csvResult = await this.processCSVStructured(filePath);
          content = csvResult.content;
          metadata = {
            ...metadata,
            type: 'csv',
            content_type: 'tabular_data',
            csvStats: csvResult.stats,
            columnTypes: csvResult.columnTypes,
            hasNumericData: csvResult.hasNumericData,
            hasCategoricalData: csvResult.hasCategoricalData,
            dataStructure: csvResult.dataStructure
          };
          break;

        case '.json':
          const jsonResult = await this.processJSONStructured(filePath);
          content = jsonResult.content;
          metadata = {
            ...metadata,
            type: 'json',
            content_type: 'tabular_data',
            jsonStats: jsonResult.stats,
            dataStructure: jsonResult.dataStructure
          };
          break;

        case '.docx':
        case '.doc':
          content = await this.processWord(filePath);
          metadata.type = 'word';
          metadata.content_type = 'structured_text';
          break;

        case '.txt':
          content = fs.readFileSync(filePath, 'utf-8');
          metadata.type = 'text';
          metadata.content_type = 'plain_text';
          break;

        case '.md':
          content = fs.readFileSync(filePath, 'utf-8');
          metadata.type = 'markdown';
          metadata.content_type = 'structured_text';
          break;

        default:
          content = fs.readFileSync(filePath, 'utf-8');
          metadata.type = 'unknown';
          metadata.content_type = 'plain_text';
      }

      // Get chunking strategy from settings
      const settingsService = SettingsService.getInstance();
      const ragSettings = await settingsService.getSetting('rag');
      let chunkingStrategy = 'semantic';
      if (ragSettings) {
        try {
          const parsed = typeof ragSettings === 'string' ? JSON.parse(ragSettings) : ragSettings;
          chunkingStrategy = parsed['ragSettings.chunkingStrategy'] || 'semantic';
        } catch (e) {
          console.warn('Failed to parse RAG settings for chunking strategy:', e);
        }
      }

      console.log(`[Processor] Using chunking strategy: ${chunkingStrategy}`);

      // Create contextual content map for better embeddings
      const contextualContent = await this.createContextualContent(content, documentType, metadata);
      const chunks = await this.createIntelligentChunks(contextualContent, documentType, chunkingStrategy);

      return {
        title: originalName,
        content: contextualContent,
        chunks,
        metadata: {
          ...metadata,
          contentLength: contextualContent.length,
          chunksCount: chunks.length,
          processingStrategy: this.getProcessingStrategy(documentType)
        }
      };
    } catch (error) {
      console.error(`Error processing file ${originalName}:`, error);
      throw error;
    }
  }

  private getProcessingStrategy(documentType: string): string {
    switch (documentType) {
      case 'tabular':
        return 'Tabular data with structured semantic chunks preserving relationships';
      case 'structured':
        return 'Structured document with hierarchical content mapping';
      case 'text':
        return 'Plain text with semantic sentence-based chunking';
      default:
        return 'Standard text processing';
    }
  }

  private async createContextualContent(content: string, documentType: string, metadata: any): Promise<string> {
    const contextHeader = [
      `Document Type: ${documentType.toUpperCase()}`,
      `Content Type: ${metadata.content_type}`,
      `File Type: ${metadata.fileType}`,
      `Title: ${metadata.originalName}`,
      `---`
    ].join('\n');

    switch (documentType) {
      case 'tabular':
        return [
          contextHeader,
          `Document Overview: This is a ${metadata.fileType.toUpperCase()} file containing ${metadata.csvStats?.totalRows || 'multiple'} rows of tabular data.`,
          `Data Structure: ${this.summarizeDataStructure(metadata)}`,
          '',
          content
        ].join('\n');

      case 'structured':
        return [
          contextHeader,
          `Document Overview: This is a structured document with organized content sections.`,
          `Processing Approach: Content is analyzed for semantic meaning and contextual relationships.`,
          '',
          content
        ].join('\n');

      case 'text':
        return [
          contextHeader,
          `Document Overview: This is a plain text document processed for semantic understanding.`,
          '',
          content
        ].join('\n');

      default:
        return [contextHeader, '', content].join('\n');
    }
  }

  private summarizeDataStructure(metadata: any): string {
    if (metadata.fileType === 'csv') {
      const stats = metadata.csvStats;
      return `${stats.totalColumns} columns (${stats.numericColumns} numeric, ${stats.categoricalColumns} categorical)`;
    }
    if (metadata.fileType === 'json') {
      const stats = metadata.jsonStats;
      return `JSON structure with ${stats.objectCount} objects, ${stats.arrayCount} arrays, ${stats.depth} levels deep`;
    }
    return 'Unknown structure';
  }

  private async processPDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);

      // Ensure text is properly encoded (handle Turkish characters, etc.)
      const text = data.text || '';

      // Replace problematic characters that might cause encoding issues
      return text
        .replace(/\0/g, '') // Remove null bytes
        .trim();
    } catch (error) {
      console.error('Error processing PDF:', error);
      // Return empty string instead of throwing - let the document be saved with empty content
      // This allows the PDF to be stored and processed later with OCR
      return '';
    }
  }

  /**
   * Analyze PDF to detect if OCR is needed
   * Returns metadata about text density
   */
  private async analyzePDFForOCR(filePath: string): Promise<{
    textLength: number;
    numPages: number;
    charsPerPage: number;
    needsOCR: boolean;
    contentType: string;
  }> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      const textLength = data.text.length;
      const numPages = data.numpages;
      const charsPerPage = numPages > 0 ? textLength / numPages : 0;

      // If average characters per page < 100, it's likely image-heavy (music sheets, scanned docs, etc.)
      const needsOCR = charsPerPage < 100;
      const contentType = needsOCR ? 'image_heavy_document' : 'structured_text';

      return {
        textLength,
        numPages,
        charsPerPage: Math.round(charsPerPage),
        needsOCR,
        contentType
      };
    } catch (error) {
      console.error('Error analyzing PDF for OCR:', error);
      return {
        textLength: 0,
        numPages: 0,
        charsPerPage: 0,
        needsOCR: true,
        contentType: 'image_heavy_document'
      };
    }
  }

  private async processCSVStructured(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const csv = require('csv-parser');
      const results: any[] = [];
      const headers: string[] = [];

      fs.createReadStream(filePath, { encoding: 'utf-8' })
        .pipe(csv())
        .on('headers', (headerList: string[]) => {
          headers.push(...headerList);
        })
        .on('data', (data: any) => {
          results.push(data);
        })
        .on('end', () => {
          const stats = this.analyzeCSVStructure(headers, results);
          const structuredContent = this.createTabularCSVContent(headers, results, stats);

          resolve({
            content: structuredContent,
            stats,
            columnTypes: stats.columnTypes,
            hasNumericData: stats.numericColumns.length > 0,
            hasCategoricalData: stats.categoricalColumns.length > 0,
            dataStructure: {
              type: 'tabular',
              headers: headers,
              rowCount: results.length,
              columnCount: headers.length
            }
          });
        })
        .on('error', reject);
    });
  }

  private async processJSONStructured(filePath: string): Promise<any> {
    try {
      const jsonContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(jsonContent);

      const stats = this.analyzeJSONStructure(parsed);
      const structuredContent = this.createTabularJSONContent(parsed, stats);

      return {
        content: structuredContent,
        stats,
        dataStructure: {
          type: 'json',
          depth: stats.depth,
          objectCount: stats.objectCount,
          arrayCount: stats.arrayCount
        }
      };
    } catch (error) {
      console.error('Error processing JSON:', error);
      throw new Error('Failed to process JSON file');
    }
  }

  private analyzeCSVStructure(headers: string[], rows: any[]): any {
    const numericColumns = this.analyzeNumericColumns(headers, rows);
    const categoricalColumns = this.analyzeCategoricalColumns(headers, rows);

    const columnTypes = headers.map(header => {
      const values = rows.map(row => row[header]);
      const numericValues = values.filter(v => !isNaN(parseFloat(v)));

      return {
        name: header,
        type: numericValues.length > values.length * 0.7 ? 'numeric' : 'text',
        uniqueValues: [...new Set(values)].length,
        nullCount: values.filter(v => !v || v === '').length
      };
    });

    return {
      totalRows: rows.length,
      totalColumns: headers.length,
      numericColumns,
      categoricalColumns,
      columnTypes
    };
  }

  private analyzeJSONStructure(obj: any, depth = 0): any {
    const stats = {
      depth,
      objectCount: 0,
      arrayCount: 0,
      primitiveCount: 0,
      maxArrayLength: 0
    };

    if (Array.isArray(obj)) {
      stats.arrayCount++;
      stats.maxArrayLength = Math.max(stats.maxArrayLength, obj.length);
      obj.forEach(item => {
        const childStats = this.analyzeJSONStructure(item, depth + 1);
        stats.objectCount += childStats.objectCount;
        stats.arrayCount += childStats.arrayCount;
        stats.primitiveCount += childStats.primitiveCount;
        stats.depth = Math.max(stats.depth, childStats.depth);
      });
    } else if (obj !== null && typeof obj === 'object') {
      stats.objectCount++;
      Object.values(obj).forEach(value => {
        const childStats = this.analyzeJSONStructure(value, depth + 1);
        stats.objectCount += childStats.objectCount;
        stats.arrayCount += childStats.arrayCount;
        stats.primitiveCount += childStats.primitiveCount;
        stats.depth = Math.max(stats.depth, childStats.depth);
      });
    } else {
      stats.primitiveCount++;
    }

    return stats;
  }

  private createTabularCSVContent(headers: string[], rows: any[], stats: any): string {
    const sections: string[] = [];

    // Table overview
    sections.push(`Tabular Data Overview:`);
    sections.push(`- Table Type: CSV Dataset`);
    sections.push(`- Dimensions: ${stats.totalRows} rows × ${stats.totalColumns} columns`);
    sections.push(`- Schema: ${headers.join(', ')}`);

    // Column analysis
    sections.push(`\nColumn Analysis:`);
    stats.columnTypes.forEach(col => {
      sections.push(`- ${col.name}: ${col.type} (${col.uniqueValues} unique values)`);
    });

    // Data records in structured chunks
    sections.push(`\nData Records:`);
    const chunkSize = 15;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      sections.push(`\n[Records ${i + 1}-${Math.min(i + chunkSize, rows.length)}]`);
      chunk.forEach((row, index) => {
        const rowNum = i + index + 1;
        const rowData = headers.map(header => `${header}=${row[header]}`).join(', ');
        sections.push(`${rowNum}: {${rowData}}`);
      });
    }

    return sections.join('\n');
  }

  private createTabularJSONContent(obj: any, stats: any): string {
    const sections: string[] = [];

    sections.push(`JSON Data Overview:`);
    sections.push(`- Structure Type: ${Array.isArray(obj) ? 'Array' : 'Object'}`);
    sections.push(`- Depth: ${stats.depth} levels`);
    sections.push(`- Contains: ${stats.objectCount} objects, ${stats.arrayCount} arrays, ${stats.primitiveCount} primitives`);

    // Convert to formatted representation
    sections.push(`\nStructured Data:`);
    sections.push(JSON.stringify(obj, null, 2));

    return sections.join('\n');
  }

  private analyzeNumericColumns(headers: string[], rows: any[]): Array<{name: string, min: number, max: number, avg: number}> {
    const numericColumns: Array<{name: string, min: number, max: number, avg: number}> = [];

    headers.forEach(header => {
      const values = rows
        .map(row => parseFloat(row[header]))
        .filter(val => !isNaN(val));

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;

        numericColumns.push({ name: header, min, max, avg });
      }
    });

    return numericColumns;
  }

  private analyzeCategoricalColumns(headers: string[], rows: any[]): Array<{name: string, uniqueCount: number, uniqueValues: string[]}> {
    const categoricalColumns: Array<{name: string, uniqueCount: number, uniqueValues: string[]}> = [];

    headers.forEach(header => {
      const values = rows.map(row => String(row[header])).filter(val => val && val.trim());
      const uniqueValues = [...new Set(values)];

      if (uniqueValues.length > 1 && uniqueValues.length < values.length * 0.8) {
        categoricalColumns.push({
          name: header,
          uniqueCount: uniqueValues.length,
          uniqueValues: uniqueValues.sort()
        });
      }
    });

    return categoricalColumns;
  }

  private async processWord(filePath: string): Promise<string> {
    try {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('Error processing Word document:', error);
      throw new Error('Failed to process Word document');
    }
  }

  private async createIntelligentChunks(text: string, documentType: string, strategy: string = 'semantic'): Promise<string[]> {
    console.log(`[Chunking] Strategy: ${strategy}, DocumentType: ${documentType}, TextLength: ${text.length}`);

    // If semantic-haiku is selected, use Claude-3-Haiku to find boundaries
    if (strategy === 'semantic-haiku' && claudeService.isAvailable()) {
      console.log(`[Chunking] Performing Semantic Segmentation with Claude-3-Haiku...`);
      return await claudeService.segmentText(text);
    }

    // Strategy-based routing
    switch (strategy) {
      case 'sentence':
        console.log(`[Chunking] Using sentence-based chunking (1000 char / 200 overlap)`);
        return this.chunkBySentence(text, 1000, 200);
      case 'paragraph':
        console.log(`[Chunking] Using paragraph-based chunking (1500 char / 300 overlap)`);
        return this.chunkByParagraph(text, 1500, 300);
      case 'semantic':
        console.log(`[Chunking] Using semantic sections chunking (1200 char / 200 overlap)`);
        return this.chunkBySemantic(text, 1200, 200);
      case 'fixed':
        console.log(`[Chunking] Using fixed-size chunking (1000 char / 100 overlap)`);
        return this.chunkByFixedSize(text, 1000, 100);
      case 'recursive':
      default:
        // Fallback to document-type-aware chunking (original behavior)
        switch (documentType) {
          case 'tabular':
            return this.createTabularChunks(text);
          case 'structured':
            return this.createStructuredChunks(text);
          case 'text':
            return this.createTextChunks(text);
          default:
            return this.createTextChunks(text);
        }
    }
  }

  /**
   * Sentence-based chunking: splits at sentence boundaries (.!?)
   * Preserves sentence structure and uses smart overlap
   */
  private chunkBySentence(text: string, maxSize: number = 1000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || text.split(/\n+/).filter(s => s.trim().length > 0);

    if (sentences.length === 0) return [text];

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxSize) {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
          // Smart overlap: keep the last part of previous chunk
          const overlapText = currentChunk.slice(-overlap);
          const sentenceBreak = overlapText.search(/[.!?]\s/);
          currentChunk = sentenceBreak > 0 ? overlapText.slice(sentenceBreak + 2) + sentence : sentence;
        } else {
          // Single sentence exceeds max, force split
          const splitChunks = this.forceSplitLongText(sentence);
          chunks.push(...splitChunks.slice(0, -1));
          currentChunk = splitChunks[splitChunks.length - 1] || '';
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 10);
  }

  /**
   * Paragraph-based chunking: splits at paragraph boundaries (double newlines)
   * Better for preserving contextual coherence in long documents
   */
  private chunkByParagraph(text: string, maxSize: number = 1500, overlap: number = 300): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    if (paragraphs.length === 0) return [text];
    if (paragraphs.length === 1 && paragraphs[0].length > maxSize) {
      return this.forceSplitLongText(paragraphs[0]);
    }

    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + '\n\n' + paragraph).length > maxSize) {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
          // Overlap: keep tail of previous chunk
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + '\n\n' + paragraph;
        } else {
          if (paragraph.length > maxSize) {
            const splitChunks = this.forceSplitLongText(paragraph);
            chunks.push(...splitChunks.slice(0, -1));
            currentChunk = splitChunks[splitChunks.length - 1] || '';
          } else {
            chunks.push(paragraph.trim());
            currentChunk = '';
          }
        }
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      }
    }

    if (currentChunk.trim().length > 0) {
      if (currentChunk.length > maxSize) {
        chunks.push(...this.forceSplitLongText(currentChunk));
      } else {
        chunks.push(currentChunk.trim());
      }
    }

    return chunks.filter(c => c.length > 10);
  }

  /**
   * Semantic section chunking: splits at heading/section boundaries
   * Best for structured documents with clear section headers
   */
  private chunkBySemantic(text: string, maxSize: number = 1200, overlap: number = 200): string[] {
    const chunks: string[] = [];
    // Split by headings (markdown #, underlines ===, ---)
    const sections = text.split(/\n(?=#{1,6}\s|={3,}|-{3,})/);
    const cleanSections = sections.map(s => s.trim()).filter(s => s.length > 0);

    if (cleanSections.length <= 1) {
      // No headings found, fall back to paragraph chunking
      return this.chunkByParagraph(text, maxSize, overlap);
    }

    for (const section of cleanSections) {
      if (section.length > maxSize) {
        // Section is too large, sub-chunk it
        const subChunks = this.chunkByParagraph(section, maxSize, overlap);
        chunks.push(...subChunks);
      } else {
        chunks.push(section);
      }
    }

    return chunks.filter(c => c.length > 10);
  }

  /**
   * Fixed-size chunking: splits at exact character boundaries
   * Fastest approach, no structure preservation
   */
  private chunkByFixedSize(text: string, maxSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + maxSize, text.length);
      const chunk = text.slice(start, end);

      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }

      start = end - overlap;
      if (start < 0 || start >= text.length) break;
      // Prevent infinite loop
      if (end === text.length) break;
    }

    return chunks.filter(c => c.length > 10);
  }


  private createTabularChunks(text: string): string[] {
    const chunks: string[] = [];

    // Split by section headers
    const sections = text.split(/\n(?=[A-Z][a-z]+:)/);

    sections.forEach(section => {
      if (section.trim().length > 0) {
        // For data records, keep them grouped
        if (section.includes('[Records')) {
          const recordChunks = section.split(/\n\[/);
          recordChunks.forEach(chunk => {
            if (chunk.trim().length > 10) {
              chunks.push(chunk.trim());
            }
          });
        } else {
          chunks.push(section.trim());
        }
      }
    });

    return chunks.filter(chunk => chunk.length > 10);
  }

  private createStructuredChunks(text: string): string[] {
    const chunks: string[] = [];

    // Split by semantic paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    // 🔧 FIX: If only one huge paragraph, force split it
    if (paragraphs.length === 1 && paragraphs[0].length > this.chunkSize) {
      console.log(`[Chunking] Force-splitting ${paragraphs[0].length} char structured text`);
      return this.forceSplitLongText(paragraphs[0]);
    }

    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > this.chunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = paragraph;
        } else {
          // 🔧 FIX: Force split long paragraph properly
          if (paragraph.length > this.chunkSize) {
            const splitChunks = this.forceSplitLongText(paragraph);
            chunks.push(...splitChunks.slice(0, -1));
            currentChunk = splitChunks[splitChunks.length - 1] || '';
          } else {
            chunks.push(paragraph.trim());
            currentChunk = '';
          }
        }
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // 🔧 FIX: Handle remaining content that might be too long
    if (currentChunk.trim().length > 0) {
      if (currentChunk.length > this.chunkSize) {
        const remainingChunks = this.forceSplitLongText(currentChunk);
        chunks.push(...remainingChunks);
      } else {
        chunks.push(currentChunk.trim());
      }
    }

    return chunks;
  }

  private createTextChunks(text: string): string[] {
    const chunks: string[] = [];
    // 🔧 FIX: Use Turkish-aware sentence splitting with fallback to paragraph/line splitting
    let sentences = text.match(/[^.!?]+[.!?]+/g);

    // If no sentence endings found, try splitting by newlines or paragraphs
    if (!sentences || sentences.length === 0) {
      sentences = text.split(/\n+/).filter(s => s.trim().length > 0);
    }

    // If still just one huge block, force split by chunkSize
    if (sentences.length === 1 && sentences[0].length > this.chunkSize) {
      console.log(`[Chunking] Force-splitting ${sentences[0].length} char text into ${Math.ceil(sentences[0].length / this.chunkSize)} chunks`);
      return this.forceSplitLongText(sentences[0]);
    }

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.chunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          // Sentence is longer than chunkSize, force split it
          const splitChunks = this.forceSplitLongText(sentence);
          chunks.push(...splitChunks.slice(0, -1)); // Add all but last
          currentChunk = splitChunks[splitChunks.length - 1] || ''; // Keep last as current
        }
      } else {
        currentChunk += ' ' + sentence;
      }
    }

    // 🔧 FIX: Properly handle remaining currentChunk if it's too long
    if (currentChunk.trim().length > 0) {
      if (currentChunk.length > this.chunkSize) {
        // Force split the remaining content
        const remainingChunks = this.forceSplitLongText(currentChunk);
        chunks.push(...remainingChunks);
      } else {
        chunks.push(currentChunk.trim());
      }
    }

    return chunks;
  }

  // 🔧 NEW: Helper to force-split long text without sentence boundaries
  private forceSplitLongText(text: string): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.chunkSize) {
        if (remaining.trim().length > 0) {
          chunks.push(remaining.trim());
        }
        break;
      }

      // Try to find a good break point (space, newline) near chunkSize
      let breakPoint = this.chunkSize;
      const searchStart = Math.max(0, this.chunkSize - 200); // Look back 200 chars

      for (let i = this.chunkSize; i >= searchStart; i--) {
        if (remaining[i] === ' ' || remaining[i] === '\n') {
          breakPoint = i;
          break;
        }
      }

      chunks.push(remaining.substring(0, breakPoint).trim());
      remaining = remaining.substring(breakPoint).trim();
    }

    return chunks.filter(c => c.length > 0);
  }

  async createEmbeddingsWithMetadata(text: string, documentType: string, chunkIndex: number, totalChunks: number, documentId: number, documentTitle: string): Promise<EmbeddingInfo> {
    try {
      const openaiClient = await this.getOpenAIClient();

      if (!openaiClient) {
        console.warn('OpenAI client not available. Skipping embeddings generation.');
        return {
          embedding: [],
          tokens: 0,
          model: 'text-embedding-ada-002',
          content_type: documentType,
          chunk_metadata: {
            chunk_index: chunkIndex,
            total_chunks: totalChunks,
            document_id: documentId,
            document_title: documentTitle,
            chunk_size: text.length,
            document_type: documentType as 'tabular' | 'text' | 'structured',
            content_type: documentType
          }
        };
      }

      const model = await this.getEmbeddingModel();
      const response = await openaiClient.embeddings.create({
        model: model,
        input: text
      });

      return {
        embedding: response.data[0].embedding,
        tokens: response.usage.total_tokens,
        model: model,
        content_type: documentType,
        chunk_metadata: {
          chunk_index: chunkIndex,
          total_chunks: totalChunks,
          document_id: documentId,
          document_title: documentTitle,
          chunk_size: text.length,
          document_type: documentType as 'tabular' | 'text' | 'structured',
          content_type: documentType,
          model_used: model,
          tokens_used: response.usage.total_tokens
        }
      };
    } catch (error) {
      console.error('Error creating embeddings:', error);
      throw error;
    }
  }

  async processAndEmbedDocumentEnhanced(
    documentId: number,
    content: string,
    title: string,
    documentType: 'tabular' | 'text' | 'structured',
    analysisMetadata?: {
      category?: string;
      keywords?: string[];
      topics?: string[];
      entities?: {
        people?: string[];
        organizations?: string[];
        locations?: string[];
        dates?: string[];
      };
      language?: string;
      summary?: string;
      templateId?: string;
    }
  ): Promise<void> {
    // Validate content before processing
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      console.error(`[Embedding] Document ${documentId} has no content to embed. Title: ${title}`);
      throw new Error(`Document ${documentId} has no content to embed. Please ensure the document has been processed/OCR'd first.`);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create enhanced embeddings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS document_embeddings (
          id SERIAL PRIMARY KEY,
          document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
          chunk_text TEXT NOT NULL,
          embedding vector(1536),
          metadata JSONB,
          content_type VARCHAR(50),
          model_name VARCHAR(100),
          tokens_used INTEGER,
          embedding_dimension INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Also create usage tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS embedding_model_usage (
          id SERIAL PRIMARY KEY,
          model_name VARCHAR(100) UNIQUE NOT NULL,
          total_tokens_used BIGINT DEFAULT 0,
          total_embeddings INTEGER DEFAULT 0,
          avg_tokens_per_embedding DECIMAL(10,2) DEFAULT 0,
          last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const chunks = this.createIntelligentChunks(content, documentType);
      let totalTokensUsed = 0;
      let modelName = 'text-embedding-ada-002';
      let embeddingDimension = 1536;

      // Build enriched metadata from PDF analysis
      const enrichedMetadata = analysisMetadata ? {
        category: analysisMetadata.category,
        keywords: analysisMetadata.keywords?.slice(0, 10), // Top 10 keywords
        topics: analysisMetadata.topics?.slice(0, 5), // Top 5 topics
        entities: {
          people: analysisMetadata.entities?.people?.slice(0, 10),
          organizations: analysisMetadata.entities?.organizations?.slice(0, 10),
          locations: analysisMetadata.entities?.locations?.slice(0, 5),
        },
        language: analysisMetadata.language,
        templateId: analysisMetadata.templateId,
      } : null;

      if (enrichedMetadata) {
        console.log(`[Embedding] Enriching with analysis metadata: category=${enrichedMetadata.category}, keywords=${enrichedMetadata.keywords?.length || 0}, entities.people=${enrichedMetadata.entities?.people?.length || 0}`);
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embeddingInfo = await this.createEmbeddingsWithMetadata(
          chunk,
          documentType,
          i,
          chunks.length,
          documentId,
          title
        );

        totalTokensUsed += embeddingInfo.tokens;
        modelName = embeddingInfo.model;
        embeddingDimension = embeddingInfo.embedding.length;

        // Merge chunk metadata with enriched analysis metadata
        const fullMetadata = {
          ...embeddingInfo.chunk_metadata,
          ...(enrichedMetadata && { analysis: enrichedMetadata })
        };

        await client.query(
          `INSERT INTO document_embeddings
           (document_id, chunk_text, embedding, metadata, content_type, model_name, tokens_used, embedding_dimension)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            documentId,
            chunk,
            `[${embeddingInfo.embedding.join(',')}]`,
            JSON.stringify(fullMetadata),
            embeddingInfo.content_type,
            modelName,
            embeddingInfo.tokens,
            embeddingDimension
          ]
        );
      }

      // Update document metadata with embedding stats
      await client.query(
        `UPDATE documents
         SET metadata = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(
                   COALESCE(metadata, '{}')::jsonb,
                   '{embeddings}',
                   'true'::jsonb
                 ),
                 '{chunks}',
                 $2::text::jsonb
               ),
               '{embedding_model}',
               to_jsonb($3::text)
             ),
             '{total_tokens_used}',
             to_jsonb($4::integer)
           ),
           '{document_type}',
           to_jsonb($5::text)
         )
         WHERE id = $1`,
        [documentId, chunks.length, modelName, totalTokensUsed, documentType]
      );

      // Update model usage tracking
      await client.query(
        `INSERT INTO embedding_model_usage (model_name, total_tokens_used, total_embeddings, avg_tokens_per_embedding)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (model_name)
         DO UPDATE SET
           total_tokens_used = embedding_model_usage.total_tokens_used + EXCLUDED.total_tokens_used,
           total_embeddings = embedding_model_usage.total_embeddings + EXCLUDED.total_embeddings,
           avg_tokens_per_embedding = (embedding_model_usage.total_tokens_used + EXCLUDED.total_tokens_used) / (embedding_model_usage.total_embeddings + EXCLUDED.total_embeddings),
           last_used_at = CURRENT_TIMESTAMP`,
        [modelName, totalTokensUsed, chunks.length, totalTokensUsed / chunks.length]
      );

      await client.query('COMMIT');
      console.log(`Created ${chunks.length} embeddings for document ${documentId} using ${modelName} (${totalTokensUsed} tokens)`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing and embedding document:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async searchSimilarDocumentsEnhanced(query: string, limit: number = 5, contentType?: string): Promise<any[]> {
    try {
      const embeddingResult = await this.createEmbeddingsWithMetadata(
        query,
        'text',
        0,
        1,
        0,
        'search_query'
      );

      let whereClause = '';
      const params: any[] = [`[${embeddingResult.embedding.join(',')}]`, limit];

      if (contentType) {
        whereClause = 'AND de.content_type = $3';
        params.push(contentType);
      }

      const result = await pool.query(
        `SELECT
          de.id,
          de.document_id,
          de.chunk_text,
          de.metadata,
          de.content_type,
          de.model_name,
          de.tokens_used,
          de.created_at,
          d.title as document_title,
          d.type as document_type,
          1 - (de.embedding <=> $1::vector) as similarity
        FROM document_embeddings de
        JOIN documents d ON de.document_id = d.id
        WHERE 1=1 ${whereClause}
        ORDER BY de.embedding <=> $1::vector
        LIMIT $2`,
        params
      );

      // Log search token usage
      console.log(`Search query used ${embeddingResult.tokens} tokens with model ${embeddingResult.model}`);

      return result.rows;
    } catch (error) {
      console.error('Error searching similar documents:', error);
      throw error;
    }
  }

  async getEmbeddingStatistics(): Promise<any> {
    try {
      const stats = await pool.query(`
        SELECT
          model_name,
          COUNT(*) as total_embeddings,
          SUM(tokens_used) as total_tokens,
          AVG(tokens_used) as avg_tokens_per_embedding,
          MAX(created_at) as last_used,
          content_type,
          COUNT(DISTINCT document_id) as documents_processed
        FROM document_embeddings
        GROUP BY model_name, content_type
        ORDER BY total_tokens DESC
      `);

      const overallStats = await pool.query(`
        SELECT
          COUNT(*) as total_embeddings,
          COUNT(DISTINCT document_id) as total_documents,
          SUM(tokens_used) as total_tokens_all,
          AVG(embedding_dimension) as avg_embedding_dimension
        FROM document_embeddings
      `);

      return {
        byModelAndType: stats.rows,
        overall: overallStats.rows[0]
      };
    } catch (error) {
      console.error('Error getting embedding statistics:', error);
      throw error;
    }
  }
}

export default new ContextualDocumentProcessorService();