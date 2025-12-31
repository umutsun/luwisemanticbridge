'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEndpoint } from '@/config/api.config';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/hooks/useLanguage';
import { createEnhancedSourceClickHandler } from '@/utils/semantic-search-enhancement';
import { Send, User, Bot, Sparkles, Clock, ChevronDown, LogOut, Trash2, MessageSquare, FileText, ExternalLink, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Particles Background Component
import { ParticlesBackground } from '@/components/ui/particles-background';

// Import CSS
import './styles/zen01.css';

// Import theme
import { useTheme } from '@/hooks/useTheme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Array<{
    title?: string;
    content?: string;
    excerpt?: string;
    sourceTable?: string;
    sourceType?: string;
    score?: number;
    summary?: string;
    keywords?: string[];
    category?: string;
  }>;
  relatedTopics?: Array<{
    title: string;
    description: string;
  }>;
  context?: string[];
  isTyping?: boolean;
  isFromSource?: boolean;
  isStreaming?: boolean;
  isError?: boolean;
  responseTime?: number;
  startTime?: number;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  fastMode?: boolean;
}

// Zen Typing Indicator
const ZenTypingIndicator = () => (
  <div className="zen01-typing">
    <div className="zen01-typing-dot" />
    <div className="zen01-typing-dot" />
    <div className="zen01-typing-dot" />
  </div>
);

// Zen Message Component
const ZenMessage = ({
  message,
  onSourceClick,
}: {
  message: Message;
  onSourceClick: (source: Message['sources'][0], allSources: Message['sources']) => void;
}) => {
  const isUser = message.role === 'user';
  const [showAllSources, setShowAllSources] = useState(false);
  const visibleSources = showAllSources ? message.sources : message.sources?.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} zen01-fade-in`}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="zen01-avatar zen01-avatar-assistant flex-shrink-0">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        {/* Message Bubble */}
        <div className={isUser ? 'zen01-message-user' : 'zen01-message-assistant'}>
          <div className="p-4">
            {message.isStreaming ? (
              <div className="flex items-center gap-2">
                <ZenTypingIndicator />
                <span className="text-cyan-400/60 text-sm">Thinking...</span>
              </div>
            ) : (
              <div className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            )}
          </div>

          {/* Response Time Badge */}
          {!isUser && message.responseTime && !message.isStreaming && (
            <div className="px-4 pb-3 flex items-center gap-2">
              <div className="zen01-response-time">
                <Clock className="h-3 w-3" />
                <span>{(message.responseTime / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Sources Section */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="zen01-sources mt-3">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-cyan-400/70" />
              <span className="text-xs font-medium text-cyan-400/70">
                {message.sources.length} source{message.sources.length > 1 ? 's' : ''} found
              </span>
            </div>
            <div className="space-y-2">
              {visibleSources?.map((source, idx) => (
                <div
                  key={idx}
                  className="zen01-source-item"
                  onClick={() => onSourceClick(source, message.sources || [])}
                >
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-3.5 w-3.5 text-cyan-400/60 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cyan-300/90 truncate">
                        {source.title || source.sourceTable || 'Source'}
                      </p>
                      {source.excerpt && (
                        <p className="text-xs text-slate-400/80 mt-1 line-clamp-2">
                          {source.excerpt}
                        </p>
                      )}
                    </div>
                    {source.score && (
                      <span className="text-[10px] text-cyan-400/50 flex-shrink-0">
                        {Math.round(source.score * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {message.sources.length > 3 && (
              <button
                onClick={() => setShowAllSources(!showAllSources)}
                className="mt-2 text-xs text-cyan-400/70 hover:text-cyan-300 transition-colors"
              >
                {showAllSources ? 'Show less' : `Show ${message.sources.length - 3} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="zen01-avatar zen01-avatar-user flex-shrink-0">
          <User className="h-4 w-4" />
        </div>
      )}
    </motion.div>
  );
};

