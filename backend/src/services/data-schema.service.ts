/**
 * Data Schema Service
 *
 * Multi-tenant veri şema yönetimi ve template işleme servisi.
 * - Industry presets (sistem şablonları)
 * - User schemas (kullanıcı özel şemaları)
 * - Template işleme ve citation üretimi
 */

import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import {
  DataSchema,
  DataSchemaConfig,
  SchemaField,
  TemplateContext,
  ProcessedCitation,
  ProcessedQuestion,
  DEFAULT_SCHEMAS,
  LLMConfig,
  LLMProcessType,
  DEFAULT_LLM_CONFIG
} from '../types/data-schema.types';

// Industry Preset from database
export interface IndustryPreset {
  id: string;
  industry_code: string;
  industry_name: string;
  industry_icon?: string;
  schema_name: string;
  schema_display_name: string;
  schema_description?: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    questions: string[];
  };
  llm_guide?: string;
  llm_config?: LLMConfig;
  tier: 'free' | 'pro' | 'enterprise';
  is_active: boolean;
  sort_order: number;
}

// User Schema from database
export interface UserSchema {
  id: string;
  user_id: string;
  name: string;
  display_name: string;
  description?: string;
  source_type: 'custom' | 'cloned' | 'imported';
  source_preset_id?: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    questions: string[];
  };
  llm_guide?: string;
  llm_config?: LLMConfig;
  is_active: boolean;
  is_default: boolean;
}

// User Schema Settings
export interface UserSchemaSettings {
  user_id: string;
  active_schema_id?: string;
  active_schema_type?: 'preset' | 'custom';
  enable_auto_detect: boolean;
  max_fields_in_citation: number;
  max_questions: number;
  preferred_industry?: string;
}

class DataSchemaService {
  private config: DataSchemaConfig | null = null;
  private readonly SETTINGS_KEY = 'dataSchema.config';

  // ============================================
  // INDUSTRY PRESETS (Read-only system templates)
  // ============================================

  /**
   * Get all industry presets (optionally filtered by industry)
   */
  async getIndustryPresets(industryCode?: string, userTier: string = 'free'): Promise<IndustryPreset[]> {
    try {
      let query = `
        SELECT * FROM industry_presets
        WHERE is_active = true
      `;
      const params: any[] = [];

      if (industryCode) {
        params.push(industryCode);
        query += ` AND industry_code = $${params.length}`;
      }

      // Filter by tier (free users can only see free presets)
      if (userTier === 'free') {
        query += ` AND tier = 'free'`;
      } else if (userTier === 'pro') {
        query += ` AND tier IN ('free', 'pro')`;
      }
      // enterprise users see all

      query += ` ORDER BY sort_order, industry_name`;

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('[DataSchema] Failed to get industry presets:', error);
      return [];
    }
  }

  /**
   * Get unique industries
   */
  async getIndustries(): Promise<{ code: string; name: string; icon: string }[]> {
    try {
      const result = await pool.query(`
        SELECT DISTINCT industry_code, industry_name, industry_icon
        FROM industry_presets
        WHERE is_active = true
        ORDER BY industry_name
      `);
      return result.rows.map(row => ({
        code: row.industry_code,
        name: row.industry_name,
        icon: row.industry_icon || '📄'
      }));
    } catch (error) {
      console.error('[DataSchema] Failed to get industries:', error);
      return [];
    }
  }

