"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_CONFIG } from "@/lib/config";
import {
  RefreshCw,
  Search,
  Trash2,
  MessageSquare,
  Loader2
} from "lucide-react";

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: any[];
  created_at: string;
  model?: string;
}

interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

interface Stats {
  total_conversations: number;
  total_messages: number;
  today_conversations: number;
  today_messages: number;
}

export default function MessagesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<Stats>({
    total_conversations: 0,
    total_messages: 0,
    today_conversations: 0,
    today_messages: 0
  });

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.conversations}?limit=100`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);

        // Calculate stats
        const today = new Date().toDateString();
        const todayConvs = (data.conversations || []).filter((c: Conversation) =>
          new Date(c.created_at).toDateString() === today
        );

        setStats({
          total_conversations: data.total || data.conversations?.length || 0,
          total_messages: data.totalMessages || 0,
          today_conversations: todayConvs.length,
          today_messages: 0
        });
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast({
        title: 'Yükleme başarısız',
        description: 'Konuşmalar yüklenirken hata oluştu',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setMessagesLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.conversations}/${conversationId}/messages`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    loadMessages(conversation.id);
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Bu konuşmayı silmek istediğinizden emin misiniz?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.conversations}/${conversationId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (response.ok) {
        toast({ title: 'Konuşma silindi' });
        loadConversations();
        if (selectedConversation?.id === conversationId) {
          setSelectedConversation(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Silme başarısız',
        variant: 'destructive'
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} sa önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR');
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter(conv =>
    !searchQuery || (conv.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 pb-40">
      <div className="w-[98%] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Mesajlar ve Konuşmalar
          </h1>
        </div>

        {/* Stats Cards - Matching Documents Page Style */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-6">
          {/* Total Conversations - Blue */}
          <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-3">
              <div className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">Toplam Konuşma</div>
              <div className="text-xl font-bold text-blue-900 dark:text-blue-100">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats.total_conversations.toLocaleString()}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                <span className="font-mono text-xs">+{stats.today_conversations}</span>
                <span className="opacity-75 ml-1 text-xs">bugün</span>
              </div>
            </CardContent>
          </Card>

          {/* Total Messages - Green */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
            <CardContent className="p-3">
              <div className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">Toplam Mesaj</div>
              <div className="text-xl font-bold text-green-900 dark:text-green-100">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats.total_messages.toLocaleString()}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                <span className="opacity-75 text-xs">soru + cevap</span>
              </div>
            </CardContent>
          </Card>

          {/* Avg Messages - Violet */}
          <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200 dark:border-violet-800">
            <CardContent className="p-3">
              <div className="text-xs text-violet-700 dark:text-violet-300 font-medium mb-1">Ort. Mesaj/Konuşma</div>
              <div className="text-xl font-bold text-violet-900 dark:text-violet-100">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> :
                  stats.total_conversations > 0
                    ? Math.round(stats.total_messages / stats.total_conversations)
                    : 0}
              </div>
              <div className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                <span className="opacity-75 text-xs">ortalama</span>
              </div>
            </CardContent>
          </Card>

          {/* Today Activity - Orange */}
          <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border-orange-200 dark:border-orange-800">
            <CardContent className="p-3">
              <div className="text-xs text-orange-700 dark:text-orange-300 font-medium mb-1">Bugün</div>
              <div className="text-xl font-bold text-orange-900 dark:text-orange-100">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats.today_conversations}
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                <span className="opacity-75 text-xs">yeni konuşma</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Conversations List */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Konuşmalar</CardTitle>
                  <CardDescription>{filteredConversations.length} konuşma</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={loadConversations} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {/* Search */}
              <div className="relative mt-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Konuşma ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Henüz konuşma yok</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredConversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedConversation?.id === conv.id ? 'bg-muted' : ''
                        }`}
                        onClick={() => handleSelectConversation(conv)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {conv.title || 'Başlıksız Konuşma'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(conv.created_at)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Messages */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {selectedConversation ? (selectedConversation.title || 'Konuşma Detayı') : 'Mesajlar'}
              </CardTitle>
              <CardDescription>
                {selectedConversation
                  ? `${messages.length} mesaj`
                  : 'Detayları görüntülemek için bir konuşma seçin'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedConversation ? (
                <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Bir konuşma seçin</p>
                  </div>
                </div>
              ) : messagesLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                  Bu konuşmada mesaj yok
                </div>
              ) : (
                <ScrollArea className="h-[450px] pr-4">
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={msg.role === 'user' ? 'secondary' : 'outline'} className="text-xs">
                              {msg.role === 'user' ? 'Kullanıcı' : 'AI'}
                            </Badge>
                            {msg.model && (
                              <span className="text-xs opacity-70">{msg.model}</span>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-current/10">
                              <p className="text-xs opacity-70 mb-1">Kaynaklar:</p>
                              <div className="flex flex-wrap gap-1">
                                {msg.sources.slice(0, 3).map((src: any, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {src.title || src.source || `Kaynak ${idx + 1}`}
                                  </Badge>
                                ))}
                                {msg.sources.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{msg.sources.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                          <p className="text-xs opacity-50 mt-2">
                            {formatDate(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
