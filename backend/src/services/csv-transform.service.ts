/**
 * CSV Transform Service
 *
 * Transforms CSV files into source database tables using LLM analysis
 * with domain-specific templates (legal, healthcare, real estate, etc.)
 */

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import axios from 'axios';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import { dataSchemaService } from './data-schema.service';
import { getDatabaseSettings } from '../config/database.config';
import { Pool } from 'pg';
import { normalizeTurkishChars, generateTableName, generateColumnName } from '../utils/text-utils';

export interface CSVTransformOptions {
  filePath: string;
  userId?: string;
  schemaName?: string; // Optional: 'vergi_mevzuati', 'emlak_mevzuati', etc.
  tableName?: string; // Optional: custom table name
  analyzeContent?: boolean; // Whether to use LLM to analyze/transform content
}

export interface CSVTransformResult {
  success: boolean;
  tableName?: string;
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  error?: string;
}

class CSVTransformService {
  private sourcePool: Pool | null = null;

  /**
   * Initialize source database connection
   */
  private async initializeSourcePool(): Promise<Pool> {
    try {
      if (this.sourcePool) {
        await this.sourcePool.end();
        this.sourcePool = null;
      }

      const dbSettingsResult = await getDatabaseSettings();
      if (!dbSettingsResult) {
        throw new Error('Source database not configured');
      }

      const dbConfig = dbSettingsResult.database || dbSettingsResult;
      const sourceDatabaseName = dbConfig.name || dbConfig.database;

      if (!sourceDatabaseName || !dbConfig.user || !dbConfig.password) {
        throw new Error('Source database not configured properly');
      }

      const config = {
        host: dbConfig.host || '91.99.229.96',
        port: dbConfig.port || 5432,
        database: sourceDatabaseName,
        user: dbConfig.user,
        password: dbConfig.password,
        ssl: dbConfig.ssl || false,
        max: 10
      };

      this.sourcePool = new Pool(config);
      console.log(`[CSV Transform] ✓ Connected to source database: ${config.database}`);
      return this.sourcePool;
    } catch (error: any) {
      console.error('[CSV Transform] ✗ Failed to initialize source pool:', error.message);
      throw error;
    }
  }

  /**
   * Strip BOM (Byte Order Mark) from buffer
   * Google Sheets/Excel exports CSV with BOM which breaks Turkish characters
   */
  private stripBOM(buffer: Buffer): Buffer {
    // UTF-8 BOM: EF BB BF
    if (buffer.length >= 3 &&
        buffer[0] === 0xEF &&
        buffer[1] === 0xBB &&
        buffer[2] === 0xBF) {
      return buffer.slice(3);
    }
    // UTF-16 LE BOM: FF FE
    if (buffer.length >= 2 &&
        buffer[0] === 0xFF &&
        buffer[1] === 0xFE) {
      return buffer.slice(2);
    }
    // UTF-16 BE BOM: FE FF
    if (buffer.length >= 2 &&
        buffer[0] === 0xFE &&
        buffer[1] === 0xFF) {
      return buffer.slice(2);
    }
    return buffer;
  }

