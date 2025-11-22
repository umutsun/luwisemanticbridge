/**
 * Settings Type Definitions
 * Centralized type definitions for application settings
 */

export interface LLMProviderConfig {
    apiKey?: string;
    model?: string;
    embeddingModel?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    status?: 'active' | 'inactive';
    verifiedDate?: string;
    avgResponseTime?: number;
}

export interface LLMSettings {
    activeChatModel?: string;
    activeEmbeddingModel?: string;
    embeddingProvider?: string;
    embeddingModel?: string;
    temperature?: number;
    maxTokens?: number;
    fallback_enabled?: boolean;
    fallback_provider?: string;
}

export interface DatabaseConfig {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl?: boolean;
    maxConnections?: number;
}

export interface RedisConfig {
    host: string;
    port: number;
    db: number;
    password?: string;
}

export interface RAGSettings {
    aiProvider?: string;
    fallbackEnabled?: boolean;
    chunkSize?: number;
    chunkOverlap?: number;
    similarityThreshold?: number;
    maxResults?: number;
}

export interface AppSettings {
    name: string;
    version: string;
    locale: string;
    description?: string;
}

export interface OCRSettings {
    activeProvider: string;
    fallbackEnabled: boolean;
    fallbackProvider: string;
    cacheEnabled: boolean;
    cacheTTL: number;
    providers: {
        openai: { apiKey: string };
        gemini: { apiKey: string };
        replicate: { apiKey: string };
    };
}

export interface Settings {
    // LLM Providers
    openai?: LLMProviderConfig;
    anthropic?: LLMProviderConfig;
    google?: LLMProviderConfig;
    deepseek?: LLMProviderConfig;
    huggingface?: LLMProviderConfig;
    openrouter?: LLMProviderConfig;

    // Core Settings
    llmSettings?: LLMSettings;
    ragSettings?: RAGSettings;
    database?: DatabaseConfig;
    redis?: RedisConfig;
    app?: AppSettings;

    // Additional Settings
    apiStatus?: Record<string, {
        status: string;
        message: string;
        lastChecked: string | null;
        verifiedDate: string | null;
        responseTime?: number;
    }>;

    // Prompts
    prompts?: Record<string, string>;

    // OCR
    ocr?: OCRSettings;
}

export interface SettingRecord {
    key: string;
    value: string;
    category?: string;
    description?: string;
    created_at?: Date;
    updated_at?: Date;
}
