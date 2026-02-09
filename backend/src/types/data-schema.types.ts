/**
 * Data Schema Types
 *
 * Kullanıcının veri yapısını tanımlaması ve LLM'in doğru yorumlaması için
 * gerekli tip tanımlamaları.
 *
 * Akış: Analyze → Embed → Search → Citation → Question
 */

// Alan tipleri
export type FieldType =
  | 'string'      // Genel metin
  | 'number'      // Sayısal değer
  | 'date'        // Tarih (format ile birlikte)
  | 'currency'    // Para birimi
  | 'percentage'  // Yüzde değeri
  | 'reference'   // Referans (kanun no, madde no vs.)
  | 'category'    // Kategori/sınıflandırma
  | 'entity'      // Named entity (kişi, kurum vs.)
  | 'boolean';    // Evet/Hayır

// Tek bir alan tanımı
export interface SchemaField {
  key: string;              // Unique identifier (snake_case)
  label: string;            // Görüntüleme adı (Türkçe)
  type: FieldType;          // Alan tipi
  format?: string;          // Tarih formatı vs. (DD.MM.YYYY)
  required?: boolean;       // Zorunlu mu?
  extractionHint?: string;  // LLM'e çıkarım ipucu
  displayOrder?: number;    // Gösterim sırası
  showInCitation?: boolean; // Citation'da gösterilsin mi?
  showInTags?: boolean;     // Tag olarak gösterilsin mi?
}

// Template değişken tipi
export interface TemplateVariable {
  key: string;              // {{key}} olarak kullanılır
  description: string;      // Açıklama
  example?: string;         // Örnek değer
}

// Ana Data Schema yapısı
export interface DataSchema {
  id: string;               // Unique ID (UUID)
  name: string;             // Schema adı (vergi_mevzuati)
  displayName: string;      // Görüntüleme adı (Vergi Mevzuatı)
  description: string;      // Detaylı açıklama

  // Alan tanımları
  fields: SchemaField[];

  // Template tanımları
  templates: {
    // Belge analiz prompt'u - {{content}} değişkeni otomatik eklenir
    analyze: string;

    // Citation gösterim formatı
    // Örnek: "{{source_table}} - {{kanun_no}} Md.{{madde_no}}"
    citation: string;

    // Excerpt gösterim formatı (opsiyonel)
    // Örnek: "{{excerpt | truncate:200}}"
    excerpt?: string;

    // Takip sorusu kalıpları
    // Örnek: ["{{madde_no}}. maddenin istisnaları nelerdir?"]
    questions: string[];

    // Statik örnek sorular (placeholder içermez)
    // Örnek: ["Vergi iadesi nasıl alınır?"]
    example_questions?: string[];
  };

  // LLM'e veri hakkında kılavuz
  // Bu metin system prompt'a eklenir
  llmGuide: string;

  // LLM Configuration for all processes
  llmConfig?: LLMConfig;

  // Source table mapping (hangi tablolara uygulanır)
  sourceTables?: string[];

  // Transform Prompts (Document analizi ve veri çıkarımı)
  transformPrompts?: TransformPrompt[];

  // Question Generation Patterns (Dinamik soru üretimi)
  questionPatterns?: QuestionPattern[];

  // Citation Patterns (Kaynak gösterme formatları)
  citationPatterns?: CitationPattern[];

  // Metadata
  isActive: boolean;
  isDefault?: boolean;      // Varsayılan schema mı?
  createdAt: Date;
  updatedAt: Date;
}

// Settings'te saklanacak konfigürasyon
export interface DataSchemaConfig {
  activeSchemaId?: string;  // Aktif schema ID
  schemas: DataSchema[];    // Tüm schema'lar
  globalSettings: {
    enableAutoDetect: boolean;    // Otomatik schema tespiti
    fallbackSchemaId?: string;    // Tespit edilemezse kullanılacak
    maxFieldsInCitation: number;  // Citation'da max alan sayısı
    maxQuestionsToGenerate: number; // Max takip sorusu sayısı
  };
}

// API Response tipleri
export interface DataSchemaListResponse {
  schemas: DataSchema[];
  activeSchemaId?: string;
}

export interface DataSchemaResponse {
  schema: DataSchema;
}

// Template işleme için helper tipler
export interface TemplateContext {
  [key: string]: string | number | boolean | undefined;
}

export interface ProcessedCitation {
  text: string;
  fields: Array<{
    key: string;
    value: string;
    label: string;
  }>;
}

export interface ProcessedQuestion {
  text: string;
  basedOn: string[];  // Hangi alanlara dayalı
}

// Question Generation Pattern (Dinamik soru üretimi için)
export interface QuestionPattern {
  id: string;                       // Unique ID
  name: string;                     // Pattern adı (Saglik, Emlak, Vergi)
  priority: number;                 // Yüksek priority = önce kontrol edilir
  keywords: string[];               // İçerikte aranacak keywords
  titleKeywords?: string[];         // Title'da aranacak keywords (opsiyonel)
  defaultQuestion: string;          // Varsayılan soru template'i (kullanılacak: {topic})
  combinations: Array<{             // Keyword kombinasyonları için özel sorular
    when: string;                   // İkinci keyword (basvuru, sure, ozellik vb.)
    question: string;               // Bu durumda sorulacak soru
  }>;
}

// Citation Pattern (Citation formatı için)
export interface CitationPattern {
  id: string;
  name: string;
  format: string;                   // Citation format template
  fields: string[];                 // Kullanılan field key'leri
  example?: string;                 // Örnek citation
}

