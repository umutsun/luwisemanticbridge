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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
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

export default function ChatInterface() {
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

  // Default questions for fallback
  const defaultQuestions = [
    // KDV ve Satış Vergileri
    'KDV oranları hangi mal ve hizmetlerde değişti?',
    'KDV iadesi başvuru süreci nasıl işler?',
    'İndirimli KDV uygulaması hangi durumlarda geçerli?',
    'KDV tevkifatı oranları nedir?',
    'E-fatura düzenleme zorunluluğu kimleri kapsar?',
    'KDV beyannamesi düzenleme ve ödeme süreleri',
    'İhracatta KDV istisnası nasıl uygulanır?',
    'Özel matrah şekilleri nelerdir?',
    
    // Gelir ve Kurumlar Vergisi
    'Gelir vergisi dilimleri ve oranları 2024',
    'Kurumlar vergisi istisnaları nelerdir?',
    'Ar-Ge indirimi şartları ve oranları',
    'Yıllık gelir vergisi beyannamesi nasıl verilir?',
    'Stopaj oranları hangi ödemelerde uygulanır?',
    'Geçici vergi dönemleri ve hesaplama',
    'Transfer fiyatlandırması düzenlemeleri',
    'Kontrol edilen yabancı kurum kazancı',
    
    // Vergi Usul ve Mevzuat
    'Vergi cezaları ve indirim oranları',
    'Mücbir sebep halleri nelerdir?',
    'Vergi dairesi işlemleri nasıl yapılır?',
    'Defter tutma yükümlülüğü kimleri kapsar?',
    'E-defter uygulaması zorunlu mu?',
    'Vergi incelemesi süreçleri nasıl işler?',
    'Uzlaşma komisyonu başvuru şartları',
    'Vergi affı ve yapılandırma imkanları',
    
    // Danıştay Kararları ve Özelgeler
    'Son Danıştay vergi dava kararları',
    'Özelge başvurusu nasıl yapılır?',
    'Emsal Danıştay kararları nelerdir?',
    'Vergi mahkemesi itiraz süreleri',
    'İstinaf ve temyiz başvuru şartları',
    
    // Özel Konular
    'Dijital hizmet vergisi kimleri kapsar?',
    'Konaklama vergisi oranları nedir?',
    'Motorlu taşıtlar vergisi hesaplama',
    'Değerli konut vergisi uygulaması',
    'Damga vergisi oranları ve istisnaları',
    'Harçlar kanunu uygulamaları',
    'Gümrük vergisi muafiyetleri',
    'Özel tüketim vergisi oranları',
    'Banka ve sigorta muameleleri vergisi',
    'Çevre temizlik vergisi tarifeleri',
    'Emlak vergisi matrah ve oranları'
  ];

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
    // Fallback to random default questions
    const shuffled = [...defaultQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4);
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
      const response = await fetch('/api/chat', {
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

  const handleSourceClick = async (source: any) => {
    // Create a more intelligent search query based on the source
    const cleanTitle = (source.title || '').replace(/ - ID: \d+/g, '').replace(/ \(Part \d+\/\d+\)/g, '').replace(/^sorucevap -\s*/, '').replace(/^ozelgeler -\s*/, '').trim();
    const sourceType = getTableDisplayName(source.sourceTable || (source.databaseInfo && source.databaseInfo.table));
    const category = source.category || '';
    const excerpt = source.excerpt || source.content || '';

    // Create a context-aware search query
    let searchQuery = '';

    // Content analysis for better question generation
    const hasQuestionWords = /(?:nedir|nasıl|neden|hangi|kim|ne zaman|kaç|nerede|ne|mi|mu|mü|mı)/i.test(excerpt);
    const hasLegalTerms = /(?:tevkiğ|kararı|kanunu|tüzüğü|yönetmeliği|tebliği|genelge|sirküler)/i.test(cleanTitle);
    const hasTaxTerms = /(?:vergi|stopaj|kdv|ötv|gv|kv|kurumlar|damga|harç)/i.test(cleanTitle);
    const isAboutProcedure = /(?:prosedür|süreç|uygulama|başvuru|talep)/i.test(cleanTitle);
    const isAboutDefinition = /(?:tanımı|kapsamı|unsurları|özellikleri)/i.test(cleanTitle);

    // Extract key topic from the title (remove table prefixes and IDs)
    const topic = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;

    // Enhanced question patterns based on content type and context
    if (sourceType === 'Soru-Cevap' && (excerpt.includes('Cevap:') || excerpt.includes('Yanıt:'))) {
      searchQuery = `"${topic}" konusunda bana detaylı bilgi ve örnekler verebilir misin? Bu konuda sıkça sorulan soruları da açıklar mısın?`;
    } else if (category === 'Mevzuat' && hasLegalTerms) {
      searchQuery = `"${topic}" ile ilgili bilmeniz gereken en önemli bilgileri anlatabilir misin? Kimleri kapsar, nasıl uygulanır?`;
    } else if (category === 'Mevzuat' && hasTaxTerms) {
      searchQuery = `"${topic}" hakkında detaylı bilgi alabilir miyim? Oranı, kimleri etkilediği ve istisnaları nelerdir?`;
    } else if (sourceType === 'Danıştay' || category === 'İçtihat') {
      searchQuery = `"${topic}" kararının içtihat değeri nedir? Bu kararın pratikteki sonuçları ve emsal oluşturup oluşturmadığını açıklar mısın?`;
    } else if (isAboutProcedure) {
      searchQuery = `"${topic}" sürecini adım adım anlatabilir misin? Başvuru için gerekli belgeler ve dikkat edilmesi gerekenler nelerdir?`;
    } else if (isAboutDefinition) {
      searchQuery = `"${topic}" nedir ve nasıl uygulanır? Kapsamına giren durumlar ve istisnaları hakkında bilgi verir misin?`;
    } else if (cleanTitle.includes('istisna')) {
      searchQuery = `"${topic}" hangi durumlarda uygulanır? Kimler bu istisnadan yararlanabilir ve şartları nelerdir?`;
    } else if (cleanTitle.includes('defter') || cleanTitle.includes('elektronik')) {
      searchQuery = `"${topic}" ile ilgili uygulama usulünü, süresini ve yükümlülükleri detaylı olarak açıklar mısın?`;
    } else if (hasQuestionWords) {
      searchQuery = `"${topic}" konusundaki bu sorunun cevabını detaylandırır mısın? Benzer durumlar için de bilgi verir misin?`;
    } else {
      // More natural and conversational generic questions
      const questionPatterns = [
        `"${topic}" hakkında bana kapsamlı bilgi verebilir misin?`,
        `"${topic}" konusunda ne gibi bilgiler paylaşabilirsin? Detaylı açıklama yapar mısın?`,
        `"${topic}" ile ilgili en önemli noktaları anlatabilir misin? Pratik örnekler verirsen çok sevinirim.`,
        `"${topic}" konusunu baştan sona açıklayabilir misin? Kimleri etkiler ve nasıl uygulanır?`
      ];
      searchQuery = questionPatterns[Math.floor(Math.random() * questionPatterns.length)];
    }

    setInputText(searchQuery);
    textareaRef.current?.focus();

    // Don't automatically send, let the user review and edit
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
                                  // Limit to max 15 sources even if more are returned
                                  const limitedSources = message.sources.slice(0, 15);
                                  const sortedSources = limitedSources.sort((a, b) => (b.score || 0) - (a.score || 0));
                                  const visibleCount = visibleSourcesCount[message.id] || 7;
                                  const visibleSources = sortedSources.slice(0, visibleCount);
                                  const hasMore = sortedSources.length > visibleCount;
                                  
                                  return (
                                    <>
                                      <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm font-semibold">İlgili Konular</p>
                                        <span className="text-xs text-muted-foreground">
                                          {limitedSources.length} konu
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        {visibleSources.map((source, idx) => (
                                    <div
                                      key={idx}
                                      className="relative p-3 rounded-lg bg-card border hover:shadow-md transition-all cursor-pointer group"
                                      onClick={() => handleSourceClick(source)}
                                      title="Bu kaynakla ilgili detaylı araştırma yap"
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
                                          <div className="flex items-start justify-between gap-2">
                                            <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                                              {(() => {
                                                let title = source.title?.replace(/ - ID: \d+/g, '')?.replace(/ \(Part \d+\/\d+\)/g, '')?.replace(/^sorucevap -\s*/, '')?.replace(/^ozelgeler -\s*/, '')?.trim() || source.citation || `Kaynak ${idx + 1}`;

                                                // Add category if available
                                                if (source.category && source.category !== 'Kaynak') {
                                                  title += ` (${source.category})`;
                                                }

                                                return title;
                                              })()}
                                            </h4>
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
                                          {source.excerpt && (
                                            <p className="text-xs text-muted-foreground line-clamp-3 mt-1.5 pl-0.5">
                                              {(() => {
                                                let excerpt = source.excerpt;

                                                // Remove "Cevap:" prefix and clean up
                                                excerpt = excerpt.replace(/^Cevap:\s*/i, '').trim();

                                                // Limit to 150 characters and break at word boundary
                                                if (excerpt.length > 150) {
                                                  const truncated = excerpt.substring(0, 150);
                                                  const lastSpace = truncated.lastIndexOf(' ');
                                                  excerpt = lastSpace > 50 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
                                                }

                                                return excerpt;
                                              })()}
                                            </p>
                                          )}
                                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            {source.category && (
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getCategoryColor(source.category)}`}>
                                                {source.category}
                                              </span>
                                            )}
                                            {(source.sourceTable || source.databaseInfo?.table) && (
                                              <div className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                <span>{getTableDisplayName(source.sourceTable || source.databaseInfo?.table)}</span>
                                              </div>
                                            )}
                                            {source.metadata?.documentType && (
                                              <Badge variant="secondary" className="text-xs py-0 h-5">
                                                {source.metadata.documentType}
                                              </Badge>
                                            )}
                                            {source.metadata?.date && (
                                              <span className="text-xs text-muted-foreground">
                                                {new Date(source.metadata.date).toLocaleDateString('tr-TR')}
                                              </span>
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
              <MessageSquare className="w-3 h-3" />
              {messages.length - 1} mesaj
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}