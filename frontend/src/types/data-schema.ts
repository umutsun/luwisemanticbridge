/**
 * Data Schema Types (Frontend)
 * Veri şema yönetimi için tip tanımlamaları
 */

// Alan tipleri
export type FieldType =
  | 'string'
  | 'number'
  | 'date'
  | 'currency'
  | 'percentage'
  | 'reference'
  | 'category'
  | 'entity'
  | 'boolean';

// Tek bir alan tanımı
export interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  format?: string;
  required?: boolean;
  extractionHint?: string;
  displayOrder?: number;
  showInCitation?: boolean;
  showInTags?: boolean;
}

/**
 * Law Code Configuration for article anchoring
 * Used by semantic search to match law article queries (e.g., "VUK 114", "GVK 40")
 * Multi-tenant: Each schema can have its own law code mappings
 */
export interface LawCodeConfig {
  /** Map of law code → aliases (e.g., "VUK" → ["Vergi Usul Kanunu", ...]) */
  lawCodes?: Record<string, string[]>;
  /** Map of law number → code (e.g., "213" → "VUK") */
  lawNumberToCode?: Record<string, string>;
  /** Map of full law name → code (handles malformed names) */
  lawNameToCode?: Record<string, string>;
  /** Patterns for matching law codes in malformed text */
  lawCodePatterns?: Array<{ pattern: string; code: string }>;
  /** v12.48: Rate article configuration for tax rate questions */
  rateArticles?: Record<string, RateArticleConfig>;
}

/**
 * v12.48: Rate Article Configuration
 * Defines which article contains rate/percentage information for a given law
 */
export interface RateArticleConfig {
  /** Article number that defines the rate (e.g., "32" for KVK) */
  articleNumber: string;
  /** Keywords that indicate a rate question (e.g., ["oran", "yüzde", "%"]) */
  keywords: string[];
  /** Boost score to add when rate question detected (0.0-0.5, default 0.2) */
  boostScore?: number;
  /** Additional article numbers for rate-related content */
  relatedArticles?: string[];
}

/**
 * Sanitizer Pattern for claim filtering
 * Used by RAG post-processor to identify ungrounded claims
 */
export interface SanitizerPattern {
  /** Unique identifier */
  id: string;
  /** Pattern category */
  category: 'normative' | 'procedural' | 'consequence' | 'duration' | 'modal' | 'custom';
  /** Regex pattern as string */
  pattern: string;
  /** Human-readable description */
  description: string;
  /** Whether pattern is active */
  enabled: boolean;
}

/**
 * Critical Claim Configuration for citation verification
 * Defines what types of claims require strict source matching
 */
export interface CriticalClaimConfig {
  /** Enable/disable temporal claim verification (10 yıl, 5 gün) */
  verifyTemporalClaims: boolean;
  /** Enable/disable date ordinal verification (26'sı, 15'i) */
  verifyDateClaims: boolean;
  /** Enable/disable percentage verification (%18, yüzde 20) */
  verifyPercentageClaims: boolean;
  /** Enable/disable article reference verification (VUK 227, KDVK 29) */
  verifyArticleClaims: boolean;
  /** Threshold for generic claim verification (0.0-1.0, default 0.7) */
  genericClaimThreshold: number;
}

/**
 * Sanitizer Configuration for schema-driven claim filtering
 * Controls which patterns trigger grounding checks and removal
 */
export interface SanitizerConfig {
  /** Whether sanitizer is enabled */
  enabled: boolean;
  /** Language code (ISO 639-1): 'tr', 'en', etc. Default: 'tr' */
  language?: string;
  /** Whether to use language pack for patterns */
  useLanguagePack?: boolean;
  /** Forbidden patterns - sentences matching are checked for grounding */
  forbiddenPatterns: SanitizerPattern[];
  /** Keywords to extract for source validation */
  groundingKeywords: string[];
  /** Minimum grounded keywords to keep sentence (default: 2) */
  minGroundedKeywords: number;
  /** Log removed sentences for debugging */
  logRemovals: boolean;
  /** Temporal units for claim extraction (e.g., yıl, ay, gün, hafta) */
  temporalUnits?: string[];
  /** Critical claim configuration - controls strict citation verification */
  criticalClaimConfig?: CriticalClaimConfig;
}

// LLM Configuration
export interface LLMConfig {
  analyzePrompt?: string;
  citationTemplate?: string;
  chatbotContext?: string;
  embeddingPrefix?: string;
  transformRules?: string;
  questionGenerator?: string;
  searchContext?: string;
  /** Law code configuration for article anchoring */
  lawCodeConfig?: LawCodeConfig;
  /** Sanitizer configuration for filtering ungrounded claims */
  sanitizerConfig?: SanitizerConfig;
}

// Ana Data Schema yapısı
export interface DataSchema {
  id: string;
  name: string;
  displayName: string;
  description: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    excerpt?: string;
    questions: string[];
  };
  llmGuide: string;
  llmConfig?: LLMConfig;
  sourceTables?: string[];
  isActive: boolean;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Global ayarlar
export interface DataSchemaGlobalSettings {
  enableAutoDetect: boolean;
  fallbackSchemaId?: string;
  maxFieldsInCitation: number;
  maxQuestionsToGenerate: number;
}

// Config yapısı
export interface DataSchemaConfig {
  activeSchemaId?: string;
  schemas: DataSchema[];
  globalSettings: DataSchemaGlobalSettings;
}

