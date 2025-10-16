/**
 * Enterprise Document Intelligence Service
 * Provides AI-powered document classification, similarity detection, and smart tagging
 */

import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { SemanticSearchService } from './semantic-search.service';

export interface DocumentClassification {
  id: string;
  documentId: string;
  category: string;
  confidence: number;
  tags: string[];
  language: string;
  contentType: string;
  sensitivityLevel: 'public' | 'internal' | 'confidential' | 'secret';
  aiModelVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentSimilarity {
  documentId: string;
  similarDocumentId: string;
  similarityScore: number;
  algorithmVersion: string;
  createdAt: Date;
}

export interface ProcessingQueueItem {
  id: string;
  documentId: string;
  processingType: 'ocr' | 'translation' | 'embedding' | 'thumbnail' | 'classification';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export class DocumentIntelligenceService {
  private semanticSearch: SemanticSearchService;

  constructor() {
    this.semanticSearch = new SemanticSearchService();
  }

  /**
   * Classify a document using AI
   */
  async classifyDocument(documentId: string, content: string, metadata: any): Promise<DocumentClassification> {
    try {
      // Extract features for classification
      const features = await this.extractFeatures(content, metadata);

      // Use AI to classify
      const classification = await this.performAIClassification(features);

      // Check for sensitive content
      const sensitivityLevel = await this.detectSensitivityLevel(content, metadata);

      // Auto-generate tags
      const tags = await this.generateTags(content, classification);

      // Detect language
      const language = await this.detectLanguage(content);

      // Determine content type
      const contentType = this.determineContentType(metadata);

      const classificationRecord: DocumentClassification = {
        id: uuidv4(),
        documentId,
        category: classification.category,
        confidence: classification.confidence,
        tags,
        language,
        contentType,
        sensitivityLevel,
        aiModelVersion: 'enterprise-v2.0',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save classification to database
      await pool.query(`
        INSERT INTO document_classifications (
          id, document_id, category, confidence, tags, language,
          content_type, sensitivity_level, ai_model_version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (document_id) DO UPDATE SET
          category = EXCLUDED.category,
          confidence = EXCLUDED.confidence,
          tags = EXCLUDED.tags,
          language = EXCLUDED.language,
          content_type = EXCLUDED.content_type,
          sensitivity_level = EXCLUDED.sensitivity_level,
          updated_at = EXCLUDED.updated_at
      `, [
        classificationRecord.id,
        classificationRecord.documentId,
        classificationRecord.category,
        classificationRecord.confidence,
        classificationRecord.tags,
        classificationRecord.language,
        classificationRecord.contentType,
        classificationRecord.sensitivityLevel,
        classificationRecord.aiModelVersion,
        classificationRecord.createdAt,
        classificationRecord.updatedAt
      ]);

      return classificationRecord;
    } catch (error) {
      console.error('Failed to classify document:', error);
      throw error;
    }
  }

  /**
   * Find similar documents using vector similarity
   */
  async findSimilarDocuments(documentId: string, threshold: number = 0.7, limit: number = 10): Promise<DocumentSimilarity[]> {
    try {
      // First check cache
      const cached = await this.getCachedSimilarities(documentId);
      if (cached && cached.length > 0) {
        return cached.filter(s => s.similarityScore >= threshold).slice(0, limit);
      }

      // Get document embedding
      const documentResult = await pool.query(
        'SELECT embedding FROM documents WHERE id = $1',
        [documentId]
      );

      if (!documentResult.rows[0]?.embedding) {
        return [];
      }

      const targetEmbedding = documentResult.rows[0].embedding;

      // Find similar documents using vector search
      const similarDocuments = await this.semanticSearch.searchByEmbedding(
        targetEmbedding,
        limit * 2, // Get more to filter
        ['content']
      );

      const similarities: DocumentSimilarity[] = [];

      for (const doc of similarDocuments) {
        if (doc.id === documentId) continue; // Skip self

        const similarity: DocumentSimilarity = {
          documentId,
          similarDocumentId: doc.id,
          similarityScore: doc.similarity,
          algorithmVersion: 'v2.0',
          createdAt: new Date()
        };

        similarities.push(similarity);

        // Cache the similarity
        await this.cacheSimilarity(similarity);
      }

      return similarities
        .filter(s => s.similarityScore >= threshold)
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to find similar documents:', error);
      return [];
    }
  }

  /**
   * Add document to processing queue
   */
  async queueProcessing(
    documentId: string,
    processingType: ProcessingQueueItem['processingType'],
    priority: number = 0
  ): Promise<string> {
    try {
      const queueId = uuidv4();

      await pool.query(`
        INSERT INTO document_processing_queue (
          id, document_id, processing_type, status, priority, max_attempts, created_at
        ) VALUES ($1, $2, $3, 'pending', $4, 3, CURRENT_TIMESTAMP)
        ON CONFLICT (document_id, processing_type) DO NOTHING
      `, [queueId, documentId, processingType, priority]);

      return queueId;
    } catch (error) {
      console.error('Failed to queue processing:', error);
      throw error;
    }
  }

  /**
   * Process queue items (background worker)
   */
  async processQueue(): Promise<void> {
    try {
      // Get next items from queue
      const result = await pool.query(`
        UPDATE document_processing_queue
        SET status = 'processing', started_at = CURRENT_TIMESTAMP, attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM document_processing_queue
          WHERE status = 'pending'
          AND (attempts < max_attempts)
          ORDER BY priority DESC, created_at ASC
          LIMIT 5
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      for (const item of result.rows) {
        await this.processQueueItem(item);
      }
    } catch (error) {
      console.error('Failed to process queue:', error);
    }
  }

  /**
   * Auto-tag documents based on content analysis
   */
  async autoTagDocument(documentId: string, content: string): Promise<string[]> {
    try {
      const tags: string[] = [];

      // Extract keywords using NLP
      const keywords = await this.extractKeywords(content);
      tags.push(...keywords);

      // Detect entities
      const entities = await this.extractEntities(content);
      tags.push(...entities);

      // Detect document patterns
      const patterns = this.detectPatterns(content);
      tags.push(...patterns);

      // Detect financial indicators
      if (this.isFinancialDocument(content)) {
        tags.push('financial', 'report');
      }

      // Detect legal indicators
      if (this.isLegalDocument(content)) {
        tags.push('legal', 'contract');
      }

      // Detect technical indicators
      if (this.isTechnicalDocument(content)) {
        tags.push('technical', 'documentation');
      }

      // Remove duplicates and limit
      return [...new Set(tags)].slice(0, 20);
    } catch (error) {
      console.error('Failed to auto-tag document:', error);
      return [];
    }
  }

  /**
   * Calculate document quality score
   */
  async calculateQualityScore(documentId: string, content: string, metadata: any): Promise<number> {
    try {
      let score = 0;
      const maxScore = 100;

      // Content length score (20 points)
      const contentLength = content.length;
      if (contentLength > 100 && contentLength < 100000) {
        score += 20;
      } else if (contentLength > 0) {
        score += 10;
      }

      // Structure score (25 points)
      if (metadata.headings > 0) score += 5;
      if (metadata.paragraphs > 3) score += 5;
      if (metadata.lists > 0) score += 5;
      if (metadata.tables > 0) score += 5;
      if (metadata.images > 0) score += 5;

      // Language quality score (20 points)
      const languageScore = await this.analyzeLanguageQuality(content);
      score += languageScore * 20;

      // Readability score (20 points)
      const readabilityScore = this.calculateReadability(content);
      score += readabilityScore * 20;

      // Metadata completeness (15 points)
      if (metadata.title) score += 5;
      if (metadata.author) score += 5;
      if (metadata.created) score += 5;

      return Math.min(score, maxScore);
    } catch (error) {
      console.error('Failed to calculate quality score:', error);
      return 0;
    }
  }

  // Private helper methods

  private async extractFeatures(content: string, metadata: any): Promise<any> {
    return {
      contentLength: content.length,
      wordCount: content.split(/\s+/).length,
      headings: metadata.headings || 0,
      tables: metadata.tables || 0,
      images: metadata.images || 0,
      links: metadata.links || 0,
      hasCodeBlocks: /```/.test(content),
      hasMath: /\$\$/.test(content)
    };
  }

  private async performAIClassification(features: any): Promise<{ category: string; confidence: number }> {
    // Simplified classification logic - in production, use actual AI model
    const categories = [
      'contract', 'report', 'presentation', 'manual', 'invoice',
      'email', 'article', 'specification', 'proposal', 'other'
    ];

    let category = 'other';
    let confidence = 0.5;

    // Rule-based classification
    if (features.hasCodeBlocks) {
      category = 'specification';
      confidence = 0.8;
    } else if (features.tables > 2) {
      category = 'report';
      confidence = 0.7;
    } else if (features.headings > 5) {
      category = 'manual';
      confidence = 0.6;
    } else if (features.wordCount < 500) {
      category = 'email';
      confidence = 0.7;
    } else if (features.images > 3) {
      category = 'presentation';
      confidence = 0.8;
    }

    return { category, confidence };
  }

  private async detectSensitivityLevel(content: string, metadata: any): Promise<'public' | 'internal' | 'confidential' | 'secret'> {
    const lowerContent = content.toLowerCase();

    // Secret indicators
    if (/\b(top secret|classified|confidential|proprietary)\b/i.test(content)) {
      return 'secret';
    }

    // Confidential indicators
    if (/\b(do not distribute|internal use only|private|sensitive)\b/i.test(content)) {
      return 'confidential';
    }

    // Internal indicators
    if (/\b(internal|company only|staff only)\b/i.test(content)) {
      return 'internal';
    }

    return 'public';
  }

  private async generateTags(content: string, classification: any): Promise<string[]> {
    const tags: string[] = [classification.category];

    // Extract common keywords
    const keywords = content.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 4)
      .slice(0, 10);

    tags.push(...keywords);

    return [...new Set(tags)].slice(0, 10);
  }

  private async detectLanguage(content: string): Promise<string> {
    // Simple language detection
    const englishWords = /\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/gi;
    const matches = content.match(englishWords) || [];

    if (matches.length > 5) {
      return 'en';
    }

    return 'unknown';
  }

  private determineContentType(metadata: any): string {
    if (metadata.mimetype) {
      if (metadata.mimetype.includes('pdf')) return 'pdf';
      if (metadata.mimetype.includes('word')) return 'docx';
      if (metadata.mimetype.includes('excel')) return 'xlsx';
      if (metadata.mimetype.includes('powerpoint')) return 'pptx';
      if (metadata.mimetype.includes('text')) return 'text';
    }
    return 'unknown';
  }

  private async getCachedSimilarities(documentId: string): Promise<DocumentSimilarity[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM document_similarity_cache WHERE document_id = $1 ORDER BY similarity_score DESC',
        [documentId]
      );

      return result.rows.map(row => ({
        documentId: row.document_id,
        similarDocumentId: row.similar_document_id,
        similarityScore: parseFloat(row.similarity_score),
        algorithmVersion: row.algorithm_version,
        createdAt: row.created_at
      }));
    } catch (error) {
      return [];
    }
  }

