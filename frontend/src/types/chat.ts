export interface PdfAttachment {
  filename: string;
  size: number;
  pageCount?: number;
  cacheKey?: string;
}

/**
 * Article query metadata from RAG article anchoring
 * Used to show warnings when a specific law article was queried but not found
 */
export interface ArticleQuery {
  detected: boolean;
  lawCode?: string;       // e.g., "VUK", "GVK", "KDVK"
  articleNumber?: string; // e.g., "114", "40", "29"
  exactMatchFound?: boolean;
  exactMatchCount?: number;
  wrongMatchCount?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sources?: Source[];
  isLoading?: boolean;
  isStreaming?: boolean;
  status?: 'reading-document' | 'searching' | 'generating' | 'complete' | 'error';
  statusMessage?: string;
  relatedTopics?: Source[];
  pdfAttachment?: PdfAttachment;
  articleQuery?: ArticleQuery; // Article anchoring metadata
}

export interface Source {
  id: string;
  title: string;
  url?: string;
  excerpt?: string;
  relevanceScore?: number;
  sourceTable?: string;
  category?: string;
  citation?: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
  timestamp?: string;
  // v12.27: Synthetic source fields for transparent labeling
  _synthetic?: boolean;
  _syntheticNote?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface SendMessageParams {
  content: string;
  conversationId?: string;
}

export interface ChatResponse {
  message: Message;
  sources?: Source[];
  relatedTopics?: Source[];
  conversationId: string;
  articleQuery?: ArticleQuery; // Article anchoring metadata from RAG
}