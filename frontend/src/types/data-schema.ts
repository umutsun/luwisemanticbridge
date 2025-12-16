/**
 * Data Schema Types (Frontend)
 *
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

// Forward declaration for LLMConfig (defined below)
interface LLMConfigForward {
  analyzePrompt?: string;
  citationTemplate?: string;
  chatbotContext?: string;
  embeddingPrefix?: string;
  transformRules?: string;
  questionGenerator?: string;
  searchContext?: string;
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
  llmConfig?: LLMConfigForward;
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
  fields: Array<{
    key: string;
    value: string;
    label: string;
  }>;
}

// İşlenmiş soru
export interface ProcessedQuestion {
  text: string;
  basedOn: string[];
}

// Field type display names
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

// Default empty schema
export const EMPTY_SCHEMA: Omit<DataSchema, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  displayName: '',
  description: '',
  fields: [],
  templates: {
    analyze: '',
    citation: '',
    questions: []
  },
  llmGuide: '',
  isActive: true
};

// Default empty field
export const EMPTY_FIELD: Omit<SchemaField, 'key'> = {
  label: '',
  type: 'string',
  showInCitation: false,
  showInTags: false
};

// ============================================
// LLM CONFIG - Unified LLM Configuration
// ============================================

/**
 * LLM Configuration for schema-aware processing
 * Used across all LLM-powered features: analyze, chatbot, embedding, transform
 */
export interface LLMConfig {
  /** Prompt used during document analysis */
  analyzePrompt?: string;

  /** Template for citation formatting */
  citationTemplate?: string;

  /** Context provided to chatbot for this schema */
  chatbotContext?: string;

  /** Prefix added to content before embedding generation */
  embeddingPrefix?: string;

  /** Rules for data transformation process */
  transformRules?: string;

  /** Template for generating follow-up questions */
  questionGenerator?: string;

  /** Context for semantic search queries */
  searchContext?: string;
}

/**
 * Process types that use LLM config
 */
export type LLMProcessType =
  | 'analyze'
  | 'chatbot'
  | 'embedding'
  | 'transform'
  | 'questions'
  | 'search';

/**
 * Default LLM config for fallback
 */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  analyzePrompt: 'Bu belgeyi analiz et ve önemli bilgileri çıkar.',
  citationTemplate: '{{baslik}}',
  chatbotContext: 'Bu belge hakkında sorulara yanıt ver. Belgedeki bilgileri doğrudan referans alarak yanıtla.',
  embeddingPrefix: 'Doküman: ',
  transformRules: 'Metin içindeki anahtar bilgileri çıkar.',
  questionGenerator: 'Bu belgenin içeriği hakkında kullanıcının ilgilenebileceği sorular öner.',
  searchContext: 'Genel doküman arama'
};

/**
 * LLM Config Tab definitions for the editor
 */
export const LLM_CONFIG_TABS = [
  {
    id: 'analyze',
    label: 'Analiz',
    icon: 'FileSearch',
    description: 'Doküman analizi sırasında LLM\'e gönderilecek prompt',
    field: 'analyzePrompt' as keyof LLMConfig,
    variables: ['{{content}}', '{{source_table}}', '{{field_name}}']
  },
  {
    id: 'chatbot',
    label: 'Chatbot',
    icon: 'MessageSquare',
    description: 'Sohbet sırasında LLM\'in referans alacağı bağlam bilgisi',
    field: 'chatbotContext' as keyof LLMConfig,
    variables: ['{{user_query}}', '{{context}}', '{{source_table}}']
  },
  {
    id: 'embedding',
    label: 'Embedding',
    icon: 'Binary',
    description: 'Vektör oluşturma öncesi içeriğe eklenen prefix',
    field: 'embeddingPrefix' as keyof LLMConfig,
    variables: ['{{source_table}}']
  },
  {
    id: 'transform',
    label: 'Transform',
    icon: 'ArrowRightLeft',
    description: 'Veri dönüşümü için LLM talimatları',
    field: 'transformRules' as keyof LLMConfig,
    variables: ['{{content}}', '{{target_fields}}']
  },
  {
    id: 'questions',
    label: 'Sorular',
    icon: 'HelpCircle',
    description: 'Takip sorusu üretimi için şablon',
    field: 'questionGenerator' as keyof LLMConfig,
    variables: ['{{topic}}', '{{context}}']
  },
  {
    id: 'search',
    label: 'Arama',
    icon: 'Search',
    description: 'Semantik arama için bağlam bilgisi',
    field: 'searchContext' as keyof LLMConfig,
    variables: ['{{query}}']
  }
] as const;
