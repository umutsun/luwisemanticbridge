import fs from 'fs';
import path from 'path';
const pdf = require('pdf-parse');
import * as ExcelJS from 'exceljs';
const csv = require('csv-parser');
import mammoth from 'mammoth';
import { Readable } from 'stream';
import OpenAI from 'openai';
import pool from '../config/database';

interface ProcessedDocument {
  title: string;
  content: string;
  chunks: string[];
  metadata: any;
}

interface ChunkMetadata {
  chunk_index: number;
  total_chunks: number;
  document_id: number;
  document_title: string;
  chunk_size: number;
}

export class DocumentProcessorService {
  private openai: OpenAI | null;
  private chunkSize: number = 1000;
  private chunkOverlap: number = 200;

  constructor() {
    // Initialize OpenAI client lazily when needed
    this.openai = null;
  }

  private async getOpenAIClient(): Promise<OpenAI | null> {
    if (this.openai) {
      return this.openai;
    }

    try {
      // Get API key from settings table
      const result = await pool.query(
        'SELECT value FROM settings WHERE key = $1',
        ['openai.apiKey']
      );

      if (result.rows.length > 0 && result.rows[0].value) {
        const apiKey = result.rows[0].value;
        // Check if it's a JSON object with apiKey property
        let key = apiKey;
        try {
          const parsed = JSON.parse(apiKey);
          if (typeof parsed === 'object' && parsed.apiKey) {
            key = parsed.apiKey;
          }
        } catch {
          // Use as-is if not JSON
        }

        this.openai = new OpenAI({ apiKey: key });
        return this.openai;
      }
    } catch (error) {
      console.error('Error fetching OpenAI API key from settings:', error);
    }

    console.warn('OpenAI API key not found in settings. OpenAI features will be disabled.');
    return null;
  }

  async processFile(filePath: string, originalName: string, mimeType: string): Promise<ProcessedDocument> {
    const ext = path.extname(originalName).toLowerCase();
    let content = '';
    let metadata: any = {
      originalName,
      mimeType,
      fileType: ext.replace('.', ''),
      processedAt: new Date()
    };

    try {
      switch (ext) {
        case '.pdf':
          content = await this.processPDF(filePath);
          metadata.type = 'pdf';
          break;
        
        case '.xlsx':
        case '.xls':
          content = await this.processExcel(filePath);
          metadata.type = 'excel';
          break;
        
        case '.csv':
          const csvResult = await this.processCSVWithMetadata(filePath);
          content = csvResult.content;
          metadata = {
            ...metadata,
            type: 'csv',
            csvStats: csvResult.stats,
            columnTypes: csvResult.columnTypes,
            hasNumericData: csvResult.hasNumericData,
            hasCategoricalData: csvResult.hasCategoricalData
          };
          break;
        
        case '.docx':
        case '.doc':
          content = await this.processWord(filePath);
          metadata.type = 'word';
          break;
        
        case '.txt':
        case '.md':
          content = fs.readFileSync(filePath, 'utf-8');
          metadata.type = 'text';
          break;
        
        case '.json':
          const jsonContent = fs.readFileSync(filePath, 'utf-8');
          content = this.formatJSON(jsonContent);
          metadata.type = 'json';
          break;
        
        default:
          content = fs.readFileSync(filePath, 'utf-8');
          metadata.type = 'unknown';
      }

      const chunks = this.createChunks(content, metadata.type);
      
      return {
        title: originalName,
        content,
        chunks,
        metadata: {
          ...metadata,
          contentLength: content.length,
          chunksCount: chunks.length
        }
      };
    } catch (error) {
      console.error(`Error processing file ${originalName}:`, error);
      throw error;
    }
  }