// Transform Prompt (Document analizi ve veri çıkarımı için)
export interface TransformPrompt {
  id: string;                       // Unique ID
  name: string;                     // Prompt adı (Invoice, Legal, Research vb.)
  description?: string;             // Açıklama
  systemPrompt: string;             // LLM system prompt (transformation instructions)
  targetFields: string[];           // Çıkarılacak field'lar
  examples?: Array<{                // Örnek input/output
    input: string;
    output: any;
  }>;
  temperature?: number;             // LLM temperature (default: 0.1)
  priority?: number;                // Uygulama önceliği
}

// ============================================
// LLM CONFIG - Unified LLM Configuration
// ============================================

/**
 * Topic Entity for domain-specific quote validation
 * Used by RAG guardrails to match questions with evidence
 */
export interface TopicEntity {
  /** Regex pattern as string, e.g., "vergi levhası|vergi levha" */
  pattern: string;
  /** Primary entity name */
  entity: string;
  /** Synonyms for broader matching in evidence */
  synonyms: string[];
}

/**
 * Law Code Configuration for article anchoring
 * Used by semantic search to match law article queries (e.g., "VUK 114", "GVK 40")
 * Multi-tenant: Each schema can have its own law code mappings
 */
export interface LawCodeConfig {
  /**
   * Map of law code → aliases (used for query detection)
   * Example: { "VUK": ["Vergi Usul Kanunu", "VERGİ USUL KANUNU", "213 Sayılı Kanun"] }
   */
  lawCodes?: Record<string, string[]>;

  /**
   * Map of law number → code (for number-based lookup)
   * Example: { "213": "VUK", "193": "GVK", "3065": "KDVK" }
   */
  lawNumberToCode?: Record<string, string>;

  /**
   * Map of full law name → code (handles malformed names from chunked data)
   * Example: { "VERGİSİ KANUNU (G.V.K.)Kanun": "GVK", "Kanunlar No: 492": "HK" }
   */
  lawNameToCode?: Record<string, string>;

  /**
   * Patterns for matching law codes in malformed text
   * Example: [{ pattern: "G\\.V\\.K", code: "GVK" }, { pattern: "\\(GVK\\)", code: "GVK" }]
   */
  lawCodePatterns?: Array<{ pattern: string; code: string }>;

  /**
   * v12.48: Rate article configuration for tax rate questions
   * Maps law codes to their rate-defining articles
   * Used to boost relevant articles when rate questions are detected
   * Example: { "KVK": { articleNumber: "32", keywords: ["oran", "yüzde"] } }
   */
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
  /** Additional article numbers for rate-related content (e.g., ["32/A", "32/B"]) */
  relatedArticles?: string[];
}

/**
 * Sanitizer Pattern for claim filtering
 * Used by RAG post-processor to identify ungrounded claims
 */
export interface SanitizerPattern {
  /** Unique identifier */
  id: string;
  /** Pattern category: normative, procedural, consequence, duration, modal */
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
  /** Whether sanitizer is enabled for this schema */
  enabled: boolean;

  /**
   * Language code for sanitizer patterns (ISO 639-1)
   * Supported: 'tr' (Turkish), 'en' (English)
   * If set and useLanguagePack is true, loads patterns from language pack
   * Default: 'tr' (Turkish for first customers)
   */
  language?: string;

  /**
   * Whether to use language pack for patterns
   * If true, loads forbiddenPatterns, groundingKeywords, temporalUnits from language pack
   * Custom patterns in this config will override language pack patterns
   * Default: false (backward compatible)
   */
  useLanguagePack?: boolean;

  /**
   * Forbidden patterns - sentences matching these are checked for grounding
   * If not grounded in sources, entire sentence is removed
   * If useLanguagePack is true, these are merged with language pack patterns
   */
  forbiddenPatterns: SanitizerPattern[];

  /**
   * Grounding keywords to extract from sentences for source validation
   * These terms must appear in source corpus for claim to be considered grounded
   * If useLanguagePack is true, these are merged with language pack keywords
   */
  groundingKeywords: string[];

  /**
   * Minimum grounded keywords required to keep a sentence
   * Default: 2 (at least 2 keywords must appear in sources)
   */
  minGroundedKeywords: number;

  /**
   * Whether to log removed sentences (for debugging)
   */
  logRemovals: boolean;

  /**
   * Temporal units for claim extraction (e.g., yıl, ay, gün, hafta)
   * Used to identify temporal claims like "10 yıl", "5 gün"
   * If useLanguagePack is true and not provided, loaded from language pack
   */
  temporalUnits?: string[];

