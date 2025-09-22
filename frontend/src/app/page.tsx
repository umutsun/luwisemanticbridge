'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import config, { getEndpoint } from '@/config/api.config';
import { 
  Send, 
  Bot, 
  User,
  Sparkles,
  MessageSquare,
  Loader2,
  RefreshCw,
  Brain,
  FileText,
  ChevronRight,
  Plus,
  X,
  ExternalLink,
  BookOpen,
  Database,
  CheckCircle2,
  Settings,
  ChevronDown,
  Search,
  Link2
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';
import SourceCitation from '@/components/SourceCitation';
import SemanticSearchResult from '@/components/SemanticSearchResult';
import { createEnhancedSourceClickHandler } from '@/utils/semantic-search-enhancement';
import {
  SearchResult,
  SearchContext,
  generateContextualQuestion,
  analyzeSearchContext,
  searchResultsToPrompt,
  extractTheme,
  generateQuestionFromExcerpt
} from '@/utils/semantic-search-prompt';
import {
  extractSemanticKeywords,
  generateTagKeywords,
  getKeywordColor,
  generateSearchQueryFromKeywords
} from '@/utils/keyword-extraction';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
  relatedTopics?: any[];
  context?: string[];
  isTyping?: boolean;
  isFromSource?: boolean; // Track if message came from clicking a source
}

// Kategori renklerini ve tablo isimlerini belirle
const getCategoryColor = (category: string): string => {
  const categoryLower = category?.toLowerCase() || '';
  if (categoryLower.includes('mevzuat')) return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800';
  if (categoryLower.includes('özelge')) return 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950 dark:border-purple-800';
  if (categoryLower.includes('makale')) return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800';
  if (categoryLower.includes('karar') || categoryLower.includes('danıştay')) return 'text-indigo-600 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-950 dark:border-indigo-800';
  if (categoryLower.includes('sirküler')) return 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950 dark:border-rose-800';
  if (categoryLower.includes('doküman')) return 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800';
  return 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700';
};

const getTableDisplayName = (tableName: string): string => {
  const tableMap: { [key: string]: string } = {
    'OZELGELER': 'Özelgeler',
    'DANISTAYKARARLARI': 'Danıştay',
    'MAKALELER': 'Makaleler',
    'DOKUMAN': 'Dokümanlar',
    'MEVZUAT': 'Mevzuat',
    'sorucevap': 'Soru-Cevap',
    'documents': 'Dokümanlar',
    'conversations': 'Sohbetler',
    'messages': 'Mesajlar'
  };
  return tableMap[tableName] || tableName;
};

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

