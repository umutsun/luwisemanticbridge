/**
 * Local Metadata Extractor Service
 * Extracts metadata from PDFs using local libraries (pdf-parse, pdf-lib)
 * NO API dependencies - fully offline
 */

import pdfParse from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFMetadata, MetadataExtractionResult } from './metadata-extractor.service';
import tableExtractionService from './table-extraction.service';
import { VisionOCRService } from '../vision-ocr.service';
import * as crypto from 'crypto';

class LocalMetadataExtractorService {

  /**
   * Convert file path for platform compatibility
   * Handles Unix-to-Windows path conversion when needed
   */
  private convertFilePathForPlatform(filePath: string): string {
    // If it's already a Windows path, return as-is
    if (filePath.includes(':\\') || filePath.includes(":/")) {
      return filePath;
    }

    // If it starts with /var/www/lsemb/, convert to Windows path
    if (filePath.startsWith('/var/www/lsemb/')) {
      const relativePath = filePath.substring('/var/www/lsemb/'.length);
      return `C:\\xampp\\htdocs\\lsemb\\${relativePath}`;
    }

    // If it starts with /docs/, convert to Windows path
    if (filePath.startsWith('/docs/')) {
      const relativePath = filePath.substring('/docs/'.length);
      return `C:\\xampp\\htdocs\\lsemb\\docs\\${relativePath}`;
    }

    // If it's a Unix absolute path starting with /, convert to Windows format
    if (filePath.startsWith('/') && !filePath.startsWith('/var/www/')) {
      // Assume it's relative to lsemb/docs if it doesn't match other patterns
      return `C:\\xampp\\htdocs\\lsemb\\docs${filePath}`;
    }

    // Return as-is if no conversion needed
    return filePath;
  }

  /**
   * Extract metadata from PDF file using local libraries + optional LLM enhancement
   */
  async extractMetadata(
    filePath: string,
    documentId: string,
    filename: string,
    options?: {
      apiKey?: string;
      deepseekApiKey?: string;
      analysisPrompt?: string;
      template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music';
      templateData?: any;  // Full template object with target_fields and focus_keywords
    }
  ): Promise<MetadataExtractionResult> {
    const startTime = Date.now();

    try {
      console.log(`[Local Metadata Extractor] Processing: ${filename}`);
      console.log(`[Local Metadata Extractor] Original path: ${filePath}`);

      // Convert file path for Windows compatibility
      const adjustedFilePath = this.convertFilePathForPlatform(filePath);
      console.log(`[Local Metadata Extractor] Adjusted path: ${adjustedFilePath}`);

      // Read PDF file
      const dataBuffer = fs.readFileSync(adjustedFilePath);

      // Extract text using pdf-parse
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text;

      // Extract PDF metadata using pdf-lib
      const pdfDoc = await PDFDocument.load(dataBuffer);
      const pageCount = pdfDoc.getPageCount();
      const pdfInfo = {
        title: pdfDoc.getTitle(),
        author: pdfDoc.getAuthor(),
        subject: pdfDoc.getSubject(),
        keywords: pdfDoc.getKeywords(),
        creator: pdfDoc.getCreator(),
        producer: pdfDoc.getProducer(),
        creationDate: pdfDoc.getCreationDate(),
        modificationDate: pdfDoc.getModificationDate(),
        pageCount,
      };

      // Use Vision OCR for visual-heavy templates (sheet_music, charts, diagrams)
      let visionOCRResult = null;
      if (options?.apiKey && (options?.template === 'sheet_music' || options?.template === 'research')) {
        try {
          console.log('[Local Metadata Extractor] Using Vision OCR for visual elements');
          const visionService = VisionOCRService.getInstance();
          visionOCRResult = await visionService.processPDFWithVision(adjustedFilePath, {
            template: options.template,
            focusKeywords: options.templateData?.focus_keywords || [],
            language: 'auto',
            apiKey: options.apiKey
          });
          console.log(`[Local Metadata Extractor] Vision OCR found ${visionOCRResult.visualElements.length} visual elements`);

          // Add visual elements to template data
          if (!options.templateData) {
            options.templateData = {};
          }
          options.templateData.visualElements = visionOCRResult.visualElements;

          // Use Vision OCR text if available and better than pdf-parse
          if (visionOCRResult.text && visionOCRResult.text.length > text.length * 0.5) {
            console.log('[Local Metadata Extractor] Using Vision OCR text (more complete)');
            // text = visionOCRResult.text; // Optionally replace text
          }
        } catch (visionError: any) {
          console.warn('[Local Metadata Extractor] Vision OCR failed:', visionError.message);
        }
      }

      // Use LLM if API key is provided
      let metadata: PDFMetadata;
      let tokensUsed = 0;

      if (options?.apiKey) {
        console.log('[Local Metadata Extractor] Using LLM enhancement with Gemini');
        try {
          const llmResult = await this.extractWithLLM(text, filename, pdfInfo, options);
          metadata = llmResult.metadata;
          tokensUsed = llmResult.tokensUsed;

          // Override statistics with accurate local calculations (LLM only sees 15k chars)
          const accurateStats = this.calculateStatistics(text, pdfInfo.pageCount || pdfData.numpages);
          metadata.statistics = accurateStats;

          // Add structure analysis from local algorithms
          if (!metadata.structure) {
            metadata.structure = this.analyzeStructure(text);
          }
        } catch (llmError: any) {
          console.warn('[Local Metadata Extractor] Gemini extraction failed, checking for fallback options');
          console.warn('[Local Metadata Extractor] Gemini Error:', llmError.message);

          // Try DeepSeek as cheap fallback if API key provided
          if (options?.deepseekApiKey) {
            try {
              console.log('[Local Metadata Extractor] Trying DeepSeek as fallback (cheap alternative)');
              const deepseekResult = await this.extractWithDeepSeek(text, filename, pdfInfo, options);
              metadata = deepseekResult.metadata;
              tokensUsed = deepseekResult.tokensUsed;

              // Override statistics with accurate local calculations
              const accurateStats = this.calculateStatistics(text, pdfInfo.pageCount || pdfData.numpages);
              metadata.statistics = accurateStats;

              if (!metadata.structure) {
                metadata.structure = this.analyzeStructure(text);
              }
            } catch (deepseekError) {
              console.warn('[Local Metadata Extractor] DeepSeek also failed, using local algorithms');
              console.warn('[Local Metadata Extractor] DeepSeek Error:', deepseekError.message);
              metadata = await this.analyzeContent(text, filename, pdfInfo, pdfData, adjustedFilePath, options);
            }
          } else {
            // No DeepSeek key, fall back to local algorithms
            console.log('[Local Metadata Extractor] No DeepSeek fallback available, using local algorithms');
            metadata = await this.analyzeContent(text, filename, pdfInfo, pdfData, adjustedFilePath, options);
          }
        }
      } else {
        console.log('[Local Metadata Extractor] Using local algorithms');
        // Analyze text content with local algorithms
        metadata = await this.analyzeContent(text, filename, pdfInfo, pdfData, adjustedFilePath, options);
      }

      const processingTime = Date.now() - startTime;

      // Generate content hash and excerpt for transformed database
      const contentHash = crypto.createHash('sha256').update(text).digest('hex');
      const textExcerpt = text.substring(0, 500) + (text.length > 500 ? '...' : '');

      return {
        documentId,
        metadata: {
          ...metadata,
          _fullText: text,  // Hidden from JSON display, used for DB insert
          _contentHash: contentHash,  // For duplicate detection
          _textExcerpt: textExcerpt  // Shown in JSON instead of full text
        },
        processingTime,
        tokensUsed
      };
    } catch (error) {
      console.error('[Local Metadata Extractor] Error:', error);

      // Return basic fallback metadata
      const processingTime = Date.now() - startTime;
      return {
        documentId,
        metadata: this.createFallbackMetadata(filename),
        processingTime,
        tokensUsed: 0
      };
    }
  }

  /**
   * Analyze content and extract metadata
   */
  private async analyzeContent(
    text: string,
    filename: string,
    pdfInfo: any,
    pdfData: any,
    filePath?: string,
    options?: {
      apiKey?: string;
      deepseekApiKey?: string;
      analysisPrompt?: string;
      template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music';
    }
  ): Promise<PDFMetadata> {
    const limitedText = text.substring(0, 10000);
    const words = this.tokenize(text);

    // Calculate statistics
    const statistics = this.calculateStatistics(text, pdfInfo.pageCount || pdfData.numpages);

    // Extract structure
    const structure = this.analyzeStructure(text);

    // Content analysis (template-specific)
    const contentAnalysis = this.generateTemplateSpecificContentAnalysis(text, options?.template);

    // Extract tables using advanced table extraction
    let extractedTables: { tables: any[], summary: { totalTables: number, highConfidenceTables: number, extractionMethods: string[], processingTime: number } } = {
      tables: [],
      summary: { totalTables: 0, highConfidenceTables: 0, extractionMethods: [], processingTime: 0 }
    };
    let hasStructuredData = this.hasStructuredData(text);
    let tableCount = this.countTables(text);

    // Enhanced table extraction if file path available
    if (filePath) {
      try {
        console.log(`[Content Analysis] Running advanced table extraction`);

        // Get DeepSeek key for OCR if available
        const deepseekKey = options?.deepseekApiKey || process.env.DEEPSEEK_API_KEY;

        extractedTables = await tableExtractionService.extractTables(filePath, text, {
          useOCR: !!deepseekKey, // Enable OCR if DeepSeek key available
          deepseekApiKey: deepseekKey,
          useMultimodal: !!options?.apiKey // Enable multimodal if Gemini key available
        });

        console.log(`[Content Analysis] Found ${extractedTables.summary.totalTables} tables using ${extractedTables.summary.extractionMethods.join(', ')}`);

        // Update structured data flags
        if (extractedTables.summary.totalTables > 0) {
          hasStructuredData = true;
          tableCount = extractedTables.summary.totalTables;
        }
      } catch (error) {
        console.warn('[Content Analysis] Table extraction failed:', error.message);
      }
    }

    return {
      summary: this.generateSummary(limitedText, pdfInfo),
      keywords: this.extractKeywords(words, pdfInfo),
      topics: this.extractTopics(limitedText),
      category: this.classifyCategory(limitedText, filename),
      language: this.detectLanguage(limitedText),

      // NEW: Statistics
      statistics,

      // NEW: Structure
      structure,

      // NEW: Content Analysis
      contentAnalysis,

      // NEW: Extracted Tables
      tables: extractedTables.tables,

      entities: {
        people: this.extractPeople(limitedText),
        organizations: this.extractOrganizations(limitedText),
        locations: this.extractLocations(limitedText),
        dates: this.extractDates(limitedText),
        money: this.extractMoney(limitedText),
      },
      dataQuality: {
        score: this.calculateQualityScore(text),
        hasStructuredData,
        tableCount,
        suggestedTableName: this.suggestTableName(filename, limitedText),
      }
    };
  }