  /**
   * Critical claim configuration - controls strict citation verification
   * If not provided, uses sensible defaults
   */
  criticalClaimConfig?: CriticalClaimConfig;
}

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

  /** Domain-specific topic entities for RAG guardrails quote validation */
  topicEntities?: TopicEntity[];

  /** Domain-specific key terms for RAG guardrails validation */
  keyTerms?: string[];

  /** Source tables that belong to this schema */
  sourceTables?: string[];

  /**
   * Authority levels for source types (higher = more authoritative)
   * Used for quote upgrade guardrail - prefers higher authority sources
   * Example: { "kanun": 100, "teblig": 90, "ozelge": 75, "danistay": 70, "makale": 50, "qna": 30 }
   */
  authorityLevels?: Record<string, number>;

  /**
   * Law code configuration for article anchoring in semantic search
   * Enables dynamic mapping of law codes, numbers, and names
   * Multi-tenant: Each schema can have its own law configurations
   */
  lawCodeConfig?: LawCodeConfig;

  /**
   * Sanitizer configuration for filtering ungrounded claims
   * Controls which patterns trigger grounding checks and removal
   * Multi-tenant: Each schema can have its own sanitizer rules
   */
  sanitizerConfig?: SanitizerConfig;

  /**
   * v12.33: Follow-up configuration for depth control
   * Controls disambiguation follow-up behavior and limits
   * Multi-tenant: Each schema can have its own follow-up rules
   */
  followUpConfig?: FollowUpConfig;

  /**
   * v12.33: Deadline configuration for schema-driven deadline detection
   * Enables dynamic deadline intent mapping and responses
   * Multi-tenant: Each schema can have its own deadline rules
   */
  deadlineConfig?: DeadlineConfig;
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
 * Default Sanitizer Config with Turkish legal/tax patterns
 * Updated based on test failures - comprehensive pattern coverage
 */