  private async processPDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw new Error('Failed to process PDF file');
    }
  }

  private async processExcel(filePath: string): Promise<string> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      let content = '';
      
      workbook.eachSheet((sheet, sheetId) => {
        content += `\n=== Sheet: ${sheet.name} ===\n`;
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const rowValues: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            rowValues.push(cell.value ? cell.value.toString() : '');
          });
          content += rowValues.join('\t') + '\n';
        });
      });
      
      return content;
    } catch (error) {
      console.error('Error processing Excel:', error);
      throw new Error('Failed to process Excel file');
    }
  }

  private async processCSVWithMetadata(filePath: string): Promise<{content: string, stats: any, columnTypes: any[], hasNumericData: boolean, hasCategoricalData: boolean}> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const headers: string[] = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('headers', (headerList: string[]) => {
          headers.push(...headerList);
        })
        .on('data', (data: any) => {
          results.push(data);
        })
        .on('end', () => {
          // Analyze the CSV structure
          const numericColumns = this.analyzeNumericColumns(headers, results);
          const categoricalColumns = this.analyzeCategoricalColumns(headers, results);

          // Create column type info
          const columnTypes = headers.map(header => {
            const values = results.map(row => row[header]);
            const numericValues = values.filter(v => !isNaN(parseFloat(v)));

            return {
              name: header,
              type: numericValues.length > values.length * 0.7 ? 'numeric' : 'text',
              uniqueValues: [...new Set(values)].length,
              nullCount: values.filter(v => !v || v === '').length
            };
          });

          const stats = {
            totalRows: results.length,
            totalColumns: headers.length,
            numericColumns: numericColumns.length,
            categoricalColumns: categoricalColumns.length,
            columnTypes: columnTypes
          };

          // Create structured content that preserves data relationships
          const structuredContent = this.createStructuredCSVContent(headers, results);

          resolve({
            content: structuredContent,
            stats,
            columnTypes,
            hasNumericData: numericColumns.length > 0,
            hasCategoricalData: categoricalColumns.length > 0
          });
        })
        .on('error', reject);
    });
  }

  private async processCSV(filePath: string): Promise<string> {
    const result = await this.processCSVWithMetadata(filePath);
    return result.content;
  }

  private createStructuredCSVContent(headers: string[], rows: any[]): string {
    const sections: string[] = [];

    // 1. Add overview section
    sections.push(`CSV Dataset Overview:\n- Total Columns: ${headers.length}\n- Total Rows: ${rows.length}\n`);
    sections.push(`Column Headers: ${headers.join(', ')}\n`);

    // 2. Add column statistics (for numeric columns)
    const numericColumns = this.analyzeNumericColumns(headers, rows);
    if (numericColumns.length > 0) {
      sections.push('\nColumn Statistics:');
      numericColumns.forEach(col => {
        sections.push(`- ${col.name}: min=${col.min}, max=${col.max}, avg=${col.avg}`);
      });
    }

    // 3. Create semantic chunks by grouping related data
    sections.push('\nData Records:\n');

    // Group data by meaningful chunks (e.g., 10-20 rows per chunk with context)
    const chunkSize = 15;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const chunkContent = chunk.map((row, index) => {
        const rowNum = i + index + 1;
        const rowData = headers.map(header => `${header}: ${row[header]}`).join(' | ');
        return `Row ${rowNum}: ${rowData}`;
      }).join('\n');

      sections.push(`\n--- Records ${i + 1} to ${Math.min(i + chunkSize, rows.length)} ---`);
      sections.push(chunkContent);
    }

    // 4. Add unique values for categorical columns (if not too many)
    const categoricalColumns = this.analyzeCategoricalColumns(headers, rows);
    if (categoricalColumns.length > 0) {
      sections.push('\nCategorical Data Summary:');
      categoricalColumns.forEach(col => {
        if (col.uniqueCount <= 20) {
          sections.push(`- ${col.name}: ${col.uniqueValues.slice(0, 10).join(', ')}${col.uniqueValues.length > 10 ? '...' : ''}`);
        }
      });
    }

    return sections.join('\n');
  }

  private analyzeNumericColumns(headers: string[], rows: any[]): Array<{name: string, min: number, max: number, avg: number}> {
    const numericColumns: Array<{name: string, min: number, max: number, avg: number}> = [];

    headers.forEach(header => {
      const values = rows
        .map(row => parseFloat(row[header]))
        .filter(val => !isNaN(val));

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;

        numericColumns.push({ name: header, min, max, avg });
      }
    });

    return numericColumns;
  }

  private analyzeCategoricalColumns(headers: string[], rows: any[]): Array<{name: string, uniqueCount: number, uniqueValues: string[]}> {
    const categoricalColumns: Array<{name: string, uniqueCount: number, uniqueValues: string[]}> = [];

    headers.forEach(header => {
      const values = rows.map(row => String(row[header])).filter(val => val && val.trim());
      const uniqueValues = [...new Set(values)];

      if (uniqueValues.length > 1 && uniqueValues.length < values.length * 0.8) {
        categoricalColumns.push({
          name: header,
          uniqueCount: uniqueValues.length,
          uniqueValues: uniqueValues.sort()
        });
      }
    });

    return categoricalColumns;
  }

  private async processWord(filePath: string): Promise<string> {
    try {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('Error processing Word document:', error);
      throw new Error('Failed to process Word document');
    }
  }

  private formatJSON(jsonString: string): string {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  }

  private createChunks(text: string, fileType?: string): string[] {
    // Special chunking for CSV data
    if (text.includes('CSV Dataset Overview:') && text.includes('Data Records:')) {
      return this.createCSVChunks(text);
    }

    // Standard chunking for other file types
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.chunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          chunks.push(sentence.substring(0, this.chunkSize).trim());
          currentChunk = sentence.substring(this.chunkSize);
        }
      } else {
        currentChunk += ' ' + sentence;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private createCSVChunks(text: string): string[] {
    const chunks: string[] = [];

    // Extract overview section as first chunk
    const overviewMatch = text.match(/CSV Dataset Overview:[\s\S]*?(?=\n\n|\nColumn Statistics:)/);
    if (overviewMatch) {
      chunks.push(overviewMatch[0].trim());
    }

    // Extract column statistics as second chunk
    const statsMatch = text.match(/Column Statistics:[\s\S]*?(?=\n\nData Records:)/);
    if (statsMatch) {
      chunks.push(statsMatch[0].trim());
    }

    // Extract categorical summary as final chunk
    const categoricalMatch = text.match(/Categorical Data Summary:[\s\S]*$/);
    if (categoricalMatch) {
      chunks.push(categoricalMatch[0].trim());
    }

    // Extract data record chunks (keep them intact)
    const recordChunks = text.split(/--- Records \d+ to \d+ ---/).filter(chunk =>
      chunk.trim() && !chunk.includes('Overview') && !chunk.includes('Statistics') && !chunk.includes('Categorical')
    );

    recordChunks.forEach(chunk => {
      const cleanChunk = chunk.trim();
      if (cleanChunk && cleanChunk.length > 0) {
        // Add context to each record chunk
        const contextualizedChunk = `CSV Data Records:\n${cleanChunk}`;
        chunks.push(contextualizedChunk);
      }
    });

    return chunks.filter(chunk => chunk.length > 10);
  }

  async createEmbeddings(text: string): Promise<{embedding: number[], tokens: number, model: string}> {
    try {
      const openaiClient = await this.getOpenAIClient();

      if (!openaiClient) {
        console.warn('OpenAI client not available. Skipping embeddings generation.');
        // Return empty array or fallback embedding
        return {embedding: [], tokens: 0, model: 'text-embedding-ada-002'};
      }

      const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
      const response = await openaiClient.embeddings.create({
        model: model,
        input: text
      });

      return {
        embedding: response.data[0].embedding,
        tokens: response.usage.total_tokens,
        model: model
      };
    } catch (error) {
      console.error('Error creating embeddings:', error);
      // Return empty array instead of throwing error to prevent crashes
      return {embedding: [], tokens: 0, model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002'};
    }
  }

  async processAndEmbedDocument(documentId: number, content: string, title: string): Promise<void> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS document_embeddings (
          id SERIAL PRIMARY KEY,
          document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
          chunk_text TEXT NOT NULL,
          embedding vector(1536),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const chunks = this.createChunks(content, metadata.type);
      let totalTokensUsed = 0;
      let modelName = 'text-embedding-ada-002';
      let embeddingDimension = 1536;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const result = await this.createEmbeddings(chunk);

        totalTokensUsed += result.tokens;
        modelName = result.model;
        embeddingDimension = result.embedding.length;

        const metadata: ChunkMetadata = {
          chunk_index: i,
          total_chunks: chunks.length,
          document_id: documentId,
          document_title: title,
          chunk_size: chunk.length,
          model_used: modelName,
          tokens_used: result.tokens
        };

        await pool.query(
          `INSERT INTO document_embeddings (document_id, chunk_text, embedding, metadata, model_name, tokens_used, embedding_dimension)` +
           `VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            documentId,
            chunk,
            `[${result.embedding.join(',')}]`,
            JSON.stringify(metadata),
            modelName,
            result.tokens,
            embeddingDimension
          ]
        );
      }
      
      // Update document metadata with embedding stats
      await pool.query(
        `UPDATE documents ` +
         `SET metadata = jsonb_set(` +
           `COALESCE(metadata, '{}')::jsonb, ` +
           `'{embeddings}', ` +
           `'true'` +
         `),
         metadata = jsonb_set(` +
           `COALESCE(metadata, '{}')::jsonb, ` +
           `'{chunks}', ` +
           `$2::jsonb` +
         `),
         metadata = jsonb_set(` +
           `COALESCE(metadata, '{}')::jsonb, ` +
           `'{embedding_model}', ` +
           `'$3'` +
         `),
         metadata = jsonb_set(` +
           `COALESCE(metadata, '{}')::jsonb, ` +
           `'{total_tokens_used}', ` +
           `$4::jsonb` +
         `)
         WHERE id = $1`,
        [documentId, chunks.length, modelName, totalTokensUsed]
      );

      // Update model usage tracking
      await pool.query(
        `INSERT INTO embedding_model_usage (model_name, total_tokens_used, total_embeddings, avg_tokens_per_embedding)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (model_name)
         DO UPDATE SET
           total_tokens_used = embedding_model_usage.total_tokens_used + EXCLUDED.total_tokens_used,
           total_embeddings = embedding_model_usage.total_embeddings + EXCLUDED.total_embeddings,
           avg_tokens_per_embedding = (embedding_model_usage.total_tokens_used + EXCLUDED.total_tokens_used) / (embedding_model_usage.total_embeddings + EXCLUDED.total_embeddings),
           last_used_at = CURRENT_TIMESTAMP`,
        [modelName, totalTokensUsed, chunks.length, totalTokensUsed / chunks.length]
      );

      console.log(`Created ${chunks.length} embeddings for document ${documentId} using ${modelName} (${totalTokensUsed} tokens)`);
    } catch (error) {
      console.error('Error processing and embedding document:', error);
      throw error;
    }
  }

  async searchSimilarDocuments(query: string, limit: number = 5): Promise<any[]> {
    try {
      const embeddingResult = await this.createEmbeddings(query);

      const result = await pool.query(
        `SELECT ` +
          `de.id,
          de.document_id,
          de.chunk_text,
          de.metadata,
          de.model_name,
          de.tokens_used,
          d.title as document_title,
          1 - (de.embedding <=> $1::vector) as similarity
        FROM document_embeddings de
        JOIN documents d ON de.document_id = d.id
        ORDER BY de.embedding <=> $1::vector
        LIMIT $2`,
        [`[${embeddingResult.embedding.join(',')}]`, limit]
      );

      // Log search token usage
      console.log(`Search query used ${embeddingResult.tokens} tokens with model ${embeddingResult.model}`);

      return result.rows;
    } catch (error) {
      console.error('Error searching similar documents:', error);
      throw error;
    }
  }

  async deleteDocumentEmbeddings(documentId: number): Promise<void> {
    try {
      // Get token usage before deleting
      const tokenResult = await pool.query(
        'SELECT SUM(tokens_used) as total_tokens, model_name FROM document_embeddings WHERE document_id = $1 GROUP BY model_name',
        [documentId]
      );

      // Delete embeddings
      await pool.query(
        'DELETE FROM document_embeddings WHERE document_id = $1',
        [documentId]
      );

      // Update document metadata
      await pool.query(
        `UPDATE documents ` +
         `SET metadata = jsonb_set(` +
           `COALESCE(metadata, '{}')::jsonb, ` +
           `'{embeddings}', ` +
           `'false'` +
         `)
         WHERE id = $1`,
        [documentId]
      );

      // Update model usage tracking (subtract tokens)
      for (const row of tokenResult.rows) {
        await pool.query(
          `UPDATE embedding_model_usage
           SET total_tokens_used = GREATEST(0, total_tokens_used - $1),
               total_embeddings = GREATEST(0, total_embeddings - (SELECT COUNT(*) FROM document_embeddings WHERE model_name = $2)),
               last_used_at = CURRENT_TIMESTAMP
           WHERE model_name = $2`,
          [row.total_tokens, row.model_name]
        );
      }
    } catch (error) {
      console.error('Error deleting document embeddings:', error);
      throw error;
    }
  }
}

export default new DocumentProcessorService();
