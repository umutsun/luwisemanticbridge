/**
 * Data Schema API Routes
 *
 * Veri şema yönetimi için REST API endpoints
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import dataSchemaService from '../services/data-schema.service';

const router = Router();

/**
 * GET /api/v2/data-schema
 * Get all schemas with active schema info
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const config = await dataSchemaService.loadConfig();
    res.json({
      schemas: config.schemas,
      activeSchemaId: config.activeSchemaId,
      globalSettings: config.globalSettings
    });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get schemas error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/data-schema/active
 * Get active schema
 */
router.get('/active', authenticateToken, async (req: Request, res: Response) => {
  try {
    const schema = await dataSchemaService.getActiveSchema();
    res.json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get active schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/data-schema/:id
 * Get schema by ID
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const schema = await dataSchemaService.getSchemaById(req.params.id);
    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    res.json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema
 * Create new schema
 */
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name, displayName, description, fields, templates, llmGuide, sourceTables, isActive } = req.body;

    if (!name || !displayName || !fields || !templates) {
      return res.status(400).json({ error: 'name, displayName, fields, and templates are required' });
    }

    const schema = await dataSchemaService.createSchema({
      name,
      displayName,
      description: description || '',
      fields,
      templates,
      llmGuide: llmGuide || '',
      sourceTables,
      isActive: isActive !== false
    });

    res.status(201).json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Create schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/v2/data-schema/:id
 * Update schema
 */
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const schema = await dataSchemaService.updateSchema(req.params.id, req.body);
    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    res.json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Update schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/v2/data-schema/:id
 * Delete schema
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const success = await dataSchemaService.deleteSchema(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Cannot delete default schema' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[DataSchema Routes] Delete schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema/:id/activate
 * Set schema as active
 */
router.post('/:id/activate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const success = await dataSchemaService.setActiveSchema(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[DataSchema Routes] Activate schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/v2/data-schema/settings/global
 * Update global settings
 */
router.put('/settings/global', authenticateToken, async (req: Request, res: Response) => {
  try {
    await dataSchemaService.updateGlobalSettings(req.body);
    const settings = await dataSchemaService.getGlobalSettings();
    res.json({ settings });
  } catch (error: any) {
    console.error('[DataSchema Routes] Update global settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema/process/citation
 * Process citation template with given data
 */
router.post('/process/citation', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sourceTable, metadata } = req.body;

    if (!sourceTable || !metadata) {
      return res.status(400).json({ error: 'sourceTable and metadata are required' });
    }

    const citation = await dataSchemaService.generateCitation(sourceTable, metadata);
    res.json({ citation });
  } catch (error: any) {
    console.error('[DataSchema Routes] Process citation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema/process/questions
 * Generate follow-up questions from source
 */
router.post('/process/questions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sourceTable, metadata, maxQuestions } = req.body;

    if (!sourceTable || !metadata) {
      return res.status(400).json({ error: 'sourceTable and metadata are required' });
    }

    const questions = await dataSchemaService.generateQuestions(sourceTable, metadata, maxQuestions);
    res.json({ questions });
  } catch (error: any) {
    console.error('[DataSchema Routes] Process questions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema/process/tags
 * Extract tags from metadata
 */
router.post('/process/tags', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sourceTable, metadata } = req.body;

    if (!sourceTable || !metadata) {
      return res.status(400).json({ error: 'sourceTable and metadata are required' });
    }

    const tags = await dataSchemaService.extractTags(sourceTable, metadata);
    res.json({ tags });
  } catch (error: any) {
    console.error('[DataSchema Routes] Extract tags error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/data-schema/analyze-prompt
 * Get analyze prompt for document processing
 */
router.get('/analyze-prompt', authenticateToken, async (req: Request, res: Response) => {
  try {
    const sourceTable = req.query.sourceTable as string | undefined;
    const prompt = await dataSchemaService.getAnalyzePrompt(sourceTable);
    res.json({ prompt });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get analyze prompt error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/data-schema/llm-guide
 * Get LLM guide for system prompt enhancement
 */
router.get('/llm-guide', authenticateToken, async (req: Request, res: Response) => {
  try {
    const sourceTable = req.query.sourceTable as string | undefined;
    const guide = await dataSchemaService.getLLMGuide(sourceTable);
    res.json({ guide });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get LLM guide error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