  private async cacheSimilarity(similarity: DocumentSimilarity): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO document_similarity_cache (
          document_id, similar_document_id, similarity_score, algorithm_version, created_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (document_id, similar_document_id) DO UPDATE SET
          similarity_score = EXCLUDED.similarity_score
      `, [
        similarity.documentId,
        similarity.similarDocumentId,
        similarity.similarityScore,
        similarity.algorithmVersion,
        similarity.createdAt
      ]);
    } catch (error) {
      // Don't throw - caching failures shouldn't break the flow
    }
  }

  private async processQueueItem(item: any): Promise<void> {
    try {
      switch (item.processing_type) {
        case 'classification':
          // Process classification
          break;
        case 'thumbnail':
          // Generate thumbnail
          break;
        case 'ocr':
          // Process OCR
          break;
        // Add other processing types
      }

      // Mark as completed
      await pool.query(
        'UPDATE document_processing_queue SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['completed', item.id]
      );
    } catch (error) {
      // Mark as failed
      await pool.query(
        'UPDATE document_processing_queue SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', error.message, item.id]
      );
    }
  }

  private async extractKeywords(content: string): Promise<string[]> {
    // Simplified keyword extraction
    const words = content.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 4)
      .filter(word => !['this', 'that', 'with', 'from', 'they', 'have'].includes(word));

    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private async extractEntities(content: string): Promise<string[]> {
    const entities: string[] = [];

    // Email addresses
    const emails = content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g) || [];
    entities.push(...emails.slice(0, 3));

    // URLs
    const urls = content.match(/https?:\/\/[^\s]+/g) || [];
    entities.push(...urls.slice(0, 3));

    // Phone numbers
    const phones = content.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g) || [];
    entities.push(...phones.slice(0, 3));

    return entities;
  }

  private detectPatterns(content: string): string[] {
    const patterns: string[] = [];

    if (/\$\d+/.test(content)) patterns.push('currency');
    if (/\d{4}-\d{2}-\d{2}/.test(content)) patterns.push('dates');
    if (/\b\d+\%\b/.test(content)) patterns.push('percentages');
    if (/\b\d+\.\d+\.\d+\.\d+\b/.test(content)) patterns.push('ip-addresses');

    return patterns;
  }

  private isFinancialDocument(content: string): boolean {
    const financialTerms = [
      'revenue', 'profit', 'loss', 'balance sheet', 'income statement',
      'invoice', 'payment', 'transaction', 'budget', 'financial'
    ];
    return financialTerms.some(term => content.toLowerCase().includes(term));
  }

  private isLegalDocument(content: string): boolean {
    const legalTerms = [
      'contract', 'agreement', 'liability', 'warranty', 'terms',
      'conditions', 'legal', 'attorney', 'court', 'jurisdiction'
    ];
    return legalTerms.some(term => content.toLowerCase().includes(term));
  }

  private isTechnicalDocument(content: string): boolean {
    const technicalTerms = [
      'api', 'function', 'class', 'method', 'parameter',
      'algorithm', 'database', 'code', 'programming', 'technical'
    ];
    return technicalTerms.some(term => content.toLowerCase().includes(term));
  }

  private async analyzeLanguageQuality(content: string): Promise<number> {
    // Simple language quality analysis
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/);

    if (sentences.length === 0 || words.length === 0) return 0;

    const avgWordsPerSentence = words.length / sentences.length;

    // Ideal is 10-20 words per sentence
    if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20) return 1;
    if (avgWordsPerSentence >= 5 && avgWordsPerSentence <= 30) return 0.8;
    return 0.5;
  }

  private calculateReadability(content: string): Promise<number> {
    return new Promise((resolve) => {
      // Simplified readability score
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const words = content.split(/\s+/);
      const syllables = words.reduce((acc, word) => acc + this.countSyllables(word), 0);

      if (sentences.length === 0 || words.length === 0) {
        resolve(0);
        return;
      }

      // Flesch Reading Ease formula
      const avgWordsPerSentence = words.length / sentences.length;
      const avgSyllablesPerWord = syllables / words.length;

      const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);

      // Normalize to 0-1
      resolve(Math.max(0, Math.min(1, score / 100)));
    });
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]|ed|es|ing)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }
}

// Export singleton instance
export const documentIntelligenceService = new DocumentIntelligenceService();