/**
 * Data Schema Service
 *
 * Veri şema yönetimi ve template işleme servisi.
 * Kullanıcının tanımladığı veri yapısına göre:
 * - Belge analizi
 * - Citation formatlaması
 * - Takip sorusu üretimi
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
  DEFAULT_SCHEMAS
} from '../types/data-schema.types';

class DataSchemaService {
  private config: DataSchemaConfig | null = null;
  private readonly SETTINGS_KEY = 'dataSchema.config';

  /**
   * Load configuration from database
   */
  async loadConfig(): Promise<DataSchemaConfig> {
    try {
      const result = await pool.query(
        "SELECT value FROM settings WHERE key = $1",
        [this.SETTINGS_KEY]
      );

      if (result.rows.length === 0) {
        // Initialize with defaults
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

  /**
   * Get default configuration with preset schemas
   */
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

  /**
   * Save configuration to database
   */
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

  /**
   * Get all schemas
   */
  async getSchemas(): Promise<DataSchema[]> {
    const config = await this.loadConfig();
    return config.schemas;
  }

  /**
   * Get active schema
   */
  async getActiveSchema(): Promise<DataSchema | null> {
    const config = await this.loadConfig();
    if (!config.activeSchemaId) return null;
    return config.schemas.find(s => s.id === config.activeSchemaId) || null;
  }

  /**
   * Get schema by ID
   */
  async getSchemaById(id: string): Promise<DataSchema | null> {
    const config = await this.loadConfig();
    return config.schemas.find(s => s.id === id) || null;
  }

  /**
   * Get schema by source table
   */
  async getSchemaBySourceTable(sourceTable: string): Promise<DataSchema | null> {
    const config = await this.loadConfig();

    // First try to find schema mapped to this source table
    const mapped = config.schemas.find(s =>
      s.sourceTables?.includes(sourceTable.toUpperCase())
    );
    if (mapped) return mapped;

    // Fallback to active or default schema
    if (config.activeSchemaId) {
      return config.schemas.find(s => s.id === config.activeSchemaId) || null;
    }

    return config.schemas.find(s => s.isDefault) || null;
  }

  /**
   * Create new schema
   */
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

  /**
   * Update existing schema
   */
  async updateSchema(id: string, updates: Partial<DataSchema>): Promise<DataSchema | null> {
    const config = await this.loadConfig();
    const index = config.schemas.findIndex(s => s.id === id);

    if (index === -1) return null;

    config.schemas[index] = {
      ...config.schemas[index],
      ...updates,
      id, // Preserve ID
      updatedAt: new Date()
    };

    await this.saveConfig(config);
    return config.schemas[index];
  }

  /**
   * Delete schema
   */
  async deleteSchema(id: string): Promise<boolean> {
    const config = await this.loadConfig();
    const schema = config.schemas.find(s => s.id === id);

    if (!schema || schema.isDefault) return false;

    config.schemas = config.schemas.filter(s => s.id !== id);

    // Update activeSchemaId if needed
    if (config.activeSchemaId === id) {
      config.activeSchemaId = config.schemas.find(s => s.isDefault)?.id;
    }

    await this.saveConfig(config);
    return true;
  }

  /**
   * Set active schema
   */
  async setActiveSchema(id: string): Promise<boolean> {
    const config = await this.loadConfig();
    const schema = config.schemas.find(s => s.id === id);

    if (!schema) return false;

    config.activeSchemaId = id;
    await this.saveConfig(config);
    return true;
  }

  /**
   * Process template with context
   * Replaces {{key}} with values from context
   */
  processTemplate(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(\w+)(?:\s*\|\s*(\w+):?(\d+))?\}\}/g, (match, key, filter, param) => {
      const value = context[key];
      if (value === undefined || value === null) return '';

      let result = String(value);

      // Apply filters
      if (filter === 'truncate' && param) {
        const maxLength = parseInt(param, 10);
        if (result.length > maxLength) {
          result = result.substring(0, maxLength) + '...';
        }
      }

      return result;
    });
  }

  /**
   * Generate citation from source metadata
   */
  async generateCitation(
    sourceTable: string,
    metadata: Record<string, unknown>
  ): Promise<ProcessedCitation> {
    const schema = await this.getSchemaBySourceTable(sourceTable);

    if (!schema) {
      return {
        text: metadata.title as string || sourceTable,
        fields: []
      };
    }

    // Build context from metadata
    const context: TemplateContext = {};
    const fields: ProcessedCitation['fields'] = [];

    for (const field of schema.fields) {
      const value = metadata[field.key];
      if (value !== undefined && value !== null) {
        context[field.key] = value as string | number | boolean;

        if (field.showInCitation) {
          fields.push({
            key: field.key,
            value: String(value),
            label: field.label
          });
        }
      }
    }

    // Also add source_table to context
    context['source_table'] = sourceTable;

    const text = this.processTemplate(schema.templates.citation, context);

    return { text: text || sourceTable, fields };
  }

  /**
   * Generate follow-up questions from source
   */
  async generateQuestions(
    sourceTable: string,
    metadata: Record<string, unknown>,
    maxQuestions?: number
  ): Promise<ProcessedQuestion[]> {
    const config = await this.loadConfig();
    const schema = await this.getSchemaBySourceTable(sourceTable);

    if (!schema) return [];

    const limit = maxQuestions || config.globalSettings.maxQuestionsToGenerate;

    // Build context from metadata
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
      // Check if template has required fields
      const requiredKeys = template.match(/\{\{(\w+)\}\}/g)?.map(m => m.slice(2, -2)) || [];
      const hasAllFields = requiredKeys.every(key => context[key] !== undefined);

      if (hasAllFields) {
        const text = this.processTemplate(template, context);
        if (text && text !== template) { // Only add if template was processed
          questions.push({
            text,
            basedOn: requiredKeys
          });
        }
      }
    }

    return questions;
  }

  /**
   * Extract tags from metadata based on schema
   */
  async extractTags(
    sourceTable: string,
    metadata: Record<string, unknown>
  ): Promise<string[]> {
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

  /**
   * Get analyze prompt for document processing
   */
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

  /**
   * Get LLM guide for system prompt enhancement
   */
  async getLLMGuide(sourceTable?: string): Promise<string> {
    let schema: DataSchema | null = null;

    if (sourceTable) {
      schema = await this.getSchemaBySourceTable(sourceTable);
    } else {
      schema = await this.getActiveSchema();
    }

    return schema?.llmGuide || '';
  }

  /**
   * Get global settings
   */
  async getGlobalSettings(): Promise<DataSchemaConfig['globalSettings']> {
    const config = await this.loadConfig();
    return config.globalSettings;
  }

  /**
   * Update global settings
   */
  async updateGlobalSettings(settings: Partial<DataSchemaConfig['globalSettings']>): Promise<void> {
    const config = await this.loadConfig();
    config.globalSettings = { ...config.globalSettings, ...settings };
    await this.saveConfig(config);
  }
}

export const dataSchemaService = new DataSchemaService();
export default dataSchemaService;