// Zen Welcome Component
interface ChatbotSettings {
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

interface UserInfo {
  name?: string;
  email?: string;
  role?: string;
}

const ZenWelcome = ({
  chatbotSettings,
  user,
  suggestions,
  onSuggestionClick,
  isLoading,
}: {
  chatbotSettings: ChatbotSettings;
  user: UserInfo | null;
  suggestions: string[];
  onSuggestionClick: (q: string) => void;
  isLoading: boolean;
}) => {
  const { t } = useTranslation();
  const displayName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  return (
    <div className="zen01-welcome zen01-slide-up">
      {/* Animated Title */}
      <h1 className="zen01-welcome-title">
        {chatbotSettings.greeting || t('chat.greeting', 'Merhaba')}, {displayName}
      </h1>
      <p className="zen01-welcome-subtitle">
        {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'Size nasıl yardımcı olabilirim?')}
      </p>

      {/* Suggestion Pills */}
      {chatbotSettings.enableSuggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          {isLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 w-32 rounded-full bg-cyan-500/10 animate-pulse"
                />
              ))}
            </div>
          ) : (
            suggestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick(q)}
                className="zen01-suggestion"
              >
                <Sparkles className="h-3.5 w-3.5 mr-2 inline-block opacity-60" />
                {q}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Zen Header Component
