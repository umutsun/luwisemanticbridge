'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEndpoint } from '@/config/api.config';
import {
    Send,
    Bot,
    User,
    Loader2,
    LogOut,
    Plus,
    LayoutDashboard,
    Sparkles,
    Zap,
    ChevronDown,
    ChevronUp,
    Edit3,
    Check,
    X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/hooks/useLanguage';
import { createEnhancedSourceClickHandler } from '@/utils/semantic-search-enhancement';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ... (Interfaces and helper functions same as base)
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
}

const getSourceTableName = (sourceTable?: string, t?: (key: string, fallback?: string) => string) => {
    if (!sourceTable) return t ? t('chat.source.default') : 'Default';
    const tableName = sourceTable
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();
    const translationKey = `chat.source.table.${sourceTable.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    return t?.(translationKey, tableName) || tableName;
};

export default function ChatInterface() {
    const { token, user, logout } = useAuth();
    const { t } = useTranslation();
    useLanguage();

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
    const [availableModels, setAvailableModels] = useState<Array<{ provider: string, model: string, displayName: string, description: string }>>([]);
    const [currentModel, setCurrentModel] = useState<string>('Claude');
    const [lastUserQuery, setLastUserQuery] = useState<string>('');

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

    // Profile update state
    const [showProfileDialog, setShowProfileDialog] = useState(false);
    const [profileForm, setProfileForm] = useState({ name: '', email: '' });
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [profileError, setProfileError] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Profile update handler
    const handleProfileUpdate = async () => {
        if (!profileForm.name.trim()) {
            setProfileError(t('profile.nameRequired', 'İsim gereklidir'));
            return;
        }
        setIsUpdatingProfile(true);
        setProfileError('');
        try {
            const response = await fetch('/api/v2/users/me', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: profileForm.name })
            });
            if (!response.ok) {
                throw new Error(t('profile.updateFailed', 'Profil güncellenemedi'));
            }
            setShowProfileDialog(false);
            window.location.reload();
        } catch (error) {
            setProfileError(error instanceof Error ? error.message : t('profile.updateFailed', 'Profil güncellenemedi'));
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    // Open profile dialog
    const openProfileDialog = () => {
        setProfileForm({ name: user?.name || '', email: user?.email || '' });
        setProfileError('');
        setShowProfileDialog(true);
    };
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
                const activePromptObj = promptsList.find((p: any) => p.isActive === true);

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
                    tone: (activePromptObj as any).conversationTone || 'professional'
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

        fetchAvailableModels(true);
    }, []);

    useEffect(() => {
        if (isStreaming) {
            const interval = setInterval(() => {
                setTimerTick(prev => prev + 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isStreaming]);

    const fetchAvailableModels = async (forceRefresh = false) => {
        try {
            const baseUrl = '/api/v2/settings';
            const url = forceRefresh ? `${baseUrl}?t=${Date.now()}` : baseUrl;
            const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' } });
            if (response.ok) {
                const settings = await response.json();
                const models = [];
                if (settings.openai?.apiKey) models.push({ provider: 'openai', model: 'openai/gpt-4o', displayName: 'ChatGPT', description: 'OpenAI GPT' });
                if (settings.anthropic?.apiKey) {
                    models.push({ provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', description: 'Anthropic Claude 3.5 Sonnet' });
                    models.push({ provider: 'anthropic', model: 'anthropic/claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', description: 'Anthropic Claude 3.5 Haiku (Fast)' });
                }
                if (settings.google?.apiKey) models.push({ provider: 'google', model: 'google/gemini-1.5-pro', displayName: 'Gemini', description: 'Google Gemini' });
                if (settings.deepseek?.apiKey) models.push({ provider: 'deepseek', model: 'deepseek/deepseek-chat', displayName: 'DeepSeek', description: 'DeepSeek AI' });

                setAvailableModels(models);
                if (chatbotSettings.activeChatModel && models.length > 0) {
                    const activeModel = models.find(m => m.model === chatbotSettings.activeChatModel);
                    if (activeModel) setCurrentModel(activeModel.displayName);
                    else setCurrentModel(models[0].displayName);
                }
            }
        } catch (error) {
            console.error('Failed to fetch models:', error);
        }
    };

    useEffect(() => {
        const handleTagClick = (event: CustomEvent) => {
            const { query } = event.detail;
            setInputText(query);
            textareaRef.current?.focus();
        };
        window.addEventListener('tagClick', handleTagClick as EventListener);
        return () => window.removeEventListener('tagClick', handleTagClick as EventListener);
    }, []);

    useEffect(() => {
        const handleAddToInput = (event: CustomEvent) => {
            setInputText(event.detail);
            textareaRef.current?.focus();
        };
        const handleSettingsUpdate = () => {
            setAvailableModels([]);
            fetchAvailableModels(true);
        };
        window.addEventListener('addToInput', handleAddToInput as EventListener);
        window.addEventListener('settingsUpdated', handleSettingsUpdate);
        return () => {
            window.removeEventListener('addToInput', handleAddToInput as EventListener);
            window.removeEventListener('settingsUpdated', handleSettingsUpdate);
        };
    }, []);

    const getSemanticKeywords = (source: Record<string, unknown>) => {
        const keywords: string[] = [];
        const boostedKeywords: string[] = [];
        if (lastUserQuery) {
            const queryWords = lastUserQuery.toLowerCase().split(/\s+/).filter(word => word.length > 2).filter(word => !['için', 'ile', 'var', 'yok', 'bir', 'olan', 'nedir', 'nasıl'].includes(word));
            const title = ((source.title as string) || '').toLowerCase();
            const content = ((source.content as string) || (source.excerpt as string) || '').toLowerCase();
            const text = title + ' ' + content;
            queryWords.forEach(word => {
                if (text.includes(word) && !boostedKeywords.includes(word)) boostedKeywords.push(word);
            });
        }
        keywords.push(...boostedKeywords.slice(0, 2));
        if (source.category && !keywords.includes(source.category as string)) keywords.push(source.category as string);
        if (source.sourceTable) {
            const tableName = getSourceTableName(source.sourceTable as string);
            if (!keywords.includes(tableName)) keywords.push(tableName);
        }
        if (source.keywords && Array.isArray(source.keywords) && source.keywords.length > 0) {
            keywords.push(...source.keywords.slice(0, 2));
        } else {
            const title = (source.title as string) || '';
            if (title.includes('KDV') && keywords.length < 5) keywords.push('KDV');
        }
        return keywords.slice(0, 5);
    };

    const handleSendMessage = async (fromSource: boolean = false) => {
        if (!inputText.trim() || isLoading || isStreaming) return;
        const userMessage: Message = { id: Date.now().toString(), role: 'user', content: inputText, timestamp: new Date(), isFromSource: fromSource };
        setMessages(prev => [...prev, userMessage]);
        const messageContent = inputText;
        setLastUserQuery(inputText);
        setInputText('');
        setIsLoading(true);
        setShowSuggestions(false);
        const messageId = (Date.now() + 1).toString();
        const messageStartTime = Date.now();
        const streamingMessage: Message = { id: messageId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true, startTime: messageStartTime };
        setMessages(prev => [...prev, streamingMessage]);
        setStreamingMessageId(messageId);
        setIsStreaming(true);

        try {
            const temperature = activePrompt.content ? activePrompt.temperature : llmSettings.temperature;
            const maxTokens = activePrompt.content ? activePrompt.maxTokens : llmSettings.maxTokens;
            const systemPrompt = activePrompt.content || undefined;

            const response = await fetch(getEndpoint('chat', 'send'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
                try { errorData = JSON.parse(errorText); } catch { errorData = { error: errorText }; }
                if (response.status === 401) { logout(); return; }
                throw new Error(`Failed to get response: ${response.status} - ${errorText}`);
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
                                    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, content: accumulatedContent } : msg));
                                }
                            } catch (e) { }
                        }
                    }
                }

                let finalData: any = {};
                try {
                    const finalResponse = await fetch(getEndpoint('chat', 'send'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
                    if (finalResponse.ok) finalData = await finalResponse.json();
                } catch (e) { }

                setMessages(prev => prev.map(msg => msg.id === messageId ? {
                    ...msg,
                    content: accumulatedContent || finalData.response || msg.content,
                    isStreaming: false,
                    sources: finalData.sources,
                    relatedTopics: finalData.relatedTopics,
                    context: finalData.context,
                    responseTime: msg.startTime ? Date.now() - msg.startTime : undefined,
                    tokens: finalData.tokens || finalData.usage
                } : msg));
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, content: 'Error occurred.', isStreaming: false, isError: true } : msg));
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingMessageId(null);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
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
        { includeCrossSourceContext: true, includeRelevanceContext: true, maxSemanticTerms: 3, queryStyle: 'detailed' }
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
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans selection:bg-violet-500/30">
                {/* Custom scrollbar styles */}
                <style>{`
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(139, 92, 246, 0.3);
                        border-radius: 3px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(139, 92, 246, 0.5);
                    }
                `}</style>
                {/* Modern Glass Header */}
                <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
                    <div className="max-w-6xl mx-auto w-full px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-3 cursor-pointer group" onClick={clearChat}>
                            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                                {settingsLoaded ? chatbotSettings.title : t('chat.title', 'AI Asistan')}
                            </h1>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={clearChat} className="text-slate-400 hover:text-white hover:bg-white/5 rounded-full" title={t('chat.newChat', 'Yeni Sohbet')}>
                                <Plus className="w-5 h-5" />
                            </Button>

                            <ThemeToggle />

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-white/5 rounded-full">
                                        <User className="w-5 h-5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-slate-900/95 backdrop-blur-xl border-slate-700/50 text-slate-200 min-w-[200px] shadow-2xl">
                                    <div className="px-3 py-2.5 border-b border-slate-700/50">
                                        <p className="text-sm font-medium text-white">{user?.name || t('chat.user', 'Kullanıcı')}</p>
                                        <p className="text-xs text-slate-400">{user?.email}</p>
                                    </div>
                                    <DropdownMenuItem className="focus:bg-violet-500/20 focus:text-white cursor-pointer" onClick={openProfileDialog}>
                                        <Edit3 className="w-4 h-4 mr-2 text-violet-400" /> {t('profile.edit', 'Profili Düzenle')}
                                    </DropdownMenuItem>
                                    {user && ['admin', 'manager'].includes(user.role) && (
                                        <DropdownMenuItem className="focus:bg-violet-500/20 focus:text-white cursor-pointer">
                                            <Link href="/dashboard" className="flex items-center w-full">
                                                <LayoutDashboard className="w-4 h-4 mr-2 text-indigo-400" /> {t('nav.dashboard', 'Yönetim Paneli')}
                                            </Link>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem className="focus:bg-red-500/20 focus:text-white cursor-pointer" onClick={logout}>
                                        <LogOut className="w-4 h-4 mr-2 text-red-400" /> {t('nav.logout', 'Çıkış')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </header>

                {/* Main Chat Area */}
                <div className="pt-16 pb-32 max-w-4xl mx-auto w-full px-4">
                    <ScrollArea className="h-[calc(100vh-12rem)] pr-4 overflow-x-hidden custom-scrollbar">
                        <div className="space-y-6 py-2">
                            {/* Welcome Message */}
                            {isClient && showSuggestions && messages.length === 0 && (
                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-6">
                                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                                        <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                                            {chatbotSettings.greeting || t('chat.greeting', 'Merhaba')}, {user?.name?.split(' ')[0] || t('chat.user', 'Kullanıcı')}
                                        </span>
                                    </h2>
                                    <p className="text-slate-400 max-w-md mx-auto text-sm">
                                        {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'Size nasıl yardımcı olabilirim?')}
                                    </p>
                                </motion.div>
                            )}

                            {/* Suggestions Grid */}
                            {isClient && showSuggestions && messages.length === 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
                                    {memoizedSuggestions.map((question, index) => (
                                        <motion.button
                                            key={index}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: index * 0.1 }}
                                            onClick={() => handleSuggestionClick(question)}
                                            className="group relative p-4 text-left rounded-xl bg-slate-900/50 border border-white/5 hover:border-violet-500/30 hover:bg-slate-800/50 transition-all duration-300"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/0 via-violet-600/0 to-violet-600/0 group-hover:from-violet-600/5 group-hover:via-transparent group-hover:to-transparent rounded-xl transition-all duration-500"></div>
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 p-1.5 rounded-lg bg-violet-500/10 text-violet-400 group-hover:text-violet-300 group-hover:bg-violet-500/20 transition-colors">
                                                    <Zap className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{question}</span>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            )}

                            {/* Messages List */}
                            <AnimatePresence mode="popLayout">
                                {messages.map((message) => (
                                    <motion.div
                                        key={message.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {message.role === 'assistant' && (
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/20">
                                                <Bot className="w-5 h-5 text-white" />
                                            </div>
                                        )}

                                        <div className={`max-w-[85%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                                            <div className={`p-5 shadow-xl ${message.role === 'user'
                                                    ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm'
                                                    : 'bg-slate-900/80 backdrop-blur-sm border border-white/10 text-slate-200 rounded-2xl rounded-tl-sm'
                                                }`}>
                                                {message.isTyping || (message.isStreaming && !message.content) ? (
                                                    <div className="flex gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-current opacity-40 animate-bounce"></span>
                                                        <span className="w-2 h-2 rounded-full bg-current opacity-40 animate-bounce delay-100"></span>
                                                        <span className="w-2 h-2 rounded-full bg-current opacity-40 animate-bounce delay-200"></span>
                                                    </div>
                                                ) : (
                                                    <div className="prose prose-invert prose-sm max-w-none">
                                                        <p className="whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{
                                                            __html: message.content
                                                                .replace(/\*\*\[([0-9,\s]+)\]\*\*/g, '<strong class="text-violet-300">[$1]</strong>')
                                                                .replace(/\n/g, '<br/>')
                                                        }} />
                                                    </div>
                                                )}

                                                {/* Sources Section */}
                                                {message.sources && message.sources.length > 0 && (
                                                    <div className="mt-6 pt-4 border-t border-white/10">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                                <Sparkles className="w-3 h-3 text-violet-400" />
                                                                {t('chat.sourcesAndCitations', 'Kaynaklar ve Atıflar')} ({message.sources.length})
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                                            {(() => {
                                                                const sortedSources = [...message.sources].sort((a, b) => (b.score || 0) - (a.score || 0));
                                                                const initialCount = ragSettings.minResults;
                                                                const visibleCount = visibleSourcesCount[message.id] || initialCount;
                                                                const visibleSources = sortedSources.slice(0, visibleCount);
                                                                const hasMore = sortedSources.length > visibleCount;
                                                                const canShowLess = visibleCount > initialCount;

                                                                return (
                                                                    <>
                                                                        {visibleSources.map((source, idx) => (
                                                                            <div
                                                                                key={idx}
                                                                                onClick={() => handleSourceClick(source)}
                                                                                className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-slate-800/40 to-slate-800/20 hover:from-violet-500/15 hover:to-indigo-500/10 border border-white/5 hover:border-violet-500/30 backdrop-blur-sm transition-all duration-300 cursor-pointer overflow-hidden"
                                                                            >
                                                                                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/30 to-indigo-500/30 text-xs font-bold text-violet-300 group-hover:from-violet-500/50 group-hover:to-indigo-500/50 group-hover:text-white transition-all shadow-lg shadow-violet-900/20">
                                                                                    {idx + 1}
                                                                                </div>
                                                                                <div className="min-w-0 flex-1 overflow-hidden">
                                                                                    <p className="text-sm font-medium text-slate-200 group-hover:text-violet-200 truncate transition-colors">
                                                                                        {source.title || t('chat.untitledSource', 'İsimsiz Kaynak')}
                                                                                    </p>
                                                                                    <div className="flex items-center gap-2 mt-1.5">
                                                                                        <div className="h-1.5 w-20 bg-slate-700/50 rounded-full overflow-hidden">
                                                                                            <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (source.score || 0))}%` }}></div>
                                                                                        </div>
                                                                                        <span className="text-[10px] font-medium text-slate-400 group-hover:text-violet-300 transition-colors">{Math.round(source.score || 0)}%</span>
                                                                                    </div>
                                                                                </div>
                                                                                <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-violet-400 -rotate-90 flex-shrink-0 transition-colors" />
                                                                            </div>
                                                                        ))}
                                                                        {/* Show more/less arrow buttons */}
                                                        {(hasMore || canShowLess) && (
                                                            <div className="flex items-center justify-center gap-2 pt-3">
                                                                {hasMore && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setVisibleSourcesCount(prev => ({
                                                                                ...prev,
                                                                                [message.id]: Math.min(visibleCount + 5, sortedSources.length)
                                                                            }));
                                                                        }}
                                                                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 transition-all duration-300"
                                                                        title={t('chat.showMore', '{{count}} daha göster', { count: Math.min(5, sortedSources.length - visibleCount) })}
                                                                    >
                                                                        <span className="text-[10px] font-medium text-violet-400 group-hover:text-violet-300">+{Math.min(5, sortedSources.length - visibleCount)}</span>
                                                                        <ChevronDown className="w-3.5 h-3.5 text-violet-400 group-hover:text-violet-300 group-hover:translate-y-0.5 transition-transform" />
                                                                    </button>
                                                                )}
                                                                {canShowLess && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setVisibleSourcesCount(prev => ({
                                                                                ...prev,
                                                                                [message.id]: initialCount
                                                                            }));
                                                                        }}
                                                                        className="group flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/20 hover:border-slate-600/40 transition-all duration-300"
                                                                        title={t('chat.showLess', 'Daha az göster')}
                                                                    >
                                                                        <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-300 group-hover:-translate-y-0.5 transition-transform" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {message.role === 'assistant' && (
                                                <div className="flex justify-start mt-2 px-1">
                                                    <span className="text-[10px] font-medium text-slate-500">
                                                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {message.responseTime && ` • ${(message.responseTime / 1000).toFixed(1)}s`}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {message.role === 'user' && (
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                                                <User className="w-5 h-5 text-slate-400" />
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                </div>

                {/* Floating Input Area */}
                <div className="fixed bottom-6 left-0 right-0 z-50 px-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl opacity-20 group-hover:opacity-40 blur transition duration-500"></div>
                            <div className="relative flex items-end gap-2 p-2 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                                <Textarea
                                    ref={textareaRef}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    placeholder={chatbotSettings.placeholder || t('chat.placeholder', 'Sorunuzu yazın...')}
                                    className="min-h-[50px] max-h-[150px] w-full bg-transparent border-0 focus-visible:ring-0 resize-none py-3 px-4 text-slate-200 placeholder:text-slate-500"
                                    disabled={isLoading}
                                />
                                <Button
                                    onClick={() => handleSendMessage()}
                                    disabled={!inputText.trim() || isLoading}
                                    size="icon"
                                    className={`mb-1 mr-1 h-10 w-10 rounded-xl transition-all duration-300 ${inputText.trim()
                                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/20 hover:shadow-violet-900/40'
                                            : 'bg-slate-800 text-slate-500'
                                        }`}
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                </Button>
                            </div>
                        </div>
                        <div className="text-center mt-3">
                            <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
                                {t('chat.disclaimer', 'YAPAY ZEKA HATA YAPABİLİR. LÜTFEN ÖNEMLİ BİLGİLERİ DOĞRULAYIN.')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Profile Update Dialog */}
                <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
                    <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-slate-700/50 text-slate-200 shadow-2xl max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-violet-500/20">
                                    <Edit3 className="w-4 h-4 text-violet-400" />
                                </div>
                                {t('profile.editTitle', 'Profili Düzenle')}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">{t('profile.name', 'Ad Soyad')}</label>
                                <Input
                                    value={profileForm.name}
                                    onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder={t('profile.namePlaceholder', 'Adınızı girin')}
                                    className="bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500 focus:border-violet-500/50 focus:ring-violet-500/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">{t('profile.email', 'E-posta')}</label>
                                <Input
                                    value={profileForm.email}
                                    disabled
                                    className="bg-slate-800/30 border-slate-700/30 text-slate-500 cursor-not-allowed"
                                />
                                <p className="text-[10px] text-slate-500">{t('profile.emailHint', 'E-posta değiştirilemez')}</p>
                            </div>
                            {profileError && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                                    <p className="text-sm text-red-400">{profileError}</p>
                                </div>
                            )}
                            <div className="flex gap-3 pt-2">
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowProfileDialog(false)}
                                    className="flex-1 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-700/50"
                                >
                                    {t('common.cancel', 'İptal')}
                                </Button>
                                <Button
                                    onClick={handleProfileUpdate}
                                    disabled={isUpdatingProfile}
                                    className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-900/30"
                                >
                                    {isUpdatingProfile ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Check className="w-4 h-4 mr-2" />
                                    )}
                                    {t('common.save', 'Kaydet')}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </ProtectedRoute>
    );
}
