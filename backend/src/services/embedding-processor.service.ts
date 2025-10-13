import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { lsembPool } from '../config/database.config';

export interface EmbeddingOptions {
  model?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  batchSize?: number;
  useLocalEmbeddings?: boolean;
}

export interface ProcessedEmbeddings {
  chunks: Array<{
    text: string;
    embedding: number[];
    metadata: any;
  }>;
  totalChunks: number;
  totalTokens: number;
  model: string;
  processingTimeMs: number;
}

export class EmbeddingProcessorService {
  private openai: OpenAI | null = null;
  private defaultModel: string = 'text-embedding-3-small';
  private defaultChunkSize: number = 1000;
  private defaultChunkOverlap: number = 200;
  private defaultBatchSize: number = 100;
  
  constructor() {
    // OpenAI'yi yalnızca API anahtarı varsa başlat
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }
  
  async processEmbeddings(
    content: string, 
    options: EmbeddingOptions = {}
  ): Promise<ProcessedEmbeddings> {
    const startTime = Date.now();
    
    const {
      model = this.defaultModel,
      chunkSize = this.defaultChunkSize,
      chunkOverlap = this.defaultChunkOverlap,
      batchSize = this.defaultBatchSize,
      useLocalEmbeddings = !this.openai
    } = options;
    
    try {
      // Metni chunk'lara ayır
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n\n', '\n\n', '\n', '. ', ', ', ' ', '']
      });
      
      const chunks = await splitter.splitText(content);
      
      // Embedding'leri oluştur
      const embeddings: Array<{
        text: string;
        embedding: number[];
        metadata: any;
      }> = [];
      
      let totalTokens = 0;
      