  /**
   * Decode buffer to UTF-8 with automatic encoding detection
   * Handles Turkish characters properly
   */
  private decodeToUTF8(buffer: Buffer): string {
    const cleanBuffer = this.stripBOM(buffer);

    // Detect encoding
    const detected = jschardet.detect(cleanBuffer);
    const encoding = detected.encoding || 'UTF-8';
    const confidence = detected.confidence || 0;

    console.log(`[CSV Transform] Encoding detected: ${encoding} (confidence: ${(confidence * 100).toFixed(1)}%)`);

    // Map encoding names
    const encodingMap: Record<string, string> = {
      'ascii': 'utf-8',
      'ASCII': 'utf-8',
      'UTF-8': 'utf-8',
      'ISO-8859-1': 'iso-8859-1',
      'ISO-8859-9': 'iso-8859-9',
      'windows-1252': 'win1252',
      'windows-1254': 'win1254',
      'WINDOWS-1252': 'win1252',
      'WINDOWS-1254': 'win1254',
    };

    const normalizedEncoding = encodingMap[encoding] || encoding.toLowerCase();

    // If already UTF-8 with high confidence, just convert
    if ((normalizedEncoding === 'utf-8' || normalizedEncoding === 'ascii') && confidence > 0.8) {
      return cleanBuffer.toString('utf-8');
    }

    // Try detected encoding first
    try {
      if (iconv.encodingExists(normalizedEncoding)) {
        const decoded = iconv.decode(cleanBuffer, normalizedEncoding);
        if (/[üşğıöçÜŞĞİÖÇ]/.test(decoded) && !/[\uFFFD�]/.test(decoded)) {
          console.log(`[CSV Transform] Successfully decoded with ${normalizedEncoding}`);
          return decoded;
        }
      }
    } catch (e) {
      // Continue to fallbacks
    }

    // Try Turkish encodings as fallback
    for (const enc of ['win1254', 'iso-8859-9', 'win1252', 'iso-8859-1']) {
      try {
        if (iconv.encodingExists(enc)) {
          const decoded = iconv.decode(cleanBuffer, enc);
          if (!decoded.includes('�') && !decoded.includes('\uFFFD')) {
            const hasTurkish = /[üşğıöçÜŞĞİÖÇ]/.test(decoded);
            const hasBroken = /Ã¼|Ã¶|Ã§|Ã°|Ä±|Å|Ä/.test(decoded);
            if (hasTurkish && !hasBroken) {
              console.log(`[CSV Transform] Successfully decoded with fallback: ${enc}`);
              return decoded;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Last resort: UTF-8
    console.log('[CSV Transform] Using UTF-8 as last resort');
    return cleanBuffer.toString('utf-8');
  }

  /**
   * Parse CSV file and return rows
   */
  private async parseCSV(filePath: string): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, any>[] = [];

      // Read file with encoding detection
      const fileBuffer = fs.readFileSync(filePath);
      const cleanContent = this.decodeToUTF8(fileBuffer);

      // Write clean UTF-8 content to temp file
      const tempFile = filePath + '.temp';
      fs.writeFileSync(tempFile, cleanContent, 'utf-8');

      fs.createReadStream(tempFile, { encoding: 'utf-8' })
        .pipe(csv())
        .on('data', (row) => {
          // Additional cleanup: trim whitespace from keys and values
          const cleanRow: Record<string, any> = {};
          for (const [key, value] of Object.entries(row)) {
            const cleanKey = key.trim();
            const cleanValue = typeof value === 'string' ? value.trim() : value;
            cleanRow[cleanKey] = cleanValue;
          }
          rows.push(cleanRow);
        })
        .on('end', () => {
          // Clean up temp file
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {
            // Ignore cleanup errors
          }
          resolve(rows);
        })
        .on('error', (error) => {
          // Clean up temp file on error
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {
            // Ignore cleanup errors
          }
          reject(error);
        });
    });
  }

  /**
   * Analyze CSV content using LLM with domain-specific template
   */
  private async analyzeWithLLM(
    rows: Record<string, any>[],
    schemaName: string
  ): Promise<{ transformedRows: Record<string, any>[]; suggestedColumns: string[] }> {
    try {
      // Get the schema template
      const config = await dataSchemaService.loadConfig();
      const schema = config.schemas.find(s => s.name === schemaName);

      if (!schema) {
        console.log(`[CSV Transform] Schema '${schemaName}' not found, using raw data`);
        return {
          transformedRows: rows,
          suggestedColumns: rows.length > 0 ? Object.keys(rows[0]) : []
        };
      }

      console.log(`[CSV Transform] Analyzing with schema: ${schema.displayName}`);

      // Prepare sample data for LLM (first 5 rows)
      const sampleRows = rows.slice(0, Math.min(5, rows.length));
      const sampleCSV = JSON.stringify(sampleRows, null, 2);

      // Build prompt using schema template
      const analyzePrompt = schema.templates.analyze;
      const fieldDescriptions = schema.fields
        .map(f => `- ${f.label} (${f.key}): ${f.extractionHint || f.type}`)
        .join('\n');

      const prompt = `
${analyzePrompt}

Aşağıdaki alanları çıkar:
${fieldDescriptions}

CSV Örnek Verisi:
${sampleCSV}

ÖNEMLI: Yanıtını SADECE JSON formatında ver, başka metin ekleme. Her satır için extracted_fields objesi döndür.
Format:
{
  "columns": ["alan1", "alan2", ...],
  "transformedData": [
    { "alan1": "değer1", "alan2": "değer2", ... }
  ]
}
`;

      // Call LLM (using OpenAI compatible endpoint)
      const response = await axios.post(
        process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: schema.llmGuide || 'Sen bir veri analiz asistanısın.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          }
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      console.log(`[CSV Transform] LLM analysis complete:`, {
        columns: result.columns?.length || 0,
        rows: result.transformedData?.length || 0
      });

      return {
        transformedRows: result.transformedData || rows,
        suggestedColumns: result.columns || Object.keys(rows[0] || {})
      };
    } catch (error: any) {
      console.error('[CSV Transform] LLM analysis failed:', error.message);
      // Fallback to raw data if LLM fails
      return {
        transformedRows: rows,
        suggestedColumns: rows.length > 0 ? Object.keys(rows[0]) : []
      };
    }
  }

  /**
   * Infer PostgreSQL column types from data
   */
  private inferColumnType(key: string, values: any[]): string {
    // Check for special fields
    if (key.toLowerCase().includes('url') || key.toLowerCase().includes('link')) {
      return 'TEXT';
    }
    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('tarih')) {
      return 'TEXT'; // Store as text, can be converted later
    }

    // Sample values to determine type
    const nonNullValues = values.filter(v => v != null && v !== '');
    if (nonNullValues.length === 0) return 'TEXT';

    // Check if numeric
    const numericCount = nonNullValues.filter(v => {
      const num = parseFloat(String(v).replace(',', '.'));
      return !isNaN(num);
    }).length;

    if (numericCount > nonNullValues.length * 0.8) {
      return 'NUMERIC';
    }

    // Check if boolean
    const booleanValues = ['true', 'false', 'yes', 'no', 'evet', 'hayır', '1', '0'];
    const booleanCount = nonNullValues.filter(v =>
      booleanValues.includes(String(v).toLowerCase())
    ).length;

    if (booleanCount > nonNullValues.length * 0.8) {
      return 'BOOLEAN';
    }

    // Default to TEXT for maximum compatibility
    return 'TEXT';
  }

  /**
   * Create source database table
   */
  private async createSourceTable(
    pool: Pool,
    tableName: string,
    columns: Array<{ columnName: string; sqlType: string }>
  ): Promise<void> {
    const columnDefs = columns.map(col => {
      let def = `"${col.columnName}" ${col.sqlType}`;

      // Add UNIQUE constraint for URL field
      if (col.columnName.toLowerCase() === 'url' || col.columnName.toLowerCase().includes('url')) {
        def += ' UNIQUE';
      }

      return def;
    }).join(', ');

    const createQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        ${columnDefs},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log(`[CSV Transform] Creating table: ${tableName}`);
    await pool.query(createQuery);
    console.log(`[CSV Transform] ✓ Table created: ${tableName}`);
  }

  /**
   * Insert transformed data into source database
   */
  private async insertData(
    pool: Pool,
    tableName: string,
    rows: Record<string, any>[]
  ): Promise<{ inserted: number; updated: number; skipped: number }> {
    const client = await pool.connect();
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    try {
      await client.query('BEGIN');

      for (const row of rows) {
        const columns = Object.keys(row).filter(k => row[k] != null);

        if (columns.length === 0) {
          skippedCount++;
          continue;
        }

        const values = columns.map(k => {
          const val = row[k];
          if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
            return JSON.stringify(val);
          }
          return val;
        });

        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const hasUrlColumn = columns.some(c => c.toLowerCase().includes('url'));

        let insertQuery;
        if (hasUrlColumn) {
          const updateColumns = columns.filter(c => !c.toLowerCase().includes('url'));
          const updateSet = updateColumns
            .map(c => `"${c}" = EXCLUDED."${c}"`)
            .join(', ');

          insertQuery = `
            INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (${columns.find(c => c.toLowerCase().includes('url'))}) DO UPDATE SET
              ${updateSet},
              updated_at = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) AS inserted
          `;
        } else {
          insertQuery = `
            INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING
          `;
        }

        const result = await client.query(insertQuery, values);

        if (result.rowCount && result.rowCount > 0) {
          if (hasUrlColumn && result.rows.length > 0) {
            if (result.rows[0].inserted) {
              insertedCount++;
            } else {
              updatedCount++;
            }
          } else {
            insertedCount += result.rowCount;
          }
        } else {
          skippedCount++;
        }
      }

      await client.query('COMMIT');
      console.log(`[CSV Transform] ✓ Insert complete: ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped`);

      return { inserted: insertedCount, updated: updatedCount, skipped: skippedCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Transform CSV file to source database
   */
  async transformCSV(options: CSVTransformOptions): Promise<CSVTransformResult> {
    try {
      console.log(`[CSV Transform] Starting transformation: ${options.filePath}`);

      // Check if file exists
      if (!fs.existsSync(options.filePath)) {
        throw new Error(`CSV file not found: ${options.filePath}`);
      }

      // Parse CSV
      console.log('[CSV Transform] Parsing CSV...');
      let rows = await this.parseCSV(options.filePath);
      console.log(`[CSV Transform] Parsed ${rows.length} rows`);

      if (rows.length === 0) {
        return {
          success: false,
          rowsProcessed: 0,
          rowsInserted: 0,
          rowsUpdated: 0,
          rowsSkipped: 0,
          error: 'CSV file is empty'
        };
      }

      // Analyze with LLM if requested
      let columns = Object.keys(rows[0]);
      if (options.analyzeContent && options.schemaName) {
        console.log('[CSV Transform] Analyzing content with LLM...');
        const analyzed = await this.analyzeWithLLM(rows, options.schemaName);
        rows = analyzed.transformedRows;
        columns = analyzed.suggestedColumns;
      }

      // Generate table name
      const fileName = path.basename(options.filePath, path.extname(options.filePath));
      const tableName = options.tableName || generateTableName(fileName);
      console.log(`[CSV Transform] Table name: ${tableName}`);

      // Infer column types
      const normalizedColumns = columns.map(col => {
        const normalizedName = generateColumnName(col);
        const values = rows.map(r => r[col]);
        const sqlType = this.inferColumnType(normalizedName, values);

        return {
          columnName: normalizedName,
          sqlType
        };
      });

      // Initialize source pool
      const pool = await this.initializeSourcePool();

      // Create table
      await this.createSourceTable(pool, tableName, normalizedColumns);

      // Transform row keys to normalized column names
      const transformedRows = rows.map(row => {
        const newRow: Record<string, any> = {};
        columns.forEach((originalCol, index) => {
          const normalizedCol = normalizedColumns[index].columnName;
          newRow[normalizedCol] = row[originalCol];
        });
        return newRow;
      });

      // Insert data
      const { inserted, updated, skipped } = await this.insertData(pool, tableName, transformedRows);

      console.log(`[CSV Transform] ✓ Transformation complete`);

      return {
        success: true,
        tableName,
        rowsProcessed: rows.length,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsSkipped: skipped
      };
    } catch (error: any) {
      console.error('[CSV Transform] ✗ Transformation failed:', error.message);
      return {
        success: false,
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        error: error.message
      };
    }
  }

  /**
   * Transform all CSV files in a directory
   */
  async transformDirectory(
    dirPath: string,
    options: Omit<CSVTransformOptions, 'filePath'>
  ): Promise<CSVTransformResult[]> {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));
    console.log(`[CSV Transform] Found ${files.length} CSV files in ${dirPath}`);

    const results: CSVTransformResult[] = [];
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const result = await this.transformCSV({
        ...options,
        filePath
      });
      results.push(result);
    }

    return results;
  }
}

export const csvTransformService = new CSVTransformService();
export default csvTransformService;