  /**
   * Generate summary from PDF info and text
   */
  private generateSummary(text: string, pdfInfo: any): string {
    const parts: string[] = [];

    // Use PDF metadata if available
    if (pdfInfo.title) {
      parts.push(`Document: ${pdfInfo.title}`);
    }
    if (pdfInfo.author) {
      parts.push(`Author: ${pdfInfo.author}`);
    }
    if (pdfInfo.subject) {
      parts.push(pdfInfo.subject);
    }

    // Extract first meaningful sentence from text
    const sentences = text.split(/[.!?]\s+/).filter(s => s.length > 20);
    if (sentences.length > 0 && parts.length < 2) {
      parts.push(sentences[0].substring(0, 150) + '...');
    }

    return parts.length > 0 ? parts.join('. ') : 'PDF document';
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(words: string[], pdfInfo: any): string[] {
    const keywords = new Set<string>();

    // Add PDF keywords if available
    if (pdfInfo.keywords) {
      const pdfKeywords = pdfInfo.keywords.split(/[,;]\s*/);
      pdfKeywords.forEach(k => keywords.add(k.trim().toLowerCase()));
    }

    // Count word frequency
    const frequency: { [key: string]: number } = {};
    const stopWords = this.getStopWords();

    words.forEach(word => {
      const lower = word.toLowerCase();
      if (lower.length > 3 && !stopWords.has(lower)) {
        frequency[lower] = (frequency[lower] || 0) + 1;
      }
    });

    // Get top keywords by frequency
    const sorted = Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);

    sorted.forEach(k => keywords.add(k));

    return Array.from(keywords).slice(0, 15);
  }

  /**
   * Extract main topics
   */
  private extractTopics(text: string): string[] {
    const topics: string[] = [];
    const lower = text.toLowerCase();

    // Simple topic detection based on keywords
    const topicPatterns = {
      'Finance': /\b(invoice|payment|contract|financial|revenue|cost|budget)\b/,
      'Legal': /\b(agreement|contract|clause|terms|legal|law|court)\b/,
      'Technical': /\b(specification|technical|system|software|hardware|api)\b/,
      'Medical': /\b(patient|medical|diagnosis|treatment|prescription|health)\b/,
      'Academic': /\b(research|study|analysis|paper|journal|academic)\b/,
      'Administrative': /\b(form|application|request|administrative|office)\b/,
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(lower)) {
        topics.push(topic);
      }
    }