      if (useLocalEmbeddings || !this.openai) {
        // Yerel embedding kullan
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = this.generateLocalEmbedding(chunk);
          
          embeddings.push({
            text: chunk,
            embedding,
            metadata: {
              chunkIndex: i,
              totalChunks: chunks.length,
              model: 'local-hash-v2',
              chunkLength: chunk.length
            }
          });
          
          totalTokens += Math.ceil(chunk.length / 4); // Yaklaşık token sayısı
        }
      } else {
        // OpenAI embedding kullan
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          
          try {
            const response = await this.openai!.embeddings.create({
              model,
              input: batch
            });
            
            response.data.forEach((item, index) => {
              const chunkIndex = i + index;
              const chunk = batch[index];
              
              embeddings.push({
                text: chunk,
                embedding: item.embedding,
                metadata: {
                  chunkIndex,
                  totalChunks: chunks.length,
                  model,
                  chunkLength: chunk.length,
                  usage: response.usage
                }
              });
            });
            
            if (response.usage) {
              totalTokens += response.usage.total_tokens;
            }
          } catch (error) {
            console.error(`Error processing batch ${i}-${i + batchSize}:`, error);
            
            // Hata durumunda yerel embedding'e geri dön
            for (let j = 0; j < batch.length; j++) {
              const chunk = batch[j];
              const chunkIndex = i + j;
              const embedding = this.generateLocalEmbedding(chunk);
              
              embeddings.push({
                text: chunk,
                embedding,
                metadata: {
                  chunkIndex,
                  totalChunks: chunks.length,
                  model: 'local-hash-fallback',
                  chunkLength: chunk.length,
                  error: 'OpenAI API error'
                }
              });
              
              totalTokens += Math.ceil(chunk.length / 4);
            }
          }
        }
      }
      
      return {
        chunks: embeddings,
        totalChunks: chunks.length,
        totalTokens,
        model: useLocalEmbeddings ? 'local-hash-v2' : model,
        processingTimeMs: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('Error processing embeddings:', error);
      throw error;
    }
  }
  
  async saveEmbeddingsToDatabase(
    documentId: number,
    embeddings: ProcessedEmbeddings,
    metadata: any = {}
  ): Promise<void> {
    try {
      // Her chunk için veritabanına kaydet
      for (const chunk of embeddings.chunks) {
        await lsembPool.query(`
          INSERT INTO document_embeddings (
            document_id, 
            chunk_text, 
            embedding,
            metadata
          )
          VALUES ($1, $2, $3::vector, $4)
          ON CONFLICT (document_id, chunk_index) 
          DO UPDATE SET 
            chunk_text = EXCLUDED.chunk_text,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            updated_at = CURRENT_TIMESTAMP
        `, [
          documentId,
          chunk.text,
          `[${chunk.embedding.join(',')}]`, // Vector formatına dönüştür
          JSON.stringify({
            ...chunk.metadata,
            ...metadata,
            processingTimeMs: embeddings.processingTimeMs,
            totalChunks: embeddings.totalChunks,
            totalTokens: embeddings.totalTokens,
            model: embeddings.model
          })
        ]);
      }
      
      // Document tablosunu güncelle
      await lsembPool.query(`
        UPDATE scraped_data 
        SET 
          chunk_count = $1,
          token_count = $2,
          embedding_model = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [
        embeddings.totalChunks,
        embeddings.totalTokens,
        embeddings.model,
        documentId
      ]);
      
    } catch (error) {
      console.error('Error saving embeddings to database:', error);
      throw error;
    }
  }
  
  async generateAndSaveEmbeddings(
    documentId: number,
    content: string,
    options: EmbeddingOptions = {},
    metadata: any = {}
  ): Promise<ProcessedEmbeddings> {
    try {
      // Embedding'leri oluştur
      const embeddings = await this.processEmbeddings(content, options);
      
      // Veritabanına kaydet
      await this.saveEmbeddingsToDatabase(documentId, embeddings, metadata);
      
      return embeddings;
      
    } catch (error) {
      console.error('Error generating and saving embeddings:', error);
      throw error;
    }
  }
  
  // Yerel embedding oluştur (mevcut sistemden alınabilir)
  private generateLocalEmbedding(text: string): number[] {
    // Bu, mevcut scraper'daki generateLocalEmbedding fonksiyonuyla aynı olabilir
    const embedding = new Array(1536).fill(0);
    
    // Metni işlemek için basit bir hash tabanlı yaklaşım
    for (let i = 0; i < Math.min(text.length, 2000); i++) {
      const charCode = text.charCodeAt(i);
      
      // Çoklu hash fonksiyonları kullan
      const hashFunctions = [
        (char: number, idx: number) => Math.sin(char * 0.01 + idx * 0.001),
        (char: number, idx: number) => Math.cos(char * 0.02 + idx * 0.002),
        (char: number, idx: number) => Math.sin(char * 0.03) * Math.cos(idx * 0.003),
        (char: number, idx: number) => (char * idx) % 1
      ];
      
      hashFunctions.forEach((hashFn, fnIdx) => {
        const value = hashFn(charCode, i);
        const index = Math.abs(Math.floor((charCode * (i + 1) * (fnIdx + 1)) % embedding.length));
        embedding[index] += value;
      });
    }
    
    // Doğrusal olmayan dönüşüm uygula
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = Math.tanh(embedding[i] / 10);
    }
    
    // Birim vektöre normalize et
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / magnitude;
      }
    }
    
    return embedding;
  }
  
  // Kategoriye özel embedding seçenekleri
  getEmbeddingOptionsForCategory(category: string): EmbeddingOptions {
    const categoryOptions: Record<string, EmbeddingOptions> = {
      'legal': {
        chunkSize: 1500,
        chunkOverlap: 300,
        model: 'text-embedding-3-large',
        useLocalEmbeddings: false
      },
      'technical': {
        chunkSize: 1000,
        chunkOverlap: 200,
        model: 'text-embedding-3-small',
        useLocalEmbeddings: false
      },
      'news': {
        chunkSize: 1200,
        chunkOverlap: 250,
        model: 'text-embedding-3-small',
        useLocalEmbeddings: false
      },
      'general': {
        chunkSize: 1000,
        chunkOverlap: 200,
        model: 'text-embedding-3-small',
        useLocalEmbeddings: true
      }
    };
    
    return categoryOptions[category] || categoryOptions['general'];
  }
  
  // Belirli bir doküman için embedding'leri getir
  async getDocumentEmbeddings(documentId: number): Promise<any[]> {
    try {
      const result = await lsembPool.query(`
        SELECT 
          id,
          chunk_text,
          embedding,
          metadata,
          created_at
        FROM document_embeddings
        WHERE document_id = $1
        ORDER BY (metadata->>'chunkIndex')::int
      `, [documentId]);
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching document embeddings:', error);
      throw error;
    }
  }
  
  // Benzer embedding'leri ara
  async searchSimilarEmbeddings(
    queryEmbedding: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<any[]> {
    try {
      const result = await lsembPool.query(`
        SELECT 
          de.id,
          de.document_id,
          de.chunk_text,
          de.metadata,
          sd.title,
          sd.url,
          1 - (de.embedding <=> $1::vector) as similarity
        FROM document_embeddings de
        JOIN scraped_data sd ON de.document_id = sd.id
        WHERE 1 - (de.embedding <=> $1::vector) > $2
        ORDER BY similarity DESC
        LIMIT $3
      `, [
        `[${queryEmbedding.join(',')}]`,
        threshold,
        limit
      ]);
      
      return result.rows;
    } catch (error) {
      console.error('Error searching similar embeddings:', error);
      throw error;
    }
  }
}

export default new EmbeddingProcessorService();