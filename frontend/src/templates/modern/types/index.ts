// Modern Template Types

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sources?: Source[];
    relatedTopics?: RelatedTopic[];
    context?: string[];
    isTyping?: boolean;
    isFromSource?: boolean;
    isStreaming?: boolean;
    isError?: boolean;
    responseTime?: number;
    startTime?: number;
    tokens?: TokenUsage;
    fastMode?: boolean;
}

export interface Source {
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

export interface RelatedTopic {
    title: string;
    description: string;
}

export interface TokenUsage {
    input?: number;
    output?: number;
    total?: number;
}

export interface ChatbotSettings {
    title: string;
    subtitle: string;
    logoUrl: string;
    placeholder: string;
    primaryColor: string;
    activeChatModel: string;
    enableSuggestions: boolean;
    welcomeMessage: string;
    greeting: string;
}

export interface RagSettings {
    minResults: number;
    maxResults: number;
    similarityThreshold: number;
}

export interface ActivePrompt {
    content: string;
    temperature: number;
    maxTokens: number;
    tone: string;
}

export interface UserInfo {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
}
