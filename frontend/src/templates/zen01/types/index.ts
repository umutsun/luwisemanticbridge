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

export interface ZenMessageProps {
  message: ZenMessage;
  onSourceClick: (source: ZenSource, allSources: ZenSource[]) => void;
  lastUserQuery?: string;
}

export interface ZenInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
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
  welcomeMessage: '',
  greeting: ''
};

export const DEFAULT_RAG_SETTINGS: ZenRagSettings = {
  minResults: 7,
  maxResults: 20,
  similarityThreshold: 0.02
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
