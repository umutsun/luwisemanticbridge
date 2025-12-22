'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEndpoint } from '@/config/api.config';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/hooks/useLanguage';
import { createEnhancedSourceClickHandler } from '@/utils/semantic-search-enhancement';

// Import new modular components
import { ChatHeader, ChatWelcome, ChatMessage, ChatInput } from '@/components/chat';

// Import theme system (force 'spark' theme - AI-inspired)
import { useTheme } from '@/hooks/useTheme';
import { ChatbotFeatures, defaultFeatures } from '@/types/chatbot-features';

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
  followUpQuestions?: string[];
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
}

export default function ChatInterface() {
  const { token, user, logout } = useAuth();
  const { t } = useTranslation();
  useLanguage();

  // FORCE Spark theme (AI-inspired with sparkle effects)
  const theme = useTheme('spark');

  // Spark-specific features (action buttons, follow-up questions enabled)
  const features: ChatbotFeatures = useMemo(() => ({
    ...defaultFeatures,
    enableSourcesSection: true,
    enableKeywordHighlighting: true,
    enableSourceExpansion: true,
    sourceDisplayStyle: 'detailed',
    enableResponseTime: true,
    enableTokenCount: true,
    enableConfidenceScore: true,
    enableFollowUpQuestions: true, // ENABLED - AI assistant feature
    enableActionButtons: true, // ENABLED - like, copy, refresh buttons
    enableSourceClick: true,
    inputStyle: 'floating', // FLOATING input
    messageStyle: 'bubble' // Bubble style messages
  }), []);

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
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [, setTimerTick] = useState(0);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [visibleSourcesCount, setVisibleSourcesCount] = useState<{ [key: string]: number }>({});
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [lastUserQuery, setLastUserQuery] = useState<string>('');

  // RAG and LLM Settings
  const [ragSettings, setRagSettings] = useState({
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

      if (response.body) {
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
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }

        let finalData: {
          sources?: Message['sources'];
          followUpQuestions?: string[];
          relatedTopics?: Message['relatedTopics'];
          context?: Message['context'];
          response?: string;
          tokens?: Message['tokens'];
          usage?: Message['tokens'];
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
            if (finalData.conversationId && !conversationId) {
              setConversationId(finalData.conversationId);
            }
          }
        } catch (e) {
          console.error('Failed to get final data:', e);
        }

        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? {
              ...msg,
              content: accumulatedContent || finalData.response || msg.content,
              isStreaming: false,
              sources: finalData.sources,
              followUpQuestions: finalData.followUpQuestions, // SPARK feature
              relatedTopics: finalData.relatedTopics,
              context: finalData.context,
              responseTime: msg.startTime ? Date.now() - msg.startTime : undefined,
              tokens: finalData.tokens || finalData.usage
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-purple-50/20 to-pink-50/30 dark:from-[#0a0a0b] dark:via-purple-950/10 dark:to-[#131314]" data-theme="spark">
        {/* Header using new component */}
        <ChatHeader
          chatbotSettings={chatbotSettings}
          user={user}
          settingsLoaded={settingsLoaded}
          onClearChat={clearChat}
          onLogout={logout}
          isUserDropdownOpen={isUserDropdownOpen}
          setIsUserDropdownOpen={setIsUserDropdownOpen}
        />

        {/* Main Chat Area */}
        <div className="pt-20 pb-32 max-w-3xl mx-auto w-full px-4">
          <ScrollArea className="h-[calc(100vh-13rem)] pr-4">
            <div className="space-y-8 py-4">
              {/* Welcome using new component */}
              {isClient && showSuggestions && messages.length === 0 && (
                <ChatWelcome
                  chatbotSettings={chatbotSettings}
                  user={user}
                  suggestedQuestions={memoizedSuggestions}
                  isSuggestionsLoading={isSuggestionsLoading}
                  onSuggestionClick={handleSuggestionClick}
                  settingsLoaded={settingsLoaded}
                />
              )}

              {/* Messages using new component */}
              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <ChatMessage
                      message={message}
                      lastUserQuery={lastUserQuery}
                      ragSettings={ragSettings}
                      visibleSourcesCount={visibleSourcesCount}
                      setVisibleSourcesCount={setVisibleSourcesCount}
                      onSourceClick={handleSourceClick}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* FLOATING Input using new component */}
        <ChatInput
          inputText={inputText}
          setInputText={setInputText}
          isLoading={isLoading}
          placeholder={chatbotSettings.placeholder}
          messagesCount={messages.length}
          onSendMessage={handleSendMessage}
          textareaRef={textareaRef}
        />
      </div>
    </ProtectedRoute>
  );
}
