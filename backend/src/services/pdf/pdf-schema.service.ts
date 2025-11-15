/**
 * PDF Schema Service
 * Manages reusable schemas for batch PDF processing
 */

import { lsembPool } from '../../config/database.config';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface PDFSchema {
  id?: string;
  name: string;
  description?: string;
  documentType?: string;
  category?: string;
  fieldSelections: string[];
  sqlSchema: {
    tableName: string;
    columns: Array<{
      name: string;
      type: string;
      isPrimary?: boolean;
      nullable?: boolean;
      default?: string;
    }>;
  };
  analyzeConfig?: {
    focusKeywords?: string[];
    extractSections?: string[];
  };
  targetTableName?: string;
  sourceDatabase?: string;
  sampleJson?: any;
  createdAt?: Date;
  updatedAt?: Date;
  usageCount?: number;
  lastUsedAt?: Date;
}

class PDFSchemaService {
  private schemasPath: string;

  constructor() {
    // Store schemas in backend/data/pdf-schemas.json
    this.schemasPath = path.join(__dirname, '../../../data/pdf-schemas.json');
  }

  /**
   * Ensure data directory and schemas file exist
   */
  private async ensureDataDirectory(): Promise<void> {
    const dataDir = path.dirname(this.schemasPath);

    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    try {
      await fs.access(this.schemasPath);
    } catch {
      // Create empty schemas file
      await fs.writeFile(this.schemasPath, JSON.stringify([], null, 2));
    }
  }

  /**
   * Load all schemas from file
   */
  private async loadSchemas(): Promise<PDFSchema[]> {
    await this.ensureDataDirectory();

    try {
      const data = await fs.readFile(this.schemasPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[PDF Schema] Error loading schemas:', error);
      return [];
    }
  }

  /**
   * Save schemas to file
   */
  private async saveSchemas(schemas: PDFSchema[]): Promise<void> {
    await this.ensureDataDirectory();
    await fs.writeFile(this.schemasPath, JSON.stringify(schemas, null, 2));
  }

  /**
   * Get all schemas
   */
  async getAll(): Promise<PDFSchema[]> {
    return await this.loadSchemas();
  }

  /**
   * Get schema by ID
   */
  async getById(id: string): Promise<PDFSchema | null> {
    const schemas = await this.loadSchemas();
    return schemas.find(s => s.id === id) || null;
  }

  /**
   * Get schema by name
   */
  async getByName(name: string): Promise<PDFSchema | null> {
    const schemas = await this.loadSchemas();
    return schemas.find(s => s.name === name) || null;
  }

  /**
   * Create new schema
   */
  async create(schema: Omit<PDFSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<PDFSchema> {
    const schemas = await this.loadSchemas();

    // Check if name already exists
    if (schemas.some(s => s.name === schema.name)) {
      throw new Error(`Schema with name "${schema.name}" already exists`);
    }

    const newSchema: PDFSchema = {
      ...schema,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0
    };

    schemas.push(newSchema);
    await this.saveSchemas(schemas);

    console.log(`[PDF Schema] Created schema: ${newSchema.name} (${newSchema.id})`);

    return newSchema;
  }

  /**
   * Update existing schema
   */
  async update(id: string, updates: Partial<PDFSchema>): Promise<PDFSchema> {
    const schemas = await this.loadSchemas();
    const index = schemas.findIndex(s => s.id === id);

    if (index === -1) {
      throw new Error(`Schema with ID "${id}" not found`);
    }

    // Check if new name conflicts with other schemas
    if (updates.name && updates.name !== schemas[index].name) {
      if (schemas.some(s => s.id !== id && s.name === updates.name)) {
        throw new Error(`Schema with name "${updates.name}" already exists`);
      }
    }

    schemas[index] = {
      ...schemas[index],
      ...updates,
      id, // Keep original ID
      updatedAt: new Date()
    };

    await this.saveSchemas(schemas);

    console.log(`[PDF Schema] Updated schema: ${schemas[index].name} (${id})`);

    return schemas[index];
  }

  /**
   * Delete schema
   */
  async delete(id: string): Promise<void> {
    const schemas = await this.loadSchemas();
    const filtered = schemas.filter(s => s.id !== id);

    if (filtered.length === schemas.length) {
      throw new Error(`Schema with ID "${id}" not found`);
    }

    await this.saveSchemas(filtered);

    console.log(`[PDF Schema] Deleted schema: ${id}`);
  }

  /**
   * Increment usage count
   */
  async incrementUsage(id: string): Promise<void> {
    const schemas = await this.loadSchemas();
    const schema = schemas.find(s => s.id === id);

    if (!schema) {
      throw new Error(`Schema with ID "${id}" not found`);
    }

    schema.usageCount = (schema.usageCount || 0) + 1;
    schema.lastUsedAt = new Date();

    await this.saveSchemas(schemas);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `schema_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get schemas by category
   */
  async getByCategory(category: string): Promise<PDFSchema[]> {
    const schemas = await this.loadSchemas();
    return schemas.filter(s => s.category === category);
  }

  /**
   * Get schemas by document type
   */
  async getByDocumentType(documentType: string): Promise<PDFSchema[]> {
    const schemas = await this.loadSchemas();
    return schemas.filter(s => s.documentType === documentType);
  }

  /**
   * Search schemas
   */
  async search(query: string): Promise<PDFSchema[]> {
    const schemas = await this.loadSchemas();
    const lowerQuery = query.toLowerCase();

    return schemas.filter(s =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.description?.toLowerCase().includes(lowerQuery) ||
      s.documentType?.toLowerCase().includes(lowerQuery) ||
      s.category?.toLowerCase().includes(lowerQuery)
    );
  }
}

export default new PDFSchemaService();
