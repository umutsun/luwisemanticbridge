import { Pool } from 'pg';
import Redis from 'ioredis';
import OpenAI from 'openai';
import * as ExcelJS from 'exceljs';
const pdf = require('pdf-parse');
const csv = require('csv-parser');
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface DataSource {
  type: 'excel' | 'pdf' | 'csv' | 'web' | 'database' | 'api';
  path?: string;
  url?: string;
  config?: any;
}

interface ProcessingResult {
  success: boolean;
  documents: number;
  chunks: number;
  tokens: number;
  embeddings: number;
  error?: string;
  duration: number;
}

export class RAGAnythingService {
  private pool: Pool;
  private redis: Redis;
  private openai: OpenAI;
  private isProcessing: boolean = false;
  
  constructor(pool: Pool, redis: Redis) {
    this.pool = pool;
    this.redis = redis;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
  }
  
  // Process any data source
  async processDataSource(source: DataSource): Promise<ProcessingResult> {
    const startTime = Date.now();
    const result: ProcessingResult = {
      success: false,
      documents: 0,
      chunks: 0,
      tokens: 0,
      embeddings: 0,
      duration: 0
    };
    
    if (this.isProcessing) {
      result.error = 'Another processing job is already running';
      return result;
    }
    
    this.isProcessing = true;
    
    try {
      let content: string[] = [];
      
      // Extract content based on source type
      switch (source.type) {
        case 'excel':
          content = await this.processExcel(source.path!);
          break;
        case 'pdf':
          content = await this.processPDF(source.path!);
          break;
        case 'csv':
          content = await this.processCSV(source.path!);
          break;
        case 'web':
          content = await this.processWeb(source.url!);
          break;
        case 'database':
          content = await this.processDatabase(source.config);
          break;
        case 'api':
          content = await this.processAPI(source.url!, source.config);
          break;
      }
      
      result.documents = content.length;
      
      // Chunk the content
      const chunks = this.chunkContent(content);
      result.chunks = chunks.length;
      
      // Generate embeddings
      const embeddings = await this.generateEmbeddings(chunks, source.type);
      result.embeddings = embeddings.length;
      result.tokens = embeddings.reduce((sum, e) => sum + (e.tokens || 0), 0);
      
      // Store in database
      await this.storeEmbeddings(embeddings, source);
      
      // Log activity
      await this.logActivity(source, result);
      
      result.success = true;
      result.duration = Date.now() - startTime;
      
      // Cache stats
      await this.redis.set(`raganything:last_process`, JSON.stringify({
        source,
        result,
        timestamp: new Date().toISOString()
      }), 'EX', 3600);
      
    } catch (error: any) {
      console.error('RAGAnything processing error:', error);
      result.error = error.message;
    } finally {
      this.isProcessing = false;
    }
    
    return result;
  }
  
