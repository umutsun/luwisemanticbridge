/**
 * Pattern Management Routes
 *
 * Question Generation Patterns, Citation Patterns ve Transform Prompts yönetimi
 * - JSON export/import
 * - Pattern CRUD operations
 * - Schema ile entegrasyon
 */

import { Router, Request, Response } from 'express';
import { dataSchemaService } from '../../../services/data-schema.service';
import { QuestionPattern, CitationPattern, TransformPrompt } from '../../../types/data-schema.types';

const router = Router();

/**
 * GET /patterns/questions
 * Tüm question pattern'lerini getir
 */
router.get('/questions', async (req: Request, res: Response) => {
  try {
    const config = await dataSchemaService.loadConfig();

    // Tüm schema'lardan pattern'leri topla
    const allPatterns: QuestionPattern[] = [];

    for (const schema of config.schemas) {
      if (schema.questionPatterns) {
        allPatterns.push(...schema.questionPatterns);
      }
    }

    res.json({
      success: true,
      patterns: allPatterns
    });
  } catch (error: any) {
    console.error('[Patterns API] Error fetching question patterns:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /patterns/questions/import
 * Pattern'leri JSON'dan import et
 *
 * Body: {
 *   schemaId: string,
 *   patterns: QuestionPattern[]
 * }
 */
router.post('/questions/import', async (req: Request, res: Response) => {
  try {
    const { schemaId, patterns } = req.body;

    if (!schemaId || !Array.isArray(patterns)) {
      return res.status(400).json({
        success: false,
        error: 'schemaId and patterns array are required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    // Pattern'leri schema'ya ekle
    schema.questionPatterns = patterns;

    // Config'i kaydet
    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Imported ${patterns.length} patterns to schema: ${schema.name}`);

    res.json({
      success: true,
      imported: patterns.length,
      schema: schema.name
    });
  } catch (error: any) {
    console.error('[Patterns API] Error importing patterns:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /patterns/questions/export
 * Pattern'leri JSON olarak export et
 *
 * Query: ?schemaId=xxx (opsiyonel)
 */
router.get('/questions/export', async (req: Request, res: Response) => {
  try {
    const { schemaId } = req.query;
    const config = await dataSchemaService.loadConfig();

    let patternsToExport: QuestionPattern[] = [];

    if (schemaId) {
      // Belirli bir schema'nın pattern'leri
      const schema = config.schemas.find(s => s.id === schemaId);
      if (schema && schema.questionPatterns) {
        patternsToExport = schema.questionPatterns;
      }
    } else {
      // Tüm pattern'ler
      for (const schema of config.schemas) {
        if (schema.questionPatterns) {
          patternsToExport.push(...schema.questionPatterns);
        }
      }
    }

    // JSON dosyası olarak indir
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="question-patterns-${Date.now()}.json"`);
    res.send(JSON.stringify(patternsToExport, null, 2));
  } catch (error: any) {
    console.error('[Patterns API] Error exporting patterns:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /patterns/questions/:patternId
 * Pattern güncelle
 */
router.put('/questions/:patternId', async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const { schemaId, pattern } = req.body;

    if (!schemaId || !pattern) {
      return res.status(400).json({
        success: false,
        error: 'schemaId and pattern are required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    if (!schema.questionPatterns) {
      schema.questionPatterns = [];
    }

    // Pattern'i bul ve güncelle
    const index = schema.questionPatterns.findIndex(p => p.id === patternId);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Pattern not found'
      });
    }

    schema.questionPatterns[index] = { ...pattern, id: patternId };

    // Config'i kaydet
    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Updated pattern: ${patternId}`);

    res.json({
      success: true,
      pattern: schema.questionPatterns[index]
    });
  } catch (error: any) {
    console.error('[Patterns API] Error updating pattern:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /patterns/questions/:patternId
 * Pattern sil
 */
router.delete('/questions/:patternId', async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const { schemaId } = req.query;

    if (!schemaId) {
      return res.status(400).json({
        success: false,
        error: 'schemaId query parameter is required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    if (!schema.questionPatterns) {
      return res.status(404).json({
        success: false,
        error: 'No patterns found'
      });
    }

    // Pattern'i sil
    const initialLength = schema.questionPatterns.length;
    schema.questionPatterns = schema.questionPatterns.filter(p => p.id !== patternId);

    if (schema.questionPatterns.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Pattern not found'
      });
    }

    // Config'i kaydet
    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Deleted pattern: ${patternId}`);

    res.json({
      success: true,
      deleted: patternId
    });
  } catch (error: any) {
    console.error('[Patterns API] Error deleting pattern:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// TRANSFORM PROMPTS ROUTES
// ========================================

/**
 * GET /patterns/transforms
 * Tüm transform prompt'larını getir
 */
router.get('/transforms', async (req: Request, res: Response) => {
  try {
    const config = await dataSchemaService.loadConfig();

    const allPrompts: TransformPrompt[] = [];

    for (const schema of config.schemas) {
      if (schema.transformPrompts) {
        allPrompts.push(...schema.transformPrompts);
      }
    }

    res.json({
      success: true,
      prompts: allPrompts
    });
  } catch (error: any) {
    console.error('[Patterns API] Error fetching transform prompts:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /patterns/transforms/import
 * Transform prompt'ları JSON'dan import et
 */
router.post('/transforms/import', async (req: Request, res: Response) => {
  try {
    const { schemaId, prompts } = req.body;

    if (!schemaId || !Array.isArray(prompts)) {
      return res.status(400).json({
        success: false,
        error: 'schemaId and prompts array are required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    schema.transformPrompts = prompts;
    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Imported ${prompts.length} transform prompts to schema: ${schema.name}`);

    res.json({
      success: true,
      imported: prompts.length,
      schema: schema.name
    });
  } catch (error: any) {
    console.error('[Patterns API] Error importing transform prompts:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /patterns/transforms/export
 * Transform prompt'ları JSON olarak export et
 */
router.get('/transforms/export', async (req: Request, res: Response) => {
  try {
    const { schemaId } = req.query;
    const config = await dataSchemaService.loadConfig();

    let promptsToExport: TransformPrompt[] = [];

    if (schemaId) {
      const schema = config.schemas.find(s => s.id === schemaId);
      if (schema && schema.transformPrompts) {
        promptsToExport = schema.transformPrompts;
      }
    } else {
      for (const schema of config.schemas) {
        if (schema.transformPrompts) {
          promptsToExport.push(...schema.transformPrompts);
        }
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="transform-prompts-${Date.now()}.json"`);
    res.send(JSON.stringify(promptsToExport, null, 2));
  } catch (error: any) {
    console.error('[Patterns API] Error exporting transform prompts:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /patterns/transforms/:promptId
 * Transform prompt güncelle
 */
router.put('/transforms/:promptId', async (req: Request, res: Response) => {
  try {
    const { promptId } = req.params;
    const { schemaId, prompt } = req.body;

    if (!schemaId || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'schemaId and prompt are required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    if (!schema.transformPrompts) {
      schema.transformPrompts = [];
    }

    const index = schema.transformPrompts.findIndex(p => p.id === promptId);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Transform prompt not found'
      });
    }

    schema.transformPrompts[index] = { ...prompt, id: promptId };
    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Updated transform prompt: ${promptId}`);

    res.json({
      success: true,
      prompt: schema.transformPrompts[index]
    });
  } catch (error: any) {
    console.error('[Patterns API] Error updating transform prompt:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /patterns/transforms/:promptId
 * Transform prompt sil
 */
router.delete('/transforms/:promptId', async (req: Request, res: Response) => {
  try {
    const { promptId } = req.params;
    const { schemaId } = req.query;

    if (!schemaId) {
      return res.status(400).json({
        success: false,
        error: 'schemaId query parameter is required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    if (!schema.transformPrompts) {
      return res.status(404).json({
        success: false,
        error: 'No transform prompts found'
      });
    }

    const initialLength = schema.transformPrompts.length;
    schema.transformPrompts = schema.transformPrompts.filter(p => p.id !== promptId);

    if (schema.transformPrompts.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Transform prompt not found'
      });
    }

    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Deleted transform prompt: ${promptId}`);

    res.json({
      success: true,
      deleted: promptId
    });
  } catch (error: any) {
    console.error('[Patterns API] Error deleting transform prompt:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// CITATION PATTERNS ROUTES
// ========================================

/**
 * GET /patterns/citations
 * Tüm citation pattern'lerini getir
 */
router.get('/citations', async (req: Request, res: Response) => {
  try {
    const config = await dataSchemaService.loadConfig();

    const allPatterns: CitationPattern[] = [];

    for (const schema of config.schemas) {
      if (schema.citationPatterns) {
        allPatterns.push(...schema.citationPatterns);
      }
    }

    res.json({
      success: true,
      patterns: allPatterns
    });
  } catch (error: any) {
    console.error('[Patterns API] Error fetching citation patterns:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /patterns/citations/import
 * Citation pattern'leri JSON'dan import et
 */
router.post('/citations/import', async (req: Request, res: Response) => {
  try {
    const { schemaId, patterns } = req.body;

    if (!schemaId || !Array.isArray(patterns)) {
      return res.status(400).json({
        success: false,
        error: 'schemaId and patterns array are required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    schema.citationPatterns = patterns;
    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Imported ${patterns.length} citation patterns to schema: ${schema.name}`);

    res.json({
      success: true,
      imported: patterns.length,
      schema: schema.name
    });
  } catch (error: any) {
    console.error('[Patterns API] Error importing citation patterns:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /patterns/citations/export
 * Citation pattern'leri JSON olarak export et
 */
router.get('/citations/export', async (req: Request, res: Response) => {
  try {
    const { schemaId } = req.query;
    const config = await dataSchemaService.loadConfig();

    let patternsToExport: CitationPattern[] = [];

    if (schemaId) {
      const schema = config.schemas.find(s => s.id === schemaId);
      if (schema && schema.citationPatterns) {
        patternsToExport = schema.citationPatterns;
      }
    } else {
      for (const schema of config.schemas) {
        if (schema.citationPatterns) {
          patternsToExport.push(...schema.citationPatterns);
        }
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="citation-patterns-${Date.now()}.json"`);
    res.send(JSON.stringify(patternsToExport, null, 2));
  } catch (error: any) {
    console.error('[Patterns API] Error exporting citation patterns:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /patterns/citations/:patternId
 * Citation pattern güncelle
 */
router.put('/citations/:patternId', async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const { schemaId, pattern } = req.body;

    if (!schemaId || !pattern) {
      return res.status(400).json({
        success: false,
        error: 'schemaId and pattern are required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    if (!schema.citationPatterns) {
      schema.citationPatterns = [];
    }

    const index = schema.citationPatterns.findIndex(p => p.id === patternId);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Citation pattern not found'
      });
    }

    schema.citationPatterns[index] = { ...pattern, id: patternId };
    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Updated citation pattern: ${patternId}`);

    res.json({
      success: true,
      pattern: schema.citationPatterns[index]
    });
  } catch (error: any) {
    console.error('[Patterns API] Error updating citation pattern:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /patterns/citations/:patternId
 * Citation pattern sil
 */
router.delete('/citations/:patternId', async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const { schemaId } = req.query;

    if (!schemaId) {
      return res.status(400).json({
        success: false,
        error: 'schemaId query parameter is required'
      });
    }

    const config = await dataSchemaService.loadConfig();
    const schema = config.schemas.find(s => s.id === schemaId);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    if (!schema.citationPatterns) {
      return res.status(404).json({
        success: false,
        error: 'No citation patterns found'
      });
    }

    const initialLength = schema.citationPatterns.length;
    schema.citationPatterns = schema.citationPatterns.filter(p => p.id !== patternId);

    if (schema.citationPatterns.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Citation pattern not found'
      });
    }

    await dataSchemaService.saveConfig(config);

    console.log(`[Patterns API] ✓ Deleted citation pattern: ${patternId}`);

    res.json({
      success: true,
      deleted: patternId
    });
  } catch (error: any) {
    console.error('[Patterns API] Error deleting citation pattern:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
