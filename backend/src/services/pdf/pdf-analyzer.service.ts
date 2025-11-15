/**
 * PDF Analyzer Service
 * Detects if a PDF is scanned or text-based
 * Used to determine if OCR processing is needed
 */

import pdf from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import { lsembPool } from '../../config/database.config';

export interface PDFAnalysisResult {
  documentId: string;
  filePath: string;
  filename: string;
  isScanned: boolean;
  confidence: number;
  stats: {
    totalPages: number;
    totalText: number;
    avgTextPerPage: number;
    hasImages: boolean;
  };
  recommendation: 'needs_ocr' | 'text_ready' | 'uncertain';
}

class PDFAnalyzerService {
  /**
   * Analyze a single PDF to detect if it's scanned
   */
  async analyzePDF(filePath: string, documentId: string): Promise<PDFAnalysisResult> {
    try {
      console.log(`[PDF Analyzer] Analyzing: ${path.basename(filePath)}`);

      // Read PDF
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);

      // Calculate metrics
      const totalPages = data.numpages;
      const totalText = data.text.length;
      const avgTextPerPage = totalPages > 0 ? totalText / totalPages : 0;

      // Heuristics for scanned detection
      const TEXT_THRESHOLD = 100; // chars per page
      const isScanned = avgTextPerPage < TEXT_THRESHOLD;

      // Confidence calculation
      let confidence = 0;
      if (avgTextPerPage === 0) {
        confidence = 1.0; // Definitely scanned
      } else if (avgTextPerPage < 50) {
        confidence = 0.95; // Very likely scanned
      } else if (avgTextPerPage < TEXT_THRESHOLD) {
        confidence = 0.8; // Likely scanned
      } else if (avgTextPerPage < 500) {
        confidence = 0.6; // Uncertain (might be sparse text)
      } else {
        confidence = 0.9; // Likely text-based
      }

      // Recommendation
      let recommendation: 'needs_ocr' | 'text_ready' | 'uncertain';
      if (isScanned && confidence > 0.8) {
        recommendation = 'needs_ocr';
      } else if (!isScanned && confidence > 0.8) {
        recommendation = 'text_ready';
      } else {
        recommendation = 'uncertain';
      }

      const result: PDFAnalysisResult = {
        documentId,
        filePath,
        filename: path.basename(filePath),
        isScanned,
        confidence,
        stats: {
          totalPages,
          totalText,
          avgTextPerPage,
          hasImages: false // TODO: Implement image detection
        },
        recommendation
      };

      console.log(`[PDF Analyzer] Result: ${recommendation} (${avgTextPerPage.toFixed(0)} chars/page)`);

      // Update document status in database
      await this.updateDocumentStatus(documentId, {
        file_type: 'application/pdf',
        ocr_status: recommendation === 'needs_ocr' ? 'pending' : 'skipped',
        processing_metadata: {
          analysis: {
            isScanned,
            confidence,
            recommendation,
            stats: result.stats,
            analyzedAt: new Date().toISOString()
          }
        }
      });

      return result;
    } catch (error) {
      console.error(`[PDF Analyzer] Error analyzing ${filePath}:`, error);
      throw new Error(`PDF analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze multiple PDFs in batch
   */
  async analyzeBatch(documents: Array<{ id: string; file_path: string }>): Promise<{
    scannedPDFs: PDFAnalysisResult[];
    textPDFs: PDFAnalysisResult[];
    uncertainPDFs: PDFAnalysisResult[];
    summary: {
      total: number;
      scanned: number;
      textBased: number;
      uncertain: number;
    };
  }> {
    console.log(`[PDF Analyzer] Batch analyzing ${documents.length} PDFs`);

    const scannedPDFs: PDFAnalysisResult[] = [];
    const textPDFs: PDFAnalysisResult[] = [];
    const uncertainPDFs: PDFAnalysisResult[] = [];

    for (const doc of documents) {
      try {
        const result = await this.analyzePDF(doc.file_path, doc.id);

        if (result.recommendation === 'needs_ocr') {
          scannedPDFs.push(result);
        } else if (result.recommendation === 'text_ready') {
          textPDFs.push(result);
        } else {
          uncertainPDFs.push(result);
        }
      } catch (error) {
        console.error(`[PDF Analyzer] Failed to analyze document ${doc.id}:`, error);
        // Add to uncertain if analysis fails
        uncertainPDFs.push({
          documentId: doc.id,
          filePath: doc.file_path,
          filename: path.basename(doc.file_path),
          isScanned: false,
          confidence: 0,
          stats: { totalPages: 0, totalText: 0, avgTextPerPage: 0, hasImages: false },
          recommendation: 'uncertain'
        });
      }
    }

    const summary = {
      total: documents.length,
      scanned: scannedPDFs.length,
      textBased: textPDFs.length,
      uncertain: uncertainPDFs.length
    };

    console.log(`[PDF Analyzer] Batch complete:`, summary);

    return {
      scannedPDFs,
      textPDFs,
      uncertainPDFs,
      summary
    };
  }

  /**
   * Get text extraction quality from PDF
   * Returns a score 0-100 indicating how well text can be extracted
   */
  async getTextQuality(filePath: string): Promise<number> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);

      const avgTextPerPage = data.numpages > 0 ? data.text.length / data.numpages : 0;

      // Convert to 0-100 score
      // 0 chars/page = 0 quality
      // 1000+ chars/page = 100 quality
      const quality = Math.min(100, (avgTextPerPage / 1000) * 100);

      return Math.round(quality);
    } catch (error) {
      console.error('[PDF Analyzer] Error getting text quality:', error);
      return 0;
    }
  }

  /**
   * Update document status in database
   */
  private async updateDocumentStatus(documentId: string, updates: {
    file_type?: string;
    ocr_status?: string;
    analysis_status?: string;
    processing_metadata?: any;
  }): Promise<void> {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.file_type) {
        setClause.push(`file_type = $${paramIndex++}`);
        values.push(updates.file_type);
      }

      if (updates.ocr_status) {
        setClause.push(`ocr_status = $${paramIndex++}`);
        values.push(updates.ocr_status);
      }

      if (updates.analysis_status) {
        setClause.push(`analysis_status = $${paramIndex++}`);
        values.push(updates.analysis_status);
      }

      if (updates.processing_metadata) {
        setClause.push(`processing_metadata = jsonb_set(
          COALESCE(processing_metadata, '{}'),
          '{}',
          $${paramIndex}::jsonb,
          true
        )`);
        values.push(JSON.stringify(updates.processing_metadata));
      }

      if (setClause.length > 0) {
        values.push(documentId);
        const query = `
          UPDATE documents
          SET ${setClause.join(', ')}, updated_at = NOW()
          WHERE id = $${paramIndex}
        `;

        await lsembPool.query(query, values);
        console.log(`[PDF Analyzer] Updated status for document ${documentId}`);
      }
    } catch (error) {
      console.error('[PDF Analyzer] Error updating document status:', error);
      // Don't throw error, just log it
    }
  }

  /**
   * Get PDF documents ready for batch processing
   * Returns only PDFs that have completed OCR and analysis
   */
  async getPDFsReadyForBatch(limit: number = 20, offset: number = 0): Promise<{
    documents: Array<{
      id: number;
      title: string;
      file_path: string;
      file_type: string;
      status: string;
      ocr_status: string;
      analysis_status: string;
      created_at: Date;
    }>;
    total: number;
  }> {
    try {
      // Get total count
      const countResult = await lsembPool.query(`
        SELECT COUNT(*) as total
        FROM pdf_ready_for_batch
      `);
      const total = parseInt(countResult.rows[0].total);

      // Get paginated documents
      const docsResult = await lsembPool.query(`
        SELECT id, title, file_path, file_type, status, ocr_status, analysis_status, created_at
        FROM pdf_ready_for_batch
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return {
        documents: docsResult.rows,
        total
      };
    } catch (error) {
      console.error('[PDF Analyzer] Error getting PDFs for batch:', error);
      throw error;
    }
  }
}

export default new PDFAnalyzerService();
