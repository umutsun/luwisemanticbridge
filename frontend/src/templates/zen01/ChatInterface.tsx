'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEndpoint } from '@/config/api.config';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/hooks/useLanguage';
import { createEnhancedSourceClickHandler } from '@/utils/semantic-search-enhancement';

// Particles Background Component
import { ParticlesBackground } from '@/components/ui/particles-background';

// Import CSS
import './styles/zen01.css';

// Import theme hook
import { useTheme } from '@/hooks/useTheme';

// Import Zen01 components
import { ZenHeader, ZenWelcome, ZenMessage, ZenInput } from './components';
import { useZenTheme } from './hooks';
import type {
  ZenMessage as ZenMessageType,
  ZenChatbotSettings,
  ZenRagSettings,
  ZenLlmSettings,
  ZenActivePrompt,
  ZenSource,
  ZenPdfSettings,
  DEFAULT_CHATBOT_SETTINGS,
  DEFAULT_RAG_SETTINGS,
  DEFAULT_LLM_SETTINGS,
  DEFAULT_ACTIVE_PROMPT
} from './types';

// Suggestions cache TTL
const SUGGESTIONS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Zen01 Chat Interface
 * A modern, glassmorphic chat interface with dark/light mode support
 */
export default function ChatInterface() {
  const { token, user, logout } = useAuth();
  const { t } = useTranslation();
  useLanguage();

  // Force zen01 theme
  useTheme('zen01');

  // Theme state
  const { isDark, toggle: toggleTheme } = useZenTheme('dark');

  // Chatbot settings state
  const [chatbotSettings, setChatbotSettings] = useState<ZenChatbotSettings>({
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
  const [messages, setMessages] = useState<ZenMessageType[]>([]);
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

  // RAG and LLM Settings
  const [, setRagSettings] = useState<ZenRagSettings>({
    minResults: 7,
    maxResults: 20,
    similarityThreshold: 0.02
  });
  const [llmSettings, setLlmSettings] = useState<ZenLlmSettings>({
    temperature: 0.7,
    maxTokens: 2048
  });
  const [activePrompt, setActivePrompt] = useState<ZenActivePrompt>({
    content: '',
    temperature: 0.7,
    maxTokens: 2048,
    tone: 'professional'
  });

  // PDF upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfSettings, setPdfSettings] = useState<ZenPdfSettings>({
    enabled: false,
    maxSizeMB: 10,
    maxPages: 30
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

  // Initial settings load
  useEffect(() => {
    setIsClient(true);

    const loadSuggestions = async () => {
      setIsSuggestionsLoading(true);
      const questions = await fetchSuggestedQuestions();
      setSuggestedQuestions(questions);
      setIsSuggestionsLoading(false);
    };

    loadSuggestions();

    // Fetch PDF settings
    fetch('/api/v2/chat/pdf-settings')
      .then(res => res.json())
      .then(data => {
        setPdfSettings({
          enabled: data.enabled || false,
          maxSizeMB: data.maxSizeMB || 10,
          maxPages: data.maxPages || 30
        });
        console.log('[Zen01] PDF settings loaded:', data);
      })
      .catch(err => {
        console.error('[Zen01] Failed to fetch PDF settings:', err);
      });

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

        const config: ZenChatbotSettings = {
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

        const rag: ZenRagSettings = {
          minResults: settingsData.ragSettings?.minResults || 7,
          maxResults: settingsData.ragSettings?.maxResults || 20,
          similarityThreshold: settingsData.ragSettings?.similarityThreshold || 0.02
        };

        const llm: ZenLlmSettings = {
          temperature: settingsData.llmSettings?.temperature || 0.7,
          maxTokens: settingsData.llmSettings?.maxTokens || 2048
        };

        const prompt: ZenActivePrompt = activePromptObj ? {
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

  // Streaming timer
  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(() => {
        setTimerTick(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isStreaming]);

  // Event listeners for tag clicks
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

  // Send message handler
  const handleSendMessage = async (fromSource: boolean = false, uploadedPdf?: File) => {
    if ((!inputText.trim() && !uploadedPdf) || isLoading || isStreaming) return;

    const userMessage: ZenMessageType = {
      id: Date.now().toString(),
      role: 'user',
      content: uploadedPdf ? `📎 ${uploadedPdf.name}\n\n${inputText}` : inputText,
      timestamp: new Date(),
      isFromSource: fromSource,
    };

    setMessages(prev => [...prev, userMessage]);
    const messageContent = inputText;
    setLastUserQuery(inputText);
    setInputText('');
    setPdfFile(null); // Clear PDF after send
    setIsLoading(true);
    setShowSuggestions(false);

    const messageId = (Date.now() + 1).toString();
    const messageStartTime = Date.now();
    const streamingMessage: ZenMessageType = {
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
            ? t('chat.errors.adminLimit', 'Admin kullanicilarsınız sınırsız erisiminiz olmalidir.')
            : t('chat.errors.queryLimit', 'Aylik soru limitinizi doldurdunuz.');

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
          sources?: ZenSource[];
          relatedTopics?: ZenMessageType['relatedTopics'];
          context?: ZenMessageType['context'];
          response?: string;
          tokens?: ZenMessageType['tokens'];
          usage?: ZenMessageType['tokens'];
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
              content: data.message?.content || data.response || data.message || t('chat.errors.general', 'Bir hata olustu.'),
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
      let userFriendlyMessage = t('chat.errors.general', 'Bir hata olustu.');

      if (errorMessage.includes(': 429') || errorMessage.includes('QUERY_LIMIT_EXCEEDED')) {
        userFriendlyMessage = user?.role === 'admin'
          ? t('chat.errors.adminLimit', 'Admin kullanicilarsınız.')
          : t('chat.errors.queryLimit', 'Aylik soru limitinizi doldurdunuz.');
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
        className={`zen01-container ${isDark ? '' : 'light'}`}
        data-theme="zen01"
        data-mode={isDark ? 'dark' : 'light'}
      >
        {/* Particles Background */}
        <ParticlesBackground variant={isDark ? 'dark' : 'light'} />

        {/* Header */}
        <ZenHeader
          chatbotSettings={chatbotSettings}
          user={user}
          onClearChat={clearChat}
          onLogout={logout}
          isDark={isDark}
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
          onSend={(pdf) => handleSendMessage(false, pdf)}
          placeholder={chatbotSettings.placeholder}
          isLoading={isLoading}
          textareaRef={textareaRef}
          pdfSettings={pdfSettings}
          pdfFile={pdfFile}
          onPdfSelect={setPdfFile}
        />
      </div>
    </ProtectedRoute>
  );
}
