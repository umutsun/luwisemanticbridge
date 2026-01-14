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
    strictModeLevel?: 'strict' | 'medium' | 'relaxed';
    strictModeTemperature?: number;
    citationsDisabled?: boolean;
    disableCitationText?: boolean;

    // Context Limits
    maxContextLength?: number;
    maxExcerptLength?: number;
    summaryMaxLength?: number;
    excerptMaxLength?: number;

    // Source Display Limits
    maxSourcesToShow?: number;  // Maximum number of sources to display in citations
    minSourcesToShow?: number;  // Minimum number of sources to display

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
    quotePrefixPatterns?: string[];
    genericTitlePatterns?: string[];
    sectionHeadingsToStrip?: Record<string, string[]>;
    fieldLabels?: Record<string, string>;
    citationPriorityFields?: string[];
    strictContextTemplate?: any;

    // Source Type Priority (dynamic ordering)
    sourceTypePriority?: string[];
    sourceTypePriorityEnabled?: boolean;

    // Refusal Policy
    refusalPolicy?: {
        clearSourcesOnRefusal?: boolean;
        cleanResponseTextOnRefusal?: boolean;
        patterns?: string[];
    };

    // Fast Mode Prompts
    fastModePromptTr?: string;
    fastModePromptEn?: string;

    // Medium Mode Prompts (for strictModeLevel='medium')
    mediumModePromptTr?: string;
    mediumModePromptEn?: string;

    // High/Low Confidence Thresholds
    highConfidenceThreshold?: number;
    lowConfidenceThreshold?: number;

    // Default System Prompts
    defaultSystemPromptTr?: string;
    defaultSystemPromptEn?: string;

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

// ============================================
// RAG ROUTING SCHEMA - Dynamic Response Formatting
// ============================================

/**
 * Response types for RAG queries
 * Each route has specific behavior and format rules
 */
export type RAGResponseType = 'NEEDS_CLARIFICATION' | 'OUT_OF_SCOPE' | 'NOT_FOUND' | 'FOUND';

/**
 * Trigger conditions for route detection
 */
export interface RouteTriggers {
    // Pattern-based triggers (regex patterns)
    patterns?: string[];
    // Condition-based triggers (logic conditions)
    conditions?: Array<'noResults' | 'hasResults' | 'inScope' | 'outOfScope'>;
}

/**
 * Article section definition for FOUND format
 * systemGenerated: true = Backend generates from sources (LLM doesn't write)
 * systemGenerated: false/undefined = LLM writes this section
 */
export interface ArticleSection {
    id: string;
    title: string;
    titleEn?: string;
    required: boolean;
    systemGenerated?: boolean;  // true = backend generates, false = LLM writes
    footnoteRequired?: boolean;
    description?: string;
    descriptionEn?: string;
}

/**
 * Source type priority definition
 */
export interface SourceTypePriority {
    type: string;
    label: string;
    priority: number;
}

/**
 * Footnote format templates by source type
 */
export interface FootnoteFormats {
    makale: string;
    ozelge: string;
    yargi: string;
    pdf: string;
    kanun: string;
    teblig: string;
    sorucevap: string;
    [key: string]: string;
}

/**
 * Format configuration for each route
 */
export interface RouteFormat {
    type: 'clarification' | 'single_line' | 'article';
    showSources: boolean;
    template: string;
    templateEn?: string;
    maxSuggestions?: number;
    // Article format specific (for FOUND)
    articleSections?: ArticleSection[];
    sourcePriority?: SourceTypePriority[];
    footnoteFormat?: FootnoteFormats;
    conflictHandling?: {
        showConflict: boolean;
        preferNewer: boolean;
        preferHigherNorm: boolean;
    };
    prohibitedContent?: string[];
    // Grounding rules for verdict protection
    groundingRules?: {
        tr?: string;
        en?: string;
    };
    // Response structure template (Wikipedia-style markdown with examples)
    formatTemplate?: string;
    formatTemplateEn?: string;
}

/**
 * Route definition with triggers and format
 */
export interface RouteDefinition {
    triggers: RouteTriggers;
    format: RouteFormat;
}

/**
 * Global settings for routing schema
 */
export interface RoutingGlobalSettings {
    domainMode: 'TAX_ONLY' | 'GENERAL_LAW';
    domainTerms: string[];
    outOfScopePatterns: string[];
    nonTaxLawPatterns: string[];
    ambiguityPatterns: {
        justNumbers: string;
        vagueQuestion: string;
        singleToken: string;
        tooShort: string;
    };
}

/**
 * Complete RAG Routing Schema
 * Stored in settings table as JSON under key 'ragRoutingSchema'
 */
export interface RAGRoutingSchema {
    version: string;
    routes: {
        NEEDS_CLARIFICATION: RouteDefinition;
        OUT_OF_SCOPE: RouteDefinition;
        NOT_FOUND: RouteDefinition;
        FOUND: RouteDefinition;
    };
    globalSettings: RoutingGlobalSettings;
}