export const DEFAULT_SANITIZER_CONFIG: SanitizerConfig = {
  enabled: true,
  minGroundedKeywords: 1,  // Lowered to 1 - stricter filtering
  logRemovals: true,

  forbiddenPatterns: [
    // ═══════════════════════════════════════════════════════════════
    // NORMATIVE VERBS (zorunluluk ifadeleri) - v7: Turkish conjugations
    // Word boundary: (?=[.,;\\s]|$) matches punctuation, space, or end of string
    // Conjugation suffixes: -lar/-ler (plural), -sınız/-siniz (formal), -ız/-iz (we)
    // ═══════════════════════════════════════════════════════════════
    { id: 'norm-1', category: 'normative', pattern: 'gerek(?:mektedir|ir|iyor|lidir|tirmektedir|tirir)(?:ler)?(?=[.,;\\s]|$)', description: 'Gerekmektedir varyantları', enabled: true },
    { id: 'norm-2', category: 'normative', pattern: 'zorunlu(?:dur|luktur)?(?:lar)?(?=[.,;\\s]|$)', description: 'Zorunludur', enabled: true },
    { id: 'norm-3', category: 'normative', pattern: 'zorundadır(?:lar|s[ıi]n[ıi]z)?(?=[.,;\\s]|$)', description: 'Zorundadır + çekimler', enabled: true },
    { id: 'norm-4', category: 'normative', pattern: 'mecbur(?:dur|idir|iyet)?(?:lar)?(?=[.,;\\s]|$)', description: 'Mecburdur/mecburiyet', enabled: true },
    { id: 'norm-5', category: 'normative', pattern: 'şart(?:tır)?(?:lar)?(?=[.,;\\s]|$)', description: 'Şarttır', enabled: true },
    { id: 'norm-6', category: 'normative', pattern: 'esas(?:tır)?(?:lar)?(?=[.,;\\s]|$)', description: 'Esastır', enabled: true },
    { id: 'norm-7', category: 'normative', pattern: 'yükümlü(?:dür)?(?:ler)?(?=[.,;\\s]|$)', description: 'Yükümlüdür', enabled: true },
    { id: 'norm-8', category: 'normative', pattern: 'yükümlülü(?:k|ğü)(?=[.,;\\s]|$)', description: 'Yükümlülük', enabled: true },
    { id: 'norm-9', category: 'normative', pattern: 'uyulmas[ıi]\\s+gerek', description: 'Uyulması gerekir', enabled: true },
    { id: 'norm-10', category: 'normative', pattern: 'uygulanmas[ıi]\\s+gerek', description: 'Uygulanması gerekir', enabled: true },
    { id: 'norm-11', category: 'normative', pattern: 'bulunmas[ıi]\\s+gerek', description: 'Bulunması gerekir', enabled: true },
    { id: 'norm-12', category: 'normative', pattern: 'edilmes[ıi]\\s+gerek', description: 'Edilmesi gerekir', enabled: true },

    // ═══════════════════════════════════════════════════════════════
    // PROCEDURAL IMPERATIVES (prosedür iddiaları)
    // ═══════════════════════════════════════════════════════════════
    { id: 'proc-1', category: 'procedural', pattern: 'ibraz(?:ı|\\s+edilmesi|\\s+edilmeli)', description: 'İbraz edilmesi', enabled: true },
    { id: 'proc-2', category: 'procedural', pattern: 'saklan(?:ması|malı)', description: 'Saklanması', enabled: true },
    { id: 'proc-3', category: 'procedural', pattern: 'muhafaza(?:sı|\\s+edilmesi)', description: 'Muhafaza edilmesi', enabled: true },
    { id: 'proc-4', category: 'procedural', pattern: 'belge(?:lenmesi|lemesi)', description: 'Belgelenmesi', enabled: true },
    { id: 'proc-5', category: 'procedural', pattern: 'sunul(?:ması|malı)', description: 'Sunulması', enabled: true },
    { id: 'proc-6', category: 'procedural', pattern: 'beyan(?:name)?\\s+veril(?:mesi|melidir)', description: 'Beyanname verilmesi', enabled: true },
    { id: 'proc-7', category: 'procedural', pattern: 'bildiril(?:mesi|melidir)', description: 'Bildirilmesi', enabled: true },
    { id: 'proc-8', category: 'procedural', pattern: 'başvur(?:ulmalıdır|u\\s+yapılmalı)', description: 'Başvurulması', enabled: true },
    { id: 'proc-9', category: 'procedural', pattern: 'düzenlen(?:mesi|melidir)', description: 'Düzenlenmesi', enabled: true },
    { id: 'proc-10', category: 'procedural', pattern: 'ödenmesi\\s+gerek', description: 'Ödenmesi gerekir', enabled: true },

    // ═══════════════════════════════════════════════════════════════
    // CONSEQUENCE WARNINGS (sonuç/ceza uyarıları)
    // ═══════════════════════════════════════════════════════════════
    { id: 'cons-1', category: 'consequence', pattern: 'aksi\\s+(?:takdirde|halde|durumda)', description: 'Aksi takdirde/halde', enabled: true },
    { id: 'cons-2', category: 'consequence', pattern: '(?:hak|indirim|iade)\\s+kayb', description: 'Hak/indirim kaybı', enabled: true },
    { id: 'cons-3', category: 'consequence', pattern: 'düşer(?=[.,;\\s]|$)', description: 'Düşer', enabled: true },
    { id: 'cons-4', category: 'consequence', pattern: 'sona\\s+erer', description: 'Sona erer', enabled: true },
    { id: 'cons-5', category: 'consequence', pattern: 'uygulan(?:a)?maz', description: 'Uygulanamaz', enabled: true },
    { id: 'cons-6', category: 'consequence', pattern: 'uyulmamas[ıi]\\s+(?:halinde|durumunda)', description: 'Uyulmaması halinde', enabled: true },
    { id: 'cons-7', category: 'consequence', pattern: 'ceza[ilğ]*\\s+yapt[ıi]r[ıi]m', description: 'Cezai yaptırım', enabled: true },
    { id: 'cons-8', category: 'consequence', pattern: 'ceza\\s+(?:söz\\s+konusu|uygulan)', description: 'Ceza uygulanır', enabled: true },
    { id: 'cons-9', category: 'consequence', pattern: 'usulsüzlük\\s+ceza', description: 'Usulsüzlük cezası', enabled: true },
    { id: 'cons-10', category: 'consequence', pattern: 'idari\\s+para\\s+ceza', description: 'İdari para cezası', enabled: true },
    { id: 'cons-11', category: 'consequence', pattern: 'vergi\\s+ziya[ıi]', description: 'Vergi ziyaı', enabled: true },
    { id: 'cons-12', category: 'consequence', pattern: 'gecikme\\s+(?:faiz|zam)', description: 'Gecikme faizi/zammı', enabled: true },

    // ═══════════════════════════════════════════════════════════════
    // UNGROUNDED WARNINGS (dayanaksız genel uyarılar)
    // ═══════════════════════════════════════════════════════════════
    { id: 'warn-1', category: 'modal', pattern: 'unutulmamalıdır', description: 'Unutulmamalıdır', enabled: true },
    { id: 'warn-2', category: 'modal', pattern: 'ihmal\\s+edilmemelidir', description: 'İhmal edilmemelidir', enabled: true },
    { id: 'warn-3', category: 'modal', pattern: 'göz\\s+ardı\\s+edilmemelidir', description: 'Göz ardı edilmemelidir', enabled: true },
    { id: 'warn-4', category: 'modal', pattern: 'dikkat\\s+edilmelidir', description: 'Dikkat edilmelidir', enabled: true },
    { id: 'warn-5', category: 'modal', pattern: 'gözetilmelidir', description: 'Gözetilmelidir', enabled: true },
    { id: 'warn-6', category: 'modal', pattern: 'atlanmamalıdır', description: 'Atlanmamalıdır', enabled: true },
    { id: 'warn-7', category: 'modal', pattern: 'titizlikle\\s+(?:incelenmesi|uyulması)', description: 'Titizlikle incelenmesi', enabled: true },
    { id: 'warn-8', category: 'modal', pattern: 'önem\\s+(?:taşı|arz\\s+et)', description: 'Önem taşır/arz eder', enabled: true },
    { id: 'warn-9', category: 'modal', pattern: 'önerilmektedir', description: 'Önerilmektedir', enabled: true },
    { id: 'warn-10', category: 'modal', pattern: 'tavsiye\\s+edilmektedir', description: 'Tavsiye edilmektedir', enabled: true },

    // ═══════════════════════════════════════════════════════════════
    // DURATION/DEADLINE CLAIMS (süre iddiaları) - MUST have citation
    // ═══════════════════════════════════════════════════════════════
    { id: 'dur-1', category: 'duration', pattern: 'belirli\\s+(?:bir\\s+)?süre', description: 'Belirli süre', enabled: true },
    { id: 'dur-2', category: 'duration', pattern: 'süre\\s+(?:içerisinde|içinde|boyunca)', description: 'Süre içinde/boyunca', enabled: true },
    { id: 'dur-3', category: 'duration', pattern: '\\d+\\s+(?:yıl|ay|gün|hafta)\\s+(?:içinde|süre|boyunca)(?!\\s*\\[\\d+\\])', description: 'X yıl/ay/gün içinde (atıfsız)', enabled: true },
    { id: 'dur-4', category: 'duration', pattern: 'takvim\\s+yılı', description: 'Takvim yılı', enabled: true },
    { id: 'dur-5', category: 'duration', pattern: '(?:bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\\s+yıl(?!\\s*\\[\\d+\\])', description: 'Yazıyla yıl (atıfsız)', enabled: true },
    { id: 'dur-6', category: 'duration', pattern: '(?:bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|onbeş|otuz)\\s+(?:ay|gün)(?!\\s*\\[\\d+\\])', description: 'Yazıyla ay/gün (atıfsız)', enabled: true },
    { id: 'dur-7', category: 'duration', pattern: 'ay[ıi]n\\s+(?:\\d+|yirmi|otuz)[^\\[]*(?:\\.|,|;|$)', description: 'Ayın X günü (atıfsız)', enabled: true },

    // ═══════════════════════════════════════════════════════════════
    // MODAL IMPERATIVES (modal zorunluluklar) - v7: Turkish conjugations
    // -malıdır/-melidir can have plural -lar/-ler suffix
    // ═══════════════════════════════════════════════════════════════
    { id: 'modal-1', category: 'modal', pattern: 'verilmelidir(?:ler)?(?=[.,;\\s]|$)', description: 'Verilmelidir', enabled: true },
    { id: 'modal-2', category: 'modal', pattern: 'yapılmalıdır(?:lar)?(?=[.,;\\s]|$)', description: 'Yapılmalıdır', enabled: true },
    { id: 'modal-3', category: 'modal', pattern: 'sunulmalıdır(?:lar)?(?=[.,;\\s]|$)', description: 'Sunulmalıdır', enabled: true },
    { id: 'modal-4', category: 'modal', pattern: 'ödenmelidir(?:ler)?(?=[.,;\\s]|$)', description: 'Ödenmelidir', enabled: true },
    { id: 'modal-5', category: 'modal', pattern: 'incelenmelidir(?:ler)?(?=[.,;\\s]|$)', description: 'İncelenmelidir', enabled: true },
    { id: 'modal-6', category: 'modal', pattern: 'bulundurulmalıdır(?:lar)?(?=[.,;\\s]|$)', description: 'Bulundurulmalıdır', enabled: true },
    { id: 'modal-7', category: 'modal', pattern: 'tutulmalıdır(?:lar)?(?=[.,;\\s]|$)', description: 'Tutulmalıdır', enabled: true },
    { id: 'modal-8', category: 'modal', pattern: 'alınmalıdır(?:lar)?(?=[.,;\\s]|$)', description: 'Alınmalıdır', enabled: true },
    { id: 'modal-9', category: 'modal', pattern: 'edilmelidir(?:ler)?(?=[.,;\\s]|$)', description: 'Edilmelidir', enabled: true },
    { id: 'modal-10', category: 'modal', pattern: 'sağlanmalıdır(?:lar)?(?=[.,;\\s]|$)', description: 'Sağlanmalıdır', enabled: true },

    // ═══════════════════════════════════════════════════════════════
    // NUMERIC CLAIMS (rakamsal iddialar) - MUST have citation
    // ═══════════════════════════════════════════════════════════════
    { id: 'num-1', category: 'custom', pattern: '%\\s*\\d+(?!\\s*\\[\\d+\\])', description: 'Yüzde oranı (atıfsız)', enabled: true },
    { id: 'num-2', category: 'custom', pattern: '\\d+[.,]\\d+\\s*(?:TL|lira|euro|dolar)(?!\\s*\\[\\d+\\])', description: 'Para tutarı (atıfsız)', enabled: true },
    { id: 'num-3', category: 'custom', pattern: '\\d{2}[./]\\d{2}[./]\\d{4}(?!\\s*\\[\\d+\\])', description: 'Tarih formatı (atıfsız)', enabled: true },
  ],

  // ═══════════════════════════════════════════════════════════════
  // GROUNDING KEYWORDS
  // These keywords are checked in source corpus to validate claims
  // IMPORTANT: These should NOT overlap with forbidden pattern words
  // v6: Added temporal/procedural terms for claim verification
  // ═══════════════════════════════════════════════════════════════
  groundingKeywords: [
    // Document types (specific nouns that indicate grounded content)
    'fatura', 'makbuz', 'fiş', 'belge', 'form', 'dilekçe',
    'sözleşme', 'protokol', 'tutanak', 'rapor', 'resmi yazı',
    // Legal document numbers (indicate specific references)
    'madde', 'fıkra', 'bent', 'kanun', 'yönetmelik', 'tebliğ',
    // Tax terms (specific nouns)
    'matrah', 'vergi', 'kdv', 'stopaj', 'tevkifat', 'istisna', 'muafiyet',
    // v12.52: ÖTV/OTV - both Turkish and ASCII forms
    'ötv', 'otv', 'özel tüketim', 'ozel tuketim',
    // Process terms (specific actions that can be verified)
    'tahakkuk', 'tahsil', 'iade', 'indirim', 'mahsup',
    // Temporal terms - CRITICAL for duration/deadline claim verification
    'süre', 'gün', 'ay', 'yıl', 'tarih', 'vade', 'dönem', 'takvim',
    // v12.52: Zamanaşımı terms (VUK 114 etc.)
    'zamanaşımı', 'zamanasimi', 'zaman aşımı',
    // Storage/retention terms - for document retention claims
    'saklama', 'muhafaza', 'ibraz', 'arşiv', 'dosya',
    // Declaration/notification terms - for deadline claims
    'beyanname', 'bildirim', 'başvuru', 'tebliğ', 'ihbar',
    // Obligation/penalty terms - for consequence claims
    'ceza', 'usulsüzlük', 'gecikme', 'faiz', 'özel', 'usulsuzlük'
  ],

  // ═══════════════════════════════════════════════════════════════
  // TEMPORAL UNITS - for claim extraction (e.g., "10 yıl", "5 gün")
  // ═══════════════════════════════════════════════════════════════
  temporalUnits: ['yıl', 'ay', 'gün', 'hafta', 'saat'],

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL CLAIM CONFIG - controls strict citation verification
  // All critical claims must be found in cited source (100% match)
  // ═══════════════════════════════════════════════════════════════
  criticalClaimConfig: {
    verifyTemporalClaims: true,   // "10 yıl", "5 gün" must be in source
    verifyDateClaims: true,       // "26'sı", "ayın 15'i" must be in source
    verifyPercentageClaims: true, // "%18", "yüzde 20" must be in source
    verifyArticleClaims: true,    // "VUK 227" must be in source
    genericClaimThreshold: 0.7    // 70% of generic claims must be in source
  }
};

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
  searchContext: 'Genel doküman arama',
  sanitizerConfig: DEFAULT_SANITIZER_CONFIG
};

