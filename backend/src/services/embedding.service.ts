/**
 * Embedding Service - Central embedding generation and provider management
 */
import OpenAI from 'openai';
import { lsembPool } from '../config/database.config';

// Embedding settings interface
interface EmbeddingSettings {
  provider: string;
  model: string;
  apiKey?: string;
}

// Default settings
const DEFAULT_SETTINGS: EmbeddingSettings = {
  provider: 'openai',
  model: 'text-embedding-3-small'
};

// Cached settings
let cachedSettings: EmbeddingSettings | null = null;
let lastSettingsRefresh = 0;
const SETTINGS_CACHE_TTL = 60000; // 1 minute

/**
 * Load embedding settings from database
 */
export async function getEmbeddingSettings(): Promise<EmbeddingSettings> {
  const now = Date.now();

  // Return cached settings if still valid
  if (cachedSettings && (now - lastSettingsRefresh) < SETTINGS_CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const result = await lsembPool.query(`
      SELECT key, value FROM settings
      WHERE key LIKE 'embedding.%'
    `);

    const settings: EmbeddingSettings = { ...DEFAULT_SETTINGS };

    for (const row of result.rows) {
      const key = row.key.replace('embedding.', '');
      if (key === 'provider') settings.provider = row.value;
      if (key === 'model') settings.model = row.value;
      if (key === 'apiKey') settings.apiKey = row.value;
    }

    cachedSettings = settings;
    lastSettingsRefresh = now;
    return settings;
  } catch (error) {
    console.error('[EmbeddingService] Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * EmbeddingService class for generating embeddings
 */
export class EmbeddingService {
  private openai: OpenAI | null = null;
  private pool: typeof lsembPool;

  constructor(pool?: typeof lsembPool) {
    this.pool = pool || lsembPool;

    // Initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const settings = await getEmbeddingSettings();

    if (!this.openai) {
      console.warn('[EmbeddingService] OpenAI not initialized, returning empty embedding');
      return [];
    }

    try {
      const response = await this.openai.embeddings.create({
        model: settings.model,
        input: text.substring(0, 8000), // Truncate to avoid token limits
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embedding:', error);
      return [];
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const settings = await getEmbeddingSettings();

    if (!this.openai) {
      console.warn('[EmbeddingService] OpenAI not initialized, returning empty embeddings');
      return texts.map(() => []);
    }

    try {
      // Truncate each text
      const truncatedTexts = texts.map(t => t.substring(0, 8000));

      const response = await this.openai.embeddings.create({
        model: settings.model,
        input: truncatedTexts,
      });

      return response.data.map(d => d.embedding);
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate batch embeddings:', error);
      return texts.map(() => []);
    }
  }
}

/**
 * Get embedding provider instance (singleton pattern)
 */
let providerInstance: EmbeddingService | null = null;

export function getEmbeddingProvider(): EmbeddingService {
  if (!providerInstance) {
    providerInstance = new EmbeddingService();
  }
  return providerInstance;
}

/**
 * Generate embedding helper (convenience function)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  return provider.generateEmbedding(text);
}

export default EmbeddingService;
