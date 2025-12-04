/**
 * CSV Transform Routes
 *
 * API endpoints for transforming CSV files to source database
 */

import { Router, Request, Response } from 'express';
import { csvTransformService } from '../services/csv-transform.service';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * POST /transform-file
 * Transform a single CSV file to source database
 */
router.post('/transform-file', async (req: Request, res: Response) => {
  try {
    const { filePath, schemaName, tableName, analyzeContent } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required'
      });
    }

    console.log(`[CSV Transform API] Transforming file: ${filePath}`);
    console.log(`[CSV Transform API] Schema: ${schemaName || 'none'}`);
    console.log(`[CSV Transform API] Analyze: ${analyzeContent || false}`);

    const result = await csvTransformService.transformCSV({
      filePath,
      schemaName,
      tableName,
      analyzeContent: analyzeContent || false
    });

    if (result.success) {
      console.log(`[CSV Transform API] ✓ Transformation successful: ${result.tableName}`);
      res.json(result);
    } else {
      console.log(`[CSV Transform API] ✗ Transformation failed: ${result.error}`);
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error('[CSV Transform API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /transform-directory
 * Transform all CSV files in a directory
 */
router.post('/transform-directory', async (req: Request, res: Response) => {
  try {
    const { dirPath, schemaName, analyzeContent } = req.body;

    if (!dirPath) {
      return res.status(400).json({
        success: false,
        error: 'dirPath is required'
      });
    }

    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({
        success: false,
        error: `Directory not found: ${dirPath}`
      });
    }

    console.log(`[CSV Transform API] Transforming directory: ${dirPath}`);
    console.log(`[CSV Transform API] Schema: ${schemaName || 'none'}`);

    const results = await csvTransformService.transformDirectory(dirPath, {
      schemaName,
      analyzeContent: analyzeContent || false
    });

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`[CSV Transform API] ✓ Directory transformation complete: ${successCount} success, ${failureCount} failed`);

    res.json({
      success: true,
      totalFiles: results.length,
      successCount,
      failureCount,
      results
    });
  } catch (error: any) {
    console.error('[CSV Transform API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /transform-document
 * Transform a CSV document by ID from documents table
 */
router.post('/transform-document', async (req: Request, res: Response) => {
  try {
    const { documentId, schemaName, tableName, analyzeContent } = req.body;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: 'documentId is required'
      });
    }

    // Get document from database
    const pool = require('../config/database').default;
    const docResult = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    const document = docResult.rows[0];
    const filePath = document.file_path;

    if (!filePath || !filePath.endsWith('.csv')) {
      return res.status(400).json({
        success: false,
        error: 'Document is not a CSV file'
      });
    }

    console.log(`[CSV Transform API] Transforming document ${documentId}: ${filePath}`);

    const result = await csvTransformService.transformCSV({
      filePath,
      schemaName,
      tableName,
      analyzeContent: analyzeContent || false
    });

    if (result.success) {
      // Update document metadata with transformation info
      await pool.query(
        `UPDATE documents
         SET metadata = COALESCE(metadata, '{}'::jsonb) ||
             jsonb_build_object(
               'source_table', $1,
               'transformed_at', NOW(),
               'rows_inserted', $2,
               'rows_updated', $3
             )
         WHERE id = $4`,
        [result.tableName, result.rowsInserted, result.rowsUpdated, documentId]
      );

      console.log(`[CSV Transform API] ✓ Document transformed: ${result.tableName}`);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[CSV Transform API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /batch-transform-documents
 * Transform multiple CSV documents by their IDs
 */
router.post('/batch-transform-documents', async (req: Request, res: Response) => {
  try {
    const { documentIds, schemaName, analyzeContent } = req.body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'documentIds array is required'
      });
    }

    console.log(`[CSV Transform API] Batch transforming ${documentIds.length} documents`);

    const pool = require('../config/database').default;
    const results = [];

    for (const documentId of documentIds) {
      try {
        const docResult = await pool.query(
          'SELECT * FROM documents WHERE id = $1',
          [documentId]
        );

        if (docResult.rows.length === 0) {
          results.push({
            documentId,
            success: false,
            error: 'Document not found'
          });
          continue;
        }

        const document = docResult.rows[0];
        const filePath = document.file_path;

        if (!filePath || !filePath.endsWith('.csv')) {
          results.push({
            documentId,
            success: false,
            error: 'Not a CSV file'
          });
          continue;
        }

        const result = await csvTransformService.transformCSV({
          filePath,
          schemaName,
          analyzeContent: analyzeContent || false
        });

        if (result.success) {
          // Update document metadata
          await pool.query(
            `UPDATE documents
             SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                 jsonb_build_object(
                   'source_table', $1,
                   'transformed_at', NOW(),
                   'rows_inserted', $2,
                   'rows_updated', $3
                 )
             WHERE id = $4`,
            [result.tableName, result.rowsInserted, result.rowsUpdated, documentId]
          );
        }

        results.push({
          documentId,
          ...result
        });
      } catch (error: any) {
        results.push({
          documentId,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`[CSV Transform API] ✓ Batch transformation complete: ${successCount} success, ${failureCount} failed`);

    res.json({
      success: true,
      totalDocuments: results.length,
      successCount,
      failureCount,
      results
    });
  } catch (error: any) {
    console.error('[CSV Transform API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