// Varsayılan schema örnekleri
export const DEFAULT_SCHEMAS: Partial<DataSchema>[] = [
  {
    name: 'emlak_mevzuati',
    displayName: 'Emlak Mevzuatı',
    description: 'İmar kanunları, plan notları, belediye kararları ve emlak hukuku',
    fields: [
      // Coğrafi Kapsam (Hiyerarşik)
      { key: 'scope', label: 'Kapsam', type: 'category', showInTags: true, extractionHint: 'TR (Türkiye geneli), İL adı (IZMIR), veya İLÇE adı (BORNOVA, KARSIYAKA)' },
      // Belge Tipi
      { key: 'doc_type', label: 'Belge Tipi', type: 'category', showInTags: true, extractionHint: 'Kanun, Yönetmelik, Plan_Notu, Meclis_Karari, Emsal_Karar, Teknik_Sartname' },
      // Konu Etiketi
      { key: 'topic', label: 'Konu', type: 'category', showInTags: true, extractionHint: 'Insaat_Hakki, Emsal, Kentsel_Donusum, Kiraci_Hukuku, Otopark, Siginak, Cekme_Mesafesi' },
      // Geçerlilik
      { key: 'validity_year', label: 'Geçerlilik Yılı', type: 'number', showInCitation: true, extractionHint: 'Belgenin geçerli olduğu yıl (2024, 2023...)' },
      // Referanslar
      { key: 'kanun_no', label: 'Kanun No', type: 'reference', showInCitation: true, extractionHint: 'İmar Kanunu (3194), Kat Mülkiyeti (634) vb.' },
      { key: 'madde_no', label: 'Madde', type: 'reference', showInCitation: true },
      { key: 'karar_no', label: 'Karar No', type: 'reference', extractionHint: 'Meclis karar numarası veya Danıştay karar no' },
      // Tarih
      { key: 'tarih', label: 'Tarih', type: 'date', format: 'DD.MM.YYYY', showInCitation: true },
      // Sayısal değerler
      { key: 'emsal', label: 'Emsal', type: 'number', extractionHint: 'İnşaat alanı katsayısı (0.30, 1.50 vb.)' },
      { key: 'taks', label: 'TAKS', type: 'percentage', extractionHint: 'Taban alanı kat sayısı' },
      { key: 'max_kat', label: 'Max Kat', type: 'number', extractionHint: 'İzin verilen maksimum kat sayısı' }
    ],
    templates: {
      analyze: `Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:
- Coğrafi kapsam (Türkiye geneli mi, hangi il/ilçe?)
- Belge tipi (Kanun, Yönetmelik, Plan Notu, Meclis Kararı, Emsal Karar?)
- Ana konu (İnşaat hakkı, emsal, kentsel dönüşüm, otopark, sığınak?)
- Geçerlilik yılı
- Kanun/madde numaraları
- Emsal, TAKS, kat yüksekliği gibi sayısal değerler`,
      citation: '{{doc_type}} - {{scope}} - {{topic}}',
      questions: [
        '{{scope}} bölgesinde {{topic}} hakkında güncel kurallar nelerdir?',
        '{{kanun_no}} sayılı kanunun {{madde_no}}. maddesi ne diyor?',
        '{{scope}} için emsal ve TAKS değerleri nedir?'
      ]
    },
    llmGuide: `Bu veri Türk emlak ve imar mevzuatını içermektedir.

KAPSAM HİYERARŞİSİ (scope):
- TR: Türkiye geneli geçerli (Anayasa, İmar Kanunu, Planlı Alanlar Yönetmeliği)
- İL (örn: IZMIR): İl geneli (Büyükşehir Belediye yönetmelikleri, meclis kararları)
- İLÇE (örn: BORNOVA): İlçe özel (Plan notları, parsel bazlı kararlar)

ÇAKIŞMA KURALI: Yerel plan notu > İl yönetmeliği > Ulusal mevzuat
Eğer ilçe plan notu farklı bir emsal veriyorsa, PLAN NOTU GEÇERLİDİR.

TEMEL KAYNAKLAR:
- İmar Kanunu (3194)
- Planlı Alanlar İmar Yönetmeliği
- Kat Mülkiyeti Kanunu (634)
- Kentsel Dönüşüm Kanunu (6306)
- Belediye meclis kararları
- Danıştay kararları

Emsal değerleri genellikle 0.30-3.00 arasındadır. TAKS %30-%60 aralığında olur.`
  },
  {
    name: 'vergi_mevzuati',
    displayName: 'Vergi Mevzuatı',
    description: 'Türk vergi kanunları, özelgeler ve Danıştay kararları',
    fields: [
      { key: 'kanun_no', label: 'Kanun No', type: 'reference', showInCitation: true, extractionHint: 'Kanun numarası (örn: 193, 3065, 5520)' },
      { key: 'madde_no', label: 'Madde', type: 'reference', showInCitation: true, extractionHint: 'Madde numarası' },
      { key: 'tarih', label: 'Tarih', type: 'date', format: 'DD.MM.YYYY', showInCitation: true },
      { key: 'ozelge_no', label: 'Özelge No', type: 'reference', extractionHint: 'Özelge sayısı/numarası' },
      { key: 'karar_no', label: 'Karar No', type: 'reference', extractionHint: 'Danıştay karar numarası' },
      { key: 'konu', label: 'Konu', type: 'category', showInTags: true },
      { key: 'vergi_turu', label: 'Vergi Türü', type: 'category', showInTags: true, extractionHint: 'GVK, KVK, KDV, ÖTV vb.' }
    ],
    templates: {
      analyze: `Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:
- Kanun numarası ve madde numarası
- Tarih bilgisi
- Özelge veya karar numarası
- Ana konu ve vergi türü
- Önemli hükümler ve istisnalar`,
      citation: '{{vergi_turu}} - {{kanun_no}} Md.{{madde_no}}',
      questions: [
        '{{madde_no}}. maddenin uygulama esasları nelerdir?',
        '{{kanun_no}} sayılı kanundaki istisnalar nelerdir?',
        '{{konu}} hakkında güncel mevzuat değişiklikleri var mı?'
      ]
    },
    llmGuide: `Bu veri Türk vergi mevzuatını içermektedir. Kaynaklar arasında:
- Gelir Vergisi Kanunu (GVK - 193)
- Kurumlar Vergisi Kanunu (KVK - 5520)
- Katma Değer Vergisi Kanunu (KDV - 3065)
- Vergi Usul Kanunu (VUK - 213)
- Gelir İdaresi Başkanlığı özelgeleri
- Danıştay vergi dava kararları
Tarihler DD.MM.YYYY formatındadır. Madde numaraları genellikle "Md." kısaltmasıyla belirtilir.`
  },
  {
    name: 'emlak_ilanlari',
    displayName: 'Emlak İlanları',
    description: 'Gayrimenkul satış ve kiralama ilanları',
    fields: [
      { key: 'fiyat', label: 'Fiyat', type: 'currency', showInCitation: true },
      { key: 'metrekare', label: 'm²', type: 'number', showInCitation: true },
      { key: 'oda_sayisi', label: 'Oda', type: 'string', showInCitation: true },
      { key: 'il', label: 'İl', type: 'string', showInTags: true },
      { key: 'ilce', label: 'İlçe', type: 'string', showInTags: true },
      { key: 'mahalle', label: 'Mahalle', type: 'string' },
      { key: 'ilan_tarihi', label: 'İlan Tarihi', type: 'date', format: 'DD.MM.YYYY' },
      { key: 'emlak_tipi', label: 'Emlak Tipi', type: 'category', showInTags: true, extractionHint: 'Daire, Villa, Arsa, İşyeri vb.' }
    ],
    templates: {
      analyze: `Bu emlak ilanını analiz et ve aşağıdaki bilgileri çıkar:
- Fiyat (TL cinsinden)
- Metrekare
- Oda sayısı (3+1, 2+1 formatında)
- Konum bilgileri (il, ilçe, mahalle)
- Emlak tipi`,
      citation: '{{emlak_tipi}} - {{oda_sayisi}} - {{metrekare}}m² - {{fiyat}}',
      questions: [
        '{{ilce}} bölgesinde benzer fiyatlı ilanlar var mı?',
        '{{metrekare}}m² civarı emlakların fiyat ortalaması nedir?',
        '{{il}} ilinde {{emlak_tipi}} piyasası nasıl?'
      ]
    },
    llmGuide: `Bu veri Türkiye emlak piyasası ilanlarını içermektedir.
Fiyatlar Türk Lirası (TL) cinsindendir. Büyük rakamlar milyon olarak ifade edilebilir.
Oda sayısı genellikle "3+1" formatında belirtilir (3 oda + 1 salon).
m²/kare fiyatı önemli bir karşılaştırma metriğidir.`
  },
  {
    name: 'genel_dokuman',
    displayName: 'Genel Doküman',
    description: 'Varsayılan genel amaçlı şema',
    fields: [
      { key: 'baslik', label: 'Başlık', type: 'string', showInCitation: true },
      { key: 'tarih', label: 'Tarih', type: 'date', format: 'DD.MM.YYYY' },
      { key: 'kategori', label: 'Kategori', type: 'category', showInTags: true },
      { key: 'yazar', label: 'Yazar', type: 'entity' },
      { key: 'kaynak', label: 'Kaynak', type: 'string' }
    ],
    templates: {
      analyze: `Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:
- Başlık veya ana konu
- Tarih bilgisi
- Kategori veya sınıflandırma
- Yazar veya kaynak`,
      citation: '{{baslik}}',
      questions: [
        '{{baslik}} hakkında daha fazla bilgi',
        '{{kategori}} konusunda başka kaynaklar var mı?'
      ]
    },
    llmGuide: 'Genel amaçlı doküman. Yapısal bilgiler mevcut değilse içerikten anlam çıkar.'
  }
];

