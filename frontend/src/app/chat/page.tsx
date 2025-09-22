'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import SourceCitation from '@/components/SourceCitation';
import { 
  Send, 
  Bot, 
  User,
  Sparkles,
  MessageSquare,
  Loader2,
  RefreshCw,
  Home,
  Brain,
  Zap,
  Database,
  Search,
  Globe,
  Code,
  FileText,
  Activity,
  Shield,
  Cpu,
  ArrowRight,
  ChevronRight,
  Layers,
  Workflow
} from 'lucide-react';
import Link from 'next/link';
import config, { getEndpoint } from '@/config/api.config';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
  context?: string[];
  isTyping?: boolean;
}

interface SystemStatus {
  database: boolean;
  redis: boolean;
  semantic: boolean;
  n8n: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '👋 Merhaba! Ben Alice, AI destekli asistanınızım. Size nasıl yardımcı olabilirim?',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeContext, setActiveContext] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    database: false,
    redis: false,
    semantic: false,
    n8n: false
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check system status
  useEffect(() => {
    const checkSystemStatus = async () => {
      try {
        // Check database
        const dbResponse = await fetch('/api/database/status');
        const redisResponse = await fetch('/api/redis/status');
        const n8nResponse = await fetch('/api/n8n/health');
        
        setSystemStatus({
          database: dbResponse.ok,
          redis: redisResponse.ok,
          semantic: dbResponse.ok, // Semantic depends on database
          n8n: n8nResponse.ok
        });
      } catch (error) {
        console.log('System status check failed:', error);
        // Keep all as false if check fails
      }
    };

    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

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
        body: JSON.stringify({
          message: input,
          useSemanticSearch: true,
          provider: 'claude',
          context: activeContext,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      setMessages(prev => prev.filter(m => m.id !== 'typing'));
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message?.content || data.response || data.message || 'Üzgünüm, bir yanıt alınamadı.',
        timestamp: new Date(),
        sources: data.sources,
        context: data.context,
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      if (data.context) {
        setActiveContext(data.context);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => prev.filter(m => m.id !== 'typing'));
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: '👋 Merhaba! Ben Alice, AI destekli asistanınızım. Size nasıl yardımcı olabilirim?',
        timestamp: new Date(),
      }
    ]);
    setActiveContext([]);
  };

  const quickActions = [
    { label: 'Nasıl çalışıyorsun?', icon: Brain },
    { label: 'Neler yapabilirsin?', icon: Sparkles },
    { label: 'Veritabanı durumu', icon: Database },
    { label: 'API entegrasyonu', icon: Code },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 dark:from-white dark:via-gray-50 dark:to-white relative overflow-hidden">
      {/* Enhanced Animated Glassmorphic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-500/10 dark:bg-violet-500/5 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl animate-float" style={{animationDelay: '2s'}} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-violet-500/5 to-blue-500/5 dark:from-violet-500/3 dark:to-blue-500/3 rounded-full blur-3xl animate-glow" style={{animationDelay: '1s'}} />
        <div className="absolute top-20 left-1/3 w-64 h-64 bg-cyan-500/5 dark:bg-cyan-500/3 rounded-full blur-2xl animate-float" style={{animationDelay: '3s', animationDuration: '8s'}} />
        <div className="absolute bottom-20 right-1/3 w-72 h-72 bg-pink-500/5 dark:bg-pink-500/3 rounded-full blur-2xl animate-float" style={{animationDelay: '4s', animationDuration: '10s'}} />
      </div>
      
      {/* Modern Header */}
      <div className="backdrop-blur-xl bg-gray-900/70 dark:bg-white/70 border-b border-gray-800 dark:border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600 blur-lg opacity-50"></div>
                <div className="relative p-2.5 bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl shadow-lg">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white dark:text-gray-900">
                  Alice Semantic Bridge
                </h1>
                <p className="text-xs text-gray-400 dark:text-gray-600">AI-Powered Intelligent Assistant</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* System Status Indicators */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 dark:bg-gray-100/50 rounded-lg backdrop-blur glass-morphism-dark">
                <div className="flex items-center gap-1 group relative">
                  <div className={`w-2 h-2 rounded-full ${systemStatus.database ? 'bg-green-500' : 'bg-red-500'} status-pulse`} />
                  <Database className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                  <span className="absolute -bottom-6 left-0 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Database</span>
                </div>
                <div className="flex items-center gap-1 group relative">
                  <div className={`w-2 h-2 rounded-full ${systemStatus.redis ? 'bg-green-500' : 'bg-red-500'} status-pulse`} />
                  <Zap className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                  <span className="absolute -bottom-6 left-0 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Redis</span>
                </div>
                <div className="flex items-center gap-1 group relative">
                  <div className={`w-2 h-2 rounded-full ${systemStatus.semantic ? 'bg-green-500' : 'bg-red-500'} status-pulse`} />
                  <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                  <span className="absolute -bottom-6 left-0 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Semantic</span>
                </div>
                <div className="flex items-center gap-1 group relative">
                  <div className={`w-2 h-2 rounded-full ${systemStatus.n8n ? 'bg-green-500' : 'bg-red-500'} status-pulse`} />
                  <Workflow className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                  <span className="absolute -bottom-6 left-0 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">n8n</span>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Yeni Sohbet
              </Button>
              
              <Link href="/dashboard">
                <Button 
                  size="sm"
                  className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-md"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Left Sidebar - Context & Features */}
          <div className="lg:col-span-1 space-y-4">
            {/* Active Context Card */}
            <Card className="backdrop-blur-xl bg-gray-900/80 dark:bg-white/80 border-gray-700 dark:border-gray-200 shadow-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-violet-600" />
                    <CardTitle className="text-base text-white dark:text-gray-900">AI Context</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {activeContext.length > 0 ? (
                  <div className="space-y-2">
                    {activeContext.map((ctx, idx) => (
                      <div key={idx} className="p-2 bg-violet-900/20 dark:bg-violet-50 rounded-lg border border-violet-700 dark:border-violet-200">
                        <p className="text-xs text-gray-300 dark:text-gray-700">{ctx}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No active context</p>
                )}
              </CardContent>
            </Card>

            {/* Features Card */}
            <Card className="backdrop-blur-xl bg-gray-900/80 dark:bg-white/80 border-gray-700 dark:border-gray-200 shadow-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-base text-white dark:text-gray-900">Capabilities</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-200 dark:text-gray-700">pgvector Database</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm text-gray-200 dark:text-gray-700">Redis Cache</span>
                </div>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-200 dark:text-gray-700">Semantic Search</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-purple-600" />
                  <span className="text-sm text-gray-200 dark:text-gray-700">Web Scraping</span>
                </div>
                <div className="flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-gray-200 dark:text-gray-700">n8n Workflows</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-gray-200 dark:text-gray-700">Secure Processing</span>
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white border-0 shadow-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  <CardTitle className="text-base">Statistics</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm opacity-90">Messages</span>
                  <span className="font-bold">{messages.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm opacity-90">Context Items</span>
                  <span className="font-bold">{activeContext.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm opacity-90">Response Time</span>
                  <span className="font-bold">~1.2s</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Chat Area */}
          <Card className="lg:col-span-3 flex flex-col backdrop-blur-xl bg-gray-900/90 dark:bg-white/90 border-gray-700 dark:border-gray-200 shadow-2xl h-[calc(100vh-8rem)]">
            <CardHeader className="border-b border-gray-800 dark:border-gray-200 bg-gradient-to-r from-gray-900/50 to-gray-800/50 dark:from-violet-50 dark:to-blue-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 border-2 border-violet-600">
                    <AvatarFallback className="bg-gradient-to-br from-violet-600 to-blue-600 text-white">
                      <Bot className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg text-white dark:text-gray-900">Alice Assistant</CardTitle>
                    <CardDescription className="text-xs text-gray-400 dark:text-gray-600">
                      Powered by Advanced AI & <span className="text-cyan-400 dark:text-cyan-600">Semantic</span> Technology
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`transition-all ${
                    Object.values(systemStatus).some(v => v) 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 status-pulse ${
                      Object.values(systemStatus).some(v => v) ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    {Object.values(systemStatus).some(v => v) ? 'Online' : 'Limited'}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                {messages.map((message) => {
                  return (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'justify-end animate-slideInRight' : 'justify-start animate-slideInLeft'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <Avatar className="w-9 h-9 border border-gray-200 dark:border-gray-700">
                          <AvatarFallback className="bg-gradient-to-br from-violet-600 to-blue-600 text-white text-sm">
                            <Bot className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      
                      <div className={`max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`rounded-2xl px-4 py-3 shadow-md transition-all message-bubble ${
                            message.role === 'user'
                              ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white'
                              : message.isTyping 
                                ? 'bg-gray-800 dark:bg-gray-100 glass-morphism-dark'
                                : 'bg-gray-800 dark:bg-white border border-gray-700 dark:border-gray-200 glass-morphism-dark'
                          }`}
                        >
                          {message.isTyping ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                              <span className="text-sm text-gray-600 dark:text-gray-400">Düşünüyorum...</span>
                            </div>
                          ) : (
                            <div className={`text-sm leading-relaxed whitespace-pre-wrap ${
                              message.role === 'assistant' ? 'text-gray-100 dark:text-gray-800' : ''
                            }`}>
                              {message.role === 'assistant' ? (
                                <div className="space-y-2">
                                  {message.content.split('\n').map((paragraph, idx) => (
                                    <p key={idx} className="relative">
                                      {paragraph.split(/(\*\*[^*]+\*\*|\`[^`]+\`|"[^"]+"|'[^']+'|\b(?:AI|semantic|vector|database|context|embedding|neural|model|Alice|ASB|n8n|pgvector|Redis)\b)/gi).map((part, partIdx) => {
                                        if (part.startsWith('**') && part.endsWith('**')) {
                                          return <span key={partIdx} className="font-bold marker-cyan">{part.slice(2, -2)}</span>;
                                        } else if (part.startsWith('`') && part.endsWith('`')) {
                                          return <code key={partIdx} className="px-2 py-0.5 marker-yellow font-mono text-xs rounded">{part.slice(1, -1)}</code>;
                                        } else if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
                                          return <span key={partIdx} className="marker-pink italic">{part}</span>;
                                        } else if (/\b(AI|semantic|vector|database|context|embedding|neural|model|Alice|ASB|n8n|pgvector|Redis)\b/i.test(part)) {
                                          return <span key={partIdx} className="marker-green font-medium">{part}</span>;
                                        }
                                        return part;
                                      })}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                message.content
                              )}
                            </div>
                          )}
                        </div>
                        
                        {message.sources && message.sources.length > 0 && (
                          <SourceCitation sources={message.sources} />
                        )}
                        
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500 px-1">
                          {message.timestamp instanceof Date 
                            ? message.timestamp.toLocaleTimeString('tr-TR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                          }
                        </p>
                      </div>
                      
                      {message.role === 'user' && (
                        <Avatar className="w-9 h-9 border border-gray-200 dark:border-gray-700">
                          <AvatarFallback className="bg-gradient-to-br from-blue-600 to-violet-600 text-white text-sm">
                            <User className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            
            {/* Input Area */}
            <div className="border-t border-gray-800 dark:border-gray-200 p-4 bg-gray-900/50 dark:bg-gray-50/50">
              {/* Quick Actions */}
              <div className="mb-3 flex flex-wrap gap-2">
                {quickActions.map((action, idx) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => setInput(action.label)}
                      className="text-xs bg-gray-800 dark:bg-gray-100 text-gray-300 dark:text-gray-700 hover:bg-violet-900/20 hover:text-violet-400 hover:border-violet-500 dark:hover:bg-violet-50 dark:hover:text-violet-700 dark:hover:border-violet-300 transition-colors"
                    >
                      <Icon className="w-3 h-3 mr-1" />
                      {action.label}
                    </Button>
                  );
                })}
              </div>
              
              <form onSubmit={handleSubmit} className="flex gap-3">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Mesajınızı yazın..."
                    disabled={isLoading}
                    className="pr-10 bg-gray-800 dark:bg-white border-gray-700 dark:border-gray-300 text-white dark:text-gray-900 placeholder-gray-500 dark:placeholder-gray-400 focus:border-violet-500 dark:focus:border-violet-600 transition-all"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    {input.length > 0 && `${input.length}/500`}
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={!input.trim() || isLoading}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Gönder
                    </>
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}