// API Response tipleri
export interface DataSchemaListResponse {
  schemas: DataSchema[];
  activeSchemaId?: string;
  globalSettings: DataSchemaGlobalSettings;
}

// İşlenmiş citation
export interface ProcessedCitation {
  text: string;
  fields: Array<{ key: string; value: string; label: string }>;
}

// İşlenmiş soru
export interface ProcessedQuestion {
  text: string;
  basedOn: string[];
}

// Field type labels
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  string: 'Metin',
  number: 'Sayı',
  date: 'Tarih',
  currency: 'Para Birimi',
  percentage: 'Yüzde',
  reference: 'Referans',
  category: 'Kategori',
  entity: 'Varlık',
  boolean: 'Evet/Hayır'
};

// Default empty field
export const EMPTY_FIELD: Omit<SchemaField, 'key'> = {
  label: '',
  type: 'string',
  showInCitation: false,
  showInTags: false
};

// Default Sanitizer config (Turkish legal/tax patterns)
// NOTE: This is a subset for UI display. Full config is in backend data-schema.types.ts
export const DEFAULT_SANITIZER_CONFIG: SanitizerConfig = {
  enabled: true,
  minGroundedKeywords: 1,  // Stricter filtering
  logRemovals: true,
  forbiddenPatterns: [
    // Normative verbs - using lookahead for word boundary
    { id: 'norm-1', category: 'normative', pattern: 'gerek(?:mektedir|ir|iyor|lidir)(?=[.,;\\s]|$)', description: 'Gerekmektedir', enabled: true },
    { id: 'norm-2', category: 'normative', pattern: 'zorunlu(?:dur)?(?=[.,;\\s]|$)', description: 'Zorunludur', enabled: true },
    { id: 'norm-3', category: 'normative', pattern: 'zorundadır(?=[.,;\\s]|$)', description: 'Zorundadır', enabled: true },
    { id: 'norm-4', category: 'normative', pattern: 'yükümlü(?:dür)?(?=[.,;\\s]|$)', description: 'Yükümlüdür', enabled: true },
    { id: 'norm-5', category: 'normative', pattern: 'şart(?:tır)?(?=[.,;\\s]|$)', description: 'Şarttır', enabled: true },
    // Consequence warnings
    { id: 'cons-1', category: 'consequence', pattern: 'aksi\\s+(?:takdirde|halde|durumda)', description: 'Aksi takdirde', enabled: true },
    { id: 'cons-2', category: 'consequence', pattern: '(?:hak|indirim|iade)\\s+kayb', description: 'Hak kaybı', enabled: true },
    // Duration claims - must have citation
    { id: 'dur-1', category: 'duration', pattern: '\\d+\\s+(?:yıl|ay|gün)\\s+(?:içinde|süre)(?!\\s*\\[\\d+\\])', description: 'Süre iddiası (atıfsız)', enabled: true },
    // Modal imperatives
    { id: 'modal-1', category: 'modal', pattern: 'yapılmalıdır(?=[.,;\\s]|$)', description: 'Yapılmalıdır', enabled: true },
    { id: 'modal-2', category: 'modal', pattern: 'verilmelidir(?=[.,;\\s]|$)', description: 'Verilmelidir', enabled: true },
    { id: 'modal-3', category: 'modal', pattern: 'edilmelidir(?=[.,;\\s]|$)', description: 'Edilmelidir', enabled: true },
  ],
  // Grounding keywords - these should NOT overlap with forbidden patterns
  // v6: Added temporal/procedural terms for claim verification
  groundingKeywords: [
    'fatura', 'makbuz', 'belge', 'form', 'dilekçe',
    'madde', 'fıkra', 'kanun', 'yönetmelik', 'tebliğ',
    'matrah', 'vergi', 'kdv', 'stopaj', 'tevkifat',
    // Temporal terms - for duration/deadline claim verification
    'süre', 'gün', 'ay', 'yıl', 'tarih', 'vade', 'dönem',
    // Storage/retention terms - for document retention claims
    'saklama', 'muhafaza', 'ibraz', 'arşiv',
    // Declaration/notification terms - for deadline claims
    'beyanname', 'bildirim', 'başvuru',
    // Obligation/penalty terms - for consequence claims
    'ceza', 'usulsüzlük', 'gecikme', 'faiz'
  ],
  // v7: Temporal units for dynamic claim extraction
  temporalUnits: ['yıl', 'ay', 'gün', 'hafta', 'saat'],
  // v7: Critical claim verification config
  criticalClaimConfig: {
    verifyTemporalClaims: true,
    verifyDateClaims: true,
    verifyPercentageClaims: true,
    verifyArticleClaims: true,
    genericClaimThreshold: 0.7
  }
};

// Default LLM config
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  analyzePrompt: 'Bu belgeyi analiz et ve önemli bilgileri çıkar.',
  citationTemplate: '{{baslik}}',
  chatbotContext: 'Bu belge hakkında sorulara yanıt ver.',
  embeddingPrefix: 'Doküman: ',
  transformRules: 'Metin içindeki anahtar bilgileri çıkar.',
  questionGenerator: 'Bu belgenin içeriği hakkında sorular öner.',
  searchContext: 'Genel doküman arama',
  sanitizerConfig: DEFAULT_SANITIZER_CONFIG
};
