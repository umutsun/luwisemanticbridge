'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSocketIO } from '@/hooks/useSocketIO';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Send,
  Bot,
  User,
  Database,
  Brain,
  Sparkles,
  Search,
  FileText,
  Link,
  MessageSquare,
  Settings,
  History,
  Download,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Loader2,
  Info,
  ChevronDown,
  Zap,
  Code,
  BookOpen
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    sources?: string[];
    confidence?: number;
    queryMode?: string;
    processingTime?: number;
    tokens?: number;
  };
  feedback?: 'positive' | 'negative';
}

interface DataSource {
  id: string;
  name: string;
  type: 'document' | 'database' | 'api' | 'custom';
  connected: boolean;
  recordCount?: number;
}

interface ChatSettings {
  model: 'gpt-3.5' | 'gpt-4' | 'claude' | 'local';
  temperature: number;
  maxTokens: number;
  queryMode: 'simple' | 'hybrid' | 'graph' | 'deep';
  includeMetadata: boolean;
  streamResponse: boolean;
}

export default function DataChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'system',
      content: 'Merhaba! Ben Luwi Semantic Bridge AI asistanınız. Verileriniz hakkında sorularınızı yanıtlamaya hazırım. Size nasıl yardımcı olabilirim?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string>('Claude 3');

  // WebSocket connection - Connect to backend port, not frontend port
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
  console.log('DataChat: Connecting to WebSocket at:', backendUrl);
  const { socket, isConnected } = useSocketIO(backendUrl);

  // Fetch active model from settings
  useEffect(() => {
    const fetchModel = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/v2/settings/`);
        if (response.ok) {
          const data = await response.json();
          if (data.llmSettings?.activeChatModel) {
            const modelName = data.llmSettings.activeChatModel.split('/').pop() || data.llmSettings.activeChatModel;
            setActiveModel(modelName);
          }
        }
      } catch (error) {
        console.log('Failed to fetch model settings');
      }
    };

    fetchModel();
    const interval = setInterval(fetchModel, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [backendUrl]);

  const [dataSources, setDataSources] = useState<DataSource[]>([
    { id: '1', name: 'Database Knowledge Base', type: 'database', connected: true, recordCount: 1234 },
    { id: '2', name: 'Document Collection', type: 'document', connected: true, recordCount: 567 },
    { id: '3', name: 'Vector Database', type: 'database', connected: true, recordCount: 8901 }
  ]);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    model: 'gpt-3.5',
    temperature: 0.7,
    maxTokens: 2000,
    queryMode: 'hybrid',
    includeMetadata: true,
    streamResponse: false
  });
  const [showSettings, setShowSettings] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[][]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Suggested questions
  const suggestedQuestions = [
    'Veri setindeki ana temalar nelerdir?',
    'En çok referans verilen kavramları göster',
    'Machine Learning ile ilgili dokümanları listele',
    'Varlıklar arasındaki ilişkileri analiz et',
    'Son eklenen dokümanların özetini ver'
  ];

  // Send message
  const sendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateResponse(inputMessage),
        timestamp: new Date(),
        metadata: {
          sources: ['Document A', 'Knowledge Base', 'Vector Search'],
          confidence: 0.92,
          queryMode: chatSettings.queryMode,
          processingTime: 1234,
          tokens: 456
        }
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generate mock response
  const generateResponse = (query: string): string => {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('tema') || lowerQuery.includes('konu')) {
      return `Veri setinizde tespit edilen ana temalar:\n\n1. **Yapay Zeka ve Machine Learning** (342 doküman)\n   - Derin öğrenme algoritmaları\n   - Natural Language Processing\n   - Computer Vision uygulamaları\n\n2. **Veri Analizi** (218 doküman)\n   - İstatistiksel modelleme\n   - Veri görselleştirme\n   - Prediktif analitik\n\n3. **İş Zekası** (156 doküman)\n   - KPI takibi ve raporlama\n   - Stratejik planlama\n   - Performans metrikleri\n\nBu temalar arasında güçlü semantik bağlantılar tespit edildi. Özellikle ML ve veri analizi konuları %73 örtüşme gösteriyor.`;
    }
    
    if (lowerQuery.includes('machine learning') || lowerQuery.includes('ml')) {
      return `Machine Learning ile ilgili **47 doküman** bulundu:\n\n📄 **En Relevan Dokümanlar:**\n1. "Derin Öğrenme Temelleri" - Skor: 0.95\n2. "PyTorch ile Neural Network" - Skor: 0.92\n3. "Transformer Mimarisi" - Skor: 0.89\n\n🔗 **İlişkili Kavramlar:**\n- Neural Networks (32 bağlantı)\n- Deep Learning (28 bağlantı)\n- Data Science (24 bağlantı)\n\n💡 **Öneriler:**\nBu konuda daha detaylı bilgi için "Neural Networks" veya "Deep Learning" terimlerini sorgulayabilirsiniz.`;
    }
    
    if (lowerQuery.includes('ilişki') || lowerQuery.includes('bağlantı')) {
      return `Varlıklar arasında tespit edilen ilişki ağı:\n\n**Güçlü Bağlantılar (>0.8 korelasyon):**\n- OpenAI ↔ GPT Models (0.94)\n- Machine Learning ↔ Data Science (0.91)\n- Python ↔ TensorFlow (0.87)\n\n**Orta Bağlantılar (0.5-0.8):**\n- Business Intelligence ↔ Analytics (0.72)\n- Cloud Computing ↔ AWS (0.68)\n- API Development ↔ REST (0.65)\n\n**Merkezi Düğümler:**\n1. Machine Learning (127 bağlantı)\n2. Data Analysis (98 bağlantı)\n3. Python Programming (76 bağlantı)\n\n📊 Toplam 342 unique ilişki ve 8 ana küme tespit edildi.`;
    }
    
    return `"${query}" sorgunuz için veri setinde arama yapıldı.\n\n**Sonuçlar:**\n- 23 ilgili doküman bulundu\n- Ortalama relevans skoru: 0.78\n- İşlem süresi: 234ms\n\nDaha spesifik sonuçlar için sorgunuzu detaylandırabilirsiniz.`;
  };

  // Handle feedback
  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, feedback } : msg
    ));
  };

  // Copy message
  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  // Clear chat
  const clearChat = () => {
    if (messages.length > 1) {
      setChatHistory(prev => [...prev, messages]);
    }
    setMessages([messages[0]]);
  };

  // Scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <Card className="h-[700px] flex flex-col">
      <CardHeader className="border-b">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bot className="h-8 w-8 text-primary" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              {isConnected && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Veri Sohbet Asistanı</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {activeModel}
                </Badge>
              </div>
              <CardDescription>
                Verilerinizle doğal dilde iletişim kurun
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Veri Kaynağı" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kaynaklar</SelectItem>
                {dataSources.map(source => (
                  <SelectItem key={source.id} value={source.id}>
                    <div className="flex items-center gap-2">
                      {source.type === 'database' && <Database className="h-3 w-3" />}
                      {source.type === 'document' && <FileText className="h-3 w-3" />}
                      {source.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={clearChat}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Model</label>
                <Select
                  value={chatSettings.model}
                  onValueChange={(value: any) => setChatSettings({...chatSettings, model: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-3.5">GPT-3.5 Turbo</SelectItem>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="claude">Claude</SelectItem>
                    <SelectItem value="local">Local LLM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Sorgu Modu</label>
                <Select
                  value={chatSettings.queryMode}
                  onValueChange={(value: any) => setChatSettings({...chatSettings, queryMode: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Basit</SelectItem>
                    <SelectItem value="hybrid">Hibrit</SelectItem>
                    <SelectItem value="graph">Graf Tabanlı</SelectItem>
                    <SelectItem value="deep">Derin Analiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 p-0 flex flex-col">
        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role !== 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {message.role === 'assistant' ? (
                        <Bot className="h-5 w-5 text-primary" />
                      ) : (
                        <Info className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                )}
                
                <div className={`flex-1 max-w-[70%] ${
                  message.role === 'user' ? 'order-first' : ''
                }`}>
                  <div className={`rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    {message.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    ) : (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground/90">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => (
                              <h1 className="text-lg font-bold mt-4 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-base font-semibold mt-3 mb-2">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-sm font-semibold mt-2 mb-1">
                                {children}
                              </h3>
                            ),
                            p: ({ children }) => (
                              <p className="my-2 leading-relaxed">
                                {children}
                              </p>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-semibold">
                                {children}
                              </strong>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc list-outside ml-4 my-2 space-y-1">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal list-outside ml-4 my-2 space-y-1">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="pl-1">
                                {children}
                              </li>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 pl-3 py-2 my-3 italic">
                                {children}
                              </blockquote>
                            ),
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">
                                  {children}
                                </code>
                              ) : (
                                <code className="block bg-gray-200 dark:bg-gray-700 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    
                    {message.metadata && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex flex-wrap gap-2 text-xs">
                          {message.metadata.sources && (
                            <Badge variant="outline" className="text-xs">
                              <Search className="h-3 w-3 mr-1" />
                              {message.metadata.sources.length} Kaynak
                            </Badge>
                          )}
                          {message.metadata.confidence && (
                            <Badge variant="outline" className="text-xs">
                              Güven: {(message.metadata.confidence * 100).toFixed(0)}%
                            </Badge>
                          )}
                          {message.metadata.processingTime && (
                            <Badge variant="outline" className="text-xs">
                              {message.metadata.processingTime}ms
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {message.role === 'assistant' && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          onClick={() => copyMessage(message.content)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-6 px-2 ${
                            message.feedback === 'positive' ? 'text-green-500' : ''
                          }`}
                          onClick={() => handleFeedback(message.id, 'positive')}
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-6 px-2 ${
                            message.feedback === 'negative' ? 'text-red-500' : ''
                          }`}
                          onClick={() => handleFeedback(message.id, 'negative')}
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 ml-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <User className="h-5 w-5" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Analiz ediliyor...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested Questions */}
        {messages.length === 1 && (
          <div className="p-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">Örnek sorular:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => setInputMessage(question)}
                  className="text-xs"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Verileriniz hakkında soru sorun..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={loading || !inputMessage.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex justify-between items-center mt-2">
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                {dataSources.filter(d => d.connected).length} Kaynak Bağlı
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {chatSettings.queryMode} Mod
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {inputMessage.length}/4000
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}