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

    // State
    const [chatbotSettings, setChatbotSettings] = useState<any>({
        title: 'Gemini',
        activeChatModel: 'Gemini 1.5 Pro',
        enableSuggestions: true,
        placeholder: 'Enter a prompt here'
    });
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
    const [isClient, setIsClient] = useState(false);

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

        // Fetch settings
        Promise.all([
            fetch('/api/v2/chatbot/settings'),
            fetch(getEndpoint('chat', 'suggestions'))
        ]).then(async ([settingsRes, suggestionsRes]) => {
            const settings = settingsRes.ok ? await settingsRes.json() : {};
            const suggestionsData = suggestionsRes.ok ? await suggestionsRes.json() : {};

            setChatbotSettings(prev => ({
                ...prev,
                ...settings,
                title: settings.title || 'Gemini',
                placeholder: settings.placeholder || 'Enter a prompt here'
            }));

            setSuggestedQuestions(suggestionsData.suggestions || [
                "Explain quantum computing in simple terms",
                "Write a poem about artificial intelligence",
                "How do I make a sourdough starter?",
                "Plan a 3-day trip to Istanbul"
            ]);
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
            const response = await fetch(getEndpoint('chat', 'send'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    message: messageContent,
                    stream: true,
                    model: chatbotSettings.activeChatModel
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

                // Finalize
                setMessages(prev => prev.map(msg =>
                    msg.id === messageId ? { ...msg, isStreaming: false } : msg
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
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            Advanced
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <Avatar className="w-8 h-8 cursor-pointer hover:ring-2 hover:ring-gray-200 dark:hover:ring-gray-700 transition-all">
                            <AvatarFallback className="bg-purple-600 text-white text-xs">
                                {user?.name?.charAt(0) || 'U'}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-hidden relative flex flex-col">
                    <ScrollArea className="flex-1 px-4 md:px-0">
                        <div className="max-w-3xl mx-auto w-full py-8 pb-32">

                            {/* Welcome Screen */}
                            {isClient && messages.length === 0 && (
                                <div className="flex flex-col items-start justify-center min-h-[60vh] space-y-12 animate-in fade-in duration-700">
                                    <div className="space-y-2">
                                        <h1 className="text-5xl md:text-6xl font-medium tracking-tighter">
                                            <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent">
                                                Hello, {user?.name?.split(' ')[0] || 'Human'}
                                            </span>
                                        </h1>
                                        <p className="text-2xl md:text-3xl text-gray-400 dark:text-gray-500 font-medium">
                                            How can I help you today?
                                        </p>
                                    </div>

                                    {/* Suggestions Cards */}
                                    {showSuggestions && (
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

                    {/* Input Area */}
                    <div className="w-full max-w-3xl mx-auto px-4 pb-6 pt-2 bg-[#fff] dark:bg-[#131314]">
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
                                Gemini may display inaccurate info, including about people, so double-check its responses.
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
