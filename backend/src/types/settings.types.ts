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
    // Core Search
    similarityThreshold?: number;
    minResults?: number;
    maxResults?: number;
    enableHybridSearch?: boolean;
    enableKeywordBoost?: boolean;

    // Embedding Sources
    enableUnifiedEmbeddings?: boolean;
    enableDocumentEmbeddings?: boolean;
    enableScrapeEmbeddings?: boolean;
    enableMessageEmbeddings?: boolean;

    // Source Priorities (0-10)
    databasePriority?: number;
    documentsPriority?: number;
    chatPriority?: number;
    webPriority?: number;

    // Evidence Gate (Quality Control)
    evidenceGateEnabled?: boolean;
    evidenceGateMinScore?: number;
    evidenceGateMinChunks?: number;
    evidenceGateRefusalTr?: string;
    evidenceGateRefusalEn?: string;

    // Retrieval Penalties
    penalties?: {
        temporal_penalty_weight?: number;
        toc_penalty_weight?: number;
        toc_score_threshold?: number;
        toc_min_pattern_count?: number;
    };

    // Response Mode
    strictMode?: boolean;
    citationsDisabled?: boolean;
    disableCitationText?: boolean;

    // Context Limits
    maxContextLength?: number;
    maxExcerptLength?: number;
    summaryMaxLength?: number;
    excerptMaxLength?: number;

    // No Results Messages
    noResultsMessageTr?: string;
    noResultsMessageEn?: string;

    // Instructions
    strictModePromptTr?: string;
    strictModePromptEn?: string;
    citationInstructionTr?: string;
    citationInstructionEn?: string;
    followUpInstructionTr?: string;
    followUpInstructionEn?: string;

    // PDF Settings
    pdfEnableRag?: boolean;
    pdfRagMaxResults?: number;
    pdfMaxLength?: number;

    // Content Processing (JSON patterns)
    sourceTypeNormalizations?: Record<string, string>;
    preferredSourceTypes?: string[];
    tocDetection?: any;
    htmlCleaningPatterns?: string[];

    // Legacy
    aiProvider?: string;
    fallbackEnabled?: boolean;
    chunkSize?: number;
    chunkOverlap?: number;
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