const getSourceTableBadgeColor = (sourceTable?: string) => {
  switch (sourceTable) {
    case 'OZELGELER':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'DANISTAYKARARLARI':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'MAKALELER':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'SORUCEVAP':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

export default function ChatInterface() {
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
      // Simple extraction from title - only tax types and numbers
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
    const relevanceScore = (source.score as number) || (source.relevanceScore as number) || 0;
    const context = {
      title: (source.title as string) || '',
      excerpt: (source.excerpt as string) || (source.content as string) || '',
      category: (source.category as string) || '',
      sourceType: (source.table as string) || (source.sourceTable as string) || '',
      relevanceScore: relevanceScore
    };

    // Get all semantic keywords from the source
    const allKeywords = getSemanticKeywords(source);

    // Prioritize the clicked keyword and add related context
    const keywordContext = {
      ...context,
      // Ensure the clicked keyword is first, then add other relevant keywords
      primaryKeyword: keyword,
      relatedKeywords: allKeywords.filter(k => k !== keyword).slice(0, 3)
    };

    // Generate enhanced search query with specific source context
    const searchQuery = generateSearchQueryFromKeywords(
      [keyword, ...keywordContext.relatedKeywords],
      context
    );

    // Set the generated query and focus the input
    setInputText(searchQuery);
    textareaRef.current?.focus();
  };

  // Chatbot settings state with loading indicator
  const [chatbotSettings, setChatbotSettings] = useState({
    title: '',
    subtitle: '',
    logoUrl: '',
    welcomeMessage: '',
    placeholder: 'Sorunuzu yazın...',
    primaryColor: '#3B82F6'
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
      content: 'Merhaba! Ben Alice Semantic Bridge AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim. Nasıl yardımcı olabilirim?',
      timestamp: new Date(),
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [visibleSourcesCount, setVisibleSourcesCount] = useState<{ [key: string]: number }>({});
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
    
    // Fetch chatbot settings
    fetch('http://localhost:8083/api/v2/chatbot/settings')
      .then(res => res.json())
      .then(data => {
        setChatbotSettings({
          title: data.title || 'ASB Hukuki Asistan',
          subtitle: data.subtitle || 'Yapay Zeka Asistanınız',
          logoUrl: data.logoUrl || '',
          welcomeMessage: data.welcomeMessage || 'Merhaba! Ben AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.',
          placeholder: data.placeholder || 'Sorunuzu yazın...',
          primaryColor: data.primaryColor || '#3B82F6'
        });
        setSettingsLoaded(true);
        
        // Update initial message with dynamic welcome message
        setMessages(prev => [{
          ...prev[0],
          content: data.welcomeMessage || prev[0].content
        }]);
      })
      .catch(err => {
        console.error('Failed to fetch chatbot settings:', err);
        // Set default values on error
        setChatbotSettings({
          title: 'ASB Hukuki Asistan',
          subtitle: 'Yapay Zeka Asistanınız',
          logoUrl: '',
          welcomeMessage: 'Merhaba! Ben AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.',
          placeholder: 'Sorunuzu yazın...',
          primaryColor: '#3B82F6'
        });
        setSettingsLoaded(true);
      });
  }, []);

  // Yeni sohbet başlatıldığında soruları yenile
  useEffect(() => {
    if (isClient && showSuggestions && messages.length === 1) {
      fetchSuggestedQuestions().then(questions => {
        setSuggestedQuestions(questions);
      });
    }
  }, [showSuggestions, messages.length, isClient]);

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
        },
        body: JSON.stringify({ message: messageContent }),
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

  // Handle question selection from semantic search results
  const handleQuestionSelect = (question: string) => {
    setInputText(question);
    textareaRef.current?.focus();
  };

  // Handle tag click for refined search
  const handleTagClick = (tag: string) => {
    setInputText(tag);
    textareaRef.current?.focus();
  };

  // Handle tag append to current query
  const handleTagAppend = (tag: string) => {
    setInputText(prev => prev ? `${prev} ${tag}` : tag);
    textareaRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([{
      id: '1',
      role: 'assistant',
      content: 'Merhaba! Ben Alice Semantic Bridge AI asistanınız. Size nasıl yardımcı olabilirim?',
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
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                Yönetim Paneli
              </Button>
            </Link>
            <Link href="/dashboard/prompts">
              <Button variant="ghost" size="icon" title="Chatbot Ayarları">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearChat}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Yeni Sohbet
            </Button>
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
                                <Link2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              )}
                              <p className="text-sm whitespace-pre-wrap flex-1">{message.content}</p>
                            </div>
                            
                            {message.sources && message.sources.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-border/50">
                                {(() => {
                                  // Remove filter and show all sources
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
                                            onClick={() => {
                                              console.log('Clicked source:', {
                                                id: source.id,
                                                title: source.title,
                                                question: source.question,
                                                sourceTable: source.sourceTable,
                                                hasContent: !!source.content
                                              });
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
                                                {/* Source Table Badge only */}
                                                {source.sourceTable && (
                                                  <Badge variant="secondary" className="text-xs mb-2">
                                                    {source.sourceTable}
                                                  </Badge>
                                                )}

                                                {/* LLM-generated content or processed excerpt */}
                                                {source.content && (
                                                  <p className="text-xs text-muted-foreground line-clamp-4 mt-1.5 pl-0.5">
                                                    {source.content}
                                                  </p>
                                                )}
                                                {source.excerpt && !source.content && (
                                                  <p className="text-xs text-muted-foreground line-clamp-4 mt-1.5 pl-0.5">
                                                    {(() => {
                                                      let excerpt = source.excerpt;

                                                      // Remove "Cevap:" prefix and clean up
                                                      excerpt = excerpt.replace(/^Cevap:\s*/i, '').trim();

                                                      // If still incomplete, complete naturally
                                                      if (!/[.!?]$/.test(excerpt)) {
                                                        // Complete based on content patterns
                                                        if (excerpt.includes('şart') || excerpt.includes('gerekir')) {
                                                          excerpt += ' ve bu durumda ilgili mevzuat hükümleri uygulanır.';
                                                        } else if (excerpt.includes('yıl') || excerpt.includes('süre')) {
                                                          excerpt += ' Bu süre hesaplanırken belirli şartlar göz önünde bulundurulur.';
                                                        } else if (excerpt.includes('vergi') || excerpt.includes('ödeme')) {
                                                          excerpt += ' Bu konuda ilgili kanun hükümleri referans alınır.';
                                                        } else if (excerpt.includes('sözleşme')) {
                                                          excerpt += ' Bu hüküm sözleşme hukuku açısından önem arz eder.';
                                                        } else if (excerpt.includes('dava')) {
                                                          excerpt += ' Bu durumda hukuki yolların izlenmesi mümkündür.';
                                                        } else {
                                                          excerpt += ' Konuyla ilgili detaylı bilgilere kaynaklardan ulaşılabilir.';
                                                        }
                                                      }

                                                      // Allow longer excerpts (up to 250 characters)
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
                                                {/* Semantic Keywords instead of static tags */}
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

                            {/* Related Topics Section */}
                            {message.relatedTopics && message.relatedTopics.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-purple-200/50 dark:border-purple-800/50">
                                <div className="mb-3 flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                                    <Search className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                  </div>
                                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                    İlgili Konular
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {(message.relatedTopics || []).map((topic, index) => {
                                    // Convert related topic to SearchResult format
                                    const searchResult: SearchResult = {
                                      id: topic.id || `topic-${index}`,
                                      title: topic.title || '',
                                      content: topic.content || topic.excerpt || '',
                                      excerpt: topic.excerpt || topic.content || '',
                                      category: topic.category || 'Genel',
                                      sourceTable: topic.sourceTable || 'Konu',
                                      score: topic.relevanceScore || topic.score || 80,
                                      relevanceScore: topic.relevanceScore || topic.score || 80,
                                      keywords: extractSemanticKeywords({
                                        title: topic.title || '',
                                        excerpt: topic.excerpt || topic.content || '',
                                        category: topic.category || '',
                                        sourceType: topic.sourceTable || '',
                                        relevanceScore: topic.relevanceScore || topic.score || 80
                                      }).keywords.slice(0, 3)
                                    };

                                    // Create search context
                                    const searchContext: SearchContext = {
                                      query: message.content,
                                      results: [searchResult],
                                      topScore: searchResult.score,
                                      averageScore: searchResult.score,
                                      theme: extractTheme(searchResult),
                                      intent: 'informational'
                                    };

                                    return (
                                      <SemanticSearchResult
                                        key={topic.id || index}
                                        result={searchResult}
                                        context={searchContext}
                                        index={index}
                                        onQuestionSelect={handleQuestionSelect}
                                        onTagClick={handleTagClick}
                                        onTagAppend={handleTagAppend}
                                        showSourceTable={false}
                                      />
                                    );
                                  })}
                                </div>
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
              <MessageSquare className="w-3 h-3" />
              {messages.length - 1} mesaj
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}