/**
 * Chatbot Feature Flags and Settings Types
 *
 * All UI features are controlled through database settings
 * This allows per-instance customization (Vergilex, Bookie, Emlakai)
 */

export interface ChatbotFeatures {
  // Source Display
  enableSourcesSection: boolean;          // Show/hide sources section
  enableKeywordHighlighting: boolean;     // Show keyword tags
  enableSourceExpansion: boolean;         // Show more/less functionality
  sourceDisplayStyle: 'detailed' | 'minimal'; // Source card complexity

  // Response Metadata
  enableResponseTime: boolean;            // Show response time
  enableTokenCount: boolean;              // Show token usage
  enableConfidenceScore: boolean;         // Show confidence scores

  // Interaction Features
  enableFollowUpQuestions: boolean;       // Show follow-up questions
  enableActionButtons: boolean;           // Thumbs up/down, copy, refresh
  enableSourceClick: boolean;             // Clickable sources for deep dive
  enableSourceQuestionGeneration: boolean; // Generate question when source is clicked

  // UI Style
  inputStyle: 'inline' | 'floating';      // Input position
  headerStyle: 'classic' | 'modern';      // Header layout
  messageStyle: 'card' | 'bubble';        // Message appearance

  // Welcome Screen
  enableWelcomeMessage: boolean;          // Show welcome message
  enableSuggestions: boolean;             // Show suggestion cards
  suggestionsCount: number;               // Number of suggestions to show (2-6)

  // Advanced
  enableStreaming: boolean;               // Stream responses
  enableTypingIndicator: boolean;         // Show typing animation
  enableAutoScroll: boolean;              // Auto scroll to bottom

  // PDF Upload
  enablePdfUpload: boolean;               // Enable PDF file upload in chat

  // Voice Features
  enableVoiceInput: boolean;              // STT - Voice input via microphone
  enableVoiceOutput: boolean;             // TTS - Text-to-speech for responses
}

export interface ChatbotSettings {
  // Basic Info
  title: string;
  subtitle: string;
  logoUrl: string;
  placeholder: string;
  welcomeMessage: string;
  greeting: string;

  // Theme
  theme: 'base' | 'modern' | 'spark';     // Visual theme
  primaryColor: string;                    // Legacy support

  // Model
  activeChatModel: string;                 // LLM model identifier

  // Features
  features: ChatbotFeatures;
}

/**
 * Default feature configuration
 * Used as fallback when database doesn't have specific settings
 */
export const defaultFeatures: ChatbotFeatures = {
  // Source Display
  enableSourcesSection: true,
  enableKeywordHighlighting: true,
  enableSourceExpansion: true,
  sourceDisplayStyle: 'detailed',

  // Response Metadata
  enableResponseTime: true,
  enableTokenCount: true,
  enableConfidenceScore: true,

  // Interaction Features
  enableFollowUpQuestions: false,
  enableActionButtons: false,
  enableSourceClick: true,
  enableSourceQuestionGeneration: true, // Default: ON

  // UI Style
  inputStyle: 'inline',
  headerStyle: 'modern',
  messageStyle: 'card',

  // Welcome Screen
  enableWelcomeMessage: true,
  enableSuggestions: true,
  suggestionsCount: 4,

  // Advanced
  enableStreaming: true,
  enableTypingIndicator: true,
  enableAutoScroll: true,

  // PDF Upload
  enablePdfUpload: false,

  // Voice Features
  enableVoiceInput: false,
  enableVoiceOutput: false
};

/**
 * Preset configurations for different use cases
 */
export const featurePresets: Record<string, Partial<ChatbotFeatures>> = {
  // Detailed legal/tax platform (Vergilex)
  detailed: {
    enableSourcesSection: true,
    enableKeywordHighlighting: true,
    enableSourceExpansion: true,
    sourceDisplayStyle: 'detailed',
    enableResponseTime: true,
    enableTokenCount: true,
    enableConfidenceScore: true,
    inputStyle: 'inline',
    messageStyle: 'card'
  },

  // Minimal modern interface (Bookie)
  minimal: {
    enableSourcesSection: true,
    enableKeywordHighlighting: false,
    enableSourceExpansion: false,
    sourceDisplayStyle: 'minimal',
    enableResponseTime: false,
    enableTokenCount: false,
    enableConfidenceScore: false,
    inputStyle: 'floating',
    messageStyle: 'bubble'
  },

  // Balanced AI assistant (Emlakai)
  balanced: {
    enableSourcesSection: true,
    enableKeywordHighlighting: true,
    enableSourceExpansion: true,
    sourceDisplayStyle: 'detailed',
    enableResponseTime: true,
    enableTokenCount: false,
    enableConfidenceScore: true,
    enableFollowUpQuestions: true,
    inputStyle: 'floating',
    messageStyle: 'bubble'
  }
};

/**
 * Merge feature settings with defaults
 * Ensures all required fields are present
 */
