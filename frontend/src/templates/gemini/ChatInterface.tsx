'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getEndpoint } from '@/config/api.config';
import {
    Send,
    User,
    Loader2,
    Sparkles,
    Plus,
    Mic,
    ThumbsUp,
    ThumbsDown,
    Copy,
    RefreshCw,
    Check,
    ChevronDown,
    ChevronUp
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
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

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

    // Profile update state
    const [showProfileDialog, setShowProfileDialog] = useState(false);
    const [profileForm, setProfileForm] = useState({
        name: '',
        email: ''
    });
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [profileUpdateError, setProfileUpdateError] = useState('');

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

    // Profile dialog handlers
    const openProfileDialog = () => {
        setProfileForm({
            name: user?.name || '',
            email: user?.email || ''
        });
        setProfileUpdateError('');
        setShowProfileDialog(true);
    };

    const handleProfileUpdate = async () => {
        if (!profileForm.name.trim()) {
            setProfileUpdateError(t('profile.nameRequired', 'Name is required'));
            return;
        }

        setIsUpdatingProfile(true);
        setProfileUpdateError('');

        try {
            const response = await fetch('/api/v2/auth/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: profileForm.name
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update profile');
            }

            // Refresh the page to get updated user info
            window.location.reload();
        } catch {
            setProfileUpdateError(t('profile.updateError', 'Failed to update profile'));
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-screen bg-gradient-to-b from-gray-50 to-white dark:from-[#0a0a0b] dark:to-[#131314] text-gray-900 dark:text-gray-100 font-sans transition-colors duration-500">

                {/* Elegant Top Bar */}
                <header className="flex items-center justify-between px-4 md:px-6 py-2.5 sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0b]/80 backdrop-blur-2xl border-b border-gray-100 dark:border-gray-800/50">
                    <div className="flex items-center gap-2.5 cursor-pointer group" onClick={clearChat}>
                        <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                            {chatbotSettings.title || t('chat.title', 'AI Asistan')}
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={clearChat}
                            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-white/5 transition-all duration-200"
                            title={t('chat.newChat', 'Yeni Sohbet')}
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                        <ThemeToggle />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="relative group p-1">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full opacity-0 group-hover:opacity-100 blur-md transition duration-300"></div>
                                    <Avatar className="relative w-8 h-8 cursor-pointer ring-2 ring-transparent group-hover:ring-blue-500/30 transition-all duration-300">
                                        <AvatarImage src={user?.avatar} />
                                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-semibold">
                                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                        </AvatarFallback>
                                    </Avatar>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border-gray-200/50 dark:border-gray-700/50 shadow-2xl shadow-black/10 dark:shadow-black/30 rounded-2xl p-2 animate-in slide-in-from-top-2 duration-200">
                                <div className="px-3 py-2.5 mb-1 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                                    <div className="font-semibold text-sm text-gray-900 dark:text-white">{user?.name || 'User'}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user?.email}</div>
                                </div>
                                <DropdownMenuItem onClick={openProfileDialog} className="cursor-pointer rounded-xl py-2.5 px-3 focus:bg-gray-100 dark:focus:bg-white/5 transition-colors">
                                    {t('profile.edit', 'Profili Düzenle')}
                                </DropdownMenuItem>
                                {user && ['admin', 'manager'].includes(user.role) && (
                                    <>
                                        <DropdownMenuSeparator className="my-1 bg-gray-100 dark:bg-gray-800" />
                                        <Link href="/dashboard">
                                            <DropdownMenuItem className="cursor-pointer rounded-xl py-2.5 px-3 focus:bg-gray-100 dark:focus:bg-white/5 transition-colors">
                                                {t('nav.dashboard', 'Yönetim Paneli')}
                                            </DropdownMenuItem>
                                        </Link>
                                        <Link href="/dashboard/settings">
                                            <DropdownMenuItem className="cursor-pointer rounded-xl py-2.5 px-3 focus:bg-gray-100 dark:focus:bg-white/5 transition-colors">
                                                {t('nav.settings', 'Ayarlar')}
                                            </DropdownMenuItem>
                                        </Link>
                                    </>
                                )}
                                <DropdownMenuSeparator className="my-1 bg-gray-100 dark:bg-gray-800" />
                                <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-xl py-2.5 px-3 text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20 transition-colors">
                                    {t('auth.logout', 'Çıkış Yap')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Profile Update Dialog */}
                <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
                    <DialogContent className="sm:max-w-md bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border-gray-200/50 dark:border-gray-700/50 rounded-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                                <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
                                    <User className="w-4 h-4 text-blue-500" />
                                </div>
                                {t('profile.edit', 'Profili Düzenle')}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-5 py-4">
                            <div className="flex justify-center">
                                <div className="relative group">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full blur opacity-30 group-hover:opacity-50 transition duration-300"></div>
                                    <Avatar className="relative w-24 h-24 ring-4 ring-white dark:ring-gray-800">
                                        <AvatarImage src={user?.avatar} />
                                        <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-3xl font-semibold">
                                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('profile.name', 'Ad Soyad')}</Label>
                                <Input
                                    id="name"
                                    value={profileForm.name}
                                    onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder={t('profile.namePlaceholder', 'Adınızı girin')}
                                    className="rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 focus:border-blue-500 focus:ring-blue-500/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('profile.email', 'E-posta')}</Label>
                                <Input
                                    id="email"
                                    value={profileForm.email}
                                    disabled
                                    className="rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
                                />
                                <p className="text-[11px] text-gray-500">{t('profile.emailNote', 'E-posta değiştirilemez')}</p>
                            </div>
                            {profileUpdateError && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                    <p className="text-sm text-red-600 dark:text-red-400">{profileUpdateError}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowProfileDialog(false)} className="rounded-xl border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800">
                                {t('common.cancel', 'İptal')}
                            </Button>
                            <Button onClick={handleProfileUpdate} disabled={isUpdatingProfile} className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25">
                                {isUpdatingProfile ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4 mr-2" />
                                )}
                                {t('common.save', 'Kaydet')}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Custom Scrollbar Styles */}
                <style jsx global>{`
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(156, 163, 175, 0.3);
                        border-radius: 3px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(156, 163, 175, 0.5);
                    }
                    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(75, 85, 99, 0.4);
                    }
                    .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(75, 85, 99, 0.6);
                    }
                `}</style>

                {/* Main Content */}
                <main className="flex-1 overflow-hidden relative flex flex-col">
                    <ScrollArea className="flex-1 h-full px-4 md:px-0 custom-scrollbar" style={{ height: 'calc(100vh - 140px)' }}>
                        <div className="max-w-3xl mx-auto w-full py-4 pb-40">

                            {/* Welcome Screen */}
                            {isClient && messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center pt-6 md:pt-10 space-y-5 animate-in fade-in duration-500 px-4">
                                    <div className="text-center space-y-2 max-w-lg">
                                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                                            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                                                {chatbotSettings.greeting || t('chat.greeting', 'Merhaba')}, {user?.name?.split(' ')[0] || t('chat.user', 'Kullanıcı')}
                                            </span>
                                        </h1>
                                        <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">
                                            {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'Size nasıl yardımcı olabilirim?')}
                                        </p>
                                    </div>

                                    {/* Suggestions Cards - Glassmorphism 3D */}
                                    {showSuggestions && suggestedQuestions.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl mt-4">
                                            {suggestedQuestions.slice(0, 4).map((q, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => setInputText(q)}
                                                    className="group relative p-4 rounded-2xl cursor-pointer transition-all duration-300
                                                        bg-white/60 dark:bg-white/5
                                                        backdrop-blur-xl backdrop-saturate-150
                                                        border border-white/50 dark:border-white/10
                                                        hover:bg-white/80 dark:hover:bg-white/10
                                                        hover:border-blue-200/50 dark:hover:border-blue-500/30
                                                        hover:shadow-xl hover:shadow-blue-500/10
                                                        hover:-translate-y-0.5 hover:scale-[1.02]
                                                        active:scale-[0.98]"
                                                >
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-relaxed">
                                                        {q}
                                                    </span>
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
                                                            {t('chat.sourcesAndCitations', 'Kaynaklar ve Atıflar')} ({msg.sources.length})
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                                        {(() => {
                                                            const sortedSources = [...msg.sources].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
                                                            const initialCount = ragSettings.minResults;
                                                            const visibleCount = visibleSourcesCount[msg.id] || initialCount;
                                                            const visibleSources = sortedSources.slice(0, visibleCount);
                                                            const hasMore = sortedSources.length > visibleCount;
                                                            const canShowLess = visibleCount > initialCount;

                                                            return (
                                                                <>
                                                                    {visibleSources.map((source: any, idx: number) => (
                                                                        <div
                                                                            key={idx}
                                                                            className="group p-3 rounded-xl bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300 cursor-pointer border border-gray-100 dark:border-gray-700/50 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-md hover:shadow-blue-500/5"
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:from-cyan-500/30 group-hover:to-blue-500/30 transition-colors">
                                                                                    {idx + 1}
                                                                                </div>
                                                                                <div className="flex-1 min-w-0 overflow-hidden">
                                                                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate transition-colors">
                                                                                        {source.title || source.citation || source.summary || t('chat.untitledSource', 'İsimsiz Kaynak')}
                                                                                    </p>
                                                                                    {source.score && (
                                                                                        <div className="flex items-center gap-2 mt-1.5">
                                                                                            <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                                                                <div
                                                                                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                                                                                                    style={{ width: `${Math.min(100, Math.round(source.score))}%` }}
                                                                                                />
                                                                                            </div>
                                                                                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                                                                                                {Math.round(source.score)}%
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-blue-500 -rotate-90 flex-shrink-0 transition-colors" />
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    {/* Arrow buttons for show more/less */}
                                                                    {(hasMore || canShowLess) && (
                                                                        <div className="flex gap-2 justify-center pt-3">
                                                                            {hasMore && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setVisibleSourcesCount(prev => ({
                                                                                            ...prev,
                                                                                            [msg.id]: Math.min(visibleCount + 5, sortedSources.length)
                                                                                        }));
                                                                                    }}
                                                                                    className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300"
                                                                                >
                                                                                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">+{Math.min(5, sortedSources.length - visibleCount)}</span>
                                                                                    <ChevronDown className="w-4 h-4 text-blue-500 group-hover:translate-y-0.5 transition-transform" />
                                                                                </button>
                                                                            )}
                                                                            {canShowLess && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setVisibleSourcesCount(prev => ({
                                                                                            ...prev,
                                                                                            [msg.id]: initialCount
                                                                                        }));
                                                                                    }}
                                                                                    className="group flex items-center gap-1 px-3 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-all duration-300"
                                                                                >
                                                                                    <ChevronUp className="w-4 h-4 text-gray-500 group-hover:-translate-y-0.5 transition-transform" />
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

                                            {/* Assistant Actions */}
                                            {msg.role === 'assistant' && !msg.isStreaming && (
                                                <div className="flex items-center gap-1 mt-3">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                        <ThumbsUp className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                        <ThumbsDown className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-gray-100 dark:hover:bg-[#2d2e30] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        {/* User Avatar */}
                                        {msg.role === 'user' && (
                                            <Avatar className="w-7 h-7 mt-1 flex-shrink-0">
                                                <AvatarImage src={user?.avatar} />
                                                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
                                                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                        </div>
                    </ScrollArea>

                    {/* Input Area - Fixed at bottom */}
                    <div className="sticky bottom-0 w-full max-w-3xl mx-auto px-4 pb-6 pt-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent dark:from-[#0a0a0b] dark:via-[#0a0a0b] dark:to-transparent">
                        <div className="relative group">
                            {/* Glow effect */}
                            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-3xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"></div>

                            <div className="relative flex items-end bg-white dark:bg-gray-800/80 rounded-2xl p-2 shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-xl transition-all focus-within:border-blue-300 dark:focus-within:border-blue-700 focus-within:shadow-xl focus-within:shadow-blue-500/10">
                                <Textarea
                                    ref={textareaRef}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    placeholder={chatbotSettings.placeholder}
                                    className="flex-1 bg-transparent border-0 focus-visible:ring-0 resize-none max-h-[200px] min-h-[52px] py-3.5 px-4 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                    rows={1}
                                />

                                <div className="flex items-center gap-1 pb-1 pr-1">
                                    {inputText.trim() ? (
                                        <Button
                                            onClick={handleSendMessage}
                                            disabled={isLoading}
                                            size="icon"
                                            className="rounded-xl h-10 w-10 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25 transition-all duration-300"
                                        >
                                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                        </Button>
                                    ) : (
                                        <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                                            <Mic className="w-5 h-5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="text-center mt-2">
                            <p className="text-[9px] text-gray-400/70 dark:text-gray-500/70 font-medium tracking-wide">
                                {t('chat.disclaimer', 'Yapay zeka hata yapabilir. Önemli bilgileri doğrulayın.')}
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
