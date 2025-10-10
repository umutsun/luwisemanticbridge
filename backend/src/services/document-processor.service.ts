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
          content = await this.processCSV(filePath);
          metadata.type = 'csv';
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

      const chunks = this.createChunks(content);
      
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

  private async processCSV(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data: any) => results.push(data))
        .on('end', () => {
          const content = results.map(row => 
            Object.values(row).join('\t')
          ).join('\n');
          resolve(content);
        })
        .on('error', reject);
    });
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

  private createChunks(text: string): string[] {
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

  async createEmbeddings(text: string): Promise<number[]> {
    try {
      const openaiClient = await this.getOpenAIClient();

      if (!openaiClient) {
        console.warn('OpenAI client not available. Skipping embeddings generation.');
        // Return empty array or fallback embedding
        return [];
      }

      const response = await openaiClient.embeddings.create({
        model: "text-embedding-ada-002",
        input: text
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating embeddings:', error);
      // Return empty array instead of throwing error to prevent crashes
      return [];
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

      const chunks = this.createChunks(content);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await this.createEmbeddings(chunk);
        
        const metadata: ChunkMetadata = {
          chunk_index: i,
          total_chunks: chunks.length,
          document_id: documentId,
          document_title: title,
          chunk_size: chunk.length
        };
        
        await pool.query(
          `INSERT INTO document_embeddings (document_id, chunk_text, embedding, metadata)` +
           `VALUES ($1, $2, $3, $4)`,
          [
            documentId,
            chunk,
            `[${embedding.join(',')}]`,
            JSON.stringify(metadata)
          ]
        );
      }
      
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
         `)
         WHERE id = $1`,
        [documentId, chunks.length]
      );
      
      console.log(`Created ${chunks.length} embeddings for document ${documentId}`);
    } catch (error) {
      console.error('Error processing and embedding document:', error);
      throw error;
    }
  }

  async searchSimilarDocuments(query: string, limit: number = 5): Promise<any[]> {
    try {
      const queryEmbedding = await this.createEmbeddings(query);
      
      const result = await pool.query(
        `SELECT ` +
          `de.id,
          de.document_id,
          de.chunk_text,
          de.metadata,
          d.title as document_title,
          1 - (de.embedding <=> $1::vector) as similarity
        FROM document_embeddings de
        JOIN documents d ON de.document_id = d.id
        ORDER BY de.embedding <=> $1::vector
        LIMIT $2`,
        [`[${queryEmbedding.join(',')}]`, limit]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error searching similar documents:', error);
      throw error;
    }
  }

  async deleteDocumentEmbeddings(documentId: number): Promise<void> {
    try {
      await pool.query(
        'DELETE FROM document_embeddings WHERE document_id = $1',
        [documentId]
      );
      
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
    } catch (error) {
      console.error('Error deleting document embeddings:', error);
      throw error;
    }
  }
}

export default new DocumentProcessorService();
