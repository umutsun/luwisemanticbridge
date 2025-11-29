'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getEndpoint } from '@/config/api.config';
import {
    Send,
    Bot,
    User,
    Loader2,
    Sparkles,
    Plus,
    Settings,
    LayoutDashboard,
    LogOut,
    Image as ImageIcon,
    Mic,
    MoreVertical,
    Share2,
    ThumbsUp,
    ThumbsDown,
    Copy,
    RefreshCw
} from 'lucide-react';
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

// Interfaces
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sources?: any[];
    isTyping?: boolean;
    isFromSource?: boolean;
    isStreaming?: boolean;
    isError?: boolean;
    responseTime?: number;
    startTime?: number;
}

export default function ChatInterface() {
    const { token, user, logout } = useAuth();
    const { t } = useTranslation();
    useLanguage();

    // State - NO hardcoded defaults, will load from database
    const [chatbotSettings, setChatbotSettings] = useState<any>({
        title: '',
        activeChatModel: '',
        enableSuggestions: true,
        placeholder: '',
        welcomeMessage: '',
        greeting: ''
    });
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
    const [isClient, setIsClient] = useState(false);
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [visibleSourcesCount, setVisibleSourcesCount] = useState<{ [key: string]: number }>({});
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

    // Scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load settings
    useEffect(() => {
        setIsClient(true);

        // Fetch all settings
        Promise.all([
            fetch('/api/v2/chatbot/settings'),
            fetch('/api/v2/settings?category=llm'),
            fetch('/api/v2/settings?category=rag'),
            fetch('/api/v2/settings?category=prompts'),
            fetch(getEndpoint('chat', 'suggestions'))
        ]).then(async ([chatbotRes, llmRes, ragRes, promptsRes, suggestionsRes]) => {
            const chatbotData = chatbotRes.ok ? await chatbotRes.json() : {};
            const llmData = llmRes.ok ? await llmRes.json() : {};
            const ragData = ragRes.ok ? await ragRes.json() : {};
            const promptsData = promptsRes.ok ? await promptsRes.json() : {};
            const suggestionsData = suggestionsRes.ok ? await suggestionsRes.json() : {};

            // Merge settings
            const settingsData = {
                llmSettings: llmData.llmSettings || {},
                ragSettings: ragData.ragSettings || {},
                prompts: promptsData.prompts || {}
            };

            // Find active prompt
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

            setChatbotSettings(prev => ({
                ...prev,
                ...chatbotData,
                title: chatbotData.title || t('chat.title', 'AI Asistan'),
                placeholder: chatbotData.placeholder || t('chat.input.placeholder', 'Sorunuzu yazın...'),
                activeChatModel: settingsData.llmSettings?.activeChatModel || '',
                welcomeMessage: chatbotData.welcomeMessage || t('chat.welcomeMessage', 'Size nasıl yardımcı olabilirim?'),
                greeting: chatbotData.greeting || t('chat.greeting', 'Merhaba')
            }));

            setRagSettings({
                minResults: settingsData.ragSettings?.minResults || 7,
                maxResults: settingsData.ragSettings?.maxResults || 20,
                similarityThreshold: settingsData.ragSettings?.similarityThreshold || 0.02
            });

            setLlmSettings({
                temperature: settingsData.llmSettings?.temperature || 0.7,
                maxTokens: settingsData.llmSettings?.maxTokens || 2048
            });

            setActivePrompt({
                content: activePromptData.content,
                temperature: activePromptData.temperature,
                maxTokens: activePromptData.maxTokens,
                tone: activePromptData.tone
            });

            // Use suggestions from API or empty array (no hardcoded suggestions)
            setSuggestedQuestions(suggestionsData.suggestions || []);

            setSettingsLoaded(true);
        }).catch(err => {
            console.error('Failed to fetch settings:', err);
            setSettingsLoaded(true);
        });
    }, []);

    // Handlers
    const handleSendMessage = async () => {
        if (!inputText.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputText,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        const messageContent = inputText;
        setInputText('');
        setIsLoading(true);
        setShowSuggestions(false);

        // Streaming placeholder
        const messageId = (Date.now() + 1).toString();
        const streamingMessage: Message = {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            startTime: Date.now()
        };
        setMessages(prev => [...prev, streamingMessage]);
        setIsStreaming(true);

        try {
            // Use active prompt settings if available
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

            if (!response.ok) throw new Error('Failed to send message');

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
                            } catch (e) { }
                        }
                    }
                }

                // Fetch final data with sources
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
                        // Save conversation ID
                        if (finalData.conversationId && !conversationId) {
                            setConversationId(finalData.conversationId);
                        }
                    }
                } catch (e) {
                    console.error('Failed to get final data:', e);
                }

                // Finalize message with sources
                setMessages(prev => prev.map(msg =>
                    msg.id === messageId ? {
                        ...msg,
                        content: accumulatedContent || finalData.response || msg.content,
                        isStreaming: false,
                        sources: finalData.sources,
                        responseTime: msg.startTime ? Date.now() - msg.startTime : undefined
                    } : msg
                ));
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => prev.map(msg =>
                msg.id === messageId ? { ...msg, content: 'Sorry, I encountered an error.', isError: true, isStreaming: false } : msg
            ));
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const clearChat = () => {
        setMessages([]);
        setShowSuggestions(true);
        setConversationId(undefined); // Reset conversation for new session
    };

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-screen bg-[#fff] dark:bg-[#131314] text-[#1f1f1f] dark:text-[#e3e3e3] font-sans transition-colors duration-300">

                {/* Top Bar */}
                <header className="flex items-center justify-between px-6 py-3 sticky top-0 z-50 bg-[#fff]/90 dark:bg-[#131314]/90 backdrop-blur-sm">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={clearChat}>
                        <span className="text-xl font-medium tracking-tight bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent">
                            {chatbotSettings.title}
                        </span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            {chatbotSettings.activeChatModel?.split('/').pop() || 'AI'}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Avatar className="w-8 h-8 cursor-pointer hover:ring-2 hover:ring-gray-200 dark:hover:ring-gray-700 transition-all">
                                    <AvatarFallback className="bg-purple-600 text-white text-xs">
                                        {user?.name?.charAt(0) || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <div className="px-2 py-1.5 text-sm font-medium border-b">
                                    <div>{user?.name || 'User'}</div>
                                    <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                                </div>
                                <Link href="/profile">
                                    <DropdownMenuItem className="cursor-pointer">
                                        <User className="w-4 h-4 mr-2" />
                                        Profile
                                    </DropdownMenuItem>
                                </Link>
                                {user?.role === 'admin' && (
                                    <>
                                        <Link href="/dashboard">
                                            <DropdownMenuItem className="cursor-pointer">
                                                <LayoutDashboard className="w-4 h-4 mr-2" />
                                                Dashboard
                                            </DropdownMenuItem>
                                        </Link>
                                        <Link href="/dashboard/settings">
                                            <DropdownMenuItem className="cursor-pointer">
                                                <Settings className="w-4 h-4 mr-2" />
                                                Settings
                                            </DropdownMenuItem>
                                        </Link>
                                    </>
                                )}
                                <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600 focus:text-red-600">
                                    <LogOut className="w-4 h-4 mr-2" />
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-hidden relative flex flex-col">
                    <ScrollArea className="flex-1 h-full px-4 md:px-0" style={{ height: 'calc(100vh - 180px)' }}>
                        <div className="max-w-3xl mx-auto w-full py-8 pb-40">

                            {/* Welcome Screen */}
                            {isClient && messages.length === 0 && (
                                <div className="flex flex-col items-start justify-center min-h-[60vh] space-y-12 animate-in fade-in duration-700">
                                    <div className="space-y-2">
                                        <h1 className="text-5xl md:text-6xl font-medium tracking-tighter">
                                            <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent">
                                                {chatbotSettings.greeting || t('chat.greeting', 'Merhaba')}, {user?.name?.split(' ')[0] || t('chat.user', 'Kullanıcı')}
                                            </span>
                                        </h1>
                                        <p className="text-2xl md:text-3xl text-gray-400 dark:text-gray-500 font-medium">
                                            {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'Size nasıl yardımcı olabilirim?')}
                                        </p>
                                    </div>

                                    {/* Suggestions Cards - Only show if suggestions exist */}
                                    {showSuggestions && suggestedQuestions.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
                                            {suggestedQuestions.slice(0, 4).map((q, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => setInputText(q)}
                                                    className="h-48 p-4 rounded-2xl bg-gray-50 dark:bg-[#1e1f20] hover:bg-gray-100 dark:hover:bg-[#2d2e30] cursor-pointer transition-colors flex flex-col justify-between group"
                                                >
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                                                        {q}
                                                    </span>
                                                    <div className="self-end p-2 rounded-full bg-white dark:bg-[#131314] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                                        <Sparkles className="w-4 h-4 text-purple-500" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Messages */}
                            <div className="space-y-8">
                                {messages.map((msg, idx) => (
                                    <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>

                                        {/* Assistant Icon */}
                                        {msg.role === 'assistant' && (
                                            <div className="flex-shrink-0 mt-1">
                                                {msg.isStreaming && !msg.content ? (
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-red-500 animate-spin" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-black border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                                                        <Sparkles className="w-5 h-5 text-blue-500 fill-blue-500" />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Message Content */}
                                        <div className={`max-w-[85%] md:max-w-[75%] ${msg.role === 'user'
                                            ? 'bg-gray-100 dark:bg-[#2d2e30] rounded-3xl py-3 px-5'
                                            : 'bg-transparent py-1 px-0'
                                            }`}>
                                            <div className="prose prose-lg dark:prose-invert max-w-none leading-relaxed">
                                                {msg.role === 'user' ? (
                                                    <p className="whitespace-pre-wrap text-base">{msg.content}</p>
                                                ) : (
                                                    <div dangerouslySetInnerHTML={{
                                                        __html: msg.content
                                                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                            .replace(/\n/g, '<br/>')
                                                    }} />
                                                )}
                                            </div>

                                            {/* Sources Section */}
                                            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                                                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                            <Sparkles className="w-3 h-3" />
                                                            Sources & Citations ({msg.sources.length})
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                                        {(() => {
                                                            const sortedSources = [...msg.sources].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
                                                            const initialCount = 3;
                                                            const visibleCount = visibleSourcesCount[msg.id] || initialCount;
                                                            const visibleSources = sortedSources.slice(0, visibleCount);
                                                            const hasMore = sortedSources.length > visibleCount;
                                                            const canShowLess = visibleCount > initialCount;

                                                            return (
                                                                <>
                                                                    {visibleSources.map((source: any, idx: number) => (
                                                                        <div
                                                                            key={idx}
                                                                            className="group p-3 rounded-xl bg-gray-50 dark:bg-[#1e1f20] hover:bg-gray-100 dark:hover:bg-[#2d2e30] transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                                                                        >
                                                                            <div className="flex items-start gap-3">
                                                                                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-xs font-medium text-blue-700 dark:text-blue-300">
                                                                                    {idx + 1}
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                                        {(source.sourceTable || source.sourceType) && (
                                                                                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                                                                                {source.sourceTable || source.sourceType}
                                                                                            </span>
                                                                                        )}
                                                                                        {source.score && (
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                                                                    <div
                                                                                                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                                                                                                        style={{ width: `${Math.min(100, Math.round(source.score))}%` }}
                                                                                                    />
                                                                                                </div>
                                                                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                                                                                                    {Math.round(source.score)}% Match
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    {(source.title || source.citation || source.summary) && (
                                                                                        <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mb-1 line-clamp-2">
                                                                                            {source.title || source.citation || source.summary}
                                                                                        </p>
                                                                                    )}
                                                                                    {(source.content || source.excerpt) && (
                                                                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                                                                                            {(source.content || source.excerpt).slice(0, 200)}...
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    <div className="flex gap-2 justify-center pt-2">
                                                                        {hasMore && (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                                                                                onClick={() => {
                                                                                    setVisibleSourcesCount(prev => ({
                                                                                        ...prev,
                                                                                        [msg.id]: Math.min(visibleCount + 5, sortedSources.length)
                                                                                    }));
                                                                                }}
                                                                            >
                                                                                Show {Math.min(5, sortedSources.length - visibleCount)} more
                                                                            </Button>
                                                                        )}
                                                                        {canShowLess && (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                                                                                onClick={() => {
                                                                                    setVisibleSourcesCount(prev => ({
                                                                                        ...prev,
                                                                                        [msg.id]: initialCount
                                                                                    }));
                                                                                }}
                                                                            >
                                                                                Show less
                                                                            </Button>
                                                                        )}
                                                                        {!hasMore && sortedSources.length > initialCount && (
                                                                            <span className="text-xs text-gray-500">
                                                                                Showing all {sortedSources.length} sources
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Assistant Actions */}
                                            {msg.role === 'assistant' && !msg.isStreaming && (
                                                <div className="flex items-center gap-2 mt-4 ml-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-500">
                                                        <ThumbsUp className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-500">
                                                        <ThumbsDown className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-500">
                                                        <Copy className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-500">
                                                        <RefreshCw className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        {/* User Icon (Hidden for cleaner look, or optional) */}
                                        {/* {msg.role === 'user' && (
                      <Avatar className="w-8 h-8 mt-1">
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                    )} */}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                        </div>
                    </ScrollArea>

                    {/* Input Area - Fixed at bottom */}
                    <div className="sticky bottom-0 w-full max-w-3xl mx-auto px-4 pb-6 pt-2 bg-[#fff] dark:bg-[#131314] border-t border-gray-100 dark:border-gray-800">
                        <div className="relative flex items-end bg-gray-100 dark:bg-[#1e1f20] rounded-[32px] p-2 transition-all focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-gray-600">
                            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 text-gray-500 hover:bg-gray-200 dark:hover:bg-[#2d2e30] mb-0.5">
                                <Plus className="w-5 h-5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 text-gray-500 hover:bg-gray-200 dark:hover:bg-[#2d2e30] mb-0.5">
                                <ImageIcon className="w-5 h-5" />
                            </Button>

                            <Textarea
                                ref={textareaRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder={chatbotSettings.placeholder}
                                className="flex-1 bg-transparent border-0 focus-visible:ring-0 resize-none max-h-[200px] min-h-[48px] py-3 px-2 text-base"
                                rows={1}
                            />

                            {inputText.trim() ? (
                                <Button
                                    onClick={handleSendMessage}
                                    disabled={isLoading}
                                    size="icon"
                                    className="rounded-full h-10 w-10 bg-blue-600 hover:bg-blue-700 text-white mb-0.5 transition-all"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                </Button>
                            ) : (
                                <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 text-gray-500 hover:bg-gray-200 dark:hover:bg-[#2d2e30] mb-0.5">
                                    <Mic className="w-5 h-5" />
                                </Button>
                            )}
                        </div>
                        <div className="text-center mt-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t('chat.disclaimer', 'AI CAN MAKE MISTAKES. PLEASE VERIFY IMPORTANT INFORMATION.')}
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