  /**
   * Get a specific preset by ID
   */
  async getPresetById(presetId: string): Promise<IndustryPreset | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM industry_presets WHERE id = $1',
        [presetId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('[DataSchema] Failed to get preset:', error);
      return null;
    }
  }

  /**
   * Update an industry preset (admin only - called from route with role check)
   */
  async updateIndustryPreset(presetId: string, updates: Partial<IndustryPreset>): Promise<IndustryPreset | null> {
    try {
      const setClauses: string[] = [];
      const params: any[] = [presetId];

      if (updates.schema_name) {
        params.push(updates.schema_name);
        setClauses.push(`schema_name = $${params.length}`);
      }
      if (updates.schema_display_name) {
        params.push(updates.schema_display_name);
        setClauses.push(`schema_display_name = $${params.length}`);
      }
      if (updates.schema_description !== undefined) {
        params.push(updates.schema_description);
        setClauses.push(`schema_description = $${params.length}`);
      }
      if (updates.fields) {
        params.push(JSON.stringify(updates.fields));
        setClauses.push(`fields = $${params.length}`);
      }
      if (updates.templates) {
        params.push(JSON.stringify(updates.templates));
        setClauses.push(`templates = $${params.length}`);
      }
      if (updates.llm_guide !== undefined) {
        params.push(updates.llm_guide);
        setClauses.push(`llm_guide = $${params.length}`);
      }
      if (updates.llm_config !== undefined) {
        params.push(JSON.stringify(updates.llm_config));
        setClauses.push(`llm_config = $${params.length}`);
      }
      if (updates.tier) {
        params.push(updates.tier);
        setClauses.push(`tier = $${params.length}`);
      }
      if (updates.is_active !== undefined) {
        params.push(updates.is_active);
        setClauses.push(`is_active = $${params.length}`);
      }

      if (setClauses.length === 0) return null;

      const result = await pool.query(
        `UPDATE industry_presets
         SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        params
      );

      console.log(`[DataSchema] Updated industry preset: ${presetId}`);
      return result.rows[0] || null;
    } catch (error) {
      console.error('[DataSchema] Failed to update industry preset:', error);
      return null;
    }
  }

  // ============================================
  // USER SCHEMAS (User's custom schemas)
  // ============================================

  /**
   * Get user's schemas
   */
  async getUserSchemas(userId: string): Promise<UserSchema[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM user_schemas
         WHERE user_id = $1 AND is_active = true
         ORDER BY is_default DESC, display_name`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('[DataSchema] Failed to get user schemas:', error);
      return [];
    }
  }

  /**
   * Clone a preset to user's schemas
   */
  async clonePresetToUser(presetId: string, userId: string, customName?: string): Promise<UserSchema | null> {
    try {
      const preset = await this.getPresetById(presetId);
      if (!preset) return null;

      const name = customName || preset.schema_name;
      const displayName = customName
        ? customName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : preset.schema_display_name;

      const result = await pool.query(
        `INSERT INTO user_schemas (
          user_id, name, display_name, description,
          source_type, source_preset_id,
          fields, templates, llm_guide, is_active, is_default
        ) VALUES ($1, $2, $3, $4, 'cloned', $5, $6, $7, $8, true, false)
        RETURNING *`,
        [
          userId,
          name,
          displayName,
          preset.schema_description,
          presetId,
          JSON.stringify(preset.fields),
          JSON.stringify(preset.templates),
          preset.llm_guide
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[DataSchema] Failed to clone preset:', error);
      return null;
    }
  }

  /**
   * Create a custom schema for user
   */
  async createUserSchema(userId: string, schema: Partial<UserSchema>): Promise<UserSchema | null> {
    try {
      const result = await pool.query(
        `INSERT INTO user_schemas (
          user_id, name, display_name, description,
          source_type, fields, templates, llm_guide, is_active, is_default
        ) VALUES ($1, $2, $3, $4, 'custom', $5, $6, $7, true, false)
        RETURNING *`,
        [
          userId,
          schema.name,
          schema.display_name,
          schema.description || '',
          JSON.stringify(schema.fields || []),
          JSON.stringify(schema.templates || { analyze: '', citation: '', questions: [] }),
          schema.llm_guide || ''
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[DataSchema] Failed to create user schema:', error);
      return null;
    }
  }

  /**
   * Update user's schema
   */
  async updateUserSchema(schemaId: string, userId: string, updates: Partial<UserSchema>): Promise<UserSchema | null> {
    try {
      const setClauses: string[] = [];
      const params: any[] = [schemaId, userId];

      if (updates.name) {
        params.push(updates.name);
        setClauses.push(`name = $${params.length}`);
      }
      if (updates.display_name) {
        params.push(updates.display_name);
        setClauses.push(`display_name = $${params.length}`);
      }
      if (updates.description !== undefined) {
        params.push(updates.description);
        setClauses.push(`description = $${params.length}`);
      }
      if (updates.fields) {
        params.push(JSON.stringify(updates.fields));
        setClauses.push(`fields = $${params.length}`);
      }
      if (updates.templates) {
        params.push(JSON.stringify(updates.templates));
        setClauses.push(`templates = $${params.length}`);
      }
      if (updates.llm_guide !== undefined) {
        params.push(updates.llm_guide);
        setClauses.push(`llm_guide = $${params.length}`);
      }

      if (setClauses.length === 0) return null;

      const result = await pool.query(
        `UPDATE user_schemas
         SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        params
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[DataSchema] Failed to update user schema:', error);
      return null;
    }
  }

  /**
   * Delete user's schema
   */
  async deleteUserSchema(schemaId: string, userId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `DELETE FROM user_schemas WHERE id = $1 AND user_id = $2`,
        [schemaId, userId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('[DataSchema] Failed to delete user schema:', error);
      return false;
    }
  }

  // ============================================
  // USER SETTINGS
  // ============================================

  /**
   * Get or create user schema settings
   */
  async getUserSettings(userId: string): Promise<UserSchemaSettings> {
    try {
      const result = await pool.query(
        'SELECT * FROM user_schema_settings WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create default settings
      const insertResult = await pool.query(
        `INSERT INTO user_schema_settings (user_id, enable_auto_detect, max_fields_in_citation, max_questions)
         VALUES ($1, true, 4, 3)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING *`,
        [userId]
      );

      return insertResult.rows[0] || {
        user_id: userId,
        enable_auto_detect: true,
        max_fields_in_citation: 4,
        max_questions: 3
      };
    } catch (error) {
      console.error('[DataSchema] Failed to get user settings:', error);
      return {
        user_id: userId,
        enable_auto_detect: true,
        max_fields_in_citation: 4,
        max_questions: 3
      };
    }
  }

  /**
   * Update user schema settings
   */
  async updateUserSettings(userId: string, settings: Partial<UserSchemaSettings>): Promise<void> {
    try {
      const setClauses: string[] = [];
      const params: any[] = [userId];

      if (settings.active_schema_id !== undefined) {
        params.push(settings.active_schema_id);
        setClauses.push(`active_schema_id = $${params.length}`);
      }
      if (settings.active_schema_type !== undefined) {
        params.push(settings.active_schema_type);
        setClauses.push(`active_schema_type = $${params.length}`);
      }
      if (settings.enable_auto_detect !== undefined) {
        params.push(settings.enable_auto_detect);
        setClauses.push(`enable_auto_detect = $${params.length}`);
      }
      if (settings.max_fields_in_citation !== undefined) {
        params.push(settings.max_fields_in_citation);
        setClauses.push(`max_fields_in_citation = $${params.length}`);
      }
      if (settings.max_questions !== undefined) {
        params.push(settings.max_questions);
        setClauses.push(`max_questions = $${params.length}`);
      }
      if (settings.preferred_industry !== undefined) {
        params.push(settings.preferred_industry);
        setClauses.push(`preferred_industry = $${params.length}`);
      }

      if (setClauses.length === 0) return;

      await pool.query(
        `INSERT INTO user_schema_settings (user_id, ${setClauses.map(c => c.split(' = ')[0]).join(', ')})
         VALUES ($1, ${params.slice(1).map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT (user_id)
         DO UPDATE SET ${setClauses.join(', ')}, updated_at = NOW()`,
        params
      );
    } catch (error) {
      console.error('[DataSchema] Failed to update user settings:', error);
    }
  }

  /**
   * Set user's active schema
   */
  async setActiveSchema(userId: string, schemaId: string, schemaType: 'preset' | 'custom'): Promise<boolean> {
    try {
      await this.updateUserSettings(userId, {
        active_schema_id: schemaId,
        active_schema_type: schemaType
      });
      return true;
    } catch (error) {
      console.error('[DataSchema] Failed to set active schema:', error);
      return false;
    }
  }

  // ============================================
  // LLM CONFIG METHODS
  // ============================================

  /**
   * Get active schema's LLM configuration for a user
   * Falls back to default config if not found
   */
  async getActiveLLMConfig(userId: string): Promise<LLMConfig> {
    try {
      const activeSchema = await this.getActiveSchemaForUser(userId);

      if (activeSchema?.llmConfig) {
        // Merge with defaults to ensure all fields exist
        return { ...DEFAULT_LLM_CONFIG, ...activeSchema.llmConfig };
      }

      // If no llm_config, try to build from legacy fields
      if (activeSchema) {
        return {
          analyzePrompt: activeSchema.templates?.analyze || DEFAULT_LLM_CONFIG.analyzePrompt,
          citationTemplate: activeSchema.templates?.citation || DEFAULT_LLM_CONFIG.citationTemplate,
          chatbotContext: activeSchema.llmGuide || DEFAULT_LLM_CONFIG.chatbotContext,
          embeddingPrefix: DEFAULT_LLM_CONFIG.embeddingPrefix,
          transformRules: DEFAULT_LLM_CONFIG.transformRules,
          questionGenerator: DEFAULT_LLM_CONFIG.questionGenerator,
          searchContext: DEFAULT_LLM_CONFIG.searchContext
        };
      }

      return DEFAULT_LLM_CONFIG;
    } catch (error) {
      console.error('[DataSchema] Failed to get active LLM config:', error);
      return DEFAULT_LLM_CONFIG;
    }
  }

  /**
   * Get specific prompt/config for a process type
   */
  async getPromptForProcess(
    userId: string,
    process: LLMProcessType
  ): Promise<string> {
    const config = await this.getActiveLLMConfig(userId);

    switch (process) {
      case 'analyze':
        return config.analyzePrompt || DEFAULT_LLM_CONFIG.analyzePrompt!;
      case 'chatbot':
        return config.chatbotContext || DEFAULT_LLM_CONFIG.chatbotContext!;
      case 'embedding':
        return config.embeddingPrefix || DEFAULT_LLM_CONFIG.embeddingPrefix!;
      case 'transform':
        return config.transformRules || DEFAULT_LLM_CONFIG.transformRules!;
      case 'questions':
        return config.questionGenerator || DEFAULT_LLM_CONFIG.questionGenerator!;
      case 'search':
        return config.searchContext || DEFAULT_LLM_CONFIG.searchContext!;
      default:
        return '';
    }
  }

  /**
   * Get schema with LLM config by ID (preset or user schema)
   */
  async getSchemaWithLLMConfig(schemaId: string, userId?: string): Promise<(DataSchema & { llmConfig?: LLMConfig }) | null> {
    try {
      // First try user schemas
      if (userId) {
        const userResult = await pool.query(
          'SELECT * FROM user_schemas WHERE id = $1 AND user_id = $2',
          [schemaId, userId]
        );
        if (userResult.rows[0]) {
          const schema = this.userSchemaToDataSchema(userResult.rows[0]);
          return { ...schema, llmConfig: userResult.rows[0].llm_config };
        }
      }

      // Then try presets
      const presetResult = await pool.query(
        'SELECT * FROM industry_presets WHERE id = $1',
        [schemaId]
      );
      if (presetResult.rows[0]) {
        const schema = this.presetToDataSchema(presetResult.rows[0]);
        return { ...schema, llmConfig: presetResult.rows[0].llm_config };
      }

      return null;
    } catch (error) {
      console.error('[DataSchema] Failed to get schema with LLM config:', error);
      return null;
    }
  }

  /**
   * Update LLM config for a user schema
   */
  async updateLLMConfig(schemaId: string, userId: string, llmConfig: Partial<LLMConfig>): Promise<boolean> {
    try {
      const result = await pool.query(
        `UPDATE user_schemas
         SET llm_config = COALESCE(llm_config, '{}'::jsonb) || $3::jsonb,
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [schemaId, userId, JSON.stringify(llmConfig)]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('[DataSchema] Failed to update LLM config:', error);
      return false;
    }
  }

  /**
   * Build system prompt with schema context for chatbot
   */
  async buildChatbotSystemPrompt(userId: string, basePrompt?: string): Promise<string> {
    const config = await this.getActiveLLMConfig(userId);
    const activeSchema = await this.getActiveSchemaForUser(userId);

    let systemPrompt = basePrompt || '';

    // Add schema context
    if (config.chatbotContext) {
      systemPrompt += `\n\n## Veri Bağlamı\n${config.chatbotContext}`;
    }

    // Add LLM guide if available
    if (activeSchema?.llmGuide) {
      systemPrompt += `\n\n## Veri Kılavuzu\n${activeSchema.llmGuide}`;
    }

    // Add field information
    if (activeSchema?.fields && activeSchema.fields.length > 0) {
      const fieldInfo = activeSchema.fields
        .map(f => `- ${f.label} (${f.key}): ${f.extractionHint || f.type}`)
        .join('\n');
      systemPrompt += `\n\n## Veri Alanları\n${fieldInfo}`;
    }

    return systemPrompt;
  }

  /**
   * Enrich content with embedding prefix based on active schema
   */
  async enrichContentForEmbedding(userId: string, content: string, metadata?: Record<string, unknown>): Promise<string> {
    const config = await this.getActiveLLMConfig(userId);
    const prefix = config.embeddingPrefix || '';

    // Add metadata context if available
    let enrichedContent = prefix;

    if (metadata?.source_table) {
      enrichedContent += `[${metadata.source_table}] `;
    }

    enrichedContent += content;

    return enrichedContent;
  }

  // ============================================
  // UNIFIED SCHEMA ACCESS (for existing code compatibility)
  // ============================================

  /**
   * Get user's active schema (preset or custom)
   */
  async getActiveSchemaForUser(userId: string): Promise<DataSchema | null> {
    try {
      const settings = await this.getUserSettings(userId);

      if (settings.active_schema_id && settings.active_schema_type) {
        if (settings.active_schema_type === 'preset') {
          const preset = await this.getPresetById(settings.active_schema_id);
          if (preset) return this.presetToDataSchema(preset);
        } else {
          const result = await pool.query(
            'SELECT * FROM user_schemas WHERE id = $1 AND user_id = $2',
            [settings.active_schema_id, userId]
          );
          if (result.rows[0]) return this.userSchemaToDataSchema(result.rows[0]);
        }
      }

      // Fallback: get default preset (genel_dokuman)
      const defaultResult = await pool.query(
        `SELECT * FROM industry_presets WHERE schema_name = 'genel_dokuman' AND is_active = true LIMIT 1`
      );
      if (defaultResult.rows[0]) {
        return this.presetToDataSchema(defaultResult.rows[0]);
      }

      return null;
    } catch (error) {
      console.error('[DataSchema] Failed to get active schema:', error);
      return null;
    }
  }

  /**
   * Convert IndustryPreset to DataSchema
   */
  private presetToDataSchema(preset: IndustryPreset): DataSchema {
    return {
      id: preset.id,
      name: preset.schema_name,
      displayName: preset.schema_display_name,
      description: preset.schema_description || '',
      fields: preset.fields,
      templates: preset.templates,
      llmGuide: preset.llm_guide || '',
      llmConfig: preset.llm_config,
      isActive: preset.is_active,
      isDefault: preset.schema_name === 'genel_dokuman',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Convert UserSchema to DataSchema
   */
  private userSchemaToDataSchema(schema: UserSchema): DataSchema {
    return {
      id: schema.id,
      name: schema.name,
      displayName: schema.display_name,
      description: schema.description || '',
      fields: schema.fields,
      templates: schema.templates,
      llmGuide: schema.llm_guide || '',
      llmConfig: schema.llm_config,
      isActive: schema.is_active,
      isDefault: schema.is_default,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  // ============================================
  // LEGACY SUPPORT (existing code compatibility)
  // ============================================

  /**
   * Load configuration from database (legacy - for backward compatibility)
   */
  async loadConfig(): Promise<DataSchemaConfig> {
    try {
      const result = await pool.query(
        "SELECT value FROM settings WHERE key = $1",
        [this.SETTINGS_KEY]
      );

      if (result.rows.length === 0) {
        const defaultConfig = this.getDefaultConfig();
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }

      const value = result.rows[0].value;
      this.config = typeof value === 'string' ? JSON.parse(value) : value;
      return this.config!;
    } catch (error) {
      console.error('[DataSchema] Failed to load config:', error);
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): DataSchemaConfig {
    const schemas: DataSchema[] = DEFAULT_SCHEMAS.map(partial => ({
      id: uuidv4(),
      name: partial.name!,
      displayName: partial.displayName!,
      description: partial.description!,
      fields: partial.fields!,
      templates: partial.templates!,
      llmGuide: partial.llmGuide!,
      isActive: true,
      isDefault: partial.name === 'genel_dokuman',
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    return {
      schemas,
      activeSchemaId: schemas.find(s => s.isDefault)?.id,
      globalSettings: {
        enableAutoDetect: true,
        fallbackSchemaId: schemas.find(s => s.isDefault)?.id,
        maxFieldsInCitation: 4,
        maxQuestionsToGenerate: 3
      }
    };
  }

  async saveConfig(config: DataSchemaConfig): Promise<void> {
    await pool.query(
      `INSERT INTO settings (key, value, category)
       VALUES ($1, $2, 'dataSchema')
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [this.SETTINGS_KEY, JSON.stringify(config)]
    );
    this.config = config;
  }

  async getSchemas(): Promise<DataSchema[]> {
    const config = await this.loadConfig();
    return config.schemas;
  }

  async getActiveSchema(): Promise<DataSchema | null> {
    const config = await this.loadConfig();
    if (!config.activeSchemaId) return null;
    return config.schemas.find(s => s.id === config.activeSchemaId) || null;
  }

  async getSchemaById(id: string): Promise<DataSchema | null> {
    const config = await this.loadConfig();
    return config.schemas.find(s => s.id === id) || null;
  }

  async getSchemaBySourceTable(sourceTable: string): Promise<DataSchema | null> {
    const config = await this.loadConfig();
    const mapped = config.schemas.find(s =>
      s.sourceTables?.includes(sourceTable.toUpperCase())
    );
    if (mapped) return mapped;
    if (config.activeSchemaId) {
      return config.schemas.find(s => s.id === config.activeSchemaId) || null;
    }
    return config.schemas.find(s => s.isDefault) || null;
  }

  async createSchema(schema: Omit<DataSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<DataSchema> {
    const config = await this.loadConfig();
    const newSchema: DataSchema = {
      ...schema,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    config.schemas.push(newSchema);
    await this.saveConfig(config);
    return newSchema;
  }

  async updateSchema(id: string, updates: Partial<DataSchema>): Promise<DataSchema | null> {
    const config = await this.loadConfig();
    const index = config.schemas.findIndex(s => s.id === id);
    if (index === -1) return null;
    config.schemas[index] = { ...config.schemas[index], ...updates, id, updatedAt: new Date() };
    await this.saveConfig(config);
    return config.schemas[index];
  }

  async deleteSchema(id: string): Promise<boolean> {
    const config = await this.loadConfig();
    const schema = config.schemas.find(s => s.id === id);
    if (!schema || schema.isDefault) return false;
    config.schemas = config.schemas.filter(s => s.id !== id);
    if (config.activeSchemaId === id) {
      config.activeSchemaId = config.schemas.find(s => s.isDefault)?.id;
    }
    await this.saveConfig(config);
    return true;
  }

  async setActiveSchemaLegacy(id: string): Promise<boolean> {
    const config = await this.loadConfig();
    const schema = config.schemas.find(s => s.id === id);
    if (!schema) return false;
    config.activeSchemaId = id;
    await this.saveConfig(config);
    return true;
  }

  // ============================================
  // TEMPLATE PROCESSING
  // ============================================

  processTemplate(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(\w+)(?:\s*\|\s*(\w+):?(\d+))?\}\}/g, (match, key, filter, param) => {
      const value = context[key];
      if (value === undefined || value === null) return '';
      let result = String(value);
      if (filter === 'truncate' && param) {
        const maxLength = parseInt(param, 10);
        if (result.length > maxLength) {
          result = result.substring(0, maxLength) + '...';
        }
      }
      return result;
    });
  }

  async generateCitation(sourceTable: string, metadata: Record<string, unknown>): Promise<ProcessedCitation> {
    const schema = await this.getSchemaBySourceTable(sourceTable);
    if (!schema) {
      return { text: metadata.title as string || sourceTable, fields: [] };
    }
    const context: TemplateContext = {};
    const fields: ProcessedCitation['fields'] = [];
    for (const field of schema.fields) {
      const value = metadata[field.key];
      if (value !== undefined && value !== null) {
        context[field.key] = value as string | number | boolean;
        if (field.showInCitation) {
          fields.push({ key: field.key, value: String(value), label: field.label });
        }
      }
    }
    context['source_table'] = sourceTable;
    const text = this.processTemplate(schema.templates.citation, context);
    return { text: text || sourceTable, fields };
  }

  async generateQuestions(sourceTable: string, metadata: Record<string, unknown>, maxQuestions?: number): Promise<ProcessedQuestion[]> {
    const config = await this.loadConfig();
    const schema = await this.getSchemaBySourceTable(sourceTable);
    if (!schema) return [];
    const limit = maxQuestions || config.globalSettings.maxQuestionsToGenerate;
    const context: TemplateContext = {};
    for (const field of schema.fields) {
      const value = metadata[field.key];
      if (value !== undefined && value !== null) {
        context[field.key] = value as string | number | boolean;
      }
    }
    context['source_table'] = sourceTable;
    const questions: ProcessedQuestion[] = [];
    for (const template of schema.templates.questions.slice(0, limit)) {
      const requiredKeys = template.match(/\{\{(\w+)\}\}/g)?.map(m => m.slice(2, -2)) || [];
      const hasAllFields = requiredKeys.every(key => context[key] !== undefined);
      if (hasAllFields) {
        const text = this.processTemplate(template, context);
        if (text && text !== template) {
          questions.push({ text, basedOn: requiredKeys });
        }
      }
    }
    return questions;
  }

  async extractTags(sourceTable: string, metadata: Record<string, unknown>): Promise<string[]> {
    const schema = await this.getSchemaBySourceTable(sourceTable);
    if (!schema) return [];
    const tags: string[] = [];
    for (const field of schema.fields) {
      if (field.showInTags) {
        const value = metadata[field.key];
        if (value !== undefined && value !== null && value !== '') {
          tags.push(String(value));
        }
      }
    }
    return tags;
  }

  async getAnalyzePrompt(sourceTable?: string): Promise<string> {
    let schema: DataSchema | null = null;
    if (sourceTable) {
      schema = await this.getSchemaBySourceTable(sourceTable);
    } else {
      schema = await this.getActiveSchema();
    }
    if (!schema) {
      return 'Belgeyi analiz et ve önemli bilgileri çıkar.';
    }
    return schema.templates.analyze;
  }

  async getLLMGuide(sourceTable?: string): Promise<string> {
    let schema: DataSchema | null = null;
    if (sourceTable) {
      schema = await this.getSchemaBySourceTable(sourceTable);
    } else {
      schema = await this.getActiveSchema();
    }
    return schema?.llmGuide || '';
  }

  async getGlobalSettings(): Promise<DataSchemaConfig['globalSettings']> {
    const config = await this.loadConfig();
    return config.globalSettings;
  }

  async updateGlobalSettings(settings: Partial<DataSchemaConfig['globalSettings']>): Promise<void> {
    const config = await this.loadConfig();
    config.globalSettings = { ...config.globalSettings, ...settings };
    await this.saveConfig(config);
  }
}

export const dataSchemaService = new DataSchemaService();
export default dataSchemaService;
