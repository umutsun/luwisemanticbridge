/**
 * Template Management Routes
 * Handle document analysis templates stored in database
 */

import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * Get all templates
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, active } = req.query;

    let query = `
      SELECT
        id, template_id, name, description, category,
        focus_keywords, subcategories, target_fields,
        folder_patterns, is_active, is_system, priority,
        version, created_at, updated_at
      FROM document_templates
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (active !== undefined) {
      params.push(active === 'true');
      query += ` AND is_active = $${params.length}`;
    }

    query += ' ORDER BY priority DESC, name ASC';

    const result = await lsembPool.query(query, params);

    res.json({
      success: true,
      templates: result.rows,
      total: result.rowCount
    });

  } catch (error: any) {
    console.error('[Templates] Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get single template by ID
 */
router.get('/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const result = await lsembPool.query(
      `SELECT * FROM document_templates WHERE template_id = $1`,
      [templateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      template: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Templates] Error fetching template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create new template
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      template_id,
      name,
      description,
      category,
      focus_keywords,
      subcategories,
      target_fields,
      extraction_prompt,
      folder_patterns,
      table_schema,
      auto_detect_rules,
      priority = 100
    } = req.body;

    if (!template_id || !name) {
      return res.status(400).json({
        success: false,
        error: 'template_id and name are required'
      });
    }

    const result = await lsembPool.query(
      `INSERT INTO document_templates (
        template_id, name, description, category,
        focus_keywords, subcategories, target_fields, extraction_prompt,
        folder_patterns, table_schema, auto_detect_rules, priority,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        template_id, name, description, category,
        focus_keywords, subcategories, target_fields, extraction_prompt,
        folder_patterns, table_schema, auto_detect_rules, priority,
        'system'
      ]
    );

    console.log(`[Templates] Created template: ${template_id}`);

    res.json({
      success: true,
      template: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Templates] Error creating template:', error);

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'Template with this ID already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update template
 */
router.put('/:templateId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId } = req.params;
    const {
      name,
      description,
      category,
      focus_keywords,
      subcategories,
      target_fields,
      extraction_prompt,
      folder_patterns,
      table_schema,
      auto_detect_rules,
      priority,
      is_active
    } = req.body;

    // Check if template exists and is not system
    const checkResult = await lsembPool.query(
      `SELECT is_system FROM document_templates WHERE template_id = $1`,
      [templateId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCount++}`);
      updateValues.push(name);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramCount++}`);
      updateValues.push(description);
    }
    if (category !== undefined) {
      updateFields.push(`category = $${paramCount++}`);
      updateValues.push(category);
    }
    if (focus_keywords !== undefined) {
      updateFields.push(`focus_keywords = $${paramCount++}`);
      updateValues.push(focus_keywords);
    }
    if (subcategories !== undefined) {
      updateFields.push(`subcategories = $${paramCount++}`);
      updateValues.push(subcategories);
    }
    if (target_fields !== undefined) {
      updateFields.push(`target_fields = $${paramCount++}`);
      updateValues.push(target_fields);
    }
    if (extraction_prompt !== undefined) {
      updateFields.push(`extraction_prompt = $${paramCount++}`);
      updateValues.push(extraction_prompt);
    }
    if (folder_patterns !== undefined) {
      updateFields.push(`folder_patterns = $${paramCount++}`);
      updateValues.push(folder_patterns);
    }
    if (table_schema !== undefined) {
      updateFields.push(`table_schema = $${paramCount++}`);
      updateValues.push(table_schema);
    }
    if (auto_detect_rules !== undefined) {
      updateFields.push(`auto_detect_rules = $${paramCount++}`);
      updateValues.push(auto_detect_rules);
    }
    if (priority !== undefined) {
      updateFields.push(`priority = $${paramCount++}`);
      updateValues.push(priority);
    }
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      updateValues.push(is_active);
    }

    updateFields.push(`updated_by = $${paramCount++}`);
    updateValues.push(req.user?.username || 'system');

    updateValues.push(templateId);

    const updateQuery = `
      UPDATE document_templates
      SET ${updateFields.join(', ')}
      WHERE template_id = $${paramCount}
      RETURNING *
    `;

    const result = await lsembPool.query(updateQuery, updateValues);

    console.log(`[Templates] Updated template: ${templateId}`);

    res.json({
      success: true,
      template: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Templates] Error updating template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete template (only non-system templates)
 */
router.delete('/:templateId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId } = req.params;

    // Check if template exists and is not system
    const checkResult = await lsembPool.query(
      `SELECT is_system FROM document_templates WHERE template_id = $1`,
      [templateId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    if (checkResult.rows[0].is_system) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete system templates'
      });
    }

    await lsembPool.query(
      `DELETE FROM document_templates WHERE template_id = $1`,
      [templateId]
    );

    console.log(`[Templates] Deleted template: ${templateId}`);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error: any) {
    console.error('[Templates] Error deleting template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Detect template for a document
 */
router.post('/detect', async (req: Request, res: Response) => {
  try {
    const { filePath, content, visualElements } = req.body;

    let detectedTemplate = null;

    // 1. Try folder-based detection first (highest priority)
    if (filePath) {
      const pathResult = await lsembPool.query(
        `SELECT * FROM get_template_by_path($1)`,
        [filePath]
      );

      if (pathResult.rows.length > 0 && pathResult.rows[0].template_id) {
        detectedTemplate = pathResult.rows[0];
        console.log(`[Templates] Detected by path: ${detectedTemplate.template_id}`);
      }
    }

    // 2. Try keyword-based detection if no path match
    if (!detectedTemplate && content) {
      const keywordResult = await lsembPool.query(
        `SELECT * FROM get_template_by_keywords($1, 1)`,
        [content.substring(0, 5000)]
      );

      if (keywordResult.rows.length > 0) {
        // Fetch full template details
        const templateResult = await lsembPool.query(
          `SELECT * FROM document_templates WHERE template_id = $1`,
          [keywordResult.rows[0].template_id]
        );

        if (templateResult.rows.length > 0) {
          detectedTemplate = templateResult.rows[0];
          console.log(`[Templates] Detected by keywords: ${detectedTemplate.template_id}`);
        }
      }
    }

    // 3. Return default if no match
    if (!detectedTemplate) {
      const defaultResult = await lsembPool.query(
        `SELECT * FROM document_templates WHERE template_id = 'general' LIMIT 1`
      );

      if (defaultResult.rows.length > 0) {
        detectedTemplate = defaultResult.rows[0];
      }
    }

    res.json({
      success: true,
      template: detectedTemplate,
      detection_method: detectedTemplate ?
        (filePath ? 'path' : 'keywords') :
        'default'
    });

  } catch (error: any) {
    console.error('[Templates] Error detecting template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Apply template to extract metadata from document
 */
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const {
      templateId,
      documentId,
      content,
      createTables = false
    } = req.body;

    if (!templateId || !content) {
      return res.status(400).json({
        success: false,
        error: 'templateId and content are required'
      });
    }

    // Get template
    const templateResult = await lsembPool.query(
      `SELECT * FROM document_templates WHERE template_id = $1`,
      [templateId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const template = templateResult.rows[0];

    // Use LLM to extract metadata based on template
    const llmManager = require('../services/llm-manager.service').default;

    const extractionPrompt = template.extraction_prompt ||
      `Extract the following fields from the document: ${template.target_fields.join(', ')}`;

    const extractedData = await llmManager.generateText(
      `${extractionPrompt}\n\nDocument content:\n${content.substring(0, 8000)}`,
      {
        temperature: 0.1,
        maxTokens: 2000
      }
    );

    let metadata = {};
    try {
      metadata = JSON.parse(extractedData.replace(/```json\n?|\n?```/g, '').trim());
    } catch (e) {
      console.error('[Templates] Failed to parse LLM response:', e);
      metadata = { raw_response: extractedData };
    }

    // Create tables if requested and schema exists
    if (createTables && template.table_schema) {
      const tableSchema = template.table_schema;

      if (tableSchema.tables && Array.isArray(tableSchema.tables)) {
        for (const table of tableSchema.tables) {
          try {
            const createSQL = generateCreateTableSQL(table);
            // Note: Actual table creation would happen in source_db
            console.log(`[Templates] Would create table: ${table.name}`);
          } catch (tableError) {
            console.error(`[Templates] Error preparing table ${table.name}:`, tableError);
          }
        }
      }
    }

    // Save to document if documentId provided
    if (documentId) {
      await lsembPool.query(
        `UPDATE documents
         SET metadata = metadata || $1::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [
          JSON.stringify({
            ...metadata,
            template_id: templateId,
            extracted_at: new Date()
          }),
          documentId
        ]
      );
    }

    res.json({
      success: true,
      metadata,
      template_id: templateId,
      template_name: template.name
    });

  } catch (error: any) {
    console.error('[Templates] Error applying template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper function to generate CREATE TABLE SQL from schema
 */
function generateCreateTableSQL(tableSchema: any): string {
  const fields = tableSchema.fields.map((field: any) => {
    let fieldDef = `  ${field.name} ${field.type}`;
    if (field.primary) fieldDef += ' PRIMARY KEY';
    if (field.required) fieldDef += ' NOT NULL';
    if (field.default) fieldDef += ` DEFAULT ${field.default}`;
    return fieldDef;
  }).join(',\n');

  return `CREATE TABLE IF NOT EXISTS ${tableSchema.name} (\n${fields}\n);`;
}

export default router;