// ============================================
// v12.33: FOLLOW-UP DEPTH CONTROL TYPES
// ============================================

/**
 * Expected response for disambiguation
 * Maps user response to resolution and pre-computed answer
 */
export interface ExpectedDisambiguationResponse {
  /** Primary keyword to match (e.g., 'beyanname') */
  keyword: string;
  /** Alternative keywords/aliases (e.g., ['beyan', 'bildirim']) */
  aliases: string[];
  /** Resolution key for processing */
  resolution: string;
  /** Pre-computed answer data */
  answer?: {
    day: number;
    article: string;
    lawCode: string;
  };
}

/**
 * Pending disambiguation state stored in Redis
 * Tracks context between user query and follow-up response
 */
export interface PendingDisambiguation {
  /** Original user query that triggered disambiguation (e.g., "KDV 24 mü 26 mı?") */
  originalQuery: string;
  /** Category of intent (e.g., 'deadline', 'rate', 'exemption') */
  intentCategory: string;
  /** Specific intent type, null until resolved */
  intentType: string | null;
  /** Expected responses that can resolve this disambiguation */
  expectedResponses: ExpectedDisambiguationResponse[];
  /** Cached context for reuse */
  cachedContext: {
    /** Search results from original query */
    searchResults: any[];
    /** Detected intent from original query */
    detectedIntent: string;
  };
  /** Number of follow-up questions asked */
  followUpCount: number;
  /** Timestamp when disambiguation was created */
  createdAt: number;
  /** Timestamp when disambiguation expires */
  expiresAt: number;
  /** Conversation ID for tracking */
  conversationId: string;
}

