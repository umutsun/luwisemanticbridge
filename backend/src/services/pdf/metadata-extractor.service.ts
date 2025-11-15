/**
 * Metadata Extractor Service
 * Extracts structured metadata from PDF text using Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { lsembPool } from '../../config/database.config';

export interface PDFMetadata {
  summary: string;
  keywords: string[];
  topics: string[];
  category: string;
  language: string;

  // Author Information
  author?: {
    name?: string;
    bio?: string;
    aboutSection?: string;
  };

  // Document Statistics
  statistics?: {
    pageCount?: number;
    wordCount?: number;
    sentenceCount?: number;
    paragraphCount?: number;
    characterCount?: number;
    readingTimeMinutes?: number;
    averageWordsPerSentence?: number;
  };

  // Structure Analysis
  structure?: {
    hasTableOfContents?: boolean;
    chapterCount?: number;
    chapters?: string[];
    sectionCount?: number;
    sections?: string[];
    headings?: string[];
  };

  // Content Analysis (for books/documents)
  contentAnalysis?: {
    mainCharacters?: string[];
    narrativeStyle?: string;
    genre?: string;
    documentType?: string;
  };

  // Extracted Tables
  tables?: any[];

  entities: {
    people?: string[];
    organizations?: string[];
    locations?: string[];
    dates?: string[];
    money?: string[];
  };
  dataQuality: {
    score: number;
    hasStructuredData: boolean;
    tableCount?: number;
    suggestedTableName?: string;
  };
}

export interface MetadataExtractionResult {
  documentId: string;
  metadata: PDFMetadata;
  processingTime: number;
  tokensUsed: number;
}

class MetadataExtractorService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  /**
   * Initialize with API key
   */
  initialize(apiKey: string, model: string = 'gemini-2.0-flash-exp') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });
  }

  /**
   * Extract metadata from PDF text
   */
  async extractMetadata(
    text: string,
    documentId: string,
    filename: string
  ): Promise<MetadataExtractionResult> {
    if (!this.model) {
      throw new Error('Metadata extractor not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      console.log(`[Metadata Extractor] Processing: ${filename}`);

      // Limit text to avoid token limits (keep first 8000 chars)
      const limitedText = text.substring(0, 8000);

      const prompt = `Analyze this PDF document and extract metadata in JSON format.

DOCUMENT TEXT:
${limitedText}

FILENAME: ${filename}

Extract the following information:

1. SUMMARY: Write a concise 2-3 sentence summary of the document
2. KEYWORDS: Extract 10-15 relevant keywords (single words or short phrases)
3. TOPICS: Identify 3-5 main topics covered in the document
4. CATEGORY: Classify into one of these categories:
   - Financial (invoices, contracts, financial reports)
   - Legal (contracts, agreements, legal documents)
   - Technical (manuals, specifications, technical docs)
   - Medical (medical records, prescriptions, reports)
   - Academic (research papers, articles, theses)
   - Administrative (forms, applications, administrative docs)
   - Other

5. LANGUAGE: Detect the primary language (en, tr, de, fr, es, etc.)

6. AUTHOR INFORMATION: Look for sections like "ABOUT THE AUTHOR", "Author Bio", "About [Author Name]", etc.
   - name: Extract author's name if mentioned
   - bio: Extract a brief bio (1-2 sentences)
   - aboutSection: Extract the full "About the Author" section text if found

7. ENTITIES: Extract named entities:
   - people: List of person names mentioned
   - organizations: List of company/organization names
   - locations: List of locations (cities, countries, addresses)
   - dates: List of important dates (YYYY-MM-DD format if possible)
   - money: List of monetary amounts with currency

8. DATA QUALITY ASSESSMENT:
   - score: Rate the data quality 0-100 (how well-structured and complete)
   - hasStructuredData: true if document contains tables/structured data, false otherwise
   - tableCount: Estimate number of tables (if any)
   - suggestedTableName: Suggest a database table name based on content (snake_case)

OUTPUT JSON STRUCTURE:
{
  "summary": "string",
  "keywords": ["keyword1", "keyword2", ...],
  "topics": ["topic1", "topic2", ...],
  "category": "Financial|Legal|Technical|Medical|Academic|Administrative|Other",
  "language": "en|tr|de|fr|es|...",
  "author": {
    "name": "Author Name",
    "bio": "Brief bio",
    "aboutSection": "Full about section text"
  },
  "entities": {
    "people": ["name1", "name2"],
    "organizations": ["org1", "org2"],
    "locations": ["location1"],
    "dates": ["2025-01-15", "2025-02-01"],
    "money": ["$5,000", "€3,200"]
  },
  "dataQuality": {
    "score": 85,
    "hasStructuredData": true,
    "tableCount": 2,
    "suggestedTableName": "financial_invoices"
  }
}

Be precise and thorough. Only include entities that are clearly mentioned in the text.`;

      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      // Parse JSON response
      let metadata: PDFMetadata;
      try {
        metadata = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[Metadata Extractor] JSON parse error:', parseError);
        console.error('[Metadata Extractor] Response was:', responseText);

        // Fallback metadata
        metadata = this.createFallbackMetadata(text, filename);
      }

      // Validate and sanitize metadata
      metadata = this.validateMetadata(metadata, filename);

      const processingTime = Date.now() - startTime;
      const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

      console.log(`[Metadata Extractor] Complete: ${filename} (${processingTime}ms, ${tokensUsed} tokens)`);

      return {
        documentId,
        metadata,
        processingTime,
        tokensUsed
      };
    } catch (error) {
      console.error(`[Metadata Extractor] Error:`, error);
      throw new Error(`Metadata extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract metadata from multiple documents in batch
   */
  async extractBatch(
    documents: Array<{ id: string; content: string; title: string }>,
    apiKey: string,
    progressCallback?: (current: number, total: number, currentDoc: string) => void
  ): Promise<MetadataExtractionResult[]> {
    this.initialize(apiKey);

    console.log(`[Metadata Extractor] Batch processing ${documents.length} documents`);

    const results: MetadataExtractionResult[] = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      try {
        // Report progress
        if (progressCallback) {
          progressCallback(i + 1, documents.length, doc.title);
        }

        const result = await this.extractMetadata(doc.content, doc.id, doc.title);
        results.push(result);

        // Save to database immediately
        await this.saveMetadataToDatabase(doc.id, result.metadata);

        // Small delay to avoid rate limiting
        if (i < documents.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`[Metadata Extractor] Failed for ${doc.title}:`, error);

        // Create fallback result
        results.push({
          documentId: doc.id,
          metadata: this.createFallbackMetadata(doc.content, doc.title),
          processingTime: 0,
          tokensUsed: 0
        });
      }
    }

    console.log(`[Metadata Extractor] Batch complete: ${results.length}/${documents.length}`);

    return results;
  }

  /**
   * Save metadata to database
   */
  private async saveMetadataToDatabase(documentId: string, metadata: PDFMetadata): Promise<void> {
    try {
      await lsembPool.query(
        `UPDATE documents
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'),
           '{analysis}',
           $1::jsonb
         ),
         updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(metadata), documentId]
      );

      console.log(`[Metadata Extractor] Saved metadata for document ${documentId}`);
    } catch (error) {
      console.error('[Metadata Extractor] Error saving to database:', error);
      throw error;
    }
  }

  /**
   * Validate and sanitize metadata
   */
  private validateMetadata(metadata: PDFMetadata, filename: string): PDFMetadata {
    // Ensure all required fields exist
    return {
      summary: metadata.summary || 'No summary available',
      keywords: Array.isArray(metadata.keywords) ? metadata.keywords.slice(0, 15) : [],
      topics: Array.isArray(metadata.topics) ? metadata.topics.slice(0, 5) : [],
      category: metadata.category || 'Other',
      language: metadata.language || 'en',
      author: metadata.author ? {
        name: metadata.author.name || undefined,
        bio: metadata.author.bio || undefined,
        aboutSection: metadata.author.aboutSection || undefined
      } : undefined,
      entities: {
        people: Array.isArray(metadata.entities?.people) ? metadata.entities.people : [],
        organizations: Array.isArray(metadata.entities?.organizations) ? metadata.entities.organizations : [],
        locations: Array.isArray(metadata.entities?.locations) ? metadata.entities.locations : [],
        dates: Array.isArray(metadata.entities?.dates) ? metadata.entities.dates : [],
        money: Array.isArray(metadata.entities?.money) ? metadata.entities.money : []
      },
      dataQuality: {
        score: metadata.dataQuality?.score || 50,
        hasStructuredData: metadata.dataQuality?.hasStructuredData || false,
        tableCount: metadata.dataQuality?.tableCount || 0,
        suggestedTableName: metadata.dataQuality?.suggestedTableName || this.generateTableName(filename)
      }
    };
  }

  /**
   * Extract author information from full text
   * Looks for "ABOUT THE AUTHOR", "Author Bio", etc.
   */
  private extractAuthorSection(text: string): { name?: string; aboutSection?: string } {
    // Common patterns for author sections
    const patterns = [
      /ABOUT THE AUTHOR[:\s]+([\s\S]{0,2000}?)(?:\n\n|\n[A-Z]|$)/i,
      /Author Bio[:\s]+([\s\S]{0,2000}?)(?:\n\n|\n[A-Z]|$)/i,
      /About (?:the )?Author[:\s]+([\s\S]{0,2000}?)(?:\n\n|\n[A-Z]|$)/i,
      /Written by[:\s]+([\s\S]{0,500}?)(?:\n\n|$)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const aboutSection = match[1].trim();

        // Try to extract author name from the section
        // Usually first sentence or first line contains the name
        const firstSentence = aboutSection.split(/[.!?]\s/)[0];
        const nameMatch = firstSentence.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);

        return {
          name: nameMatch ? nameMatch[1] : undefined,
          aboutSection
        };
      }
    }

    return {};
  }

  /**
   * Create fallback metadata when extraction fails
   */
  private createFallbackMetadata(text: string, filename: string): PDFMetadata {
    // Basic text analysis
    const words = text.split(/\s+/).filter(w => w.length > 3);
    const uniqueWords = [...new Set(words)];
    const keywords = uniqueWords.slice(0, 10);

    return {
      summary: `Document: ${filename}. Analysis pending.`,
      keywords,
      topics: ['General'],
      category: 'Other',
      language: this.detectLanguage(text),
      entities: {
        people: [],
        organizations: [],
        locations: [],
        dates: [],
        money: []
      },
      dataQuality: {
        score: 30,
        hasStructuredData: false,
        tableCount: 0,
        suggestedTableName: this.generateTableName(filename)
      }
    };
  }

  /**
   * Detect language from text (simple heuristic)
   */
  private detectLanguage(text: string): string {
    const turkishChars = /[ğüşıöçĞÜŞİÖÇ]/g;
    const matches = text.match(turkishChars);
    return matches && matches.length > 10 ? 'tr' : 'en';
  }

  /**
   * Generate table name from filename
   */
  private generateTableName(filename: string): string {
    // Remove extension and special characters
    const baseName = filename
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-zA-Z0-9_]/g, '_') // Replace special chars
      .replace(/_+/g, '_') // Remove duplicate underscores
      .toLowerCase();

    return `pdf_${baseName}`;
  }
}

export default new MetadataExtractorService();