const ZenHeader = ({
  chatbotSettings,
  user,
  onClearChat,
  onLogout,
  isDark,
  onToggleTheme,
}: {
  chatbotSettings: ChatbotSettings;
  user: UserInfo | null;
  onClearChat: () => void;
  onLogout: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}) => {
  return (
    <header className="zen01-header">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">
              {chatbotSettings.title || 'Zen Assistant'}
            </h1>
            {chatbotSettings.subtitle && (
              <p className="text-xs opacity-60">{chatbotSettings.subtitle}</p>
            )}
          </div>
        </div>

        {/* Live Indicator, Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          <div className="zen01-live">
            <div className="zen01-live-dot" />
            <span className="text-xs text-emerald-500 dark:text-emerald-400">Online</span>
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="zen01-theme-toggle"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Avatar className="h-7 w-7 bg-gradient-to-br from-cyan-500 to-purple-600">
                  <AvatarFallback className="text-xs text-white bg-transparent">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 zen01-dropdown"
            >
              <DropdownMenuItem
                onClick={onClearChat}
                className="zen01-dropdown-item cursor-pointer"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Chat
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#1e3a5f]/50 dark:bg-[#1e3a5f]/50 bg-slate-200" />
              <DropdownMenuItem
                onClick={onLogout}
                className="text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

// Zen Input Component
const ZenInput = ({
  value,
  onChange,
  onSend,
  placeholder,
  isLoading,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="zen01-input-container">
      <div className="max-w-4xl mx-auto">
        <div className="zen01-input flex items-end gap-3 p-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Ask anything...'}
            rows={1}
            className="flex-1 bg-transparent border-none text-cyan-100 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-0 py-2 px-3 text-sm"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={onSend}
            disabled={!value.trim() || isLoading}
            className="zen01-send-btn"
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main ChatInterface Component
export default function ChatInterface() {
  const { token, user, logout } = useAuth();
  const { t } = useTranslation();
  useLanguage();

  // Force zen01 theme
  useTheme('zen01');

  // Chatbot settings state
  const [chatbotSettings, setChatbotSettings] = useState<{
    title: string;
    subtitle: string;
    logoUrl: string;
    placeholder: string;
    primaryColor: string;
    activeChatModel: string;
    enableSuggestions: boolean;
    welcomeMessage?: string;
    greeting?: string;
  }>({
    title: '',
    subtitle: '',
    logoUrl: '',
    placeholder: '',
    primaryColor: '',
    activeChatModel: '',
    enableSuggestions: true,
    welcomeMessage: '',
    greeting: ''
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Suggestions cache
  const suggestionsCache = useRef<{ data: string[], timestamp: number } | null>(null);
  const SUGGESTIONS_CACHE_TTL = 60 * 60 * 1000;

  const fetchSuggestedQuestions = async () => {
    if (suggestionsCache.current) {
      const age = Date.now() - suggestionsCache.current.timestamp;
      if (age < SUGGESTIONS_CACHE_TTL) {
        return suggestionsCache.current.data;
      }
    }

    try {
      const response = await fetch(getEndpoint('chat', 'suggestions'));
      if (response.ok) {
        const data = await response.json();
        const suggestions = data.suggestions || [];
        suggestionsCache.current = {
          data: suggestions,
          timestamp: Date.now()
        };
        return suggestions;
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
    return [];
  };

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [, setStreamingMessageId] = useState<string | null>(null);
  const [, setShowSuggestions] = useState(true);
  const [, setTimerTick] = useState(0);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [lastUserQuery, setLastUserQuery] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Theme toggle handler
  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  // RAG and LLM Settings
  const [, setRagSettings] = useState({
    minResults: 7,
    maxResults: 20,
    similarityThreshold: 0.02
  });
  const [llmSettings, setLlmSettings] = useState({
    temperature: 0.7,
    maxTokens: 2048
  });
  const [activePrompt, setActivePrompt] = useState({
    content: '',
    temperature: 0.7,
    maxTokens: 2048,
    tone: 'professional'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (settingsLoaded && chatbotSettings.title) {
      document.title = chatbotSettings.title;
    }
  }, [settingsLoaded, chatbotSettings.title]);

  useEffect(() => {
    if (settingsLoaded && messages.length === 0) {
      setShowSuggestions(chatbotSettings.enableSuggestions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, chatbotSettings.enableSuggestions]);

  const [shuffledSuggestions, setShuffledSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (suggestedQuestions.length === 0) {
      setShuffledSuggestions([]);
      return;
    }

    const unique = Array.from(new Set(suggestedQuestions));
    const seed = unique[0]?.charCodeAt(0) || 1;
    const shuffled = [...unique];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(((i + 1) * seed * 7) % shuffled.length);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setShuffledSuggestions(shuffled.slice(0, 4));
  }, [suggestedQuestions]);

  const memoizedSuggestions = shuffledSuggestions;

  useEffect(() => {
    setIsClient(true);

    const loadSuggestions = async () => {
      setIsSuggestionsLoading(true);
      const questions = await fetchSuggestedQuestions();
      setSuggestedQuestions(questions);
      setIsSuggestionsLoading(false);
    };

    loadSuggestions();

    Promise.all([
      fetch('/api/v2/chatbot/settings'),
      fetch('/api/v2/settings?category=llm'),
      fetch('/api/v2/settings?category=rag'),
      fetch('/api/v2/settings?category=prompts')
    ])
      .then(async ([chatbotRes, llmRes, ragRes, promptsRes]) => {
        const chatbotData = chatbotRes.ok ? await chatbotRes.json() : {};
        const llmData = llmRes.ok ? await llmRes.json() : {};
        const ragData = ragRes.ok ? await ragRes.json() : {};
        const promptsData = promptsRes.ok ? await promptsRes.json() : {};

        const settingsData = {
          llmSettings: llmData.llmSettings || {},
          ragSettings: ragData.ragSettings || {},
          prompts: promptsData.prompts || {}
        };

        const promptsList = settingsData.prompts?.list || [];
        const activePromptObj = promptsList.find((p: { isActive?: boolean }) => p.isActive === true);

        let activePromptData = {
          content: '',
          temperature: 0.7,
          maxTokens: 2048,
          tone: 'professional'
        };
        if (activePromptObj) {
          activePromptData = {
            content: activePromptObj.systemPrompt || '',
            temperature: parseFloat(activePromptObj.temperature || '0.7'),
            maxTokens: parseInt(activePromptObj.maxTokens || '2048'),
            tone: activePromptObj.conversationTone || 'professional'
          };
        }

        const config = {
          title: chatbotData.title || '',
          subtitle: chatbotData.subtitle || '',
          logoUrl: chatbotData.logoUrl || '',
          placeholder: chatbotData.placeholder || '',
          primaryColor: chatbotData.primaryColor || '',
          activeChatModel: settingsData.llmSettings?.activeChatModel || '',
          enableSuggestions: chatbotData.enableSuggestions !== undefined ? chatbotData.enableSuggestions : true,
          welcomeMessage: chatbotData.welcomeMessage || '',
          greeting: chatbotData.greeting || ''
        };

        const rag = {
          minResults: settingsData.ragSettings?.minResults || 7,
          maxResults: settingsData.ragSettings?.maxResults || 20,
          similarityThreshold: settingsData.ragSettings?.similarityThreshold || 0.02
        };

        const llm = {
          temperature: settingsData.llmSettings?.temperature || 0.7,
          maxTokens: settingsData.llmSettings?.maxTokens || 2048
        };

        const prompt = activePromptObj ? {
          content: activePromptData.content || '',
          temperature: activePromptData.temperature || llm.temperature,
          maxTokens: activePromptData.maxTokens || llm.maxTokens,
          tone: activePromptObj.conversationTone || 'professional'
        } : {
          content: '',
          temperature: llm.temperature,
          maxTokens: llm.maxTokens,
          tone: 'professional'
        };

        setChatbotSettings(config);
        setRagSettings(rag);
        setLlmSettings(llm);
        setActivePrompt(prompt);
        setSettingsLoaded(true);
      })
      .catch(err => {
        console.error('Failed to fetch chatbot settings:', err);
        setSettingsLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(() => {
        setTimerTick(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isStreaming]);

  useEffect(() => {
    const handleTagClick = (event: CustomEvent) => {
      const { query } = event.detail;
      setInputText(query);
      textareaRef.current?.focus();
    };

    const handleAddToInput = (event: CustomEvent) => {
      setInputText(event.detail);
      textareaRef.current?.focus();
    };

    window.addEventListener('tagClick', handleTagClick as EventListener);
    window.addEventListener('addToInput', handleAddToInput as EventListener);

    return () => {
      window.removeEventListener('tagClick', handleTagClick as EventListener);
      window.removeEventListener('addToInput', handleAddToInput as EventListener);
    };
  }, []);

  const handleSendMessage = async (fromSource: boolean = false) => {
    if (!inputText.trim() || isLoading || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
      isFromSource: fromSource,
    };

    setMessages(prev => [...prev, userMessage]);
    const messageContent = inputText;
    setLastUserQuery(inputText);
    setInputText('');
    setIsLoading(true);
    setShowSuggestions(false);

    const messageId = (Date.now() + 1).toString();
    const messageStartTime = Date.now();
    const streamingMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      startTime: messageStartTime,
    };
    setMessages(prev => [...prev, streamingMessage]);
    setStreamingMessageId(messageId);
    setIsStreaming(true);

    try {
      const temperature = activePrompt.content ? activePrompt.temperature : llmSettings.temperature;
      const maxTokens = activePrompt.content ? activePrompt.maxTokens : llmSettings.maxTokens;
      const systemPrompt = activePrompt.content || undefined;

      const response = await fetch(getEndpoint('chat', 'send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageContent,
          conversationId: conversationId,
          model: chatbotSettings.activeChatModel,
          temperature,
          maxTokens,
          systemPrompt,
          enableSemanticAnalysis: true,
          trackUserInsights: true,
          stream: true
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }

        if (response.status === 401) {
          logout();
          return;
        }

        if (response.status === 429 && errorData.code === 'QUERY_LIMIT_EXCEEDED') {
          const subscriptionMessage = user?.role === 'admin'
            ? t('chat.errors.adminLimit', 'Admin kullanıcılarsınız sınırsız erişiminiz olmalıdır.')
            : t('chat.errors.queryLimit', 'Aylık soru limitinizi doldurdunuz.');

          setMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? { ...msg, content: subscriptionMessage, isStreaming: false, isError: true }
              : msg
          ));
          return;
        }

        throw new Error(`Failed to get response: ${response.status}`);
      }

      // Check if response is SSE stream or JSON
      const contentType = response.headers.get('content-type') || '';
      const isStreamingResponse = contentType.includes('text/event-stream');

      if (isStreamingResponse && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  accumulatedContent += data.content;
                  setMessages(prev => prev.map(msg =>
                    msg.id === messageId ? { ...msg, content: accumulatedContent } : msg
                  ));
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        let finalData: {
          sources?: Message['sources'];
          relatedTopics?: Message['relatedTopics'];
          context?: Message['context'];
          response?: string;
          tokens?: Message['tokens'];
          usage?: Message['tokens'];
          fastMode?: boolean;
        } = {};
        try {
          const finalResponse = await fetch(getEndpoint('chat', 'send'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              message: messageContent,
              conversationId: conversationId,
              model: chatbotSettings.activeChatModel,
              temperature,
              maxTokens,
              systemPrompt,
              enableSemanticAnalysis: true,
              trackUserInsights: true,
              stream: false
            }),
          });
          if (finalResponse.ok) {
            finalData = await finalResponse.json();
          }
        } catch (error) {
          console.error('Failed to get final data:', error);
        }

        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? {
              ...msg,
              content: accumulatedContent || finalData.response || msg.content,
              isStreaming: false,
              sources: finalData.fastMode ? [] : finalData.sources,
              relatedTopics: finalData.relatedTopics,
              context: finalData.context,
              responseTime: msg.startTime ? Date.now() - msg.startTime : undefined,
              tokens: finalData.tokens || finalData.usage,
              fastMode: finalData.fastMode
            }
            : msg
        ));
      } else {
        // Non-streaming JSON response (default mode)
        const data = await response.json();

        // Save conversation ID from response
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
        }

        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? {
              ...msg,
              content: data.message?.content || data.response || data.message || t('chat.errors.general', 'Bir hata oluştu.'),
              isStreaming: false,
              sources: data.fastMode ? [] : data.sources,
              relatedTopics: data.relatedTopics,
              context: data.context,
              responseTime: msg.startTime ? Date.now() - msg.startTime : undefined,
              tokens: data.tokens || data.usage,
              fastMode: data.fastMode
            }
            : msg
        ));
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : '';
      let userFriendlyMessage = t('chat.errors.general', 'Bir hata oluştu.');

      if (errorMessage.includes(': 429') || errorMessage.includes('QUERY_LIMIT_EXCEEDED')) {
        userFriendlyMessage = user?.role === 'admin'
          ? t('chat.errors.adminLimit', 'Admin kullanıcılarsınız.')
          : t('chat.errors.queryLimit', 'Aylık soru limitinizi doldurdunuz.');
      }

      setMessages(prev => prev.map(msg =>
        msg.id === messageId
          ? {
            ...msg,
            content: userFriendlyMessage,
            isStreaming: false,
            isError: true,
            responseTime: msg.startTime ? Date.now() - msg.startTime : undefined
          }
          : msg
      ));
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  };

  const handleSuggestionClick = (question: string) => {
    setInputText(question);
    textareaRef.current?.focus();
  };

  const handleSourceClick = createEnhancedSourceClickHandler(
    () => inputText,
    setInputText,
    () => textareaRef.current?.focus(),
    {
      includeCrossSourceContext: true,
      includeRelevanceContext: true,
      maxSemanticTerms: 3,
      queryStyle: 'detailed'
    }
  );

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(chatbotSettings.enableSuggestions);
    setConversationId(undefined);

    if (typeof window !== 'undefined') {
      setIsSuggestionsLoading(true);
      fetchSuggestedQuestions().then(questions => {
        setSuggestedQuestions(questions);
        setIsSuggestionsLoading(false);
      });
    }
  };

  return (
    <ProtectedRoute>
      <div
        className={`zen01-container ${isDarkMode ? '' : 'light'}`}
        data-theme="zen01"
        data-mode={isDarkMode ? 'dark' : 'light'}
      >
        {/* Particles Background */}
        <ParticlesBackground variant={isDarkMode ? 'dark' : 'light'} />

        {/* Header */}
        <ZenHeader
          chatbotSettings={chatbotSettings}
          user={user}
          onClearChat={clearChat}
          onLogout={logout}
          isDark={isDarkMode}
          onToggleTheme={toggleTheme}
        />

        {/* Main Chat Area */}
        <div className="relative z-10 pt-20 pb-32 max-w-5xl mx-auto w-full px-4">
          <ScrollArea className="h-[calc(100vh-13rem)] zen01-scroll">
            <div className="space-y-6 py-4 pr-4">
              {/* Welcome Screen */}
              {isClient && messages.length === 0 && (
                <ZenWelcome
                  chatbotSettings={chatbotSettings}
                  user={user}
                  suggestions={memoizedSuggestions}
                  onSuggestionClick={handleSuggestionClick}
                  isLoading={isSuggestionsLoading}
                />
              )}

              {/* Messages */}
              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <ZenMessage
                    key={message.id}
                    message={message}
                    onSourceClick={handleSourceClick}
                    lastUserQuery={lastUserQuery}
                  />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Floating Input */}
        <ZenInput
          value={inputText}
          onChange={setInputText}
          onSend={() => handleSendMessage(false)}
          placeholder={chatbotSettings.placeholder}
          isLoading={isLoading}
          textareaRef={textareaRef}
        />
      </div>
    </ProtectedRoute>
  );
}
