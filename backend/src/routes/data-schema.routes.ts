/**
 * Data Schema API Routes
 *
 * Multi-tenant veri şema yönetimi için REST API endpoints
 * - Industry presets (sistem şablonları)
 * - User schemas (kullanıcı özel şemaları)
 * - Template işleme ve citation üretimi
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import dataSchemaService from '../services/data-schema.service';

const router = Router();

// ============================================
// INDUSTRY PRESETS (Read-only system templates)
// ============================================

/**
 * GET /api/v2/data-schema/industries
 * Get all available industries
 */
router.get('/industries', authenticateToken, async (req: Request, res: Response) => {
  try {
    const industries = await dataSchemaService.getIndustries();
    res.json({ industries });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get industries error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/data-schema/presets
 * Get industry presets (optionally filtered by industry)
 */
router.get('/presets', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const industryCode = req.query.industry as string | undefined;
    const userTier = (req.user as any)?.subscription_tier || 'free';
    const presets = await dataSchemaService.getIndustryPresets(industryCode, userTier);
    res.json({ presets });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get presets error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/data-schema/presets/:id
 * Get a specific preset by ID
 */
router.get('/presets/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const preset = await dataSchemaService.getPresetById(req.params.id);
    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    res.json({ preset });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get preset error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema/presets/:id/clone
 * Clone a preset to user's schemas
 */
router.post('/presets/:id/clone', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { customName } = req.body;
    const schema = await dataSchemaService.clonePresetToUser(req.params.id, userId, customName);

    if (!schema) {
      return res.status(404).json({ error: 'Preset not found or clone failed' });
    }

    res.status(201).json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Clone preset error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER SCHEMAS (User's custom schemas)
// ============================================

/**
 * GET /api/v2/data-schema/user/schemas
 * Get user's custom schemas
 */
router.get('/user/schemas', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const schemas = await dataSchemaService.getUserSchemas(userId);
    res.json({ schemas });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get user schemas error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema/user/schemas
 * Create a custom schema for user
 */
router.post('/user/schemas', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { name, display_name, description, fields, templates, llm_guide } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ error: 'name and display_name are required' });
    }

    const schema = await dataSchemaService.createUserSchema(userId, {
      name,
      display_name,
      description,
      fields: fields || [],
      templates: templates || { analyze: '', citation: '', questions: [] },
      llm_guide
    });

    if (!schema) {
      return res.status(500).json({ error: 'Failed to create schema' });
    }

    res.status(201).json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Create user schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/v2/data-schema/user/schemas/:id
 * Update user's schema
 */
router.put('/user/schemas/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const schema = await dataSchemaService.updateUserSchema(req.params.id, userId, req.body);
    if (!schema) {
      return res.status(404).json({ error: 'Schema not found or update failed' });
    }

    res.json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Update user schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/v2/data-schema/user/schemas/:id
 * Delete user's schema
 */
router.delete('/user/schemas/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const success = await dataSchemaService.deleteUserSchema(req.params.id, userId);
    if (!success) {
      return res.status(404).json({ error: 'Schema not found or delete failed' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[DataSchema Routes] Delete user schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER SETTINGS
// ============================================

/**
 * GET /api/v2/data-schema/user/settings
 * Get user's schema settings
 */
router.get('/user/settings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const settings = await dataSchemaService.getUserSettings(userId);
    res.json({ settings });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get user settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/v2/data-schema/user/settings
 * Update user's schema settings
 */
router.put('/user/settings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    await dataSchemaService.updateUserSettings(userId, req.body);
    const settings = await dataSchemaService.getUserSettings(userId);
    res.json({ settings });
  } catch (error: any) {
    console.error('[DataSchema Routes] Update user settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/data-schema/user/active-schema
 * Set user's active schema
 */
router.post('/user/active-schema', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { schemaId, schemaType } = req.body;
    if (!schemaId || !schemaType) {
      return res.status(400).json({ error: 'schemaId and schemaType are required' });
    }

    if (!['preset', 'custom'].includes(schemaType)) {
      return res.status(400).json({ error: 'schemaType must be "preset" or "custom"' });
    }

    const success = await dataSchemaService.setActiveSchema(userId, schemaId, schemaType);
    if (!success) {
      return res.status(500).json({ error: 'Failed to set active schema' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[DataSchema Routes] Set active schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/data-schema/user/active-schema
 * Get user's active schema
 */
router.get('/user/active-schema', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const schema = await dataSchemaService.getActiveSchemaForUser(userId);
    res.json({ schema });
  } catch (error: any) {
    console.error('[DataSchema Routes] Get active schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LEGACY ENDPOINTS (Backward compatibility)
// ============================================

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
 * Set schema as active (legacy - uses settings table)
 */
router.post('/:id/activate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const success = await dataSchemaService.setActiveSchemaLegacy(req.params.id);
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