    return topics.length > 0 ? topics : ['General'];
  }

  /**
   * Classify document category
   */
  private classifyCategory(text: string, filename: string): string {
    const lower = text.toLowerCase() + ' ' + filename.toLowerCase();

    if (/\b(invoice|payment|financial|revenue)\b/.test(lower)) return 'Financial';
    if (/\b(contract|agreement|legal|law)\b/.test(lower)) return 'Legal';
    if (/\b(manual|specification|technical)\b/.test(lower)) return 'Technical';
    if (/\b(patient|medical|prescription)\b/.test(lower)) return 'Medical';
    if (/\b(research|paper|journal|thesis)\b/.test(lower)) return 'Academic';
    if (/\b(form|application|administrative)\b/.test(lower)) return 'Administrative';

    return 'Other';
  }

  /**
   * Detect primary language with enhanced support including Vietnamese
   */
  private detectLanguage(text: string): string {
    const sample = text.substring(0, 2000).toLowerCase();

    // Extended language detection based on common words and characters
    const turkishWords = /\b(ve|bir|için|ile|bu|olan|olarak|da|de|ama|fakat|ancak)\b/g;
    const englishWords = /\b(the|and|for|with|this|that|from|they|were|been|will|would)\b/g;
    const germanWords = /\b(und|der|die|das|ist|ein|eine|nicht|oder|aber|wenn)\b/g;

    // Vietnamese detection - special characters and common words
    const vietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g;
    const vietnameseWords = /\b(và|của|cho|cái|là|mà|nhưng|nếu|khi|đã|trên|dưới|với|có|không|được)\b/g;

    // French detection
    const frenchWords = /\b(le|la|les|de|du|des|et|pour|avec|ce|que|qui|dans|sur|par|pas)\b/g;

    // Spanish detection
    const spanishWords = /\b(el|la|los|las|de|del|y|para|con|este|que|quien|en|por|no)\b/g;

    const turkishMatches = (sample.match(turkishWords) || []).length;
    const englishMatches = (sample.match(englishWords) || []).length;
    const germanMatches = (sample.match(germanWords) || []).length;
    const vietnameseCharMatches = (sample.match(vietnameseChars) || []).length;
    const vietnameseWordMatches = (sample.match(vietnameseWords) || []).length;
    const frenchMatches = (sample.match(frenchWords) || []).length;
    const spanishMatches = (sample.match(spanishWords) || []).length;

    // Calculate Vietnamese score (both characters and words)
    const vietnameseScore = vietnameseCharMatches.length * 5 + vietnameseWordMatches.length * 10;

    console.log(`[Language Detection] Matches: TR=${turkishMatches}, EN=${englishMatches}, DE=${germanMatches}, VI=${vietnameseScore}, FR=${frenchMatches}, ES=${spanishMatches}`);

    // Determine language based on highest score
    if (vietnameseScore > 10) return 'vi';
    if (turkishMatches > englishMatches && turkishMatches > germanMatches && turkishMatches > 2) return 'tr';
    if (frenchMatches > 3) return 'fr';
    if (spanishMatches > 3) return 'es';
    if (germanMatches > englishMatches && germanMatches > 2) return 'de';

    return 'en'; // Default to English
  }

  /**
   * Extract people names (basic pattern matching)
   */
  private extractPeople(text: string): string[] {
    const names = new Set<string>();
    // Pattern: Capitalized words (potential names)
    const namePattern = /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    const matches = text.match(namePattern) || [];

    matches.forEach(name => {
      if (name.split(' ').length >= 2 && name.split(' ').length <= 4) {
        names.add(name);
      }
    });

    return Array.from(names).slice(0, 10);
  }

  /**
   * Extract organization names
   */
  private extractOrganizations(text: string): string[] {
    const orgs = new Set<string>();
    // Common organization suffixes
    const orgPattern = /\b([A-Z][A-Za-z\s&]+(?:Inc\.|LLC|Ltd\.|Corp\.|Company|Corporation|GmbH|A\.?Ş\.|Limited))\b/g;
    const matches = text.match(orgPattern) || [];

    matches.forEach(org => orgs.add(org.trim()));

    return Array.from(orgs).slice(0, 10);
  }

  /**
   * Extract locations
   */
  private extractLocations(text: string): string[] {
    const locations = new Set<string>();
    // Common location patterns
    const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:,\s+[A-Z]{2})?)\b/g;

    // Common cities/countries (you can expand this)
    const knownLocations = ['Istanbul', 'Ankara', 'London', 'New York', 'Paris', 'Berlin', 'Tokyo'];

    const words = text.split(/\s+/);
    words.forEach(word => {
      if (knownLocations.some(loc => word.includes(loc))) {
        locations.add(word);
      }
    });

    return Array.from(locations).slice(0, 10);
  }

  /**
   * Extract dates
   */
  private extractDates(text: string): string[] {
    const dates = new Set<string>();
    // Date patterns: DD/MM/YYYY, DD-MM-YYYY, Month DD, YYYY
    const datePatterns = [
      /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ];

    datePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(date => dates.add(date));
    });

    return Array.from(dates).slice(0, 10);
  }

  /**
   * Extract money amounts
   */
  private extractMoney(text: string): string[] {
    const money = new Set<string>();
    // Money patterns: $100, €50, £25, 100 USD, 50 TRY
    const moneyPattern = /\b(?:[\$€£¥₺]\s*\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP|TRY|JPY))\b/g;
    const matches = text.match(moneyPattern) || [];

    matches.forEach(amount => money.add(amount));

    return Array.from(money).slice(0, 10);
  }

  /**
   * Calculate data quality score
   */
  private calculateQualityScore(text: string): number {
    let score = 50; // Base score

    // Length check
    if (text.length > 1000) score += 10;
    if (text.length > 5000) score += 10;

    // Structure check
    if (this.hasStructuredData(text)) score += 15;

    // Content quality
    const words = text.split(/\s+/).length;
    if (words > 500) score += 10;

    // Readability
    const sentences = text.split(/[.!?]/).length;
    if (sentences > 10) score += 5;

    return Math.min(100, score);
  }

  /**
   * Check if document has structured data
   */
  private hasStructuredData(text: string): boolean {
    // Check for tables, lists, or structured content
    const hasTable = /\|.*\|.*\|/.test(text) || /\t.*\t/.test(text);
    const hasList = /\n\s*[-*•]\s/.test(text);
    const hasNumberedList = /\n\s*\d+\.\s/.test(text);

    return hasTable || hasList || hasNumberedList;
  }

  /**
   * Count tables in document
   */
  private countTables(text: string): number {
    const tablePattern = /\|.*\|.*\|/g;
    const matches = text.match(tablePattern) || [];
    return Math.floor(matches.length / 3); // Rough estimate
  }

  /**
   * Suggest table name based on content
   */
  private suggestTableName(filename: string, text: string): string {
    const baseName = filename.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const category = this.classifyCategory(text, filename).toLowerCase();

    return `${category}_${baseName}`;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text.split(/\s+/)
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(w => w.length > 0);
  }

  /**
   * Get common stop words
   */
  private getStopWords(): Set<string> {
    return new Set([
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has',
      'was', 'were', 'been', 'will', 'would', 'could', 'should',
      've', 'bir', 'için', 'ile', 'olan', 'olarak', 'den', 'dan'
    ]);
  }

  /**
   * Calculate document statistics
   */
  private calculateStatistics(text: string, pageCount: number) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const paragraphCount = paragraphs.length;
    const characterCount = text.length;

    // Average reading speed: 200-250 words per minute
    const readingTimeMinutes = Math.ceil(wordCount / 225);

    const averageWordsPerSentence = sentenceCount > 0
      ? Math.round(wordCount / sentenceCount)
      : 0;

    return {
      pageCount,
      wordCount,
      sentenceCount,
      paragraphCount,
      characterCount,
      readingTimeMinutes,
      averageWordsPerSentence
    };
  }

  /**
   * Analyze document structure (chapters, sections, headings)
   */
  private analyzeStructure(text: string) {
    const lines = text.split('\n');

    // Detect chapters (common patterns)
    const chapterPatterns = [
      /^Chapter\s+(\d+|[IVXLCDM]+)[\s:\-]+(.*)/i,
      /^CHAPTER\s+(\d+|[IVXLCDM]+)[\s:\-]+(.*)/,
      /^Bölüm\s+(\d+|[IVXLCDM]+)[\s:\-]+(.*)/i,
      /^Part\s+(\d+|[IVXLCDM]+)[\s:\-]+(.*)/i,
      /^\d+\.\s+[A-Z][A-Za-z\s]{3,50}$/  // "1. Introduction" pattern
    ];

    const chapters: string[] = [];
    const sections: string[] = [];
    const headings: string[] = [];

    lines.forEach(line => {
      const trimmed = line.trim();

      // Check for chapters
      for (const pattern of chapterPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          chapters.push(trimmed);
          break;
        }
      }

      // Detect headings (all caps lines, or lines ending with colon)
      if (trimmed.length > 5 && trimmed.length < 100) {
        if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
          headings.push(trimmed);
        } else if (/^\d+\.\d+/.test(trimmed)) {  // Numbered sections like "1.1 Introduction"
          sections.push(trimmed);
        }
      }
    });

    // Check for table of contents
    const hasTableOfContents = text.toLowerCase().includes('table of contents') ||
                                text.toLowerCase().includes('contents') && chapters.length > 0;

    return {
      hasTableOfContents,
      chapterCount: chapters.length,
      chapters: chapters.slice(0, 20),  // Max 20 chapters
      sectionCount: sections.length,
      sections: sections.slice(0, 30),  // Max 30 sections
      headings: headings.slice(0, 50)   // Max 50 headings
    };
  }

  /**
   * Analyze content type (for books/novels)
   */
  private analyzeContentType(fullText: string, limitedText: string) {
    // Extract main characters using full text with strategic sampling
    const mainCharacters = this.extractMainCharacters(fullText);

    // Detect narrative style
    const narrativeStyle = this.detectNarrativeStyle(limitedText);

    // Detect genre
    const genre = this.detectGenre(limitedText);

    // Document type
    const documentType = this.detectDocumentType(fullText, limitedText);

    return {
      mainCharacters,
      narrativeStyle,
      genre,
      documentType
    };
  }

  /**
   * Extract main characters from text using Hybrid Approach (Approach C)
   * - Strategic sampling (beginning, middle, end, random)
   * - Full-text frequency analysis
   * - Possessive form detection (Alobar's, Kudra's)
   * - Dialogue detection with bonus scoring
   * - TF-IDF-like scoring for better name detection
   * - NO DEPENDENCY on Google/LLM quota
   */
  private extractMainCharacters(text: string): string[] {
    const textLength = text.length;

    // STEP 1: Strategic Sampling
    // Sample from different parts of the document for comprehensive coverage
    const samples: string[] = [];

    // Beginning (first 15%)
    samples.push(text.substring(0, Math.min(textLength * 0.15, 30000)));

    // Middle sections (3 samples at 30%, 50%, 70%)
    const samplePoints = [0.30, 0.50, 0.70];
    samplePoints.forEach(point => {
      const start = Math.floor(textLength * point);
      const end = Math.min(start + 10000, textLength);
      samples.push(text.substring(start, end));
    });

    // End (last 15%)
    const endStart = Math.max(0, textLength - Math.min(textLength * 0.15, 30000));
    samples.push(text.substring(endStart));

    // Random samples (2 random sections for diversity)
    for (let i = 0; i < 2; i++) {
      const randomStart = Math.floor(Math.random() * (textLength * 0.6)) + (textLength * 0.2);
      const randomEnd = Math.min(randomStart + 8000, textLength);
      samples.push(text.substring(randomStart, randomEnd));
    }

    // STEP 2: Extract names with multiple patterns
    interface NameScore {
      count: number;
      possessiveCount: number;
      dialogueCount: number;
      sampleAppearances: number;
      score: number;
    }

    const nameScores: { [key: string]: NameScore } = {};

    samples.forEach(sample => {
      // Pattern 1: Standard capitalized names (single or full names)
      const namePattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g;

      // Pattern 2: Possessive forms (Alobar's, Kudra's)
      const possessivePattern = /\b([A-Z][a-z]{2,})(?:'s|'s)\b/g;

      // Pattern 3: Names in dialogue (bonus scoring)
      const dialoguePattern = /[""]([^"""]{0,100}\b([A-Z][a-z]{2,})\b[^"""]{0,100})[""]?/g;

      // Extract standard names
      let match;
      const sampleNames = new Set<string>();

      while ((match = namePattern.exec(sample)) !== null) {
        const name = match[1];
        if (this.isValidCharacterName(name)) {
          sampleNames.add(name);
          if (!nameScores[name]) {
            nameScores[name] = { count: 0, possessiveCount: 0, dialogueCount: 0, sampleAppearances: 0, score: 0 };
          }
          nameScores[name].count++;
        }
      }

      // Extract possessive forms (strong indicator of character)
      while ((match = possessivePattern.exec(sample)) !== null) {
        const name = match[1];
        if (this.isValidCharacterName(name)) {
          if (!nameScores[name]) {
            nameScores[name] = { count: 0, possessiveCount: 0, dialogueCount: 0, sampleAppearances: 0, score: 0 };
          }
          nameScores[name].possessiveCount++;
          nameScores[name].count++; // Also count as regular mention
        }
      }

      // Extract names in dialogue (strong indicator of character)
      while ((match = dialoguePattern.exec(sample)) !== null) {
        const name = match[2];
        if (this.isValidCharacterName(name)) {
          if (!nameScores[name]) {
            nameScores[name] = { count: 0, possessiveCount: 0, dialogueCount: 0, sampleAppearances: 0, score: 0 };
          }
          nameScores[name].dialogueCount++;
        }
      }

      // Track sample appearances (TF-IDF concept)
      sampleNames.forEach(name => {
        if (nameScores[name]) {
          nameScores[name].sampleAppearances++;
        }
      });
    });

    // STEP 3: Calculate composite scores
    // Score = (base_frequency * 1.0) + (possessive * 3.0) + (dialogue * 2.5) + (sample_diversity * 10)
    Object.keys(nameScores).forEach(name => {
      const ns = nameScores[name];
      ns.score =
        (ns.count * 1.0) +                    // Base frequency
        (ns.possessiveCount * 3.0) +          // Possessive forms are strong indicators
        (ns.dialogueCount * 2.5) +            // Dialogue mentions are strong indicators
        (ns.sampleAppearances * 10);          // Appearing across samples = important character
    });

    // STEP 4: Filter and rank
    const minScore = 5; // Minimum score to be considered
    const topCharacters = Object.entries(nameScores)
      .filter(([_, ns]) => ns.score >= minScore)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 12)
      .map(([name]) => name);

    console.log('[Character Extraction] Top characters with scores:',
      Object.entries(nameScores)
        .filter(([name]) => topCharacters.includes(name))
        .map(([name, ns]) => `${name}: ${ns.score.toFixed(1)} (freq:${ns.count}, poss:${ns.possessiveCount}, dial:${ns.dialogueCount}, samples:${ns.sampleAppearances})`)
    );

    return topCharacters;
  }

  /**
   * Validate if a name is a valid character name (not a pronoun or common word)
   */
  private isValidCharacterName(name: string): boolean {
    // Must be at least 3 characters
    if (name.length < 3) return false;

    // Filter out pronouns and common words
    if (this.isPronoun(name) || this.isCommonWord(name)) return false;

    // Filter out common verbs and adjectives that might be capitalized
    const commonCapitalizedWords = new Set([
      'Said', 'Asked', 'Told', 'Went', 'Came', 'Made', 'Took', 'Gave',
      'Found', 'Thought', 'Looked', 'Seemed', 'Felt', 'Knew', 'Left',
      'During', 'Before', 'After', 'While', 'Since', 'Until', 'Through'
    ]);

    if (commonCapitalizedWords.has(name)) return false;

    // Must contain at least one lowercase letter (avoid all-caps abbreviations)
    if (!/[a-z]/.test(name)) return false;

    return true;
  }

  /**
   * Detect narrative style
   */
  private detectNarrativeStyle(text: string): string {
    const firstPerson = (text.match(/\b(I|me|my|mine|we|us|our)\b/gi) || []).length;
    const thirdPerson = (text.match(/\b(he|him|his|she|her|they|them|their)\b/gi) || []).length;

    if (firstPerson > thirdPerson * 1.5) return 'first_person';
    if (thirdPerson > firstPerson * 1.5) return 'third_person';
    return 'mixed';
  }

  /**
   * Detect genre based on keywords
   */
  private detectGenre(text: string): string {
    const lower = text.toLowerCase();

    const genreKeywords = {
      'fiction_novel': ['character', 'protagonist', 'plot', 'story', 'chapter'],
      'technical': ['system', 'method', 'algorithm', 'implementation', 'function'],
      'academic': ['research', 'study', 'hypothesis', 'methodology', 'conclusion'],
      'business': ['market', 'strategy', 'business', 'company', 'revenue'],
      'legal': ['contract', 'agreement', 'party', 'clause', 'terms'],
    };

    let maxScore = 0;
    let detectedGenre = 'general';

    for (const [genre, keywords] of Object.entries(genreKeywords)) {
      const score = keywords.reduce((sum, keyword) => {
        const matches = (lower.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
        return sum + matches;
      }, 0);

      if (score > maxScore) {
        maxScore = score;
        detectedGenre = genre;
      }
    }

    return detectedGenre;
  }

  /**
   * Detect document type
   */
  private detectDocumentType(fullText: string, limitedText: string): string {
    const lower = limitedText.toLowerCase();

    if (/\b(abstract|introduction|methodology|conclusion|references)\b/.test(lower)) {
      return 'research_paper';
    }
    if (/\b(chapter|prologue|epilogue)\b/.test(lower)) {
      return 'book';
    }
    if (/\b(agreement|whereas|party|signature)\b/.test(lower)) {
      return 'legal_document';
    }
    if (/\b(invoice|payment|total|subtotal)\b/.test(lower)) {
      return 'invoice_financial';
    }
    if (fullText.length > 50000 && /\b(said|thought|felt|looked)\b/.test(lower)) {
      return 'novel_story';
    }

    return 'general_document';
  }

  /**
   * Check if word is a pronoun (should not be treated as character name)
   */
  private isPronoun(word: string): boolean {
    const pronouns = new Set([
      'I', 'You', 'He', 'She', 'It', 'We', 'They', 'Me', 'Him', 'Her', 'Us', 'Them',
      'My', 'Your', 'His', 'Her', 'Its', 'Our', 'Their', 'Mine', 'Yours', 'Hers', 'Ours', 'Theirs'
    ]);
    return pronouns.has(word);
  }

  /**
   * Check if word is a common word (not a name)
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'The', 'This', 'That', 'These', 'Those', 'What', 'Which', 'Who', 'When', 'Where',
      'Why', 'How', 'There', 'Here', 'Then', 'Now', 'Today', 'Tomorrow', 'Yesterday',
      'Chapter', 'Section', 'Page', 'Table', 'Figure', 'Appendix', 'Introduction',
      'Conclusion', 'Summary', 'References', 'Bibliography', 'Index', 'Preface'
    ]);
    return commonWords.has(word);
  }

  /**
   * Create fallback metadata when extraction fails
   */
  private createFallbackMetadata(filename: string): PDFMetadata {
    return {
      summary: `PDF document: ${filename}`,
      keywords: [filename.replace(/\.pdf$/i, '')],
      topics: ['General'],
      category: 'Other',
      language: 'en',
      statistics: {
        pageCount: 0,
        wordCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        characterCount: 0,
        readingTimeMinutes: 0,
        averageWordsPerSentence: 0
      },
      structure: {
        hasTableOfContents: false,
        chapterCount: 0,
        chapters: [],
        sectionCount: 0,
        sections: [],
        headings: []
      },
      contentAnalysis: {
        mainCharacters: [],
        narrativeStyle: 'unknown',
        genre: 'unknown',
        documentType: 'unknown'
      },
      tables: [],
      entities: {
        people: [],
        organizations: [],
        locations: [],
        dates: [],
        money: [],
      },
      dataQuality: {
        score: 30,
        hasStructuredData: false,
        tableCount: 0,
        suggestedTableName: filename.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '_'),
      }
    };
  }

  /**
   * Extract metadata from raw text content (for crawled web pages)
   */
  async extractMetadataFromText(
    text: string,
    documentId: string,
    options?: {
      apiKey?: string;
      deepseekApiKey?: string;
      analysisPrompt?: string;
      template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music';
      templateData?: any;
    }
  ): Promise<MetadataExtractionResult> {
    const startTime = Date.now();

    try {
      console.log(`[Text Metadata Extractor] Processing document: ${documentId}`);

      // Use LLM if API key is provided
      let metadata: PDFMetadata;
      let tokensUsed = 0;

      if (options?.apiKey) {
        console.log('[Text Metadata Extractor] Using LLM enhancement with Gemini');
        const result = await this.extractWithLLM(text, documentId, {}, {
          apiKey: options.apiKey,
          analysisPrompt: options.analysisPrompt,
          template: options.template,
          templateData: options.templateData
        });
        metadata = result.metadata;
        tokensUsed = result.tokensUsed;
      } else if (options?.deepseekApiKey) {
        console.log('[Text Metadata Extractor] Using DeepSeek fallback');
        const result = await this.extractWithDeepSeek(text, documentId, {}, {
          deepseekApiKey: options.deepseekApiKey,
          analysisPrompt: options.analysisPrompt,
          template: options.template,
          templateData: options.templateData
        });
        metadata = result.metadata;
        tokensUsed = result.tokensUsed;
      } else {
        // Basic metadata extraction without LLM
        metadata = {
          summary: text.substring(0, 500),
          keywords: [],
          topics: [],
          entities: {
            people: [],
            organizations: [],
            locations: [],
            dates: [],
            money: []
          },
          contentAnalysis: {},
          statistics: {
            pageCount: 0,
            wordCount: text.split(/\s+/).length,
            sentenceCount: 0,
            paragraphCount: 0,
            characterCount: text.length,
            readingTimeMinutes: 0,
            averageWordsPerSentence: 0
          },
          structure: {
            hasTableOfContents: false,
            chapterCount: 0,
            chapters: [],
            sectionCount: 0,
            sections: [],
            headings: []
          },
          dataQuality: {
            score: 30,
            hasStructuredData: false,
            tableCount: 0,
            suggestedTableName: documentId.toLowerCase().replace(/[^a-z0-9]/g, '_')
          }
        } as PDFMetadata;
      }

      const processingTime = Date.now() - startTime;

      return {
        documentId,
        metadata,
        processingTime,
        tokensUsed
      };
    } catch (error: any) {
      console.error('[Text Metadata Extractor] Error:', error);

      // Return basic fallback metadata
      const processingTime = Date.now() - startTime;
      return {
        documentId,
        metadata: {
          summary: text.substring(0, 500),
          keywords: [],
          topics: [],
          entities: {
            people: [],
            organizations: [],
            locations: [],
            dates: [],
            money: []
          },
          contentAnalysis: {},
          statistics: {
            pageCount: 0,
            wordCount: text.split(/\s+/).length,
            sentenceCount: 0,
            paragraphCount: 0,
            characterCount: text.length,
            readingTimeMinutes: 0,
            averageWordsPerSentence: 0
          },
          structure: {
            hasTableOfContents: false,
            chapterCount: 0,
            chapters: [],
            sectionCount: 0,
            sections: [],
            headings: []
          },
          dataQuality: {
            score: 30,
            hasStructuredData: false,
            tableCount: 0,
            suggestedTableName: documentId.toLowerCase().replace(/[^a-z0-9]/g, '_')
          }
        } as PDFMetadata,
        processingTime,
        tokensUsed: 0
      };
    }
  }

  /**
   * Extract metadata using LLM (Gemini)
   */
  private async extractWithLLM(
    text: string,
    filename: string,
    pdfInfo: any,
    options: {
      apiKey: string;
      analysisPrompt?: string;
      template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music';
      templateData?: any;  // Full template object with target_fields
    }
  ): Promise<{ metadata: PDFMetadata; tokensUsed: number }> {
    const genAI = new GoogleGenerativeAI(options.apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    // Build template-aware analysis prompt
    const analysisPrompt = this.buildTemplateAwareAnalysisPrompt(
      options.template,
      options.templateData,
      options.analysisPrompt
    );

    // Build template-aware JSON schema
    const jsonSchema = this.buildTemplateAwareJsonSchema(options.template, options.templateData);

    // Limit text to avoid token limits
    const limitedText = text.substring(0, 15000);

    // Build focus keywords section
    let focusKeywordsSection = '';
    const focusKeywords = options.templateData?.focus_keywords || [];
    if (focusKeywords.length > 0) {
      focusKeywordsSection = `\n\nFOCUS KEYWORDS (Human-in-the-Loop):\nUser wants to find these keywords in the document: ${focusKeywords.join(', ')}\n- Add these to the "focusKeywords" field in JSON\n- For each keyword, find sentences/contexts where it appears and add to "keywordMatches" object\n`;
    }

    // Build visual elements section (tables from Vision OCR)
    let visualElementsSection = '';
    const visualElements = options.templateData?.visualElements || [];
    const tables = visualElements.filter((v: any) => v.type === 'table');
    if (tables.length > 0) {
      visualElementsSection = `\n\nEXTRACTED TABLES (from Vision OCR):\n`;
      tables.forEach((table: any, index: number) => {
        visualElementsSection += `Table ${index + 1}: ${table.description}\n${table.extractedData ? 'Data: ' + table.extractedData : ''}\n`;
      });
      visualElementsSection += `- Add these tables to the "extractedTables" field in JSON with proper structure\n`;
    }

    const prompt = `Analyze this PDF document and extract comprehensive metadata in JSON format.

DOCUMENT TEXT:
${limitedText}

FILENAME: ${filename}
PAGE COUNT: ${pdfInfo.pageCount}${focusKeywordsSection}${visualElementsSection}

${analysisPrompt}

OUTPUT JSON STRUCTURE (GROUPED - follow this exact schema):
${jsonSchema}

IMPORTANT RULES:
- Output JSON with TWO top-level objects: "common" and "templateData"
- "common" contains universal metadata (summary, keywords, statistics, entities, etc.)
- "templateData.fields" contains template-specific fields (kanunNo, maddeler for legal; mainCharacters for novel; lyrics, makam for sheet_music)
- Extract ALL fields specified in the schema
- Be precise and thorough
- Only include entities that are clearly mentioned in the document
- Use multi-language awareness for all text analysis
- For legal documents: Focus on extracting law numbers, articles, dates, and authorities
- For novels: Focus on character names (ONLY proper names, NOT pronouns)
- For research papers: Focus on methodology, findings, and citations
- If focus keywords provided, MUST extract them and add to common.focusKeywords with contexts in common.keywordMatches
- If tables provided from OCR, MUST include them in common.extractedTables field

EXAMPLE OUTPUT STRUCTURE:
{
  "common": {
    "summary": "...",
    "keywords": [...],
    "focusKeywords": [...],
    "keywordMatches": {...},
    "extractedTables": [...],
    "statistics": {...},
    "structure": {...},
    "entities": {...},
    "dataQuality": {...}
  },
  "templateData": {
    "template": "legal",
    "fields": {
      "kanunNo": "213",
      "maddeler": ["Madde 1: ...", ...]
    }
  }
}`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      let metadata: PDFMetadata;
      try {
        metadata = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[LLM Extractor] JSON parse error:', parseError);
        throw new Error('Failed to parse LLM response as JSON');
      }

      const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

      return {
        metadata,
        tokensUsed
      };
    } catch (error) {
      console.error('[LLM Extractor] Error:', error);
      throw error;
    }
  }

  /**
   * Extract metadata using DeepSeek (cheap alternative to Gemini)
   * DeepSeek is extremely cost-effective: ~$0.14 per 1M tokens (vs Gemini free tier quota limits)
   */
  private async extractWithDeepSeek(
    text: string,
    filename: string,
    pdfInfo: any,
    options: {
      deepseekApiKey: string;
      analysisPrompt?: string;
      template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music';
      templateData?: any;  // Full template object with target_fields
    }
  ): Promise<{ metadata: PDFMetadata; tokensUsed: number }> {
    // Build template-aware analysis prompt
    const analysisPrompt = this.buildTemplateAwareAnalysisPrompt(
      options.template,
      options.templateData,
      options.analysisPrompt
    );

    // Build template-aware JSON schema
    const jsonSchema = this.buildTemplateAwareJsonSchema(options.template, options.templateData);

    // Limit text to avoid token limits
    const limitedText = text.substring(0, 15000);

    // Build focus keywords section
    let focusKeywordsSection = '';
    const focusKeywords = options.templateData?.focus_keywords || [];
    if (focusKeywords.length > 0) {
      focusKeywordsSection = `\n\nFOCUS KEYWORDS (Human-in-the-Loop):\nUser wants to find these keywords in the document: ${focusKeywords.join(', ')}\n- Add these to the "focusKeywords" field in JSON\n- For each keyword, find sentences/contexts where it appears and add to "keywordMatches" object\n`;
    }

    // Build visual elements section (tables from Vision OCR)
    let visualElementsSection = '';
    const visualElements = options.templateData?.visualElements || [];
    const tables = visualElements.filter((v: any) => v.type === 'table');
    if (tables.length > 0) {
      visualElementsSection = `\n\nEXTRACTED TABLES (from Vision OCR):\n`;
      tables.forEach((table: any, index: number) => {
        visualElementsSection += `Table ${index + 1}: ${table.description}\n${table.extractedData ? 'Data: ' + table.extractedData : ''}\n`;
      });
      visualElementsSection += `- Add these tables to the "extractedTables" field in JSON with proper structure\n`;
    }

    const prompt = `Analyze this PDF document and extract comprehensive metadata in JSON format.

DOCUMENT TEXT:
${limitedText}

FILENAME: ${filename}
PAGE COUNT: ${pdfInfo.pageCount}${focusKeywordsSection}${visualElementsSection}

${analysisPrompt}

OUTPUT JSON STRUCTURE (GROUPED - follow this exact schema):
${jsonSchema}

IMPORTANT RULES:
- Output JSON with TWO top-level objects: "common" and "templateData"
- "common" contains universal metadata (summary, keywords, statistics, entities, etc.)
- "templateData.fields" contains template-specific fields (kanunNo, maddeler for legal; mainCharacters for novel; lyrics, makam for sheet_music)
- Extract ALL fields specified in the schema
- Be precise and thorough
- Only include entities that are clearly mentioned in the document
- Output ONLY valid JSON, no markdown or extra text
- For legal documents: Focus on extracting law numbers, articles, dates, and authorities
- For novels: Focus on character names (ONLY proper names, NOT pronouns)
- For research papers: Focus on methodology, findings, and citations
- If focus keywords provided, MUST extract them and add to common.focusKeywords with contexts in common.keywordMatches
- If tables provided from OCR, MUST include them in common.extractedTables field

EXAMPLE OUTPUT STRUCTURE:
{
  "common": {
    "summary": "...",
    "keywords": [...],
    "focusKeywords": [...],
    "keywordMatches": {...},
    "extractedTables": [...],
    "statistics": {...},
    "structure": {...},
    "entities": {...},
    "dataQuality": {...}
  },
  "templateData": {
    "template": "legal",
    "fields": {
      "kanunNo": "213",
      "maddeler": ["Madde 1: ...", ...]
    }
  }
}`;

    try {
      // Call DeepSeek API (OpenAI-compatible endpoint)
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are a document analysis expert. Extract metadata from documents and return ONLY valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const responseText = data.choices[0].message.content;

      let metadata: PDFMetadata;
      try {
        metadata = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[DeepSeek Extractor] JSON parse error:', parseError);
        throw new Error('Failed to parse DeepSeek response as JSON');
      }

      const tokensUsed = data.usage?.total_tokens || 0;
      console.log(`[DeepSeek Extractor] Success! Tokens used: ${tokensUsed} (~$${(tokensUsed / 1000000 * 0.14).toFixed(4)})`);

      return {
        metadata,
        tokensUsed
      };
    } catch (error) {
      console.error('[DeepSeek Extractor] Error:', error);
      throw error;
    }
  }

  /**
   * Build template-aware JSON schema dynamically based on template type
   * GROUPED STRUCTURE: common + templateData (for clean field separation)
   */
  private buildTemplateAwareJsonSchema(
    template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music',
    templateData?: any
  ): string {
    // COMMON METADATA (same for all templates)
    const commonSchema = {
      summary: "string - concise 2-3 sentence summary",
      keywords: "array of strings - 10-15 relevant keywords",
      topics: "array of strings - 3-5 main topics",
      category: "string - Financial|Legal|Technical|Medical|Academic|Administrative|Other",
      language: "string - en|tr|de|fr|es|vi|...",

      // Focus keywords provided by user (Human-in-the-Loop)
      focusKeywords: "array of strings - keywords user wants to find/extract",
      keywordMatches: "object - for each focus keyword, array of sentences/contexts where it appears",

      statistics: {
        pageCount: "number",
        wordCount: "number",
        sentenceCount: "number",
        paragraphCount: "number",
        characterCount: "number",
        readingTimeMinutes: "number",
        averageWordsPerSentence: "number"
      },

      structure: {
        hasTableOfContents: "boolean",
        chapterCount: "number",
        chapters: "array of strings",
        sectionCount: "number",
        sections: "array of strings",
        headings: "array of strings"
      },

      entities: {
        people: "array of strings",
        organizations: "array of strings",
        locations: "array of strings",
        dates: "array of strings (ISO format if possible)",
        money: "array of strings"
      },

      // Extracted tables from Vision OCR
      extractedTables: "array of objects - tables detected by OCR with structure: {tableId: string, description: string, rows: array, columns: array, data: array}",

      dataQuality: {
        score: "number (0-100)",
        hasStructuredData: "boolean",
        tableCount: "number",
        suggestedTableName: "string (snake_case)"
      }
    };

    // Template-specific fields (will be nested under templateData.fields)
    let templateFieldsSchema: any = {};

    switch (template) {
      case 'legal':
        templateFieldsSchema = {
          kanunNo: "string - law number. Extract from 'Kanun Numarası: XXX' or 'XXX sayılı Kanun' (ONLY the number)",
          kanunAdi: "string - law name/title",
          kabulTarihi: "string - acceptance date (DD/MM/YYYY). Parse from 'Kabul Tarihi: X/X/XXXX'",
          yürürlükTarihi: "string - effective date (DD/MM/YYYY). Parse from 'Yürürlük Tarihi:'",
          yayinBilgisi: "object - {resmiGazete: {tarih: string, sayi: string}, dustur: {tertip: string, cilt: string, sayfa: string}}. Parse from 'Yayımlandığı R.Gazete: Tarih: X Sayı: Y'",
          mevzuatTuru: "string - Kanun|Yönetmelik|Tüzük|KHK|Kararname",
          maddeler: "array of strings - article texts (first 200 chars each). Extract 'Madde 1:', 'MADDE 2:' patterns",
          maddeSayisi: "number - count of articles",
          kisimlar: "array of strings - UPPERCASE section titles (BİRİNCİ KISIM, İKİNCİ KİTAP, etc.)",
          bolumler: "array of strings - chapter titles",
          degisiklikler: "array of strings - amendments",
          yaptirimlar: "array of strings - penalties with amounts",
          YetkiliKurum: "string - responsible authority",
          tarihBilgileri: "array of strings - ALL dates in document",
          ilgiliMevzuat: "array of strings - references to other laws"
        };
        break;

      case 'novel':
        templateFieldsSchema = {
          mainCharacters: "array of strings - ONLY proper names (e.g., 'John Smith', 'Mary'), NOT pronouns",
          narrativeStyle: "string - first_person|third_person|mixed",
          genre: "string - fiction_novel|mystery|romance|thriller|fantasy|etc",
          plotThemes: "array of strings - main themes",
          setting: "string - time period and location"
        };
        break;

      case 'research':
        templateFieldsSchema = {
          title: "string - paper title",
          authors: "array of strings - author names",
          abstract: "string - abstract/summary",
          methodology: "string - research methodology",
          researchDomain: "string - field of study",
          keyFindings: "array of strings - main findings",
          conclusions: "string - conclusions",
          citations: "array of strings - references",
          references_count: "number",
          doi: "string - DOI if available",
          publication_date: "string - publication date"
        };
        break;

      case 'invoice':
        templateFieldsSchema = {
          invoice_number: "string - invoice number",
          vendor_name: "string - seller name",
          invoice_date: "string - invoice date",
          due_date: "string - payment due date",
          total_amount: "string or number - total amount",
          tax_amount: "string or number - tax amount",
          line_items: "array of objects - items/services",
          payment_terms: "string - payment terms",
          currency: "string - currency code (USD, EUR, TRY, etc.)"
        };
        break;

      case 'contract':
        templateFieldsSchema = {
          contract_title: "string - contract title",
          parties: "array of strings - contracting parties",
          effective_date: "string - effective/start date",
          termination_date: "string - end/termination date",
          key_obligations: "array of strings - main obligations",
          payment_terms: "string - payment terms",
          liability_clauses: "array of strings - liability clauses",
          jurisdiction: "string - governing law/jurisdiction"
        };
        break;

      case 'web_page':
        templateFieldsSchema = {
          title: "string - web page title",
          summary: "string - concise summary of the web page content",
          mainTopics: "array of strings - main topics covered",
          entities: "array of strings - people, organizations, products mentioned",
          publishDate: "string - publication date if available",
          author: "string - author name if available",
          contentType: "string - article|blog|news|documentation|product_page|etc",
          keywords: "array of strings - relevant keywords",
          mainContent: "string - extract the main content (first 1000 chars)"
        };
        break;

      case 'sheet_music':
        templateFieldsSchema = {
          title: "string - song/piece title",
          composer: "string - composer name (besteci)",
          lyricist: "string - lyricist/poet name (güfteci/söz yazarı)",
          genre: "string - musical genre (klasik/pop/türkü/rock/jazz/etc)",
          key: "string - musical key (Do majör, La minör, etc) or makam for Turkish music",
          makam: "string - Turkish classical music makam (Hüseyni, Hicaz, Rast, Uşşak, etc) if applicable",
          usul: "string - Turkish classical music rhythm pattern (Sofyan, Düyek, Aksak, etc) if applicable",
          timeSignature: "string - time signature (4/4, 3/4, 6/8, 9/8, etc)",
          tempo: "string - tempo marking (Andante, Allegro, 120 BPM, etc)",
          lyrics: "string - full lyrics text with line breaks preserved",
          chords: "array of strings - chord progression (C, Am, F, G, etc)",
          musicalNotation: "string - any musical notation found (ABC notation, notes, etc)",
          language: "string - language of lyrics (Turkish, English, etc)",
          arranger: "string - arranger name if different from composer",
          publisher: "string - publisher/yayın evi",
          copyright: "string - copyright information",
          difficulty: "string - difficulty level (beginner/intermediate/advanced)",
          instruments: "array of strings - instruments (piyano, gitar, ses, etc)",
          form: "string - musical form (şarkı, türkü, marş, ninni, etc)"
        };
        break;

      default:
        templateFieldsSchema = {
          mainCharacters: "array of strings - if applicable",
          narrativeStyle: "string - first_person|third_person|mixed|academic|technical",
          genre: "string - document genre"
        };
    }

    // If templateData provided with target_fields, use those to enhance template fields
    if (templateData?.target_fields && Array.isArray(templateData.target_fields)) {
      console.log(`[Schema Builder] Using template target_fields:`, templateData.target_fields);

      // Override templateFieldsSchema with template-specific fields
      const customSchema: any = {};
      templateData.target_fields.forEach((field: string) => {
        // Provide intelligent field type hints based on field name
        if (field.includes('date') || field.includes('Date') || field.includes('Tarih')) {
          customSchema[field] = "string - date in format DD/MM/YYYY or YYYY-MM-DD";
        } else if (field.includes('count') || field.includes('Count') || field.includes('Sayisi')) {
          customSchema[field] = "number - count/quantity";
        } else if (field.includes('amount') || field.includes('Amount') || field.includes('total')) {
          customSchema[field] = "string or number - monetary amount";
        } else if (field === 'maddeler' || field === 'articles' || field.includes('list')) {
          customSchema[field] = "array of strings";
        } else {
          customSchema[field] = "string - extract this field from document";
        }
      });
      templateFieldsSchema = { ...templateFieldsSchema, ...customSchema };
    }

    // GROUPED STRUCTURE: common + templateData
    const fullSchema = {
      common: commonSchema,
      templateData: {
        template: template || 'general',
        fields: templateFieldsSchema
      }
    };

    return JSON.stringify(fullSchema, null, 2);
  }

  /**
   * Build template-aware analysis prompt with field-specific instructions
   */
  private buildTemplateAwareAnalysisPrompt(
    template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music',
    templateData?: any,
    customPrompt?: string
  ): string {
    // If custom prompt provided, use it
    if (customPrompt && customPrompt.trim().length > 0) {
      return `CUSTOM ANALYSIS REQUEST:\n${customPrompt}`;
    }

    // Get base instruction from template
    let baseInstruction = '';
    let fieldInstructions = '';

    switch (template) {
      case 'legal':
        baseInstruction = `This is a LEGAL STATUTE/REGULATION document (Kanun/Mevzuat).`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS (Extract values after colons ':'):

- kanunNo: Extract ONLY number from "Kanun Numarası: 213" → "213"
- kanunAdi: Full law name/title
- kabulTarihi: Parse "Kabul Tarihi: 4/1/1961" → "4/1/1961"
- yürürlükTarihi: Parse "Yürürlük Tarihi: ..." or similar
- yayinBilgisi: Parse structured data:
  "Yayımlandığı R.Gazete: Tarih: 10/1/1961 Sayı: 10703"
  "Yayımlandığı Düstur: Tertip: 4 Cilt: 1 Sayfa: 1"
  → {resmiGazete: {tarih: "10/1/1961", sayi: "10703"}, dustur: {tertip: "4", cilt: "1", sayfa: "1"}}

- mevzuatTuru: Identify: Kanun|Yönetmelik|Tüzük|KHK|Kararname

- maddeler: Extract articles with full text (first 200 chars each)
  Patterns: "Madde 1 -", "MADDE 2:", "Madde 3."
  Format: ["Madde 1 - Bu Kanunun adı \"Vergi Usul Kanunu\"dur...", ...]

- maddeSayisi: Count total articles

- kisimlar: Extract ALL UPPERCASE section headings:
  "BİRİNCİ KİSIM: Temel İlkeler", "İKİNCİ KİTAP: Genel Hükümler"
  → ["BİRİNCİ KISIM: Temel İlkeler", "İKİNCİ KİTAP: Genel Hükümler"]

- bolumler: Extract chapter titles

- yaptirimlar: Extract penalties with amounts
  "para cezası: 10.000 TL", "hapis cezası: 2 yıl"

- YetkiliKurum: Extract from "Bakanlık", "Başkanlık" mentions

- tarihBilgileri: Extract ALL dates in document (DD/MM/YYYY format)

- ilgiliMevzuat: Extract references like "5510 sayılı Kanun", "TTK madde 123"`;
        break;

      case 'novel':
        baseInstruction = `This is a NOVEL/FICTION document.`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS:
- mainCharacters: Extract ONLY proper character names (e.g., "John Smith", "Elizabeth")
  DO NOT include pronouns like "She", "He", "I", "You"
  DO NOT include common words like "Chapter", "Said"
  Extract 5-15 most frequently mentioned character names

- narrativeStyle: Determine if "first_person" (uses I/me), "third_person" (uses he/she), or "mixed"

- genre: Identify genre (fiction_novel, mystery, romance, thriller, fantasy, sci-fi, etc.)

- plotThemes: Extract 3-7 main themes (e.g., "love", "betrayal", "coming of age")

- setting: Describe time period and location (e.g., "1920s Paris", "Medieval England")`;
        break;

      case 'research':
        baseInstruction = `This is a RESEARCH PAPER.`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS:
- title: Extract paper title
- authors: Extract all author names
- abstract: Extract abstract/summary section
- methodology: Extract research methodology description
- researchDomain: Identify field (e.g., "Computer Science", "Biology", "Economics")
- keyFindings: Extract 3-5 main findings/results
- conclusions: Extract conclusions section
- citations: Extract references (sample 10-15)
- references_count: Count total references`;
        break;

      case 'invoice':
        baseInstruction = `This is an INVOICE/FINANCIAL DOCUMENT.`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS:
- invoice_number: Extract invoice/bill number
- vendor_name: Extract seller/vendor name
- invoice_date: Extract invoice date
- due_date: Extract payment due date
- total_amount: Extract total amount with currency
- tax_amount: Extract tax/VAT amount
- payment_terms: Extract payment terms (e.g., "Net 30")`;
        break;

      case 'contract':
        baseInstruction = `This is a CONTRACT/AGREEMENT document.`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS:
- contract_title: Extract contract title
- parties: Extract all contracting party names
- effective_date: Extract start/effective date
- termination_date: Extract end date if mentioned
- key_obligations: Extract main obligations of each party
- payment_terms: Extract payment conditions
- jurisdiction: Extract governing law/jurisdiction`;
        break;

      case 'web_page':
        baseInstruction = `This is a WEB PAGE content (article, blog post, or web document).`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS:
- title: Extract the main title/headline of the web page
- summary: Create a concise 2-3 sentence summary of the content
- mainTopics: Extract 3-5 main topics discussed in the content
- entities: Extract people, organizations, products, or brands mentioned
- publishDate: Look for publication date (format: YYYY-MM-DD if found)
- author: Extract author name if mentioned
- contentType: Classify as article|blog|news|documentation|product_page|landing_page|etc
- keywords: Extract 5-10 relevant keywords
- mainContent: Extract the first 1000 characters of the main text content`;
        break;

      case 'sheet_music':
        baseInstruction = `This is SHEET MUSIC / MUSICAL SCORE with notation and/or lyrics.`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS:
- title: Extract song/piece title
- composer: Extract composer name (look for "Beste:" "Besteci:" "Music by:" "Composer:")
- lyricist: Extract lyricist/poet name (look for "Güfte:" "Güfteci:" "Söz:" "Lyrics by:" "Poet:")
- genre: Identify genre (klasik/pop/türkü/rock/jazz/arabesk/marş/ninni/etc)
- key: Extract musical key (Do majör, La minör, C major, A minor, etc)
- makam: FOR TURKISH CLASSICAL MUSIC ONLY: Extract makam (Hüseyni, Hicaz, Rast, Uşşak, Kürdi, Nihavend, Segah, etc)
- usul: FOR TURKISH CLASSICAL MUSIC ONLY: Extract usul/rhythm (Sofyan, Düyek, Aksak, Sengin Semâî, Devr-i Hindi, etc)
- timeSignature: Extract time signature (4/4, 3/4, 6/8, 2/4, 9/8, 5/8, etc)
- tempo: Extract tempo (Andante, Allegro, Moderato, Largo, 120 BPM, etc)
- lyrics: Extract FULL LYRICS with line breaks preserved. Include all verses, chorus, bridge
- chords: Extract chord progression (C, Am, F, G7, Dm, etc) - look above or below lyrics
- musicalNotation: Extract any visible notation (ABC notation, note names, solfege, etc)
- language: Identify language of lyrics (Turkish, English, Arabic, etc)
- arranger: Extract arranger name if different from composer
- publisher: Extract publisher name (look for "Yayın:" "Publisher:" "©")
- copyright: Extract copyright info (© year, name)
- difficulty: Estimate difficulty level (beginner/kolay, intermediate/orta, advanced/ileri)
- instruments: Extract instruments mentioned (piyano, gitar, keman, ses, bağlama, etc)
- form: Extract musical form (şarkı, türkü, marş, ninni, oyun havası, zeybek, horon, etc)

IMPORTANT FOR LYRICS:
- Preserve original formatting and line breaks
- Include all verses, even if repeated
- Keep punctuation intact
- Extract chorus/nakarat if labeled
- If lyrics span multiple pages, combine them

IMPORTANT FOR TURKISH CLASSICAL MUSIC:
- Always extract both makam AND usul if present
- Common makams: Hüseyni, Hicaz, Rast, Uşşak, Nihavend, Kürdi, Segah, Hüzzam, Saba
- Common usuls: Sofyan (4/4), Düyek (8/8), Aksak (9/8), Sengin Semâî (6/4), Devr-i Hindi (7/8)
- Form types: Şarkı, Türkü, İlahi, Nefes, Gazel, Destan`;
        break;

      default:
        baseInstruction = `Analyze this document comprehensively.`;
        fieldInstructions = `
FIELD EXTRACTION INSTRUCTIONS:
- Auto-detect document type
- Extract all relevant metadata based on document type
- Identify key entities (people, organizations, locations, dates, amounts)`;
    }

    // Add template-specific field instructions if provided
    if (templateData?.target_fields && Array.isArray(templateData.target_fields)) {
      fieldInstructions += `\n\nADDITIONAL TEMPLATE FIELDS:`;
      templateData.target_fields.forEach((field: string) => {
        fieldInstructions += `\n- ${field}: Extract this field from the document`;
      });
    }

    // Add focus keywords if provided
    let keywordHint = '';
    if (templateData?.focus_keywords && Array.isArray(templateData.focus_keywords) && templateData.focus_keywords.length > 0) {
      keywordHint = `\n\nFOCUS KEYWORDS (pay special attention to these): ${templateData.focus_keywords.join(', ')}`;
    }

    return `${baseInstruction}${keywordHint}\n${fieldInstructions}`;
  }

  /**
   * Generate template-specific content analysis
   */
  private generateTemplateSpecificContentAnalysis(
    text: string,
    template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music'
  ): any {
    const baseAnalysis = {
      narrativeStyle: 'unknown',
      genre: 'unknown',
      documentType: 'unknown'
    };

    switch (template) {
      case 'legal':
        return {
          ...baseAnalysis,
          // Legal-specific fields instead of mainCharacters
          kanunNo: this.extractLawNumber(text),
          maddeler: this.extractArticles(text),
          yürürlükTarihi: this.extractEffectiveDate(text),
          mevzuatTuru: this.extractLawType(text),
          maddeSayisi: this.countArticles(text),
          degisiklikler: this.extractAmendments(text),
          yaptirimlar: this.extractSanctions(text),
          YetkiliKurum: this.extractAuthority(text)
        };

      case 'novel':
        return {
          ...baseAnalysis,
          mainCharacters: this.extractMainCharacters(text),
          narrativeStyle: this.detectNarrativeStyle(text),
          genre: this.detectGenre(text),
          plotThemes: this.extractPlotThemes(text),
          setting: this.extractSetting(text)
        };

      case 'research':
        return {
          ...baseAnalysis,
          methodology: this.extractMethodology(text),
          researchDomain: this.extractResearchDomain(text),
          keyFindings: this.extractKeyFindings(text),
          citations: this.extractCitations(text)
        };

      case 'invoice':
        return {
          ...baseAnalysis,
          invoiceNumber: this.extractInvoiceNumber(text),
          totalAmount: this.extractTotalAmount(text),
          seller: this.extractSeller(text),
          buyer: this.extractBuyer(text),
          paymentTerms: this.extractPaymentTerms(text)
        };

      case 'contract':
        return {
          ...baseAnalysis,
          parties: this.extractParties(text),
          contractType: this.extractContractType(text),
          keyTerms: this.extractKeyTerms(text),
          effectiveDate: this.extractContractEffectiveDate(text)
        };

      default:
        return {
          ...baseAnalysis,
          mainCharacters: [], // Keep for backward compatibility
          narrativeStyle: 'unknown',
          genre: 'unknown',
          documentType: this.detectDocumentType(text)
        };
    }
  }

  /**
   * Extract law number from legal text
   */
  private extractLawNumber(text: string): string {
    // Turkish law number patterns - using exec() for proper capture group extraction
    const patterns = [
      /Kanun Numarası\s*[:\-]?\s*([0-9]+)/i,
      /([0-9]+)\s*sayılı\s+(?:sayılı\s+)?(?:Kanun|Yasa)/i,
      /(?:Kanun|Yasa)\s+(?:Numarası|No|Sayısı)\s*[:\-]?\s*([0-9]+)/i,
      /([0-9]+)\s*(?:nolu|numaralı|sayılı)\s*(?:Kanun|Yasa|KHK)/i,
      /(?:Law|Act)\s*(?:No|Number|#)\s*[:\-]?\s*([0-9]+)/i,
      // Pattern for beginning of document
      /^([0-9]+)\s*[-–—]\s*(?:Vergi|Gelir|Kurumlar|Katma)/im
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        console.log(`[Law Number] Found: ${match[1]} using pattern: ${pattern.source}`);
        return match[1];
      }
    }

    console.log('[Law Number] Not found in text');
    return '';
  }

  /**
   * Extract articles (maddeler) from legal text
   */
  private extractArticles(text: string): string[] {
    const articles: string[] = [];
    const seenArticles = new Set<string>(); // To avoid duplicates

    // Turkish article patterns with better capture groups
    const mainPattern = /(?:Madde|MADDE|Article)\s+(\d+)\s*[-–—]?\s*[–-]?\s*(.{20,200}?)(?=\n(?:Madde|MADDE|Article)\s+\d+|\n\n|$)/gi;

    // Simpler fallback pattern
    const simplePattern = /(?:Madde|MADDE|Article)\s+(\d+)\s*[-–—:\s]*([^\n]{10,})/gi;

    // Try main pattern first
    let match;
    mainPattern.lastIndex = 0;
    while ((match = mainPattern.exec(text)) !== null) {
      const articleNum = match[1];
      const content = match[2].trim();

      if (!seenArticles.has(articleNum) && content.length >= 10) {
        // Clean up content
        const cleanContent = content
          .replace(/\s+/g, ' ')  // Normalize whitespace
          .replace(/^[-–—:\s]+/, '')  // Remove leading dashes/colons
          .trim();

        if (cleanContent.length >= 10) {
          articles.push(`Madde ${articleNum}: ${cleanContent.substring(0, 150)}${cleanContent.length > 150 ? '...' : ''}`);
          seenArticles.add(articleNum);
        }
      }
    }

    // Use simple pattern as fallback if we didn't find many articles
    if (articles.length < 5) {
      console.log('[Article Extraction] Using fallback pattern');
      simplePattern.lastIndex = 0;
      while ((match = simplePattern.exec(text)) !== null) {
        const articleNum = match[1];
        const content = match[2].trim();

        if (!seenArticles.has(articleNum) && content.length >= 10) {
          const cleanContent = content.replace(/\s+/g, ' ').trim();
          articles.push(`Madde ${articleNum}: ${cleanContent.substring(0, 150)}${cleanContent.length > 150 ? '...' : ''}`);
          seenArticles.add(articleNum);
        }
      }
    }

    console.log(`[Article Extraction] Found ${articles.length} articles`);
    return articles.slice(0, 50); // Limit to first 50 articles
  }

  /**
   * Count total articles
   */
  private countArticles(text: string): number {
    const pattern = /(?:Madde|MADDE|Article)\s+(\d+)/gi;
    const articleNumbers = new Set<string>();

    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      articleNumbers.add(match[1]);
    }

    const count = articleNumbers.size;
    console.log(`[Article Count] Found ${count} unique articles`);
    return count;
  }

  /**
   * Extract effective date from legal text
   */
  private extractEffectiveDate(text: string): string {
    const patterns = [
      /yürürlüğe gir(?:ti|me|er)(?:den)?[^0-9]*([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/gi,
      /yürürlük[^0-9]*([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/gi,
      /effective[^0-9]*([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/gi,
      /promulgated[^0-9]*([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return '';
  }

  /**
   * Extract law type
   */
  private extractLawType(text: string): string {
    if (/Vergi Usul Kanunu|Tax Procedure Law/i.test(text)) return 'Vergi Kanunu';
    if (/Borçlar Kanunu|Obligations Law/i.test(text)) return 'Borçlar Kanunu';
    if (/Ticaret Kanunu|Commercial Law/i.test(text)) return 'Ticaret Kanunu';
    if (/Ceza Kanunu|Penal Law/i.test(text)) return 'Ceza Kanunu';
    if (/İdare Kanunu|Administrative Law/i.test(text)) return 'İdare Kanunu';
    if (/Dernekler Kanunu|Associations Law/i.test(text)) return 'Dernekler Kanunu';
    if (/Kanun Hükmünde Kararname|KHK/i.test(text)) return 'KHK';
    if (/Tüzük|Regulation/i.test(text)) return 'Tüzük';
    if (/Yönetmelik|Directive/i.test(text)) return 'Yönetmelik';
    return 'Genel';
  }

  /**
   * Extract amendments
   */
  private extractAmendments(text: string): string[] {
    const amendments: string[] = [];

    const patterns = [
      /([0-9]+)\s*nolu\s*(?:Kanun|Yasa|KHK)\s*ile\s*değiştirilmiştir/gi,
      /değiştirilen\s*maddeler[:\s]*([^\n]*)/gi,
      /amended\s*by\s*(?:law|act)[^0-9]*([0-9]+)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        amendments.push(match[0]);
      }
    }

    return amendments.slice(0, 10); // Limit to first 10 amendments
  }

  /**
   * Extract sanctions or penalties
   */
  private extractSanctions(text: string): string[] {
    const sanctions: string[] = [];

    const patterns = [
      /cezai\s*yaptırım[:\s]*([^\n]*)/gi,
      /idari\s*ceza[:\s]*([^\n]*)/gi,
      /para\s*cezası[:\s]*([^\n]*)/gi,
      /hapis\s*cezası[:\s]*([^\n]*)/gi,
      /penalty[:\s]*([^\n]*)/gi,
      /fine[:\s]*([^\n]*)/gi,
      /sanction[:\s]*([^\n]*)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        sanctions.push(match[0]);
      }
    }

    return sanctions.slice(0, 20); // Limit to first 20 sanctions
  }

  /**
   * Extract responsible authority
   */
  private extractAuthority(text: string): string {
    const patterns = [
      /(?:Yetkili\s*(?:kurum|kuruluş|merkez)|authority|responsible\s*body)[:\s]*([^\n]*)/gi,
      /(?:Bakanlık|Ministry)\s*([^\s]*)/gi,
      /(?:Kurul|Board|Commission)\s*([^\s]*)/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  // Placeholder methods for other template types (would need implementation)
  private extractMainCharacters(text: string): string[] { return []; }
  private detectNarrativeStyle(text: string): string { return 'unknown'; }
  private detectGenre(text: string): string { return 'unknown'; }
  private extractPlotThemes(text: string): string[] { return []; }
  private extractSetting(text: string): string { return ''; }
  private extractMethodology(text: string): string { return ''; }
  private extractResearchDomain(text: string): string { return ''; }
  private extractKeyFindings(text: string): string[] { return []; }
  private extractCitations(text: string): string[] { return []; }
  private extractInvoiceNumber(text: string): string { return ''; }
  private extractTotalAmount(text: string): string { return ''; }
  private extractSeller(text: string): string { return ''; }
  private extractBuyer(text: string): string { return ''; }
  private extractPaymentTerms(text: string): string { return ''; }
  private extractParties(text: string): string[] { return []; }
  private extractContractType(text: string): string { return ''; }
  private extractKeyTerms(text: string): string[] { return []; }
  private extractContractEffectiveDate(text: string): string { return ''; }
  private detectDocumentType(text: string): string { return 'unknown'; }

  /**
   * Build analysis prompt based on template
   */
  private buildAnalysisPrompt(
    template?: 'novel' | 'research' | 'invoice' | 'contract' | 'legal' | 'general' | 'web_page' | 'sheet_music',
    customPrompt?: string
  ): string {
    // If custom prompt provided, use it
    if (customPrompt && customPrompt.trim().length > 0) {
      return `CUSTOM ANALYSIS REQUEST:\n${customPrompt}`;
    }

    // Otherwise use template
    switch (template) {
      case 'novel':
        return `This is a NOVEL/FICTION document. Focus on:
- Extract main character names (proper names only, NO pronouns)
- Identify narrative style (first person, third person, etc.)
- Determine genre (fiction, mystery, romance, etc.)
- Extract chapter titles and structure
- Identify plot themes and topics
- Extract locations and time periods mentioned`;

      case 'research':
        return `This is a RESEARCH PAPER. Focus on:
- Extract research methodology
- Identify key findings and conclusions
- Extract author names and affiliations
- List citations and references
- Identify research domain and keywords
- Extract hypotheses and research questions
- Note publication details if present`;

      case 'invoice':
        return `This is an INVOICE/FINANCIAL DOCUMENT. Focus on:
- Extract invoice number and date
- Identify parties (seller, buyer)
- Extract line items and amounts
- Total amount and currency
- Payment terms and due date
- Tax information
- Bank details if present`;

      case 'contract':
        return `This is a CONTRACT/LEGAL DOCUMENT. Focus on:
- Extract party names
- Identify contract type and purpose
- Extract key terms and conditions
- Important dates (effective date, expiration, etc.)
- Financial terms and amounts
- Obligations and responsibilities
- Signatures and witnesses`;

      case 'legal':
        return `This is a LEGAL STATUTE/REGULATION document. Focus on:
- Extract law number, title, and publication date
- Identify effective dates and amendment history
- Extract article numbers (maddeler) and their key provisions
- Identify legal definitions and interpretations
- Extract penalties, sanctions, or enforcement provisions
- Identify related laws and cross-references
- Extract jurisdiction and scope of application
- Note responsible authorities and implementation bodies`;

      case 'general':
      default:
        return `Analyze this document comprehensively:
- Auto-detect document type
- Extract all relevant metadata based on document type
- Identify key entities (people, organizations, locations, dates, amounts)
- Determine structure and organization
- Extract main topics and themes`;
    }
  }

  /**
   * Automatically detect the best template for a document using LLM
   */
  async detectTemplate(
    text: string,
    options?: {
      apiKey?: string;
      deepseekApiKey?: string;
      visualElements?: Array<{type: string; description: string; extractedData?: any}>;
      language?: { code: string; name: string; confidence?: number };
    }
  ): Promise<{
    templateId: string;
    confidence: number;
    reason: string;
  }> {
    const startTime = Date.now();

    try {
      console.log('[Template Detection] Starting automatic template detection');
      const visualElements = options?.visualElements || [];
      const language = options?.language;

      if (language) {
        console.log(`[Template Detection] Language provided: ${language.name} (${language.code}) - confidence: ${language.confidence || 'N/A'}%`);
      }

      // Check visual elements for quick detection
      if (visualElements.length > 0) {
        console.log('[Template Detection] Visual elements detected:', visualElements.map(v => v.type).join(', '));

        // Check for music notation in visual elements
        const hasMusicNotation = visualElements.some(v => v.type === 'music_notation' || v.description?.toLowerCase().includes('nota') || v.description?.toLowerCase().includes('music'));
        if (hasMusicNotation) {
          console.log('[Template Detection] Music notation detected in visual elements, using sheet_music template');
          return {
            templateId: 'sheet_music',
            confidence: 95,
            reason: 'Vision OCR detected music notation in visual elements'
          };
        }

        // Check for tables - could indicate financial report, invoice, or research
        const hasTables = visualElements.some(v => v.type === 'table');
        if (hasTables) {
          console.log('[Template Detection] Tables detected in visual elements');
          // Let LLM decide based on content + tables
        }
      }

      // PRIORITY: Check for strong keyword matches BEFORE LLM (prevents LLM errors)
      console.log('[Template Detection] Running priority keyword matching...');
      const lowerText = text.toLowerCase();

      // Check for legal document indicators (HIGH PRIORITY)
      const legalKeywords = [
        'kanun', 'madde', 'mevzuat', 'yasa', 'tüzük', 'yönetmelik',
        'kararname', 'genelge', 'tebliğ', 'sirküler', 'resmi gazete',
        'tcmb', 'maliye bakanlığı', 'hazine', 'vergi', 'gümrük',
        'ceza kanunu', 'medeni kanun', 'ticaret kanunu', 'borçlar kanunu',
        'anayasa', 'mahkeme', 'yargıtay', 'danıştay',
        'karar', 'hüküm', 'dava', 'esas', 'sayılı kanun'
      ];
      const legalMatches = legalKeywords.filter(kw => lowerText.includes(kw)).length;
      if (legalMatches >= 2) {
        console.log(`[Template Detection] Strong legal match (${legalMatches} keywords), skipping LLM`);
        return {
          templateId: 'legal',
          confidence: 90,
          reason: `Strong keyword match: Found ${legalMatches} legal terms (${legalKeywords.filter(kw => lowerText.includes(kw)).slice(0, 5).join(', ')})`
        };
      }

      // Check for invoice indicators
      const invoiceKeywords = ['invoice', 'fatura', 'bill', 'total amount', 'due date', 'payment'];
      const invoiceMatches = invoiceKeywords.filter(kw => lowerText.includes(kw)).length;
      if (invoiceMatches >= 3) {
        console.log(`[Template Detection] Strong invoice match (${invoiceMatches} keywords), skipping LLM`);
        return {
          templateId: 'invoice',
          confidence: 88,
          reason: `Strong keyword match: Found ${invoiceMatches} invoice terms`
        };
      }

      // Check for contract indicators
      const contractKeywords = ['agreement', 'sözleşme', 'parties', 'obligations', 'terms and conditions'];
      const contractMatches = contractKeywords.filter(kw => lowerText.includes(kw)).length;
      if (contractMatches >= 2) {
        console.log(`[Template Detection] Strong contract match (${contractMatches} keywords), skipping LLM`);
        return {
          templateId: 'contract',
          confidence: 87,
          reason: `Strong keyword match: Found ${contractMatches} contract terms`
        };
      }

      // Check for music notation/sheet music indicators (HIGH PRIORITY)
      const musicKeywords = [
        'nota', 'güfte', 'söz', 'beste', 'besteci', 'bestekâr',
        'makam', 'usul', 'tempo', 'akor', 'chord', 'lyrics',
        'melodi', 'ritim', 'şarkı', 'türkü', 'türk sanat müziği',
        'hüseyni', 'hicaz', 'rast', 'nihavend', 'kürdi', 'segah', // makam names
        'sofyan', 'düyek', 'aksak', 'curcuna', 'devr-i hindi', // usul names
        'güfteci', 'söz yazarı', 'aranjör'
      ];
      const musicMatches = musicKeywords.filter(kw => lowerText.includes(kw)).length;
      if (musicMatches >= 2) {
        console.log(`[Template Detection] Strong music match (${musicMatches} keywords), skipping LLM`);
        return {
          templateId: 'sheet_music',
          confidence: 92,
          reason: `Strong keyword match: Found ${musicMatches} music terms (${musicKeywords.filter(kw => lowerText.includes(kw)).slice(0, 5).join(', ')})`
        };
      }

      // Load available templates
      const templatesPath = require('path').join(__dirname, '../../../data/analysis-templates.json');
      const templatesData = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
      const templates = templatesData.templates;

      // Prepare template descriptions for LLM
      const templateDescriptions = templates.map((t: any) => {
        return `- ${t.id}: ${t.name} (${t.description}) - Focus: ${t.focus_keywords.slice(0, 5).join(', ')}`;
      }).join('\n');

      // Build visual elements context
      let visualElementsContext = '';
      if (visualElements.length > 0) {
        visualElementsContext = `\n\nVISUAL ELEMENTS DETECTED (via Vision OCR):\n`;
        visualElements.forEach((elem, idx) => {
          visualElementsContext += `${idx + 1}. Type: ${elem.type}, Description: ${elem.description}\n`;
        });
        visualElementsContext += `\nIMPORTANT: Consider these visual elements when choosing the template.\n`;
      }

      const prompt = `You are a document classifier. Analyze the following document excerpt and determine which template best matches it.${visualElementsContext}

AVAILABLE TEMPLATES:
${templateDescriptions}

DOCUMENT EXCERPT (first 3000 characters):
${text.substring(0, 3000)}

Respond in JSON format:
{
  "templateId": "the_template_id",
  "confidence": 0-100,
  "reason": "Brief explanation why this template matches"
}

Rules:
- Use "sheet_music" for musical scores, notation, lyrics, or music-related documents
- Use "legal" for Turkish laws (kanun, madde, mevzuat)
- Use "invoice" for bills, invoices, or financial transactions
- Use "contract" for agreements, contracts, terms and conditions
- Use "research" for academic papers, scientific studies
- Use "novel" for fiction, literature, stories
- Use "financial_report" for financial statements, reports
- Use "web_page" for web content, articles, blog posts
- Use "general" only if no other template matches well

Respond ONLY with valid JSON, no other text.`;

      // Try Gemini first
      if (options?.apiKey) {
        try {
          const genAI = new GoogleGenerativeAI(options.apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

          const result = await model.generateContent(prompt);
          const response = await result.response;
          const responseText = response.text();

          console.log('[Template Detection] Gemini response:', responseText);

          // Extract JSON from response
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const detection = JSON.parse(jsonMatch[0]);
            console.log(`[Template Detection] Detected template: ${detection.templateId} (${detection.confidence}% confidence)`);
            return {
              templateId: detection.templateId,
              confidence: detection.confidence,
              reason: detection.reason
            };
          }
        } catch (geminiError) {
          console.error('[Template Detection] Gemini error:', geminiError.message);
        }
      }

      // Try DeepSeek fallback
      if (options?.deepseekApiKey) {
        try {
          const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${options.deepseekApiKey}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1
            })
          });

          const data = await response.json();
          const responseText = data.choices?.[0]?.message?.content || '';

          console.log('[Template Detection] DeepSeek response:', responseText);

          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const detection = JSON.parse(jsonMatch[0]);
            console.log(`[Template Detection] Detected template: ${detection.templateId} (${detection.confidence}% confidence)`);
            return {
              templateId: detection.templateId,
              confidence: detection.confidence,
              reason: detection.reason
            };
          }
        } catch (deepseekError) {
          console.error('[Template Detection] DeepSeek error:', deepseekError.message);
        }
      }

      // Fallback: Use simple keyword matching
      console.log('[Template Detection] LLM unavailable, using keyword matching fallback');
      // lowerText already declared above

      // Check for sheet music indicators
      if (lowerText.includes('nota') || lowerText.includes('müzik') || lowerText.includes('beste') ||
          lowerText.includes('makam') || lowerText.includes('usul') || lowerText.includes('güfte') ||
          lowerText.includes('chord') || lowerText.includes('lyrics')) {
        return { templateId: 'sheet_music', confidence: 70, reason: 'Keyword matching: music-related terms detected' };
      }

      // Check for legal document indicators
      if (lowerText.includes('kanun') || lowerText.includes('madde') || lowerText.includes('mevzuat') ||
          lowerText.includes('yasa') || lowerText.includes('tüzük')) {
        return { templateId: 'legal', confidence: 75, reason: 'Keyword matching: Turkish legal terms detected' };
      }

      // Check for invoice indicators
      if (lowerText.includes('invoice') || lowerText.includes('fatura') || lowerText.includes('bill') ||
          lowerText.includes('payment') || lowerText.includes('due date')) {
        return { templateId: 'invoice', confidence: 70, reason: 'Keyword matching: invoice terms detected' };
      }

      // Check for contract indicators
      if (lowerText.includes('contract') || lowerText.includes('agreement') || lowerText.includes('sözleşme') ||
          lowerText.includes('parties') || lowerText.includes('obligations')) {
        return { templateId: 'contract', confidence: 70, reason: 'Keyword matching: contract terms detected' };
      }

      // Check for research paper indicators
      if (lowerText.includes('abstract') || lowerText.includes('methodology') || lowerText.includes('references') ||
          lowerText.includes('hypothesis') || lowerText.includes('research')) {
        return { templateId: 'research', confidence: 70, reason: 'Keyword matching: research paper structure detected' };
      }

      // Default to general
      return { templateId: 'general', confidence: 50, reason: 'No specific template matched, using general template' };

    } catch (error) {
      console.error('[Template Detection] Error:', error);
      return { templateId: 'general', confidence: 50, reason: 'Error during detection, defaulting to general' };
    }
  }
}

// Export singleton instance
export default new LocalMetadataExtractorService();
