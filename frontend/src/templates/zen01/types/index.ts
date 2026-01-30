/**
 * Zen01 Template - Shared TypeScript Types
 */

// Message Source Interface
export interface ZenSource {
  title?: string;
  content?: string;
  excerpt?: string;
  sourceTable?: string;
  sourceType?: string;
  score?: number;
  summary?: string;
  keywords?: string[];
  category?: string;
  // Metadata from CSV source tables (dynamic fields)
  metadata?: {
    // Common fields
    kurum?: string;
    tarih?: string;
    sayi?: string;
    madde_no?: string;
    madde?: string;
    // Danıştay kararları
    kararno?: string;
    karar_no?: string;
    esas_no?: string;
    esasno?: string;
    karar?: string;
    esas?: string;
    daire?: string;
    // Makaleler
    dergi?: string;
    yazar?: string;
    author?: string;
    // Generic fields
    date?: string;
    yil?: string;
    year?: string;
    // Allow any other dynamic fields from CSV
    [key: string]: string | number | boolean | undefined;
  };
}

// Related Topic Interface
export interface ZenRelatedTopic {
  title: string;
  description: string;
}

// Token Usage Interface
export interface ZenTokens {
  input?: number;
  output?: number;
  total?: number;
}

// Message Interface
export interface ZenMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: ZenSource[];
  relatedTopics?: ZenRelatedTopic[];
  context?: string[];
  isTyping?: boolean;
  isFromSource?: boolean;
  isStreaming?: boolean;
  isError?: boolean;
  responseTime?: number;
  startTime?: number;
  tokens?: ZenTokens;
  fastMode?: boolean;
  /** Flag indicating sources fetch failed after retries (streaming mode) */
  sourcesFetchFailed?: boolean;
}

// Chatbot Settings Interface
export interface ZenChatbotSettings {
  title: string;
  subtitle: string;
  logoUrl: string;
  placeholder: string;
  primaryColor: string;
  activeChatModel: string;
  enableSuggestions: boolean;
  welcomeMessage?: string;
  greeting?: string;
  // Suggestion Cards
  maxSuggestionCards?: number;
  // Source Interaction Features (from schema)
  enableSourceClick?: boolean;
  enableSourceQuestionGeneration?: boolean;
  // Keyword Highlighting
  enableKeywordHighlighting?: boolean;
  // PDF Upload Feature Toggle
  enablePdfUpload?: boolean;
  // Voice Features Master Toggles
  enableVoiceInput?: boolean;
  enableVoiceOutput?: boolean;
  // Response Schema (dynamic format configuration)
  responseSchemaId?: string;
}

// User Info Interface
export interface ZenUserInfo {
  name?: string;
  email?: string;
  role?: string;
}

// Theme Mode Type
export type ZenThemeMode = 'dark' | 'light';

// Theme Context Interface
export interface ZenThemeContext {
  isDark: boolean;
  mode: ZenThemeMode;
  toggle: () => void;
}

// RAG Settings Interface
export interface ZenRagSettings {
  minResults: number;
  maxResults: number;
  similarityThreshold: number;
  minSourcesToShow?: number;
  maxSourcesToShow?: number;
  /** Enable streaming mode for chat responses */
  streamingEnabled?: boolean;
}

// LLM Settings Interface
export interface ZenLlmSettings {
  temperature: number;
  maxTokens: number;
}

// Active Prompt Interface
export interface ZenActivePrompt {
  content: string;
  temperature: number;
  maxTokens: number;
  tone: string;
}

// Component Props Interfaces
export interface ZenHeaderProps {
  chatbotSettings: ZenChatbotSettings;
  user: ZenUserInfo | null;
  onClearChat: () => void;
  onLogout: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export interface ZenWelcomeProps {
  chatbotSettings: ZenChatbotSettings;
  user: ZenUserInfo | null;
  suggestions: string[];
  onSuggestionClick: (question: string) => void;
  isLoading: boolean;
}

// PDF Settings Interface
export interface ZenPdfSettings {
  enabled: boolean;
  maxSizeMB: number;
  maxPages: number;
}

// Voice Settings Interface
export interface ZenVoiceSettings {
  enableVoiceInput: boolean;
  enableVoiceOutput: boolean;
  maxRecordingSeconds: number;
}

export interface ZenInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (pdfFile?: File) => void;
  placeholder: string;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  pdfSettings?: ZenPdfSettings;
  pdfFile?: File | null;
  onPdfSelect?: (file: File | null) => void;
  voiceSettings?: ZenVoiceSettings;
  // Slash command support
  onSlashCommand?: (command: SlashCommand) => void;
  // History panel support (renders above input like slash commands)
  historyPanel?: React.ReactNode;
}

export interface ZenMessageProps {
  message: ZenMessage;
  onSourceClick: (source: ZenSource, allSources: ZenSource[]) => void;
  lastUserQuery?: string;
  voiceOutputEnabled?: boolean;
  // Feature toggles from schema
  enableSourceClick?: boolean;
  enableKeywordHighlighting?: boolean;
  // Response schema configuration
  responseSchemaId?: string;
  // Backend-generated metadata for schema sections
  keywords?: string[];
  dayanaklar?: string[];
  // Source display configuration
  minSourcesToShow?: number;
  // Translation support
  translation?: MessageTranslation;
  onToggleTranslation?: () => void;
}

// Slash Command Submenu Item
export interface SlashCommandSubmenuItem {
  id: string;
  label: string;
  targetLanguage: string;
}

// Slash Command Types
export interface SlashCommand {
  id: string;
  trigger: string;       // '/translate', '/history'
  label: string;         // 'Çevir', 'Geçmiş'
  description: string;   // 'Mesajı çevir', 'Konuşma geçmişini göster'
  icon: string;          // Icon (empty string if none)
  category: 'translation' | 'navigation' | 'utility';
  targetLanguage?: string;
  hasSubmenu?: boolean;
  submenuItems?: SlashCommandSubmenuItem[];
}

// Message Translation State
export interface MessageTranslation {
  originalContent: string;
  translatedContent: string;
  targetLanguage: string;
  isShowingTranslation: boolean;
}

// Default Settings
export const DEFAULT_CHATBOT_SETTINGS: ZenChatbotSettings = {
  title: '',
  subtitle: '',
  logoUrl: '',
  placeholder: '',
  primaryColor: '',
  activeChatModel: '',
  enableSuggestions: true,
  maxSuggestionCards: 4,
  welcomeMessage: '',
  greeting: ''
};

export const DEFAULT_RAG_SETTINGS: ZenRagSettings = {
  minResults: 7,
  maxResults: 20,
  similarityThreshold: 0.02,
  minSourcesToShow: 7,  // minResults ile senkronize
  maxSourcesToShow: 15
};

export const DEFAULT_LLM_SETTINGS: ZenLlmSettings = {
  temperature: 0.7,
  maxTokens: 2048
};

export const DEFAULT_ACTIVE_PROMPT: ZenActivePrompt = {
  content: '',
  temperature: 0.7,
  maxTokens: 2048,
  tone: 'professional'
};
