'use client';

import debug from '@/lib/debug';

import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import config, { getEndpoint } from '@/config/api.config';
import { safeJsonParse } from '@/lib/auth-fetch';
import {
  Send,
  Bot,
  User,
  Loader2,
  RefreshCw,
  Brain,
  ChevronRight,
  ExternalLink,
  ChevronDown,
  LogOut,
  UserCircle,
  Cpu,
  Plus,
  Settings,
  LayoutDashboard,
  MessageSquare,
  Search
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthProvider';
import { createEnhancedSourceClickHandler } from '@/utils/semantic-search-enhancement';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { SmartAutocomplete } from '@/components/chat/SmartAutocomplete';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
  relatedTopics?: any[];
  context?: string[];
  suggestedQuestions?: string[];  // Clickable suggestions for NEEDS_CLARIFICATION
  isTyping?: boolean;
  isFromSource?: boolean;
  isStreaming?: boolean;
  isError?: boolean;
  responseTime?: number; // Response time in milliseconds
  startTime?: number; // Start timestamp for calculating response time
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
}

const getSourceTableName = (sourceTable?: string) => {
  // Format source table name dynamically (same logic as backend)
  if (!sourceTable) return 'Kaynak';

  return sourceTable
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
};

const getKeywordColor = (keyword: string, isBoosted: boolean = false): string => {
  // Boosted keywords (from user query) get yellow highlighting - improved dark mode contrast
  if (isBoosted) {
    return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-amber-900/70 dark:text-amber-100';
  }

  const colors = [
    'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/70 dark:text-blue-100',
    'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/70 dark:text-green-100',
    'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/70 dark:text-purple-100',
    'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/70 dark:text-orange-100',
    'bg-pink-100 text-pink-700 hover:bg-pink-200 dark:bg-pink-900/70 dark:text-pink-100'
  ];

  const index = keyword.length % colors.length;
  return colors[index];
};

// Memoized StreamingTimer component - isolates re-renders to just this component
const StreamingTimer = memo(({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100); // Update every 100ms for smoother display
    return () => clearInterval(interval);
  }, [startTime]);

  const seconds = (elapsed / 1000).toFixed(1);
  return <span className="text-xs text-muted-foreground">{seconds}s</span>;
});
StreamingTimer.displayName = 'StreamingTimer';

// Static markdown components - defined outside component to prevent recreation on every render
const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-base sm:text-lg font-bold mt-4 mb-2 pb-1 border-b border-border">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-sm sm:text-base font-semibold mt-4 mb-2">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xs sm:text-sm font-semibold mt-3 mb-1">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-xs sm:text-sm my-2 leading-relaxed">
      {children}
    </p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">
      {children}
    </strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside ml-4 my-2 space-y-1 text-xs sm:text-sm">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside ml-4 my-2 space-y-1 text-xs sm:text-sm">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="pl-1">
      {children}
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 pl-3 py-2 my-3 text-amber-800 dark:text-amber-200 italic text-xs sm:text-sm">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    ) : (
      <code className="block bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto">
        {children}
      </code>
    );
  },
};