export const mergeFeatures = (features?: Partial<ChatbotFeatures>): ChatbotFeatures => {
  return {
    ...defaultFeatures,
    ...features
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC RESPONSE SCHEMA
// Configurable response format sections - similar to GİB özelge format
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Response section definition - each section in the structured response
 */
export interface ResponseSection {
  id: string;                              // Unique section identifier
  label: string;                           // Display label (Turkish)
  labelKey?: string;                       // i18n key for label translation
  backendLabel?: string;                   // Label used by backend in response (e.g., "KONU:", "DEGERLENDIRME:")
  source: 'llm' | 'backend' | 'metadata';  // Where content comes from
  required: boolean;                       // Is this section mandatory
  order: number;                           // Display order (1, 2, 3...)
  style: 'heading' | 'text' | 'list' | 'tags' | 'citation' | 'metadata';
  backendExtractor?: string;               // Backend function name if source='backend'
  visible: boolean;                        // Show/hide in UI
}

/**
 * Response schema configuration - defines the structure of AI responses
 */
export interface ResponseSchema {
  id: string;                              // Schema identifier
  name: string;                            // Display name
  description?: string;                    // Schema description
  sections: ResponseSection[];             // Ordered list of sections
  promptTemplate?: string;                 // Optional prompt template override
  active: boolean;                         // Is this schema currently active
}

/**
 * Default response schema - GİB özelge-like format
 */
export const defaultResponseSchema: ResponseSchema = {
  id: 'vergilex-article',
  name: 'Vergilex Makale Formatı',
  description: 'GİB özelge benzeri yapılandırılmış yanıt formatı',
  active: true,
  sections: [
    {
      id: 'keywords',
      label: 'Anahtar Terimler',
      backendLabel: 'ANAHTAR_TERİMLER:',
      source: 'backend',
      required: false,
      order: 1,
      style: 'tags',
      backendExtractor: 'extractKeywordsFromSources',
      visible: true
    },
    {
      id: 'assessment',
      label: 'Değerlendirme',
      backendLabel: 'DEĞERLENDİRME:',
      source: 'llm',
      required: true,
      order: 2,
      style: 'text',
      visible: true
    }
  ]
};

/**
 * Alternative schema presets
 */
export const responseSchemaPresets: Record<string, ResponseSchema> = {
  // Detailed legal/tax format (Vergilex)
  'vergilex-article': defaultResponseSchema,

  // Simple Q&A format (Bookie)
  'simple-qa': {
    id: 'simple-qa',
    name: 'Basit Soru-Cevap',
    description: 'Sadece cevap ve kaynaklar',
    active: false,
    sections: [
      {
        id: 'cevap',
        label: 'Cevap',
        source: 'llm',
        required: true,
        order: 1,
        style: 'text',
        visible: true
      },
      {
        id: 'kaynaklar',
        label: 'Kaynaklar',
        source: 'backend',
        required: false,
        order: 2,
        style: 'citation',
        backendExtractor: 'extractSourceReferences',
        visible: true
      }
    ]
  },

  // Detailed analysis format (GeoLex)
  'detailed-analysis': {
    id: 'detailed-analysis',
    name: 'Detaylı Analiz',
    description: 'Özet, analiz ve öneriler içeren format',
    active: false,
    sections: [
      {
        id: 'ozet',
        label: 'Özet',
        source: 'llm',
        required: true,
        order: 1,
        style: 'heading',
        visible: true
      },
      {
        id: 'anahtar_terimler',
        label: 'Anahtar Terimler',
        source: 'backend',
        required: false,
        order: 2,
        style: 'tags',
        backendExtractor: 'extractKeywordsFromSources',
        visible: true
      },
      {
        id: 'analiz',
        label: 'Analiz',
        source: 'llm',
        required: true,
        order: 3,
        style: 'text',
        visible: true
      },
      {
        id: 'oneriler',
        label: 'Öneriler',
        source: 'llm',
        required: false,
        order: 4,
        style: 'list',
        visible: true
      },
      {
        id: 'kaynaklar',
        label: 'Kaynaklar',
        source: 'backend',
        required: false,
        order: 5,
        style: 'citation',
        backendExtractor: 'extractSourceReferences',
        visible: true
      }
    ]
  }
};

/**
 * Helper to get active schema
 */
export const getActiveSchema = (schemaId?: string): ResponseSchema => {
  if (schemaId && responseSchemaPresets[schemaId]) {
    return responseSchemaPresets[schemaId];
  }
  return defaultResponseSchema;
};

/**
 * Generate prompt instructions from schema
 * This tells the LLM what sections to include in its response
 */
export const generatePromptFromSchema = (schema: ResponseSchema): string => {
  const llmSections = schema.sections
    .filter(s => s.source === 'llm' && s.visible)
    .sort((a, b) => a.order - b.order);

  if (llmSections.length === 0) return '';

  let prompt = 'Yanıtını aşağıdaki bölümlerle yapılandır:\n\n';

  llmSections.forEach((section, idx) => {
    prompt += `${idx + 1}) **${section.label.toUpperCase()}**`;
    if (section.required) {
      prompt += ' (zorunlu)';
    }
    prompt += '\n';

    // Add section-specific instructions
    switch (section.id) {
      case 'konu':
        prompt += '   Sorunun konusunu kısa ve öz şekilde belirt.\n';
        break;
      case 'degerlendirme':
        prompt += '   Kaynaklara dayanarak detaylı değerlendirme yap. Atıf numaralarını [1], [2] şeklinde kullan.\n';
        break;
      case 'ozet':
        prompt += '   Konuyu 2-3 cümleyle özetle.\n';
        break;
      case 'analiz':
        prompt += '   Detaylı analiz ve açıklama yap.\n';
        break;
      case 'oneriler':
        prompt += '   Madde madde öneriler listele.\n';
        break;
      case 'sonuc':
        prompt += '   Kesin sonuç veya tavsiyeyi belirt.\n';
        break;
      default:
        prompt += `   ${section.label} içeriğini yaz.\n`;
    }
  });

  return prompt;
};
