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
  enablePdfUpload: false
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