export default function ChatInterface() {
  const { token, user, logout } = useAuth();

  // Chatbot settings state - NO hardcoded defaults, will load from database
  const [chatbotSettings, setChatbotSettings] = useState({
    title: '',
    subtitle: '',
    logoUrl: '',
    welcomeMessage: '',  // Welcome message from settings
    placeholder: '',
    primaryColor: '',
    activeChatModel: '',
    enableSuggestions: true, // Default to true, will be overridden by DB
    suggestionCount: 4 // Default to 4, will be overridden by DB
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Cache for suggestions (2 minutes for more variety)
  const suggestionsCache = useRef<{ data: string[], timestamp: number } | null>(null);
  const SUGGESTIONS_CACHE_TTL = 60 * 60 * 1000; // 1 hour - no auto-refresh needed

  // Fetch popular questions from backend with cache
  const fetchSuggestedQuestions = async () => {
    // Check cache first
    if (suggestionsCache.current) {
      const age = Date.now() - suggestionsCache.current.timestamp;
      if (age < SUGGESTIONS_CACHE_TTL) {
        debug.log('📋 Using cached suggestions');
        return suggestionsCache.current.data;
      }
    }

    try {
      debug.log('🔄 Fetching fresh suggestions from backend...');

      // Fetch from backend with auth (endpoint requires authentication)
      const response = await fetch(getEndpoint('chat', 'suggestions'), {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await safeJsonParse(response);
        if (!data) return [];
        const suggestions = data.suggestions || [];

        // Update cache
        suggestionsCache.current = {
          data: suggestions,
          timestamp: Date.now()
        };
        return suggestions;
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }

    // No fallback - don't show anything if API fails
    return [];
  };

  // Start with empty messages - no welcome message
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [inputText, setInputText] = useState('');
  // Consolidated loading state to reduce re-renders during message send
  const [loadingState, setLoadingState] = useState({
    isLoading: false,
    isStreaming: false,
    streamingMessageId: null as string | null
  });
  // Destructure for backward compatibility
  const { isLoading, isStreaming, streamingMessageId } = loadingState;
  const [showSuggestions, setShowSuggestions] = useState(true);
  // Timer state removed - now using isolated StreamingTimer component
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [visibleSourcesCount, setVisibleSourcesCount] = useState<{ [key: string]: number }>({});
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{provider: string, model: string, displayName: string, description: string}>>([]);
  const [currentModel, setCurrentModel] = useState<string>('Claude');
  const [lastUserQuery, setLastUserQuery] = useState<string>(''); // For keyword boost highlighting
  const [keyTerms, setKeyTerms] = useState<string[]>([]); // Schema keyTerms for autocomplete
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // RAG and LLM Settings from backend
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

  // Update page title when chatbot settings are loaded
  useEffect(() => {
    if (settingsLoaded && chatbotSettings.title) {
      document.title = chatbotSettings.title;
    }
  }, [settingsLoaded, chatbotSettings.title]);

  // Initialize suggestions when settings are loaded
  useEffect(() => {
    if (settingsLoaded && messages.length === 0) {
      setShowSuggestions(chatbotSettings.enableSuggestions);
    }
  }, [settingsLoaded, chatbotSettings.enableSuggestions]);

  // Shuffle suggestions only once and keep them stable
  const [shuffledSuggestions, setShuffledSuggestions] = useState<string[]>([]);

  // When suggestedQuestions change, shuffle once and store
  // Uses suggestionCount from settings (dynamic)
  useEffect(() => {
    if (suggestedQuestions.length === 0) {
      setShuffledSuggestions([]);
      return;
    }

    const unique = Array.from(new Set(suggestedQuestions));
    // Deterministic shuffle using first question's hash as seed
    const seed = unique[0]?.charCodeAt(0) || 1;
    const shuffled = [...unique];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(((i + 1) * seed * 7) % shuffled.length);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Use dynamic count from settings
    const count = chatbotSettings.suggestionCount || 4;
    setShuffledSuggestions(shuffled.slice(0, count));
  }, [suggestedQuestions, chatbotSettings.suggestionCount]);

  // Use stable shuffled suggestions
  const memoizedSuggestions = shuffledSuggestions;

  // Client-side'da olduğumuzu işaretle ve soruları yükle
  useEffect(() => {
    setIsClient(true);

    // Fetch popular questions from backend immediately
    const loadSuggestions = async () => {
      setIsSuggestionsLoading(true);
      const questions = await fetchSuggestedQuestions();
      setSuggestedQuestions(questions);
      setIsSuggestionsLoading(false);
    };

    loadSuggestions();

    // No auto-refresh - suggestions are stable and don't need frequent updates
    // If user wants fresh suggestions, they can refresh the page

    // Fetch chatbot settings, RAG settings, LLM settings, and active prompt
    Promise.all([
      fetch('/api/v2/chatbot/settings'),
      fetch('/api/v2/settings?category=llm'),
      fetch('/api/v2/settings?category=rag'),
      fetch('/api/v2/settings?category=prompts')
    ])
      .then(async ([chatbotRes, llmRes, ragRes, promptsRes]) => {
        const chatbotData = chatbotRes.ok ? await safeJsonParse(chatbotRes) || {} : {};
        const llmData = llmRes.ok ? await safeJsonParse(llmRes) || {} : {};
        const ragData = ragRes.ok ? await safeJsonParse(ragRes) || {} : {};
        const promptsData = promptsRes.ok ? await safeJsonParse(promptsRes) || {} : {};

        // Merge all settings
        const settingsData = {
          llmSettings: llmData.llmSettings || {},
          openai: llmData.openai || {},
          anthropic: llmData.anthropic || {},
          google: llmData.google || {},
          ragSettings: ragData.ragSettings || {},
          prompts: promptsData.prompts || {}
        };

        // Find active prompt from prompts.list array (NEW FORMAT)
        const promptsList = settingsData.prompts?.list || [];
        const activePromptObj = promptsList.find((p: any) => p.isActive === true);

        let activePromptData = {};
        if (activePromptObj) {
          activePromptData = {
            content: activePromptObj.systemPrompt || '',
            temperature: parseFloat(activePromptObj.temperature || '0.7'),
            maxTokens: parseInt(activePromptObj.maxTokens || '2048'),
            conversationTone: activePromptObj.conversationTone || 'professional'
          };
          debug.log('✅ [ChatInterface] Active prompt loaded:', {
            name: activePromptObj.name,
            temperature: activePromptData.temperature,
            maxTokens: activePromptData.maxTokens
          });
        } else {
          debug.log('⚠️ [ChatInterface] No active prompt found, using LLM defaults');
        }

        // CRITICAL: NO fallback defaults - use ONLY what's in database
        const config = {
          title: chatbotData.title || '',
          subtitle: chatbotData.subtitle || '',
          logoUrl: chatbotData.logoUrl || '',
          welcomeMessage: chatbotData.welcomeMessage || '',  // Welcome message from settings
          placeholder: chatbotData.placeholder || '',  // NO fallback
          primaryColor: chatbotData.primaryColor || '',  // NO fallback
          activeChatModel: settingsData.llmSettings?.activeChatModel || '',  // NO fallback - must be configured
          enableSuggestions: chatbotData.enableSuggestions !== undefined ? chatbotData.enableSuggestions : true,
          // Support both maxSuggestionCards (UI) and suggestionCount (legacy)
          suggestionCount: chatbotData.maxSuggestionCards || chatbotData.suggestionCount || 4
        };

        // Extract RAG settings
        const rag = {
          minResults: settingsData.ragSettings?.minResults || 7,
          maxResults: settingsData.ragSettings?.maxResults || 20,
          similarityThreshold: settingsData.ragSettings?.similarityThreshold || 0.02
        };

        // Extract LLM settings
        const llm = {
          temperature: settingsData.llmSettings?.temperature || 0.7,
          maxTokens: settingsData.llmSettings?.maxTokens || 2048
        };

        // Get active prompt (already extracted above)
        const prompt = activePromptObj ? {
          content: activePromptData.content || '',
          temperature: activePromptData.temperature || llm.temperature,
          maxTokens: activePromptData.maxTokens || llm.maxTokens,
          tone: activePromptData.conversationTone || 'professional'
        } : {
          content: '',
          temperature: llm.temperature,
          maxTokens: llm.maxTokens,
          tone: 'professional'
        };

        debug.log('🤖 Chatbot initialized with full config:', {
          title: config.title,
          activeChatModel: config.activeChatModel,
          ragSettings: rag,
          llmSettings: llm,
          activePrompt: { hasContent: !!prompt.content, temperature: prompt.temperature, tone: prompt.tone }
        });

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

    // Fetch available models with force refresh to avoid caching
    fetchAvailableModels(true);

    // Fetch schema keyTerms for autocomplete
    fetch('/api/v2/data-schema/llm-config', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const terms = data.config?.keyTerms || [];
          setKeyTerms(terms);
          debug.log('📚 [ChatInterface] KeyTerms loaded:', terms.length);
        }
      })
      .catch(err => debug.log('KeyTerms fetch error:', err));

    // No interval to cleanup - suggestions are fetched once and cached
  }, [token]);

  // Timer useEffect removed - now using isolated StreamingTimer component

  // Fetch available models
  const fetchAvailableModels = async (forceRefresh = false) => {
    try {
      // Use relative URL to leverage Next.js rewrites
      const baseUrl = '/api/v2/settings';
      const url = forceRefresh
        ? `${baseUrl}?t=${Date.now()}`
        : baseUrl;

      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (response.ok) {
        const settings = await response.json();
        debug.log('Fetched settings:', settings);
        const models = [];

        if (settings.openai?.apiKey) {
          debug.log('OpenAI API key found, adding OpenAI models');
          models.push({
            provider: 'openai',
            model: 'openai/gpt-4o',
            displayName: 'ChatGPT',
            description: 'OpenAI GPT'
          });
        } else {
          debug.log('OpenAI API key NOT found, skipping OpenAI models');
        }
        if (settings.anthropic?.apiKey) {
          // Add Claude 3.5 models only
          models.push({
            provider: 'anthropic',
            model: 'anthropic/claude-3-5-sonnet-20241022',
            displayName: 'Claude 3.5 Sonnet',
            description: 'Anthropic Claude 3.5 Sonnet'
          });
          models.push({
            provider: 'anthropic',
            model: 'anthropic/claude-3-5-haiku-20241022',
            displayName: 'Claude 3.5 Haiku',
            description: 'Anthropic Claude 3.5 Haiku (Fast)'
          });
        }
        if (settings.google?.apiKey) {
          debug.log('Adding Google/Gemini models');
          models.push({
            provider: 'google',
            model: 'google/gemini-1.5-pro',
            displayName: 'Gemini',
            description: 'Google Gemini'
          });
        } else {
          debug.log('Google API key not found');
        }
        if (settings.deepseek?.apiKey) {
          debug.log('Adding DeepSeek models');
          models.push({
            provider: 'deepseek',
            model: 'deepseek/deepseek-chat',
            displayName: 'DeepSeek',
            description: 'DeepSeek AI'
          });
        } else {
          debug.log('DeepSeek API key not found');
        }

        setAvailableModels(models);

        // Set current model based on chatbotSettings.activeChatModel
        if (chatbotSettings.activeChatModel && models.length > 0) {
          const activeModel = models.find(m => m.model === chatbotSettings.activeChatModel);
          if (activeModel) {
            setCurrentModel(activeModel.displayName);
              debug.log(`Set active model: ${activeModel.displayName} (${activeModel.model})`);
          } else {
            // Fallback to first available model
            setCurrentModel(models[0].displayName);
              debug.log(`Set fallback model: ${models[0].displayName}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  };

  // Switch model
  const switchModel = async (model: string) => {
    try {
      const response = await fetch('/api/v2/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llmSettings: {
            activeChatModel: model
          }
        })
      });

      if (response.ok) {
        debug.log(`Model switched to: ${model}`);

        // Update local state immediately for better UX
        setChatbotSettings(prev => ({
          ...prev,
          activeChatModel: model
        }));

        // Also update the currentModel display name
        const selectedModel = availableModels.find(m => m.model === model);
        if (selectedModel) {
          setCurrentModel(selectedModel.displayName);
        }

        // Force refresh available models with a cache-busting parameter
        await fetchAvailableModels(true);
      }
    } catch (error) {
      console.error('Error switching model:', error);
    }
  };

  // Listen for tag click events from SourceCitation component
  useEffect(() => {
    const handleTagClick = (event: CustomEvent) => {
      const { query } = event.detail;
      setInputText(query);
      textareaRef.current?.focus();
    };

    window.addEventListener('tagClick', handleTagClick as EventListener);
    return () => {
      window.removeEventListener('tagClick', handleTagClick as EventListener);
    };
  }, []);

  // Listen for addToInput events from SourceCitation component
  useEffect(() => {
    const handleAddToInput = (event: CustomEvent) => {
      const query = event.detail;
      setInputText(query);
      textareaRef.current?.focus();
    };

    // Listen for settings updates to refresh available models
    const handleSettingsUpdate = () => {
      debug.log('Settings updated, clearing models and refreshing...');
      setAvailableModels([]); // Clear models first
      fetchAvailableModels(true);
    };

    window.addEventListener('addToInput', handleAddToInput as EventListener);
    window.addEventListener('settingsUpdated', handleSettingsUpdate);

    return () => {
      window.removeEventListener('addToInput', handleAddToInput as EventListener);
      window.removeEventListener('settingsUpdated', handleSettingsUpdate);
    };
  }, []);

  // Extract minimal meaningful keywords from title
  const getSemanticKeywords = (source: Record<string, unknown>) => {
    const keywords: string[] = [];
    const boostedKeywords: string[] = []; // Keywords from user query (keyword boost)

    // Extract keywords from user's query for keyword boost highlighting
    if (lastUserQuery) {
      const queryWords = lastUserQuery.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2) // Ignore very short words
        .filter(word => !['için', 'ile', 'var', 'yok', 'bir', 'olan', 'nedir', 'nasıl'].includes(word)); // Exclude stop words

      const title = ((source.title as string) || '').toLowerCase();
      const content = ((source.content as string) || (source.excerpt as string) || '').toLowerCase();
      const text = title + ' ' + content;

      queryWords.forEach(word => {
        if (text.includes(word) && !boostedKeywords.includes(word)) {
          boostedKeywords.push(word);
        }
      });
    }

    // Add boosted keywords first (these matched user's query)
    keywords.push(...boostedKeywords.slice(0, 2));

    // Add category as tag
    if (source.category && !keywords.includes(source.category as string)) {
      keywords.push(source.category as string);
    }

    // Backend should provide keywords
    if (source.keywords && Array.isArray(source.keywords) && source.keywords.length > 0) {
      keywords.push(...source.keywords.slice(0, 2));
    } else {
      // Simple extraction from title
      const title = (source.title as string) || '';
      const content = (source.content as string) || (source.excerpt as string) || '';
      const text = (title + ' ' + content).toLowerCase();

      // Common legal/tax terms
      const legalTerms = [
        'vergi', 'tazminat', 'sözleşme', 'kanun', 'yönetmelik', 'tebliğ',
        'karar', 'emsal', 'istisna', 'muafiyet', 'oran', 'tutar', 'süre',
        'başvuru', 'dava', 'itiraz', 'uzlaşma', 'tarhiyat', 'ceza',
        'kıdem', 'ihbar', 'işçi', 'işveren', 'mükellef', 'beyan'
      ];

      legalTerms.forEach(term => {
        if (text.includes(term) && keywords.length < 5) {
          keywords.push(term);
        }
      });

      // Extract tax types
      if (title.includes('KDV') && keywords.length < 5) keywords.push('KDV');
      if (title.includes('Stopaj') && keywords.length < 5) keywords.push('Stopaj');
      if (title.includes('ÖTV') && keywords.length < 5) keywords.push('ÖTV');
      if (title.includes('Damga') && keywords.length < 5) keywords.push('Damga Vergisi');
      if (title.includes('Gelir Vergisi') && keywords.length < 5) keywords.push('Gelir Vergisi');
      if (title.includes('Kurumlar Vergisi') && keywords.length < 5) keywords.push('Kurumlar Vergisi');

      // Extract percentages
      const percentMatch = title.match(/(\d+)%/);
      if (percentMatch && keywords.length < 5) keywords.push(`${percentMatch[1]}%`);
    }

    return keywords.slice(0, 5);
  };

  // Tag click disabled - only source click generates questions
  // const handleKeywordClick = (source: Record<string, unknown>, keyword: string) => {
  //   const searchQuery = `${keyword} ${source.title || ''}`.trim();
  //   setInputText(searchQuery);
  //   textareaRef.current?.focus();
  // };

  const handleSendMessage = useCallback(async (fromSource: boolean = false) => {
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
    setLastUserQuery(inputText); // Save for keyword boost highlighting
    setInputText('');
    setLoadingState(prev => ({ ...prev, isLoading: true }));
    setShowSuggestions(false);

    // Create empty streaming message
    const messageId = (Date.now() + 1).toString();
    const messageStartTime = Date.now(); // Track start time for response time calculation
    const streamingMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      startTime: messageStartTime,
    };
    setMessages(prev => [...prev, streamingMessage]);
    // Update streaming state in single call
    setLoadingState({ isLoading: true, isStreaming: true, streamingMessageId: messageId });

    try {
      // Use active prompt settings if available, otherwise fall back to LLM settings
      const temperature = activePrompt.content ? activePrompt.temperature : llmSettings.temperature;
      const maxTokens = activePrompt.content ? activePrompt.maxTokens : llmSettings.maxTokens;
      const systemPrompt = activePrompt.content || undefined;

      debug.log('📤 Sending chat request with settings:', {
        model: chatbotSettings.activeChatModel,
        temperature,
        maxTokens,
        hasSystemPrompt: !!systemPrompt,
        promptLength: systemPrompt?.length || 0
      });

      const response = await fetch(getEndpoint('chat', 'send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageContent,
          conversationId: conversationId, // Include conversation ID for session continuity
          model: chatbotSettings.activeChatModel,  // CRITICAL: Send model to backend!
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
        console.error('Chat API error:', response.status, errorText);

        // Parse error if possible
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // If not JSON, use raw text
          errorData = { error: errorText };
        }

        // Handle authentication errors (401) - logout and redirect
        if (response.status === 401 && (errorData.code === 'TOKEN_INVALID' || errorData.code === 'TOKEN_MISSING' || errorData.code === 'TOKEN_EXPIRED')) {
          console.error('🔒 [ChatInterface] Authentication failed - token invalid or expired, logging out');

          // Clear streaming message and reset loading state
          setMessages(prev => prev.filter(msg => msg.id !== messageId));
          setLoadingState({ isLoading: false, isStreaming: false, streamingMessageId: null });

          // Logout will clear tokens and redirect to login page
          logout();
          return;
        }

        // Handle subscription limit error specifically
        if (response.status === 429 && errorData.code === 'QUERY_LIMIT_EXCEEDED') {
          const subscriptionMessage = user?.role === 'admin'
            ? 'Admin kullanıcılarsınız sınırsız erişiminiz olmalıdır. Ancak teknik bir sorun oluştuğunu görüyoruz.'
            : 'Üzgünüm, aylık soru limitinizi doldurdunuz. devam etmek için lütfen abonelik paketinizi yükseltin veya bir yönetici ile iletişime geçin.';

          setMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: subscriptionMessage,
                  isStreaming: false,
                  isError: true
                }
              : msg
          ));
          return;
        }

        throw new Error(`Failed to get response: ${response.status} - ${errorText}`);
      }

      // Check if response is SSE stream or JSON
      const contentType = response.headers.get('content-type') || '';
      const isStreamingResponse = contentType.includes('text/event-stream');

      // Handle streaming response (SSE)
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
                    msg.id === messageId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  ));
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }

        // Get final sources and metadata
        let finalData: any = {};
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
            debug.log('📦 Final data received:', {
              hasSources: !!finalData.sources,
              sourcesCount: finalData.sources?.length || 0,
              sources: finalData.sources?.map((s: any) => ({
                title: s.title?.substring(0, 30),
                contentLength: s.content?.length || 0,
                excerptLength: s.excerpt?.length || 0
              }))
            });
          }
        } catch (e) {
          console.error('Failed to get final data:', e);
        }

        // Finalize message - KEEP the accumulated content and ADD sources
        debug.log('Setting sources on message:', finalData.sources?.length || 0, 'sources');
        debug.log('Accumulated content length:', accumulatedContent.length);

        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? {
                ...msg,
                content: accumulatedContent || finalData.response || msg.content, // Keep accumulated content
                isStreaming: false,
                sources: finalData.sources,
                relatedTopics: finalData.relatedTopics,
                context: finalData.context,
                responseTime: msg.startTime ? Date.now() - msg.startTime : undefined,
                tokens: finalData.tokens || finalData.usage
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
                content: data.message?.content || data.response || data.message || 'Üzgünüm, bir hata oluştu.',
                isStreaming: false,
                sources: data.sources,
                relatedTopics: data.relatedTopics,
                context: data.context,
                suggestedQuestions: data.suggestedQuestions,  // "Did you mean?" suggestions
                responseTime: msg.startTime ? Date.now() - msg.startTime : undefined,
                tokens: data.tokens || data.usage
              }
            : msg
        ));
      }
    } catch (error) {
      console.error('Chat error:', error);

      // Check if it's a subscription error that wasn't handled above
      const errorMessage = error instanceof Error ? error.message : '';

      let userFriendlyMessage = 'Üzgünüm, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.';

      // More specific check for 429 status - only match HTTP status format, not arbitrary '429' in text
      const is429Error = errorMessage.includes(': 429') || errorMessage.includes('status 429') || errorMessage.includes('QUERY_LIMIT_EXCEEDED');
      if (is429Error) {
        userFriendlyMessage = user?.role === 'admin'
          ? 'Admin kullanıcılarsınız sınırsız erişiminiz olmalıdır. Ancak teknik bir sorun oluştuğunu görüyoruz. Lütfen sistem yöneticisi ile iletişime geçin.'
          : 'Üzgünüm, aylık soru limitinizi doldurdunuz. devam etmek için lütfen abonelik paketinizi yükseltin veya bir yönetici ile iletişime geçin.';
      } else if (errorMessage.includes('401') || errorMessage.includes('TOKEN')) {
        userFriendlyMessage = 'Oturumunuzun süresi dolmuş. Lütfen tekrar giriş yapın.';
      } else if (errorMessage.includes('403') || errorMessage.includes('SUBSCRIPTION')) {
        userFriendlyMessage = 'Bu özelliği kullanmak için aktif bir abonelik gereklidir. Lütfen abonelik paketinizi yükseltin.';
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
      // Reset all loading state in single call
      setLoadingState({ isLoading: false, isStreaming: false, streamingMessageId: null });
    }
  }, [inputText, isLoading, isStreaming, token, conversationId, chatbotSettings.activeChatModel, activePrompt, llmSettings, user, logout]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleSuggestionClick = useCallback((question: string) => {
    setInputText(question);
    textareaRef.current?.focus();
  }, []);

  // Static options for source click handler - memoized to prevent recreation
  const sourceClickOptions = useMemo(() => ({
    includeCrossSourceContext: true,
    includeRelevanceContext: true,
    maxSemanticTerms: 3,
    queryStyle: 'detailed' as const
  }), []);

  // Create enhanced source click handler with semantic search capabilities
  const handleSourceClick = createEnhancedSourceClickHandler(
    () => inputText,
    setInputText,
    () => textareaRef.current?.focus(),
    sourceClickOptions
  );

  const clearChat = useCallback(() => {
    // Clear messages and reset to initial state
    setMessages([]);
    setShowSuggestions(chatbotSettings.enableSuggestions);
    setConversationId(undefined); // Clear conversation ID for new session

    // Fetch new suggestions
    if (typeof window !== 'undefined') {
      setIsSuggestionsLoading(true);
      fetchSuggestedQuestions().then(questions => {
        setSuggestedQuestions(questions);
        setIsSuggestionsLoading(false);
      });
    }
  }, [chatbotSettings.enableSuggestions]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
          <div className="max-w-6xl mx-auto w-[95%] md:w-full px-2 md:px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {settingsLoaded && chatbotSettings.logoUrl ? (
                  <img
                    src={chatbotSettings.logoUrl}
                    alt={chatbotSettings.title}
                    className="w-8 h-8 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <Brain className={`w-8 h-8 text-primary ${settingsLoaded && chatbotSettings.logoUrl ? 'hidden' : ''}`} />
                <div>
                  <h1 className="text-xl font-bold">
                    {settingsLoaded ? chatbotSettings.title : (
                      <span className="inline-block w-32 h-6 bg-muted animate-pulse rounded"></span>
                    )}
                  </h1>
                  {/* Active Model Display */}
                  {settingsLoaded && chatbotSettings.activeChatModel && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] font-medium text-muted-foreground leading-tight">
                        {chatbotSettings.activeChatModel.split('/')?.[1] || chatbotSettings.activeChatModel}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* New Session Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="gap-2 px-2"
                title="Yeni Sohbet"
              >
                <Plus className="w-4 h-4" />
              </Button>

              {/* Admin/Manager View */}
              {user && (user.role === 'admin' || user.role === 'manager') ? (
                <>
                  {/* Admin-only Controls */}
                  <div className="flex items-center gap-1">
                    {/* Settings Chip - Admin Only */}
                    {user?.role === 'admin' && (
                      <Link href="/dashboard/settings">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 px-2"
                          title="Ayarlar"
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}

                    {/* Dashboard Link - Admin Only */}
                    {user?.role === 'admin' && (
                      <Link href="/dashboard">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 px-2"
                          title="Dashboard"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>

                  {/* User Dropdown */}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                      className="flex items-center gap-2"
                    >
                      <UserCircle className="w-4 h-4" />
                        <ChevronDown className={`w-3 h-3 transition-transform ${isUserDropdownOpen ? 'rotate-180' : ''}`} />
                    </Button>

                    {isUserDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-popover border rounded-md shadow-lg z-50">
                        <div className="p-2">
                          <div className="px-2 py-1.5 text-sm font-medium border-b">
                            <div>{user?.name || 'Kullanıcı'}</div>
                            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                          </div>
                          <Link href="/profile">
                            <Button variant="ghost" className="w-full justify-start text-sm h-8 px-2">
                              <UserCircle className="w-4 h-4 mr-2" />
                              Profil
                            </Button>
                          </Link>
                          {(user?.role === 'admin' || user?.role === 'manager') && (
                            <Link href="/dashboard/messages">
                              <Button variant="ghost" className="w-full justify-start text-sm h-8 px-2">
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Mesaj Analizleri
                              </Button>
                            </Link>
                          )}
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-sm h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                            onClick={() => {
                              logout();
                              setIsUserDropdownOpen(false);
                            }}
                          >
                            <LogOut className="w-4 h-4 mr-2" />
                            Çıkış Yap
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Standard User View - Simple */}
                  {/* User Icon without Dropdown */}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2"
                      title={user?.name || 'Kullanıcı'}
                    >
                      <UserCircle className="w-5 h-5" />
                    </Button>
                  </div>
                </>
              )}

              {/* Theme Toggle - Always Visible */}
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Main Chat Area */}
        <div className="pt-20 pb-32 max-w-4xl mx-auto w-[98%] sm:w-[95%] md:w-full px-1 sm:px-2 md:px-5">
          <ScrollArea className="h-[calc(100vh-12rem)] pr-1 sm:pr-4">
            <div className="space-y-3 sm:space-y-4 py-2 sm:py-4 pr-0 sm:pr-2">
              {/* Suggestions skeleton loader */}
              {/* Welcome Message (only when no user interaction yet) */}
              {isClient && showSuggestions && messages.length === 0 && settingsLoaded && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="flex gap-3 justify-start mb-8"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary/10">
                      <Bot className="w-5 h-5 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="rounded-lg p-4 bg-card border">
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        {chatbotSettings.welcomeMessage || 'Merhaba! Size nasıl yardımcı olabilirim?'}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Suggestions for new conversations */}
              {isClient && showSuggestions && messages.length === 0 && (
                <motion.div
                  key="suggestions-container"
                  initial={settingsLoaded ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: settingsLoaded ? 0 : 0.3 }}
                  className="my-8"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                    {isSuggestionsLoading ? (
                      // Loading skeleton
                      Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={`skeleton-${index}`}
                          className="text-left p-3 sm:p-4 rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        </div>
                      ))
                    ) : (
                      // Actual suggestions - using memoized array to prevent flicker
                      memoizedSuggestions.map((question, index) => (
                        <motion.button
                          key={`suggestion-${question.substring(0, 20)}-${index}`}
                          initial={settingsLoaded ? false : { opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: settingsLoaded ? 0 : index * 0.05 }}
                          onClick={() => handleSuggestionClick(question)}
                          className="text-left p-3 sm:p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-primary/60 flex-shrink-0" />
                              <span className="text-xs sm:text-sm line-clamp-2">{question}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hidden sm:block" />
                          </div>
                        </motion.button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}

              {/* Messages */}
              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-primary/10">
                          <Bot className="w-5 h-5 text-primary" />
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className={`w-full ${
                      message.role === 'user' ? 'order-1' : 'order-2'
                    }`}>
                      <Card className={`${
                        message.role === 'user'
                          ? message.isFromSource
                            ? 'bg-yellow-100 text-black border-yellow-400 dark:bg-yellow-900 dark:text-yellow-100 dark:border-yellow-600'
                            : 'bg-black text-white dark:bg-gray-900 dark:text-gray-100'
                          : message.isError
                            ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
                            : 'bg-card'
                      }`}>
                        <CardContent className="p-2 sm:p-3">
                          {message.isTyping ? (
                            <MessageSkeleton type="searching" />
                          ) : (
                            <>
                              {message.isStreaming && !message.content ? (
                                // Streaming but no content yet - show generating skeleton
                                <MessageSkeleton type={message.sources && message.sources.length > 0 ? 'generating' : 'searching'} />
                              ) : (
                                <div className="flex items-start gap-2 overflow-hidden">
                                  {message.role === 'user' && message.isFromSource && (
                                    <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                  )}
                                  {message.content ? (
                                    message.role === 'user' ? (
                                      <p className="text-xs sm:text-sm whitespace-pre-wrap flex-1 break-words">
                                        {message.content}
                                      </p>
                                    ) : (
                                      <div className="flex-1 prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-li:text-foreground/90">
                                        <ReactMarkdown
                                          remarkPlugins={[remarkGfm]}
                                          components={markdownComponents}
                                        >
                                          {message.content}
                                        </ReactMarkdown>
                                      </div>
                                    )
                                  ) : message.isStreaming ? (
                                    <MessageSkeleton type="generating" />
                                  ) : null}
                                </div>
                              )}

                              {/* 🔍 SUGGESTED QUESTIONS - "Did you mean?" style cards */}
                              {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                                <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-border/50">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {message.suggestedQuestions.map((question, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => handleSuggestionClick(question)}
                                        className="text-left p-2 sm:p-3 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group"
                                      >
                                        <div className="flex items-center gap-2">
                                          <Search className="w-4 h-4 text-primary/60 group-hover:text-primary flex-shrink-0" />
                                          <span className="text-xs sm:text-sm text-foreground/80 group-hover:text-foreground line-clamp-2">
                                            {question}
                                          </span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {message.sources && message.sources.length > 0 && (
                                <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-border/50">
                                  {(() => {
                                    const sortedSources = (message.sources || []).sort((a, b) => (b.score || 0) - (a.score || 0));
                                    const visibleCount = visibleSourcesCount[message.id] || ragSettings.minResults;
                                    const visibleSources = sortedSources.slice(0, visibleCount);
                                    const hasMore = sortedSources.length > visibleCount;

                                    return (
                                      <>
                                        <div className="space-y-1.5 sm:space-y-2">
                                          {visibleSources.map((source, idx) => (
                                            <div
                                              key={idx}
                                              className="relative p-2 sm:p-3 rounded-lg bg-card border hover:shadow-md transition-all cursor-pointer group"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleSourceClick(source);
                                              }}
                                              title="Bu konuyla ilgili detaylı araştırma yap"
                                            >
                                              <div className="flex items-start gap-2 sm:gap-3">
                                                <div className="flex-1 min-w-0 overflow-hidden">
                                                  {source.sourceType && (
                                                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                                                      <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                        {source.sourceType}
                                                      </span>
                                                      {source.score && (
                                                        <span className="text-[10px] sm:text-xs text-muted-foreground">
                                                          %{Math.min(100, Math.round(source.score))}
                                                        </span>
                                                      )}
                                                    </div>
                                                  )}
                                                  {/* LLM-generated summary - hidden on mobile */}
                                                  {source.summary && (
                                                    <div className="hidden sm:block mt-2 p-2 rounded bg-primary/5 border-l-2 border-primary/30">
                                                      <p className="text-xs text-primary font-medium">
                                                        💡 {source.summary}
                                                      </p>
                                                    </div>
                                                  )}
                                                  {source.content && (
                                                    <p className="text-xs text-muted-foreground line-clamp-4 mt-1.5 pl-0.5">
                                                      {source.content}
                                                    </p>
                                                  )}
                                                  {source.excerpt && !source.content && (
                                                    <p className="text-xs text-muted-foreground line-clamp-4 mt-1.5 pl-0.5">
                                                      {(() => {
                                                        let excerpt = source.excerpt;
                                                        excerpt = excerpt.replace(/^Cevap:\s*/i, '').trim();

                                                        if (!/[.!?]$/.test(excerpt)) {
                                                          if (excerpt.includes('şart') || excerpt.includes('gerekir')) {
                                                            excerpt += ' ve bu durumda ilgili mevzuat hükümleri uygulanır.';
                                                          } else if (excerpt.includes('yıl') || excerpt.includes('süre')) {
                                                            excerpt += ' Bu süre hesaplanırken belirli şartlar göz önünde bulundurulur.';
                                                          } else if (excerpt.includes('vergi') || excerpt.includes('ödeme')) {
                                                            excerpt += ' Bu konuda ilgili kanun hükümleri referans alınır.';
                                                          } else {
                                                            excerpt += ' Konuyla ilgili detaylı bilgilere kaynaklardan ulaşılabilir.';
                                                          }
                                                        }

                                                        if (excerpt.length > 1000) {
                                                          const truncated = excerpt.substring(0, 1000);
                                                          const lastSentenceEnd = Math.max(
                                                            truncated.lastIndexOf('.'),
                                                            truncated.lastIndexOf('!'),
                                                            truncated.lastIndexOf('?')
                                                          );

                                                          if (lastSentenceEnd > 600) {
                                                            excerpt = truncated.substring(0, lastSentenceEnd + 1);
                                                          } else {
                                                            const lastSpace = truncated.lastIndexOf(' ');
                                                            excerpt = lastSpace > 200 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
                                                          }
                                                        }

                                                        return excerpt;
                                                      })()}
                                                    </p>
                                                  )}

                                                  <div className="flex flex-wrap gap-1 mt-2">
                                                    {getSemanticKeywords(source).slice(0, 4).map((keyword: string, keywordIdx: number) => {
                                                      // First 2 keywords are from user query (boosted)
                                                      const isBoosted = keywordIdx < 2 && lastUserQuery.length > 0;
                                                      // Add source number to the first tag
                                                      const displayKeyword = keywordIdx === 0 ? `[${idx + 1}] ${keyword}` : keyword;
                                                      return (
                                                        <span
                                                          key={keywordIdx}
                                                          className={`text-xs px-2 py-1 rounded-none font-medium ${getKeywordColor(keyword, isBoosted)}`}
                                                          title={isBoosted ? `🔍 Arama sorgunuzdan: "${keyword}"` : `Anahtar kelime`}
                                                        >
                                                          {displayKeyword}
                                                        </span>
                                                      );
                                                    })}
                                                    {source.score && (
                                                      <div className="flex items-center gap-1 flex-shrink-0">
                                                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                          <div
                                                            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 transition-all duration-300"
                                                            style={{ width: `${Math.min(100, Math.round(source.score))}%` }}
                                                          />
                                                        </div>
                                                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium w-10 text-right">
                                                          %{Math.min(100, Math.round(source.score))}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                          {hasMore && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="w-full mt-2"
                                              onClick={() => {
                                                setVisibleSourcesCount(prev => ({
                                                  ...prev,
                                                  [message.id]: Math.min(visibleCount + ragSettings.minResults, sortedSources.length)
                                                }));
                                              }}
                                            >
                                              <ChevronDown className="w-4 h-4 mr-2" />
                                              Daha fazla göster ({sortedSources.length - visibleCount} konu daha)
                                            </Button>
                                          )}
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}

                              <div className="flex justify-end mt-2">
                                <div className="text-[9px] font-semibold opacity-50 text-right">
                                  {message.role === 'assistant' && message.isStreaming ? (
                                    <span className="tabular-nums">
                                      {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })} • {Math.floor((Date.now() - message.timestamp.getTime()) / 1000)}s
                                    </span>
                                  ) : (
                                    <span className="tabular-nums">
                                      {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })}
                                      {message.responseTime && message.role === 'assistant' && (
                                        <>
                                          {' • '}{(message.responseTime / 1000).toFixed(2)}s
                                          {message.tokens?.total && (
                                            <> • {message.tokens.total.toLocaleString('tr-TR')} tokens</>
                                          )}
                                        </>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {message.role === 'user' && (
                      <Avatar className="w-8 h-8 order-2">
                        <AvatarFallback>
                          <User className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t">
          <div className="max-w-4xl mx-auto w-[98%] sm:w-[95%] md:w-full px-1 sm:px-2 md:px-4 py-2 sm:py-3 md:py-4">
            <div className="flex gap-1.5 sm:gap-2">
              <div className="relative flex-1">
                <Textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    // Show autocomplete when typing (at least 2 chars in current word)
                    const words = e.target.value.split(/\s+/);
                    const lastWord = words[words.length - 1] || '';
                    setShowAutocomplete(lastWord.length >= 2 && !isLoading);
                  }}
                  onKeyDown={(e) => {
                    // Hide autocomplete on Escape
                    if (e.key === 'Escape') {
                      setShowAutocomplete(false);
                      return;
                    }
                    handleKeyPress(e);
                  }}
                  onFocus={() => {
                    const words = inputText.split(/\s+/);
                    const lastWord = words[words.length - 1] || '';
                    setShowAutocomplete(lastWord.length >= 2 && !isLoading);
                  }}
                  onBlur={() => {
                    // Delay hiding to allow click on suggestions
                    setTimeout(() => setShowAutocomplete(false), 200);
                  }}
                  placeholder={chatbotSettings.placeholder}
                  className="min-h-[50px] sm:min-h-[60px] max-h-[100px] sm:max-h-[120px] resize-none text-sm w-full"
                  disabled={isLoading}
                />
                {/* Smart Autocomplete */}
                {showAutocomplete && keyTerms.length > 0 && (
                  <SmartAutocomplete
                    value={inputText}
                    onSelect={(term) => {
                      // Replace last word with selected term
                      const words = inputText.split(/\s+/);
                      words[words.length - 1] = term;
                      setInputText(words.join(' ') + ' ');
                      setShowAutocomplete(false);
                      textareaRef.current?.focus();
                      // Track recent queries
                      setRecentQueries(prev => [inputText, ...prev.slice(0, 4)]);
                    }}
                    keyTerms={keyTerms}
                    recentQueries={recentQueries}
                    position="above"
                    enabled={showAutocomplete}
                    llmEnabled={true}
                    token={token}
                  />
                )}
              </div>
              <Button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isLoading}
                size="lg"
                className="px-4 sm:px-8"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between mt-1.5 sm:mt-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                Enter ile gönder, Shift+Enter ile yeni satır
              </p>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground ml-auto">
                <span>{messages.length - 1} mesaj</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}