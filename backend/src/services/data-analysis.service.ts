/**
 * Data Analysis Service
 * Scraped data'nın yapısını analiz eder, entity detection yapar
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface DataAnalysisResult {
  id: string;
  projectKey: string;
  source: string;
  sampleData: any[];
  detectedEntities: DetectedEntity[];
  fieldTypes: FieldTypeSuggestion[];
  dataQualityScore: number;
  rowCount: number;
  columnCount: number;
  issues: DataIssue[];
  analyzedAt: Date;
  analyzedBy?: string;
}

export interface DetectedEntity {
  name: string;
  confidence: number;
  fields: string[];
  sampleValues: any;
  suggestedPrimaryKey?: string;
  relationships: EntityRelationship[];
}

export interface EntityRelationship {
  targetEntity: string;
  type: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';
  foreignKeyField: string;
  confidence: number;
}

export interface FieldTypeSuggestion {
  fieldName: string;
  detectedType: string;
  suggestedSQLType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  hasIndex: boolean;
  uniqueValues: number;
  nullCount: number;
  sampleValues: string[];
  warnings: string[];
}

export interface DataIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  field?: string;
  row?: number;
  description: string;
  suggestion?: string;
  affectedRows: number;
  canAutoFix: boolean;
}

export class DataAnalysisService {
  private analysisCache: Map<string, DataAnalysisResult> = new Map();

  /**
   * Scraped data'yı analiz et
   */
  async analyzeScrapedData(
    data: any[],
    source: string,
    projectKey: string,
    options: {
      sampleSize?: number;
      detectRelationships?: boolean;
      runQualityChecks?: boolean;
      suggestIndexes?: boolean;
    } = {}
  ): Promise<DataAnalysisResult> {
    const {
      sampleSize = 100,
      detectRelationships = true,
      runQualityChecks = true,
      suggestIndexes = true,
    } = options;

    // Generate analysis ID
    const analysisId = uuidv4();

    // Sample data
    const sampleData = data.slice(0, Math.min(sampleSize, data.length));

    // Get all fields from data
    const allFields = this.extractFields(data);

    // Analyze field types
    const fieldTypes = await this.analyzeFieldTypes(data, allFields, suggestIndexes);

    // Detect entities
    const detectedEntities = await this.detectEntities(
      data,
      fieldTypes,
      detectRelationships
    );

    // Run quality checks
    const issues = runQualityChecks
      ? await this.runDataQualityChecks(data, fieldTypes)
      : [];

    // Calculate quality score
    const dataQualityScore = this.calculateQualityScore(issues, fieldTypes, data.length);

    const result: DataAnalysisResult = {
      id: analysisId,
      projectKey,
      source,
      sampleData,
      detectedEntities,
      fieldTypes,
      dataQualityScore,
      rowCount: data.length,
      columnCount: allFields.length,
      issues,
      analyzedAt: new Date(),
    };

    // Cache result
    this.analysisCache.set(analysisId, result);

    return result;
  }

  /**
   * Get cached analysis
   */
  getAnalysis(analysisId: string): DataAnalysisResult | null {
    return this.analysisCache.get(analysisId) || null;
  }

  /**
   * Extract all unique fields from data
   */
  private extractFields(data: any[]): string[] {
    const fieldsSet = new Set<string>();

    data.forEach((row) => {
      if (typeof row === 'object' && row !== null) {
        Object.keys(row).forEach((key) => fieldsSet.add(key));
      }
    });

    return Array.from(fieldsSet);
  }

  /**
   * Analyze field types and suggest SQL types
   */
  private async analyzeFieldTypes(
    data: any[],
    fields: string[],
    suggestIndexes: boolean
  ): Promise<FieldTypeSuggestion[]> {
    return fields.map((fieldName) => {
      const values = data.map((row) => row[fieldName]).filter((v) => v !== null && v !== undefined);
      const uniqueValues = new Set(values);
      const nullCount = data.length - values.length;

      // Detect type
      const detectedType = this.detectFieldType(values);
      const suggestedSQLType = this.mapToSQLType(detectedType, values);

      // Check if primary key candidate
      const isPrimaryKey = uniqueValues.size === data.length && nullCount === 0;
      const isUnique = uniqueValues.size === values.length;
      const hasIndex = suggestIndexes && (isPrimaryKey || isUnique || uniqueValues.size < data.length * 0.1);

      const warnings: string[] = [];
      if (nullCount > data.length * 0.5) {
        warnings.push(`High null rate: ${((nullCount / data.length) * 100).toFixed(1)}%`);
      }

      return {
        fieldName,
        detectedType,
        suggestedSQLType,
        nullable: nullCount > 0,
        isPrimaryKey,
        isUnique,
        hasIndex,
        uniqueValues: uniqueValues.size,
        nullCount,
        sampleValues: Array.from(uniqueValues).slice(0, 5).map(String),
        warnings,
      };
    });
  }

  /**
   * Check if a string value is a valid date format (not just a number that Date.parse accepts)
   */
  private isValidDateString(value: string): boolean {
    if (!value || typeof value !== 'string') return false;

    const trimmed = value.trim();

    // Reject pure numbers - Date.parse("2008") returns valid timestamp but it's not a date
    if (/^\d+$/.test(trimmed)) return false;

    // Only match actual date formats, not plain numbers
    // Common formats: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, YYYY/MM/DD, ISO dates
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,                    // YYYY-MM-DD
      /^\d{2}\.\d{2}\.\d{4}$/,                  // DD.MM.YYYY (Turkish)
      /^\d{2}\/\d{2}\/\d{4}$/,                  // DD/MM/YYYY or MM/DD/YYYY
      /^\d{4}\/\d{2}\/\d{2}$/,                  // YYYY/MM/DD
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,  // ISO 8601
      /^\d{2}-\d{2}-\d{4}$/,                    // DD-MM-YYYY
    ];

    return datePatterns.some(pattern => pattern.test(trimmed));
  }

  /**
   * Detect field data type
   */
  private detectFieldType(values: any[]): string {
    if (values.length === 0) return 'unknown';

    const sample = values.slice(0, 100);

    // Check if all are numbers (native type)
    if (sample.every((v) => typeof v === 'number')) {
      return sample.every((v) => Number.isInteger(v)) ? 'integer' : 'float';
    }

    // Check if all are booleans
    if (sample.every((v) => typeof v === 'boolean')) {
      return 'boolean';
    }

    // Check if all are strings
    if (sample.every((v) => typeof v === 'string')) {
      // Check if numeric strings (e.g., "1001", "2008")
      // These should be INTEGER, not TIMESTAMP
      if (sample.every((v) => /^\d+$/.test(v.trim()))) {
        return 'integer';
      }

      // Check if float strings (e.g., "3.14", "100.50")
      if (sample.every((v) => /^-?\d+\.?\d*$/.test(v.trim()) && v.includes('.'))) {
        return 'float';
      }

      // Check if date-like strings using strict pattern matching
      // IMPORTANT: Only use pattern matching, not Date.parse which accepts numbers as years
      if (sample.every((v) => this.isValidDateString(v))) {
        return 'date';
      }

      const maxLength = Math.max(...sample.map((v) => v.length));
      if (maxLength < 255) return 'string';
      return 'text';
    }

    // Check if JSON objects
    if (sample.every((v) => typeof v === 'object')) {
      return 'json';
    }

    return 'text';
  }

  /**
   * Map detected type to SQL type
   */
  private mapToSQLType(detectedType: string, values: any[]): string {
    const maxLength = Math.max(...values.map((v) => String(v).length));

    switch (detectedType) {
      case 'integer':
        return maxLength < 10 ? 'INTEGER' : 'BIGINT';
      case 'float':
        return 'DOUBLE PRECISION';
      case 'boolean':
        return 'BOOLEAN';
      case 'date':
        return 'TIMESTAMP';
      case 'string':
        return maxLength < 255 ? `VARCHAR(${Math.max(255, maxLength * 2)})` : 'TEXT';
      case 'text':
        return 'TEXT';
      case 'json':
        return 'JSONB';
      default:
        return 'TEXT';
    }
  }

  /**
   * Detect entities from data structure
   */
  private async detectEntities(
    data: any[],
    fieldTypes: FieldTypeSuggestion[],
    detectRelationships: boolean
  ): Promise<DetectedEntity[]> {
    // Simple entity detection: group related fields
    const primaryKeyField = fieldTypes.find((f) => f.isPrimaryKey);

    // For now, treat the entire dataset as one entity
    const entity: DetectedEntity = {
      name: 'DetectedTable',
      confidence: 0.8,
      fields: fieldTypes.map((f) => f.fieldName),
      sampleValues: data[0] || {},
      suggestedPrimaryKey: primaryKeyField?.fieldName || 'id',
      relationships: [],
    };

    // TODO: Implement more sophisticated entity detection
    // - Look for common naming patterns (user_id, product_id)
    // - Detect foreign key relationships
    // - Group related fields

    return [entity];
  }

  /**
   * Run data quality checks
   */
  private async runDataQualityChecks(
    data: any[],
    fieldTypes: FieldTypeSuggestion[]
  ): Promise<DataIssue[]> {
    const issues: DataIssue[] = [];

    // Check for missing primary key
    const hasPrimaryKey = fieldTypes.some((f) => f.isPrimaryKey);
    if (!hasPrimaryKey) {
      issues.push({
        severity: 'WARNING',
        description: 'No unique identifier field detected',
        suggestion: 'Consider adding an auto-incrementing ID column',
        affectedRows: data.length,
        canAutoFix: true,
      });
    }

    // Check for high null rates
    fieldTypes.forEach((field) => {
      const nullRate = field.nullCount / data.length;
      if (nullRate > 0.8) {
        issues.push({
          severity: 'WARNING',
          field: field.fieldName,
          description: `High null rate: ${(nullRate * 100).toFixed(1)}%`,
          suggestion: 'Consider removing this field or providing default values',
          affectedRows: field.nullCount,
          canAutoFix: false,
        });
      }
    });

    // Check for duplicate rows
    const uniqueRows = new Set(data.map((row) => JSON.stringify(row)));
    const duplicateCount = data.length - uniqueRows.size;
    if (duplicateCount > 0) {
      issues.push({
        severity: 'WARNING',
        description: `${duplicateCount} duplicate rows detected`,
        suggestion: 'Remove duplicate rows before importing',
        affectedRows: duplicateCount,
        canAutoFix: true,
      });
    }

    return issues;
  }

  /**
   * Calculate overall data quality score (0-1)
   */
  private calculateQualityScore(
    issues: DataIssue[],
    fieldTypes: FieldTypeSuggestion[],
    rowCount: number
  ): number {
    let score = 1.0;

    // Penalize for errors
    const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
    score -= errorCount * 0.2;

    // Penalize for warnings
    const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
    score -= warningCount * 0.1;

    // Penalize for high null rates
    const avgNullRate =
      fieldTypes.reduce((sum, f) => sum + f.nullCount, 0) / (fieldTypes.length * rowCount);
    score -= avgNullRate * 0.3;

    // Bonus for having primary key
    const hasPrimaryKey = fieldTypes.some((f) => f.isPrimaryKey);
    if (hasPrimaryKey) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }
}

export default new DataAnalysisService();