  // Process Excel files
  private async processExcel(filePath: string): Promise<string[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const content: string[] = [];
    
    workbook.eachSheet((sheet) => {
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const rowValues: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          rowValues.push(cell.value ? cell.value.toString() : '');
        });
        const text = rowValues.join(' ').trim();
        if (text) {
          content.push(text);
        }
      });
    });
    
    return content;
  }
  
  // Process PDF files
  private async processPDF(filePath: string): Promise<string[]> {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    
    // Split by pages
    const pages = data.text.split('\n\n');
    return pages.filter((p: any) => p.trim().length > 0);
  }
  
  // Process CSV files
  private async processCSV(filePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const content: string[] = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          const text = Object.values(row).join(' ').trim();
          if (text) content.push(text);
        })
        .on('end', () => resolve(content))
        .on('error', reject);
    });
  }
  
  // Process web pages
  private async processWeb(url: string): Promise<string[]> {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // Remove scripts and styles
    $('script, style').remove();
    
    // Extract text content
    const content: string[] = [];
    
    // Get paragraphs
    $('p').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 50) content.push(text);
    });
    
    // Get headers
    $('h1, h2, h3, h4, h5, h6').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text) content.push(text);
    });
    
    // Get list items
    $('li').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 20) content.push(text);
    });
    
    return content;
  }
  
  // Process database tables
  private async processDatabase(config: any): Promise<string[]> {
    const { table, columns, limit = 1000 } = config;
    const content: string[] = [];
    
    const query = `
      SELECT ${columns.join(', ')} 
      FROM ${table} 
      LIMIT ${limit}
    `;
    
    const result = await this.pool.query(query);
    
    result.rows.forEach(row => {
      const text = Object.values(row).join(' ').trim();
      if (text) content.push(text);
    });
    
    return content;
  }
  
  // Process API endpoints
  private async processAPI(url: string, config: any = {}): Promise<string[]> {
    const { headers = {}, method = 'GET', body = null } = config;
    
    const response = await axios({
      url,
      method,
      headers,
      data: body
    });
    
    const content: string[] = [];
    
    // Process based on response type
    if (Array.isArray(response.data)) {
      response.data.forEach(item => {
        const text = typeof item === 'string' ? item : JSON.stringify(item);
        content.push(text);
      });
    } else if (typeof response.data === 'object') {
      // Extract text from object
      const extractText = (obj: any): void => {
        Object.values(obj).forEach(value => {
          if (typeof value === 'string' && value.length > 20) {
            content.push(value);
          } else if (typeof value === 'object' && value !== null) {
            extractText(value);
          }
        });
      };
      extractText(response.data);
    } else {
      content.push(String(response.data));
    }
    
    return content;
  }
  
  // Chunk content into smaller pieces
  private chunkContent(content: string[], chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    
    for (const text of content) {
      if (text.length <= chunkSize) {
        chunks.push(text);
      } else {
        // Split long text into chunks
        const words = text.split(' ');
        let currentChunk = '';
        
        for (const word of words) {
          if ((currentChunk + ' ' + word).length > chunkSize) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
          }
        }
        
        if (currentChunk) chunks.push(currentChunk.trim());
      }
    }
    
    return chunks;
  }
  
  // Generate embeddings for chunks
  private async generateEmbeddings(chunks: string[], sourceType: string): Promise<any[]> {
    const embeddings = [];
    const batchSize = 10;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      
      try {
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: batch
        });
        
        for (let j = 0; j < batch.length; j++) {
          embeddings.push({
            content: batch[j],
            embedding: response.data[j].embedding,
            tokens: response.usage?.total_tokens || 0,
            sourceType
          });
        }
        
        // Update progress
        const progress = Math.round((i + batch.length) / chunks.length * 100);
        await this.redis.set('raganything:progress', progress, 'EX', 300);
        
      } catch (error) {
        console.error('Error generating embeddings:', error);
      }
    }
    
    return embeddings;
  }
  
  // Store embeddings in database
  private async storeEmbeddings(embeddings: any[], source: DataSource): Promise<void> {
    for (const item of embeddings) {
      await this.pool.query(`
        INSERT INTO unified_embeddings (
          source_type, source_name, source_table, source_id,
          title, content, embedding, metadata, 
          model_used, tokens_used, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        source.type,
        'raganything',
        source.path || source.url || 'api',
        `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        `RAGAnything - ${source.type}`,
        item.content.substring(0, 5000),
        `[${item.embedding.join(',')}]`,
        JSON.stringify({
          source,
          processed_at: new Date().toISOString()
        }),
        'text-embedding-ada-002',
        item.tokens
      ]);
    }
  }
  
  // Log activity
  private async logActivity(source: DataSource, result: ProcessingResult): Promise<void> {
    await this.pool.query(`
      INSERT INTO activity_log (
        operation_type, source_url, title, status,
        details, metrics, error_message, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      'raganything',
      source.url || source.path || 'N/A',
      `RAGAnything - ${source.type}`,
      result.success ? 'success' : 'error',
      JSON.stringify(source),
      JSON.stringify({
        documents: result.documents,
        chunks: result.chunks,
        tokens: result.tokens,
        embeddings: result.embeddings,
        duration: result.duration
      }),
      result.error
    ]);
  }
  
  // Get processing status
  async getStatus(): Promise<any> {
    const lastProcess = await this.redis.get('raganything:last_process');
    const progress = await this.redis.get('raganything:progress');
    
    return {
      isProcessing: this.isProcessing,
      progress: progress ? parseInt(progress) : 0,
      lastProcess: lastProcess ? JSON.parse(lastProcess) : null
    };
  }
  
  // Get supported formats
  getSupportedFormats(): string[] {
    return ['excel', 'pdf', 'csv', 'web', 'database', 'api'];
  }
  
  // Get statistics
  async getStatistics(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_embeddings,
        COUNT(DISTINCT source_name) as sources,
        SUM(tokens_used) as total_tokens,
        AVG(tokens_used) as avg_tokens
      FROM unified_embeddings
      WHERE source_name = 'raganything'
    `);
    
    const byType = await this.pool.query(`
      SELECT 
        metadata->>'source'->>'type' as source_type,
        COUNT(*) as count
      FROM unified_embeddings
      WHERE source_name = 'raganything'
      GROUP BY metadata->>'source'->>'type'
    `);
    
    return {
      ...result.rows[0],
      byType: byType.rows
    };
  }
}

export default RAGAnythingService;