/**
 * Follow-up configuration for depth control
 * Schema-driven, can be customized per tenant
 */
export interface FollowUpConfig {
  /** Whether follow-up detection is enabled */
  enabled: boolean;
  /** Maximum follow-up depth before forcing closure (default: 2) */
  maxDepth: number;
  /** Maximum depth for exceptional intents like iade, istisna (default: 3) */
  exceptionalMaxDepth: number;
  /** Intent categories that get exceptional max depth */
  exceptionalIntents: string[];
  /** Closing message when max depth reached */
  closingMessage: {
    tr: string;
    en: string;
  };
  /** Number of messages to look back for context (default: 2) */
  carryOverWindow: number;
  /** TTL in seconds for pending disambiguation (default: 300) */
  ttlSeconds: number;
}

/**
 * Deadline intent configuration
 * Schema-driven deadline detection and response
 */
export interface DeadlineIntentConfig {
  /** Keywords for this intent type (Turkish) */
  keywords: string[];
  /** ASCII variants of keywords */
  keywordsAscii: string[];
  /** Target article number (e.g., "41" for beyanname) */
  articleNumber: string;
  /** Law code (e.g., "KDVK") */
  lawCode: string;
  /** Full law name */
  lawName: string;
  /** Deadline information */
  deadline: {
    day: number;
    wordTr: string;
  };
  /** Table filter for targeted DB fetch */
  tableFilter: string;
}

