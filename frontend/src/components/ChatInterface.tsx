'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import config, { getEndpoint } from '@/config/api.config';
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
  UserCircle
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthProvider';
import { createEnhancedSourceClickHandler } from '@/utils/semantic-search-enhancement';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
  relatedTopics?: any[];
  context?: string[];
  isTyping?: boolean;
  isFromSource?: boolean;
}

const getSourceTableName = (sourceTable?: string) => {
  const tableNames: { [key: string]: string } = {
    'OZELGELER': 'Özelgeler',
    'DANISTAYKARARLARI': 'Danıştay Kararları',
    'MAKALELER': 'Makaleler',
    'SORUCEVAP': 'Soru Cevap',
    'Konu': 'Genel Konu',
    'embeddings': 'Dokümanlar',
    'chunks': 'Metin Parçaları',
    'sources': 'Konular'
  };
  return tableNames[sourceTable || ''] || sourceTable || 'Konu';
};

const getKeywordColor = (keyword: string): string => {
  const colors = [
    'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400',
    'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
    'bg-pink-100 text-pink-700 hover:bg-pink-200 dark:bg-pink-900/30 dark:text-pink-400'
  ];

  const index = keyword.length % colors.length;
  return colors[index];
};

export default function ChatInterface() {
  const { token, user, logout } = useAuth();

  // Chatbot settings state
  const [chatbotSettings, setChatbotSettings] = useState({
    title: 'ASB Hukuki Asistan',
    subtitle: 'Yapay Zeka Asistanınız',
    logoUrl: '',
    welcomeMessage: 'Merhaba! Ben Luwi Semantic Bridge AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.',
    placeholder: 'Sorunuzu yazın...',
    primaryColor: '#3B82F6',
    activeChatModel: 'deepseek/deepseek-chat'
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Fetch popular questions from backend
  const fetchSuggestedQuestions = async () => {
    try {
      const response = await fetch(getEndpoint('chat', 'suggestions'));
      if (response.ok) {
        const data = await response.json();
        return data.suggestions || [];
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
    return [];
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Merhaba! Ben Luwi Semantic BridgeAI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim. Nasıl yardımcı olabilirim?',
      timestamp: new Date(),
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [visibleSourcesCount, setVisibleSourcesCount] = useState<{ [key: string]: number }>({});
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Client-side'da olduğumuzu işaretle ve soruları yükle
  useEffect(() => {
    setIsClient(true);

    // Fetch popular questions from backend
    fetchSuggestedQuestions().then(questions => {
      setSuggestedQuestions(questions);
    });

    // Fetch chatbot settings and active model
    Promise.all([
      fetch(config.getApiUrl('/api/v2/chatbot/settings')),
      fetch(config.getApiUrl('/api/v2/settings/'))
    ])
      .then(async ([chatbotRes, settingsRes]) => {
        const chatbotData = chatbotRes.ok ? await chatbotRes.json() : {};
        const settingsData = settingsRes.ok ? await settingsRes.json() : {};

        setChatbotSettings({
          title: chatbotData.title || 'ASB Hukuki Asistan',
          subtitle: chatbotData.subtitle || 'Yapay Zeka Asistanınız',
          logoUrl: chatbotData.logoUrl || '',
          welcomeMessage: chatbotData.welcomeMessage || 'Merhaba! Ben AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.',
          placeholder: chatbotData.placeholder || 'Sorunuzu yazın...',
          primaryColor: chatbotData.primaryColor || '#3B82F6',
          activeChatModel: settingsData.llmSettings?.activeChatModel || 'deepseek/deepseek-chat'
        });
        setSettingsLoaded(true);

        // Update initial message with dynamic welcome message
        setMessages(prev => [{
          ...prev[0],
          content: chatbotData.welcomeMessage || prev[0].content
        }]);
      })
      .catch(err => {
        console.error('Failed to fetch chatbot settings:', err);
        setSettingsLoaded(true);
      });
  }, []);

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

  // Extract minimal meaningful keywords from title
  const getSemanticKeywords = (source: Record<string, unknown>) => {
    const keywords: string[] = [];

    // Always add category as first tag
    if (source.category) {
      keywords.push(source.category as string);
    }

    // Add source table as second tag
    if (source.sourceTable) {
      const tableMap: { [key: string]: string } = {
        'OZELGELER': 'Özelge',
        'DANISTAYKARARLARI': 'Danıştay',
        'MAKALELER': 'Makale',
        'SORUCEVAP': 'Soru-Cevap',
        'sorucevap': 'Soru-Cevap'
      };
      const tableName = tableMap[source.sourceTable as string] || source.sourceTable as string;
      keywords.push(tableName);
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

  const handleKeywordClick = (source: Record<string, unknown>, keyword: string) => {
    // Generate enhanced search query with specific source context
    const searchQuery = `${keyword} ${source.title || ''}`.trim();

    // Set the generated query and focus the input
    setInputText(searchQuery);
    textareaRef.current?.focus();
  };

  const handleSendMessage = async (fromSource: boolean = false) => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
      isFromSource: fromSource,
    };

    setMessages(prev => [...prev, userMessage]);
    const messageContent = inputText;
    setInputText('');
    setIsLoading(true);
    setShowSuggestions(false);

    // Typing indicator
    const typingMessage: Message = {
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    };
    setMessages(prev => [...prev, typingMessage]);

    try {
      const response = await fetch(getEndpoint('chat', 'send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageContent,
          enableSemanticAnalysis: true,
          trackUserInsights: true
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message?.content || data.response || data.message || 'Üzgünüm, bir hata oluştu.',
        timestamp: new Date(),
        sources: data.sources,
        relatedTopics: data.relatedTopics,
        context: data.context,
      };

      setMessages(prev => prev.filter(m => m.id !== 'typing').concat(assistantMessage));
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Üzgünüm, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.',
        timestamp: new Date(),
      };
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat(errorMessage));
    } finally {
      setIsLoading(false);
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

  // Create enhanced source click handler with semantic search capabilities
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
    setMessages([{
      id: '1',
      role: 'assistant',
      content: 'Merhaba! Ben Luwi Semantic BridgeAI asistanınız. Size nasıl yardımcı olabilirim?',
      timestamp: new Date(),
    }]);
    setShowSuggestions(true);
    if (typeof window !== 'undefined') {
      fetchSuggestedQuestions().then(questions => {
        setSuggestedQuestions(questions);
      });
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
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
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Active Model Display */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-lg">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  {(() => {
                    const modelMap: { [key: string]: string } = {
                      'deepseek/deepseek-chat': 'Deepseek',
                      'deepseek-chat': 'Deepseek',
                      'openai/gpt-4-turbo-preview': 'GPT-4 Turbo',
                      'openai/gpt-4': 'GPT-4',
                      'openai/gpt-3.5-turbo': 'GPT-3.5',
                      'google/gemini-pro': 'Gemini Pro',
                      'anthropic/claude-3-opus': 'Claude 3 Opus',
                      'anthropic/claude-3-sonnet': 'Claude 3 Sonnet'
                    };
                    const activeModel = chatbotSettings.activeChatModel || 'google/gemini-pro';
                    return modelMap[activeModel] || activeModel.split('/')[1] || activeModel;
                  })()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Yeni Sohbet
              </Button>

              {/* User Dropdown */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="flex items-center gap-2"
                >
                  <UserCircle className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">
                    {user?.name || user?.email || 'Kullanıcı'}
                  </span>
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

              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Main Chat Area */}
        <div className="pt-20 pb-32 max-w-4xl mx-auto px-4">
          <ScrollArea className="h-[calc(100vh-12rem)]">
            <div className="space-y-4 py-4">
              {/* Suggestions for new conversations */}
              {isClient && showSuggestions && messages.length === 1 && suggestedQuestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-3 my-8"
                >
                  <div className="col-span-full text-center mb-4">
                    <h2 className="text-lg font-semibold text-muted-foreground">
                      Başlamak için bir konu seçin veya sorunuzu yazın
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Her yenilemede farklı öneriler gösterilir
                    </p>
                  </div>
                  {suggestedQuestions.map((question, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleSuggestionClick(question)}
                      className="text-left p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-primary/60" />
                          <span className="text-sm">{question}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.button>
                  ))}
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

                    <div className={`max-w-[70%] ${
                      message.role === 'user' ? 'order-1' : 'order-2'
                    }`}>
                      <Card className={`${
                        message.role === 'user'
                          ? message.isFromSource
                            ? 'bg-yellow-100 text-black border-yellow-400 dark:bg-yellow-900 dark:text-yellow-100 dark:border-yellow-600'
                            : 'bg-black text-white dark:bg-gray-900 dark:text-gray-100'
                          : 'bg-card'
                      }`}>
                        <CardContent className="p-3">
                          {message.isTyping ? (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce delay-100" />
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce delay-200" />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start gap-2">
                                {message.role === 'user' && message.isFromSource && (
                                  <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                )}
                                <p className="text-sm whitespace-pre-wrap flex-1">{message.content}</p>
                              </div>

                              {message.sources && message.sources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-border/50">
                                  {(() => {
                                    const sortedSources = (message.sources || []).sort((a, b) => (b.score || 0) - (a.score || 0));
                                    const visibleCount = visibleSourcesCount[message.id] || 7;
                                    const visibleSources = sortedSources.slice(0, visibleCount);
                                    const hasMore = sortedSources.length > visibleCount;

                                    return (
                                      <>
                                        <div className="space-y-2">
                                          {visibleSources.map((source, idx) => (
                                            <div
                                              key={idx}
                                              className="relative p-3 rounded-lg bg-card border hover:shadow-md transition-all cursor-pointer group"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleSourceClick(source);
                                              }}
                                              title="Bu konuyla ilgili detaylı araştırma yap"
                                            >
                                              <div className="flex items-start gap-3">
                                                <div className="flex-shrink-0">
                                                  <div className="flex flex-col items-center gap-1">
                                                    <span className="flex items-center justify-center w-7 h-7 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                                      {idx + 1}
                                                    </span>
                                                  </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
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

                                                        if (excerpt.length > 250) {
                                                          const truncated = excerpt.substring(0, 250);
                                                          const lastSentenceEnd = Math.max(
                                                            truncated.lastIndexOf('.'),
                                                            truncated.lastIndexOf('!'),
                                                            truncated.lastIndexOf('?')
                                                          );

                                                          if (lastSentenceEnd > 150) {
                                                            excerpt = truncated.substring(0, lastSentenceEnd + 1);
                                                          } else {
                                                            const lastSpace = truncated.lastIndexOf(' ');
                                                            excerpt = lastSpace > 100 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
                                                          }
                                                        }

                                                        return excerpt;
                                                      })()}
                                                    </p>
                                                  )}

                                                  <div className="flex flex-wrap gap-1 mt-2">
                                                    {getSemanticKeywords(source).slice(0, 4).map((keyword: string, idx: number) => (
                                                      <button
                                                        key={idx}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleKeywordClick(source, keyword);
                                                        }}
                                                        className={`text-xs px-2 py-1 rounded-none font-medium transition-colors duration-200 ${getKeywordColor(keyword)}`}
                                                        title={`"${keyword}" ile ilgili araştırma yap`}
                                                      >
                                                        {keyword}
                                                      </button>
                                                    ))}
                                                    {source.score && (
                                                      <div className="flex items-center gap-1 flex-shrink-0">
                                                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                          <div
                                                            className="h-full bg-gradient-to-r from-slate-400 to-slate-600 dark:from-slate-500 dark:to-slate-400 transition-all duration-300"
                                                            style={{ width: `${Math.min(100, Math.round(source.score))}%` }}
                                                          />
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                                                          {Math.round(source.score)}
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
                                                  [message.id]: Math.min(visibleCount + 7, sortedSources.length)
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

                              <p className="text-xs opacity-60 mt-2">
                                {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
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
          <div className="max-w-4xl mx-auto p-4">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={chatbotSettings.placeholder}
                className="min-h-[60px] max-h-[120px] resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isLoading}
                size="lg"
                className="px-8"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                Enter ile gönder, Shift+Enter ile yeni satır
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{messages.length - 1} mesaj</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}