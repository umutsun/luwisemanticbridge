/**
 * Transform Configuration Routes
 * CRUD operations for generic template-based data transformation
 */

import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// ============================================================================
// TEMPLATE TABLE SCHEMAS
// ============================================================================

/**
 * Get all table schemas for a template
 */
router.get('/schemas', async (req: Request, res: Response) => {
  try {
    const { template_id } = req.query;

    let query = 'SELECT * FROM template_table_schemas WHERE is_active = true';
    const params: any[] = [];

    if (template_id) {
      query += ' AND template_id = $1';
      params.push(template_id);
    }

    query += ' ORDER BY created_at DESC';

    const result = await lsembPool.query(query, params);

    res.json({
      success: true,
      schemas: result.rows,
      total: result.rowCount
    });

  } catch (error: any) {
    console.error('[Transform Config] Get schemas error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get a specific table schema
 */
router.get('/schemas/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await lsembPool.query(
      'SELECT * FROM template_table_schemas WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    res.json({
      success: true,
      schema: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Transform Config] Get schema error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new table schema
 */
router.post('/schemas', async (req: Request, res: Response) => {
  try {
    const {
      template_id,
      table_name,
      schema_definition,
      description
    } = req.body;

    // Validate required fields
    if (!template_id || !table_name || !schema_definition) {
      return res.status(400).json({
        success: false,
        error: 'template_id, table_name, and schema_definition are required'
      });
    }

    // Validate schema_definition structure
    if (!schema_definition.columns || !Array.isArray(schema_definition.columns)) {
      return res.status(400).json({
        success: false,
        error: 'schema_definition must include a columns array'
      });
    }

    const result = await lsembPool.query(
      `INSERT INTO template_table_schemas
       (template_id, table_name, schema_definition, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [template_id, table_name, JSON.stringify(schema_definition), description]
    );

    res.json({
      success: true,
      schema: result.rows[0],
      message: 'Table schema created successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Create schema error:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A schema with this template_id and table_name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update a table schema
 */
router.put('/schemas/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      table_name,
      schema_definition,
      description,
      is_active
    } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (table_name !== undefined) {
      updates.push(`table_name = $${paramCount++}`);
      params.push(table_name);
    }

    if (schema_definition !== undefined) {
      updates.push(`schema_definition = $${paramCount++}`);
      params.push(JSON.stringify(schema_definition));
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(description);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await lsembPool.query(
      `UPDATE template_table_schemas
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    res.json({
      success: true,
      schema: result.rows[0],
      message: 'Schema updated successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Update schema error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete a table schema
 */
router.delete('/schemas/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await lsembPool.query(
      'DELETE FROM template_table_schemas WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    res.json({
      success: true,
      message: 'Schema deleted successfully',
      deleted: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Transform Config] Delete schema error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// TEMPLATE FIELD MAPPINGS
// ============================================================================

/**
 * Get all field mappings for a template
 */
router.get('/mappings', async (req: Request, res: Response) => {
  try {
    const { template_id, target_table } = req.query;

    let query = 'SELECT * FROM template_field_mappings WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (template_id) {
      query += ` AND template_id = $${paramCount++}`;
      params.push(template_id);
    }

    if (target_table) {
      query += ` AND target_table = $${paramCount++}`;
      params.push(target_table);
    }

    query += ' ORDER BY priority ASC, created_at DESC';

    const result = await lsembPool.query(query, params);

    res.json({
      success: true,
      mappings: result.rows,
      total: result.rowCount
    });

  } catch (error: any) {
    console.error('[Transform Config] Get mappings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new field mapping
 */
router.post('/mappings', async (req: Request, res: Response) => {
  try {
    const {
      template_id,
      source_field,
      target_table,
      target_column,
      transform_function,
      default_value,
      is_required,
      priority
    } = req.body;

    // Validate required fields
    if (!template_id || !source_field || !target_table || !target_column) {
      return res.status(400).json({
        success: false,
        error: 'template_id, source_field, target_table, and target_column are required'
      });
    }

    const result = await lsembPool.query(
      `INSERT INTO template_field_mappings
       (template_id, source_field, target_table, target_column,
        transform_function, default_value, is_required, priority,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        template_id,
        source_field,
        target_table,
        target_column,
        transform_function,
        default_value,
        is_required || false,
        priority || 0
      ]
    );

    res.json({
      success: true,
      mapping: result.rows[0],
      message: 'Field mapping created successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Create mapping error:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A mapping with these fields already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update a field mapping
 */
router.put('/mappings/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      source_field,
      target_table,
      target_column,
      transform_function,
      default_value,
      is_required,
      priority
    } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (source_field !== undefined) {
      updates.push(`source_field = $${paramCount++}`);
      params.push(source_field);
    }

    if (target_table !== undefined) {
      updates.push(`target_table = $${paramCount++}`);
      params.push(target_table);
    }

    if (target_column !== undefined) {
      updates.push(`target_column = $${paramCount++}`);
      params.push(target_column);
    }

    if (transform_function !== undefined) {
      updates.push(`transform_function = $${paramCount++}`);
      params.push(transform_function);
    }

    if (default_value !== undefined) {
      updates.push(`default_value = $${paramCount++}`);
      params.push(default_value);
    }

    if (is_required !== undefined) {
      updates.push(`is_required = $${paramCount++}`);
      params.push(is_required);
    }

    if (priority !== undefined) {
      updates.push(`priority = $${paramCount++}`);
      params.push(priority);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await lsembPool.query(
      `UPDATE template_field_mappings
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping not found'
      });
    }

    res.json({
      success: true,
      mapping: result.rows[0],
      message: 'Mapping updated successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Update mapping error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete a field mapping
 */
router.delete('/mappings/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await lsembPool.query(
      'DELETE FROM template_field_mappings WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping not found'
      });
    }

    res.json({
      success: true,
      message: 'Mapping deleted successfully',
      deleted: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Transform Config] Delete mapping error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// TEMPLATE TRANSFORM RULES
// ============================================================================

/**
 * Get all transform rules for a template
 */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const { template_id, rule_type } = req.query;

    let query = 'SELECT * FROM template_transform_rules WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (template_id) {
      query += ` AND template_id = $${paramCount++}`;
      params.push(template_id);
    }

    if (rule_type) {
      query += ` AND rule_type = $${paramCount++}`;
      params.push(rule_type);
    }

    query += ' ORDER BY priority ASC, created_at DESC';

    const result = await lsembPool.query(query, params);

    res.json({
      success: true,
      rules: result.rows,
      total: result.rowCount
    });

  } catch (error: any) {
    console.error('[Transform Config] Get rules error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new transform rule
 */
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const {
      template_id,
      rule_name,
      rule_type,
      rule_definition,
      priority,
      is_active
    } = req.body;

    // Validate required fields
    if (!template_id || !rule_name || !rule_type || !rule_definition) {
      return res.status(400).json({
        success: false,
        error: 'template_id, rule_name, rule_type, and rule_definition are required'
      });
    }

    // Validate rule_type
    const validRuleTypes = ['pre_transform', 'post_transform', 'validation', 'enrichment'];
    if (!validRuleTypes.includes(rule_type)) {
      return res.status(400).json({
        success: false,
        error: `rule_type must be one of: ${validRuleTypes.join(', ')}`
      });
    }

    const result = await lsembPool.query(
      `INSERT INTO template_transform_rules
       (template_id, rule_name, rule_type, rule_definition, priority, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        template_id,
        rule_name,
        rule_type,
        JSON.stringify(rule_definition),
        priority || 0,
        is_active !== false
      ]
    );

    res.json({
      success: true,
      rule: result.rows[0],
      message: 'Transform rule created successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Create rule error:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A rule with this template_id and rule_name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update a transform rule
 */
router.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      rule_type,
      rule_definition,
      priority,
      is_active
    } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (rule_name !== undefined) {
      updates.push(`rule_name = $${paramCount++}`);
      params.push(rule_name);
    }

    if (rule_type !== undefined) {
      // Validate rule_type
      const validRuleTypes = ['pre_transform', 'post_transform', 'validation', 'enrichment'];
      if (!validRuleTypes.includes(rule_type)) {
        return res.status(400).json({
          success: false,
          error: `rule_type must be one of: ${validRuleTypes.join(', ')}`
        });
      }
      updates.push(`rule_type = $${paramCount++}`);
      params.push(rule_type);
    }

    if (rule_definition !== undefined) {
      updates.push(`rule_definition = $${paramCount++}`);
      params.push(JSON.stringify(rule_definition));
    }

    if (priority !== undefined) {
      updates.push(`priority = $${paramCount++}`);
      params.push(priority);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await lsembPool.query(
      `UPDATE template_transform_rules
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    res.json({
      success: true,
      rule: result.rows[0],
      message: 'Rule updated successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Update rule error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete a transform rule
 */
router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await lsembPool.query(
      'DELETE FROM template_transform_rules WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Rule deleted successfully',
      deleted: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Transform Config] Delete rule error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// TRANSFORM JOBS
// ============================================================================

/**
 * Get all transform jobs
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { template_id, status, limit = 50 } = req.query;

    let query = 'SELECT * FROM transform_jobs WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (template_id) {
      query += ` AND template_id = $${paramCount++}`;
      params.push(template_id);
    }

    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await lsembPool.query(query, params);

    res.json({
      success: true,
      jobs: result.rows,
      total: result.rowCount
    });

  } catch (error: any) {
    console.error('[Transform Config] Get jobs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get a specific transform job
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const result = await lsembPool.query(
      'SELECT * FROM transform_jobs WHERE job_id = $1',
      [jobId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Transform Config] Get job error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new transform job
 */
router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const {
      job_id,
      template_id,
      folder_config,
      total_documents
    } = req.body;

    // Validate required fields
    if (!job_id || !template_id) {
      return res.status(400).json({
        success: false,
        error: 'job_id and template_id are required'
      });
    }

    const result = await lsembPool.query(
      `INSERT INTO transform_jobs
       (job_id, template_id, folder_config, total_documents, status, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW(), NOW())
       RETURNING *`,
      [
        job_id,
        template_id,
        folder_config ? JSON.stringify(folder_config) : null,
        total_documents || 0
      ]
    );

    res.json({
      success: true,
      job: result.rows[0],
      message: 'Transform job created successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Create job error:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A job with this job_id already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update a transform job
 */
router.put('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const {
      status,
      processed_documents,
      created_tables,
      errors
    } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);

      // If status is completed, set completed_at
      if (status === 'completed') {
        updates.push(`completed_at = NOW()`);
      }
    }

    if (processed_documents !== undefined) {
      updates.push(`processed_documents = $${paramCount++}`);
      params.push(processed_documents);
    }

    if (created_tables !== undefined) {
      updates.push(`created_tables = $${paramCount++}`);
      params.push(created_tables);
    }

    if (errors !== undefined) {
      updates.push(`errors = $${paramCount++}`);
      params.push(JSON.stringify(errors));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    params.push(jobId);

    const result = await lsembPool.query(
      `UPDATE transform_jobs
       SET ${updates.join(', ')}
       WHERE job_id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job: result.rows[0],
      message: 'Job updated successfully'
    });

  } catch (error: any) {
    console.error('[Transform Config] Update job error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete a transform job
 */
router.delete('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const result = await lsembPool.query(
      'DELETE FROM transform_jobs WHERE job_id = $1 RETURNING *',
      [jobId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      message: 'Job deleted successfully',
      deleted: result.rows[0]
    });

  } catch (error: any) {
    console.error('[Transform Config] Delete job error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Get complete transform configuration for a template
 */
router.get('/templates/:templateId/config', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    // Get all schemas
    const schemasResult = await lsembPool.query(
      'SELECT * FROM template_table_schemas WHERE template_id = $1 AND is_active = true ORDER BY created_at',
      [templateId]
    );

    // Get all mappings
    const mappingsResult = await lsembPool.query(
      'SELECT * FROM template_field_mappings WHERE template_id = $1 ORDER BY priority, created_at',
      [templateId]
    );

    // Get all rules
    const rulesResult = await lsembPool.query(
      'SELECT * FROM template_transform_rules WHERE template_id = $1 AND is_active = true ORDER BY priority, created_at',
      [templateId]
    );

    res.json({
      success: true,
      template_id: templateId,
      config: {
        schemas: schemasResult.rows,
        mappings: mappingsResult.rows,
        rules: rulesResult.rows
      },
      counts: {
        schemas: schemasResult.rowCount,
        mappings: mappingsResult.rowCount,
        rules: rulesResult.rowCount
      }
    });

  } catch (error: any) {
    console.error('[Transform Config] Get template config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Clone configuration from one template to another
 */
router.post('/templates/:sourceId/clone', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { target_template_id } = req.body;

    if (!target_template_id) {
      return res.status(400).json({
        success: false,
        error: 'target_template_id is required'
      });
    }

    // Start transaction
    const client = await lsembPool.connect();
    try {
      await client.query('BEGIN');

      // Clone schemas
      const schemasResult = await client.query(
        `INSERT INTO template_table_schemas
         (template_id, table_name, schema_definition, description, is_active)
         SELECT $1, table_name, schema_definition, description, is_active
         FROM template_table_schemas
         WHERE template_id = $2 AND is_active = true
         RETURNING *`,
        [target_template_id, sourceId]
      );

      // Clone mappings
      const mappingsResult = await client.query(
        `INSERT INTO template_field_mappings
         (template_id, source_field, target_table, target_column,
          transform_function, default_value, is_required, priority)
         SELECT $1, source_field, target_table, target_column,
                transform_function, default_value, is_required, priority
         FROM template_field_mappings
         WHERE template_id = $2
         RETURNING *`,
        [target_template_id, sourceId]
      );

      // Clone rules
      const rulesResult = await client.query(
        `INSERT INTO template_transform_rules
         (template_id, rule_name, rule_type, rule_definition, priority, is_active)
         SELECT $1, rule_name, rule_type, rule_definition, priority, is_active
         FROM template_transform_rules
         WHERE template_id = $2 AND is_active = true
         RETURNING *`,
        [target_template_id, sourceId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Configuration cloned successfully',
        cloned: {
          schemas: schemasResult.rowCount,
          mappings: mappingsResult.rowCount,
          rules: rulesResult.rowCount
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('[Transform Config] Clone error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
