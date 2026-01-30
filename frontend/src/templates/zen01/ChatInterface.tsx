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
import { ZenHeader, ZenWelcome, ZenMessage, ZenInput, ZenHistoryPanel, ZenSuggestPanel } from './components';
import { useZenTheme, useConversationHistory } from './hooks';
import type {
  ZenMessage as ZenMessageType,
  ZenChatbotSettings,
  ZenRagSettings,
  ZenLlmSettings,
  ZenActivePrompt,
  ZenSource,
  ZenPdfSettings,
  SlashCommand,
  MessageTranslation,
  DEFAULT_CHATBOT_SETTINGS,
  DEFAULT_RAG_SETTINGS,
  DEFAULT_LLM_SETTINGS,
  DEFAULT_ACTIVE_PROMPT
} from './types';
import { useToast } from '@/hooks/use-toast';

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
    enableSuggestions: false, // Default false - will be set by loaded settings
    welcomeMessage: '',
    greeting: '',
    // Feature toggles - default to false until settings load
    enableSourceClick: false,
    enableSourceQuestionGeneration: false,
    enableKeywordHighlighting: false,
    enablePdfUpload: false,
    // Voice features - default to false
    enableVoiceInput: false,
    enableVoiceOutput: false
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
      // Get auth token from localStorage
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(getEndpoint('chat', 'suggestions'), {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
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
  const [ragSettings, setRagSettings] = useState<ZenRagSettings>({
    minResults: 7,
    maxResults: 20,
    similarityThreshold: 0.02,
    minSourcesToShow: 7,  // Dinamik: minResults ile senkronize
    maxSourcesToShow: 15
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

  // Voice settings state
  const [voiceSettings, setVoiceSettings] = useState({
    enableVoiceInput: false,
    enableVoiceOutput: false,
    maxRecordingSeconds: 60
  });

  // Translation state - tracks translations per message
  const [messageTranslations, setMessageTranslations] = useState<Map<string, MessageTranslation>>(new Map());
  const [isTranslating, setIsTranslating] = useState(false);

  // History panel state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // Suggest panel state (recent conversations dropdown)
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const {
    conversations,
    isLoading: isHistoryLoading,
    fetchConversations,
    loadConversation,
    deleteConversation
  } = useConversationHistory();

  // Toast for notifications
  const { toast } = useToast();

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

  // Fetch conversations when history panel opens
  useEffect(() => {
    if (isHistoryOpen) {
      fetchConversations().catch(err => {
        console.error('[ChatInterface] Failed to fetch conversations:', err);
      });
    }
  }, [isHistoryOpen, fetchConversations]);

  // Fetch conversations when suggest panel opens
  useEffect(() => {
    if (isSuggestOpen) {
      fetchConversations().catch(err => {
        console.error('[ChatInterface] Failed to fetch conversations for suggest:', err);
      });
    }
  }, [isSuggestOpen, fetchConversations]);

  // Load suggestions only after settings are loaded AND if enabled
  useEffect(() => {
    if (!settingsLoaded) return;

    // Only load suggestions if enabled
    if (chatbotSettings.enableSuggestions) {
      const loadSuggestions = async () => {
        setIsSuggestionsLoading(true);
        const questions = await fetchSuggestedQuestions();
        setSuggestedQuestions(questions);
        setIsSuggestionsLoading(false);
      };
      loadSuggestions();
    } else {
      // Clear suggestions if disabled
      setSuggestedQuestions([]);
      setShuffledSuggestions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, chatbotSettings.enableSuggestions]);

  const [shuffledSuggestions, setShuffledSuggestions] = useState<string[]>([]);

  // Shuffle and limit suggestions based on maxSuggestionCards setting
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
    // Use maxSuggestionCards from settings (default 4)
    const maxCards = chatbotSettings.maxSuggestionCards || 4;
    setShuffledSuggestions(shuffled.slice(0, maxCards));
  }, [suggestedQuestions, chatbotSettings.maxSuggestionCards]);

  const memoizedSuggestions = shuffledSuggestions;

  // Initial settings load
  useEffect(() => {
    setIsClient(true);

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

        // prompts.list may be a JSON string, parse if needed
        let promptsList = settingsData.prompts?.list || [];
        if (typeof promptsList === 'string') {
          try {
            promptsList = JSON.parse(promptsList);
          } catch (e) {
            promptsList = [];
          }
        }
        const activePromptObj = Array.isArray(promptsList)
          ? promptsList.find((p: { isActive?: boolean }) => p.isActive === true)
          : null;

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
          // Suggestion Cards count - from settings
          maxSuggestionCards: chatbotData.maxSuggestionCards || 4,
          welcomeMessage: chatbotData.welcomeMessage || '',
          greeting: chatbotData.greeting || '',
          // Feature toggles from schema - default to TRUE for better UX
          enableSourceClick: chatbotData.enableSourceClick !== false, // Default true - citations clickable
          // Read from ragSettings (where the toggle saves) with fallback to chatbotData
          enableSourceQuestionGeneration: settingsData.ragSettings?.enableSourceQuestionGeneration ?? chatbotData.enableSourceQuestionGeneration ?? false,
          enableKeywordHighlighting: chatbotData.enableKeywordHighlighting !== false, // Default true - keywords highlighted
          // PDF Upload toggle
          enablePdfUpload: chatbotData.enablePdfUpload !== undefined ? chatbotData.enablePdfUpload : false,
          // Voice Feature Toggles (master toggles)
          enableVoiceInput: chatbotData.enableVoiceInput !== undefined ? chatbotData.enableVoiceInput : false,
          enableVoiceOutput: chatbotData.enableVoiceOutput !== undefined ? chatbotData.enableVoiceOutput : false,
          // Response schema configuration
          responseSchemaId: chatbotData.responseSchemaId || 'vergilex-article'
        };

        const minResultsValue = settingsData.ragSettings?.minResults || 7;
        const ragSettings: ZenRagSettings = {
          minResults: minResultsValue,
          maxResults: settingsData.ragSettings?.maxResults || 20,
          similarityThreshold: settingsData.ragSettings?.similarityThreshold || 0.02,
          // minSourcesToShow = minResults (dinamik olarak ayarlanır)
          minSourcesToShow: settingsData.ragSettings?.minSourcesToShow || minResultsValue,
          maxSourcesToShow: settingsData.ragSettings?.maxSourcesToShow || 15
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

        // Debug: Log feature toggles from settings
        console.log('[ChatInterface] 🔧 Feature Toggles:', {
          enableSourceClick: config.enableSourceClick,
          enableSourceQuestionGeneration: config.enableSourceQuestionGeneration,
          enableKeywordHighlighting: config.enableKeywordHighlighting,
          rawData: {
            sourceClick: chatbotData.enableSourceClick,
            questionGenRag: settingsData.ragSettings?.enableSourceQuestionGeneration,
            questionGenChatbot: chatbotData.enableSourceQuestionGeneration
          }
        });

        // Debug: Log RAG settings
        console.log('[ChatInterface] 📊 RAG Settings:', {
          minResults: ragSettings.minResults,
          maxResults: ragSettings.maxResults,
          minSourcesToShow: ragSettings.minSourcesToShow,
          maxSourcesToShow: ragSettings.maxSourcesToShow,
          similarityThreshold: ragSettings.similarityThreshold,
          rawFromBackend: {
            minResults: settingsData.ragSettings?.minResults,
            maxResults: settingsData.ragSettings?.maxResults,
            minSourcesToShow: settingsData.ragSettings?.minSourcesToShow
          }
        });

        setChatbotSettings(config);
        setRagSettings(ragSettings);
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

  // Listen for settings updates - handles all 4 categories: rag, chatbot, llm, prompts
  // v12.15: Enhanced to support real-time updates from Settings panel
  useEffect(() => {
    const handleSettingsUpdate = async (event: CustomEvent<{ category: string; settings?: any }>) => {
      const { category, settings } = event.detail;
      console.log(`[ChatInterface] 🔄 Settings update received: category=${category}`);

      try {
        // RAG Settings refresh
        if (category === 'rag') {
          const ragRes = await fetch('/api/v2/settings?category=rag');
          if (ragRes.ok) {
            const ragData = await ragRes.json();
            const minResultsValue = ragData.ragSettings?.minResults || 7;
            const newRagSettings: ZenRagSettings = {
              minResults: minResultsValue,
              maxResults: ragData.ragSettings?.maxResults || 20,
              similarityThreshold: ragData.ragSettings?.similarityThreshold || 0.02,
              minSourcesToShow: ragData.ragSettings?.minSourcesToShow || minResultsValue,
              maxSourcesToShow: ragData.ragSettings?.maxSourcesToShow || 15
            };
            setRagSettings(newRagSettings);
            console.log('[ChatInterface] ✅ RAG settings refreshed:', newRagSettings);
          }
        }

        // Chatbot Settings refresh (UI, feature toggles)
        if (category === 'chatbot') {
          const chatbotRes = await fetch('/api/v2/chatbot/settings');
          if (chatbotRes.ok) {
            const chatbotData = await chatbotRes.json();
            // Also fetch RAG settings for feature toggles that are stored there
            const ragRes = await fetch('/api/v2/settings?category=rag');
            const ragData = ragRes.ok ? await ragRes.json() : {};

            setChatbotSettings(prev => ({
              ...prev,
              title: chatbotData.title || prev.title,
              subtitle: chatbotData.subtitle || prev.subtitle,
              logoUrl: chatbotData.logoUrl || prev.logoUrl,
              placeholder: chatbotData.placeholder || prev.placeholder,
              primaryColor: chatbotData.primaryColor || prev.primaryColor,
              enableSuggestions: chatbotData.enableSuggestions ?? prev.enableSuggestions,
              maxSuggestionCards: chatbotData.maxSuggestionCards || prev.maxSuggestionCards,
              welcomeMessage: chatbotData.welcomeMessage || prev.welcomeMessage,
              greeting: chatbotData.greeting || prev.greeting,
              enableSourceClick: chatbotData.enableSourceClick ?? prev.enableSourceClick,
              enableSourceQuestionGeneration: ragData.ragSettings?.enableSourceQuestionGeneration ?? chatbotData.enableSourceQuestionGeneration ?? prev.enableSourceQuestionGeneration,
              enableKeywordHighlighting: chatbotData.enableKeywordHighlighting ?? prev.enableKeywordHighlighting,
              enablePdfUpload: chatbotData.enablePdfUpload ?? prev.enablePdfUpload,
              enableVoiceInput: chatbotData.enableVoiceInput ?? prev.enableVoiceInput,
              enableVoiceOutput: chatbotData.enableVoiceOutput ?? prev.enableVoiceOutput,
              responseSchemaId: chatbotData.responseSchemaId || prev.responseSchemaId
            }));
            console.log('[ChatInterface] ✅ Chatbot settings refreshed');
          }
        }

        // LLM Settings refresh (model, temperature, maxTokens)
        if (category === 'llm') {
          const llmRes = await fetch('/api/v2/settings?category=llm');
          if (llmRes.ok) {
            const llmData = await llmRes.json();
            const newLlmSettings: ZenLlmSettings = {
              temperature: llmData.llmSettings?.temperature || 0.7,
              maxTokens: llmData.llmSettings?.maxTokens || 2048
            };
            setLlmSettings(newLlmSettings);
            // Also update activeChatModel in chatbotSettings
            if (llmData.llmSettings?.activeChatModel) {
              setChatbotSettings(prev => ({
                ...prev,
                activeChatModel: llmData.llmSettings.activeChatModel
              }));
            }
            console.log('[ChatInterface] ✅ LLM settings refreshed:', newLlmSettings);
          }
        }

        // Prompts refresh (active system prompt)
        if (category === 'prompts') {
          const promptsRes = await fetch('/api/v2/settings?category=prompts');
          if (promptsRes.ok) {
            const promptsData = await promptsRes.json();
            let promptsList = promptsData.prompts?.list || [];
            if (typeof promptsList === 'string') {
              try {
                promptsList = JSON.parse(promptsList);
              } catch (e) {
                promptsList = [];
              }
            }
            const activePromptObj = Array.isArray(promptsList)
              ? promptsList.find((p: { isActive?: boolean }) => p.isActive === true)
              : null;

            if (activePromptObj) {
              setActivePrompt({
                content: activePromptObj.systemPrompt || '',
                temperature: parseFloat(activePromptObj.temperature || '0.7'),
                maxTokens: parseInt(activePromptObj.maxTokens || '2048'),
                tone: activePromptObj.conversationTone || 'professional'
              });
              console.log('[ChatInterface] ✅ Active prompt refreshed:', activePromptObj.name);
            }
          }
        }
      } catch (error) {
        console.error(`[ChatInterface] Failed to refresh ${category} settings:`, error);
      }
    };

    window.addEventListener('settingsUpdated', handleSettingsUpdate as EventListener);
    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsUpdate as EventListener);
    };
  }, []);

  // Fetch PDF settings when token is available AND chatbot settings are loaded
  useEffect(() => {
    if (!token || !settingsLoaded) return;

    fetch('/api/v2/chat/pdf-settings', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          // PDF is enabled only if BOTH chatbot settings AND pdf-settings say enabled
          // chatbotSettings.enablePdfUpload is the master toggle
          const masterToggle = chatbotSettings.enablePdfUpload !== false;
          setPdfSettings({
            enabled: masterToggle && (data.enabled || false),
            maxSizeMB: data.maxSizeMB || 10,
            maxPages: data.maxPages || 30
          });
          console.log('[Zen01] PDF settings loaded:', { masterToggle, endpointEnabled: data.enabled });
        }
      })
      .catch(err => {
        console.error('[Zen01] Failed to fetch PDF settings:', err);
      });
  }, [token, settingsLoaded, chatbotSettings.enablePdfUpload]);

  // Fetch Voice settings when token is available
  // Voice settings - respect master toggles from chatbot settings
  useEffect(() => {
    if (!token || !settingsLoaded) return;

    // Master toggles from chatbot settings
    const masterInputToggle = chatbotSettings.enableVoiceInput !== false;
    const masterOutputToggle = chatbotSettings.enableVoiceOutput !== false;

    // If both master toggles are off, don't even fetch voice settings
    if (!masterInputToggle && !masterOutputToggle) {
      setVoiceSettings({
        enableVoiceInput: false,
        enableVoiceOutput: false,
        maxRecordingSeconds: 60
      });
      console.log('[Zen01] Voice features disabled by master toggles');
      return;
    }

    fetch('/api/v2/chat/voice-settings', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          // Apply master toggles - if master is OFF, voice feature stays OFF
          setVoiceSettings({
            enableVoiceInput: masterInputToggle && (data.enableVoiceInput || false),
            enableVoiceOutput: masterOutputToggle && (data.enableVoiceOutput || false),
            maxRecordingSeconds: data.maxRecordingSeconds || 60
          });
          console.log('[Zen01] Voice settings loaded (with master toggles):', {
            masterInput: masterInputToggle,
            masterOutput: masterOutputToggle,
            endpointInput: data.enableVoiceInput,
            endpointOutput: data.enableVoiceOutput
          });
        }
      })
      .catch(err => {
        console.error('[Zen01] Failed to fetch voice settings:', err);
      });
  }, [token, settingsLoaded, chatbotSettings.enableVoiceInput, chatbotSettings.enableVoiceOutput]);

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
          stream: ragSettings.streamingEnabled !== false, // Default true, can be disabled via settings
          // RAG settings for source retrieval
          ragSettings: {
            minResults: ragSettings.minResults,
            maxResults: ragSettings.maxResults,
            similarityThreshold: ragSettings.similarityThreshold,
            minSourcesToShow: ragSettings.minSourcesToShow
          }
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
          conversationId?: string;
        } = {};

        // Fetch sources with retry mechanism (streaming mode fix)
        const fetchSourcesWithRetry = async (retries = 2): Promise<typeof finalData> => {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              console.log(`[Streaming] Fetching sources (attempt ${attempt}/${retries})...`);
              const startTime = Date.now();

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
                  stream: false,
                  ragSettings: {
                    minResults: ragSettings.minResults,
                    maxResults: ragSettings.maxResults,
                    similarityThreshold: ragSettings.similarityThreshold,
                    minSourcesToShow: ragSettings.minSourcesToShow
                  }
                }),
              });

              const elapsed = Date.now() - startTime;
              console.log(`[Streaming] Sources fetch response: status=${finalResponse.status}, ok=${finalResponse.ok}, elapsed=${elapsed}ms`);

              if (finalResponse.ok) {
                const data = await finalResponse.json();
                console.log(`[Streaming] Sources fetched successfully: ${data.sources?.length || 0} sources`);
                return data;
              } else {
                console.warn(`[Streaming] Sources fetch failed: HTTP ${finalResponse.status} ${finalResponse.statusText}`);
                if (attempt < retries) {
                  console.log(`[Streaming] Retrying in 500ms...`);
                  await new Promise(r => setTimeout(r, 500));
                }
              }
            } catch (error) {
              console.error(`[Streaming] Sources fetch error (attempt ${attempt}):`, error);
              if (attempt < retries) {
                console.log(`[Streaming] Retrying in 500ms...`);
                await new Promise(r => setTimeout(r, 500));
              }
            }
          }
          console.error('[Streaming] All retry attempts failed for sources fetch');
          return {};
        };

        finalData = await fetchSourcesWithRetry(2);

        // 🔍 DEBUG: Log finalData structure for citation debugging
        console.log('[Streaming] finalData received:', {
          hasSources: !!finalData.sources,
          sourcesLength: finalData.sources?.length || 0,
          fastMode: finalData.fastMode,
          hasResponse: !!finalData.response,
          keys: Object.keys(finalData)
        });

        // Check if sources fetch failed (empty finalData means all retries failed)
        const sourcesFetchFailed = !finalData.sources && !finalData.fastMode && Object.keys(finalData).length === 0;
        if (sourcesFetchFailed) {
          console.warn('[Streaming] Sources could not be loaded - showing warning to user');
        }

        // Save conversation ID if returned
        if (finalData.conversationId && !conversationId) {
          setConversationId(finalData.conversationId);
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
              fastMode: finalData.fastMode,
              sourcesFetchFailed // Flag for UI to show warning
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

  // Create source click handler with dynamic question generation toggle
  const handleSourceClick = React.useMemo(() =>
    createEnhancedSourceClickHandler(
      () => inputText,
      setInputText,
      () => textareaRef.current?.focus(),
      {
        includeCrossSourceContext: true,
        includeRelevanceContext: true,
        maxSemanticTerms: 3,
        queryStyle: 'detailed',
        enableQuestionGeneration: chatbotSettings.enableSourceQuestionGeneration
      }
    ),
    [chatbotSettings.enableSourceQuestionGeneration, inputText, setInputText]
  );

  // Handle slash commands (translation, navigation, suggestion, etc.)
  const handleSlashCommand = async (command: SlashCommand) => {
    console.log('[SlashCommand] Triggered:', command);

    // Handle navigation commands
    if (command.category === 'navigation') {
      if (command.id === 'history') {
        setIsSuggestOpen(false); // Close suggest panel if open
        await fetchConversations();
        setIsHistoryOpen(true);
      } else if (command.id === 'new') {
        handleNewConversation();
      }
      return;
    }

    // Handle suggestion commands - open suggest panel
    if (command.category === 'suggestion') {
      if (command.conversationId) {
        // Submenu item selected - load conversation
        handleSelectConversation(command.conversationId);
      } else {
        // Main command - open suggest panel
        setIsHistoryOpen(false); // Close history panel if open
        await fetchConversations();
        setIsSuggestOpen(true);
      }
      return;
    }

    if (command.category === 'translation') {
      // Find last assistant message
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');

      if (!lastAssistantMsg) {
        toast({
          title: 'Çeviri yapılamadı',
          description: 'Çevrilecek mesaj bulunamadı',
          variant: 'destructive'
        });
        return;
      }

      // Check for token
      if (!token) {
        toast({
          title: 'Çeviri yapılamadı',
          description: 'Oturum bulunamadı, lütfen tekrar giriş yapın',
          variant: 'destructive'
        });
        return;
      }

      // Check if already translated to same language - toggle instead
      const existingTranslation = messageTranslations.get(lastAssistantMsg.id);
      if (existingTranslation?.targetLanguage === command.targetLanguage) {
        // Toggle between original and translated
        setMessageTranslations(prev => {
          const newMap = new Map(prev);
          newMap.set(lastAssistantMsg.id, {
            ...existingTranslation,
            isShowingTranslation: !existingTranslation.isShowingTranslation
          });
          return newMap;
        });
        return;
      }

      // Call translation API
      try {
        setIsTranslating(true);
        const translateUrl = getEndpoint('chat', 'translate');
        console.log('[SlashCommand] Calling translate API:', translateUrl);

        const response = await fetch(translateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            text: lastAssistantMsg.content,
            targetLanguage: command.targetLanguage
          })
        });

        console.log('[SlashCommand] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[SlashCommand] Translation error:', errorText);
          throw new Error(`Translation failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('[SlashCommand] Translation success:', data);

        // Store translation
        setMessageTranslations(prev => {
          const newMap = new Map(prev);
          newMap.set(lastAssistantMsg.id, {
            originalContent: lastAssistantMsg.content,
            translatedContent: data.translatedText,
            targetLanguage: command.targetLanguage!,
            isShowingTranslation: true
          });
          return newMap;
        });

        toast({
          title: 'Çeviri tamamlandı',
          description: `Mesaj ${command.label} diline çevrildi`
        });

      } catch (error) {
        console.error('Translation error:', error);
        toast({
          title: 'Çeviri başarısız',
          description: 'Lütfen tekrar deneyin',
          variant: 'destructive'
        });
      } finally {
        setIsTranslating(false);
      }
    }
  };

  // Toggle translation for a message
  const handleToggleTranslation = (messageId: string) => {
    const translation = messageTranslations.get(messageId);
    if (translation) {
      setMessageTranslations(prev => {
        const newMap = new Map(prev);
        newMap.set(messageId, {
          ...translation,
          isShowingTranslation: !translation.isShowingTranslation
        });
        return newMap;
      });
    }
  };

  // Start a new conversation
  const handleNewConversation = () => {
    setMessages([]);
    setMessageTranslations(new Map());
    setConversationId(undefined);
    setShowSuggestions(chatbotSettings.enableSuggestions);
    setIsHistoryOpen(false);

    // Refresh suggestions
    if (typeof window !== 'undefined') {
      fetchSuggestedQuestions().then(questions => {
        setSuggestedQuestions(questions);
      });
    }

    toast({
      title: 'Yeni konuşma',
      description: 'Yeni bir konuşma başlatıldı'
    });
  };

  // Select and load a conversation from history
  const handleSelectConversation = async (id: string) => {
    const conversation = await loadConversation(id);
    if (conversation) {
      // Transform database messages to ZenMessage format
      const transformedMessages: ZenMessageType[] = conversation.messages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at),
        sources: (msg.sources || []) as ZenSource[],
        isFromSource: false
      }));

      setMessages(transformedMessages);
      setConversationId(id);
      setMessageTranslations(new Map());
      setShowSuggestions(false);
      setIsHistoryOpen(false);

      toast({
        title: 'Konuşma yüklendi',
        description: `${conversation.title || 'Adsız konuşma'}`
      });
    } else {
      toast({
        title: 'Yükleme başarısız',
        description: 'Konuşma yüklenemedi',
        variant: 'destructive'
      });
    }
  };

  // Delete a conversation from history
  const handleDeleteConversation = async (id: string) => {
    const success = await deleteConversation(id);
    if (success) {
      // If we deleted the current conversation, start fresh
      if (conversationId === id) {
        handleNewConversation();
      }
      toast({
        title: 'Konuşma silindi',
        description: 'Konuşma başarıyla silindi'
      });
    } else {
      toast({
        title: 'Silme başarısız',
        description: 'Konuşma silinemedi',
        variant: 'destructive'
      });
    }
  };

  const clearChat = () => {
    setMessages([]);
    setMessageTranslations(new Map()); // Clear translations too
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
        className={`zen01-container ${isDark ? 'dark' : 'light'}`}
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
        <div className="relative z-10 pt-20 pb-32 max-w-5xl mx-auto w-full px-4 overflow-hidden">
          <ScrollArea className="h-[calc(100vh-13rem)] zen01-scroll">
            <div className="space-y-6 py-4 pr-4">
              {/* Welcome Screen - only render after settings are loaded */}
              {isClient && settingsLoaded && messages.length === 0 && (
                <ZenWelcome
                  chatbotSettings={chatbotSettings}
                  user={user}
                  recentConversations={conversations.slice(0, 12).map(c => ({ id: c.id, title: c.title || 'Adsız konuşma' }))}
                  onConversationClick={handleSelectConversation}
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
                    voiceOutputEnabled={voiceSettings.enableVoiceOutput}
                    enableSourceClick={chatbotSettings.enableSourceClick}
                    enableKeywordHighlighting={chatbotSettings.enableKeywordHighlighting}
                    responseSchemaId={chatbotSettings.responseSchemaId}
                    minSourcesToShow={ragSettings.minSourcesToShow}
                    translation={messageTranslations.get(message.id)}
                    onToggleTranslation={() => handleToggleTranslation(message.id)}
                  />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Floating Input with History & Suggest Panels */}
        <ZenInput
          value={inputText}
          onChange={setInputText}
          onSend={(pdf) => handleSendMessage(false, pdf)}
          placeholder={chatbotSettings.placeholder}
          isLoading={isLoading || isTranslating}
          textareaRef={textareaRef}
          pdfSettings={pdfSettings}
          pdfFile={pdfFile}
          onPdfSelect={setPdfFile}
          voiceSettings={voiceSettings}
          onSlashCommand={handleSlashCommand}
          recentConversations={conversations.slice(0, 12).map(c => ({ id: c.id, title: c.title || 'Adsız konuşma' }))}
          historyPanel={
            <ZenHistoryPanel
              isOpen={isHistoryOpen}
              onClose={() => setIsHistoryOpen(false)}
              conversations={conversations}
              isLoading={isHistoryLoading}
              currentConversationId={conversationId}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onDeleteConversation={handleDeleteConversation}
            />
          }
          suggestPanel={
            <ZenSuggestPanel
              isOpen={isSuggestOpen}
              onClose={() => setIsSuggestOpen(false)}
              suggestions={suggestedQuestions}
              isLoading={isSuggestionsLoading}
              onSelectSuggestion={handleSuggestionClick}
            />
          }
        />

      </div>
    </ProtectedRoute>
  );
}