/**
 * Deadline configuration for schema
 */
export interface DeadlineConfig {
  /** Whether deadline detection is enabled */
  enabled: boolean;
  /** Intent configurations keyed by intent type */
  intents: Record<string, DeadlineIntentConfig>;
  /** Patterns for detecting comparison questions (e.g., "24 mü 26 mı") */
  comparisonPatterns: string[];
  /** Typo tolerance configuration */
  typoTolerance: {
    enabled: boolean;
    maxLevenshteinDistance: number;
    shortWordMaxDistance: number;
  };
}

/**
 * Default follow-up configuration
 * v12.36: maxDepth = 1 (single follow-up only, no loops)
 */
export const DEFAULT_FOLLOWUP_CONFIG: FollowUpConfig = {
  enabled: true,
  maxDepth: 2,  // v12.44: Allow disambiguation(1) + resolution(2)
  exceptionalMaxDepth: 3,
  exceptionalIntents: ['iade', 'istisna', 'tevkifat'],
  closingMessage: {
    tr: 'Bu konu birden fazla hukuki senaryo içeriyor. Lütfen sorunuzu tek başlık altında netleştirerek yeni bir sorgu oluşturun.',
    en: 'This topic involves multiple legal scenarios. Please clarify your question under a single topic.'
  },
  carryOverWindow: 2,
  ttlSeconds: 300
};

/**
 * Default deadline disambiguation responses
 * Used when user responds to "Beyanname mi ödeme mi?" question
 */
export const DEADLINE_DISAMBIGUATION_RESPONSES: Record<string, ExpectedDisambiguationResponse> = {
  beyanname: {
    keyword: 'beyanname',
    aliases: ['beyan', 'bildirim', 'declaration', 'bildiri'],
    resolution: 'beyanname',
    answer: { day: 24, article: 'm.41', lawCode: 'KDVK' }
  },
  odeme: {
    keyword: 'ödeme',
    aliases: ['odeme', 'ödenir', 'odenir', 'payment', 'yatırma', 'yatirma', 'öde', 'ode'],
    resolution: 'odeme',
    answer: { day: 26, article: 'm.46', lawCode: 'KDVK' }
  }
};
