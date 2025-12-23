"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/config";

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
      const response = await fetch(getApiUrl('conversations?limit=100'));

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
      const response = await fetch(getApiUrl(`conversations/${conversationId}/messages`));

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
      const response = await fetch(getApiUrl(`conversations/${conversationId}`), {
        method: 'DELETE'
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
    if (diffMins < 60) return `${diffMins} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR');
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mesajlar ve Konuşmalar</h1>
          <p className="text-muted-foreground mt-1">
            AI sohbet geçmişi
          </p>
        </div>
        <Button variant="outline" onClick={loadConversations} disabled={loading}>
          Yenile
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Toplam Konuşma</p>
            <p className="text-2xl font-bold">{stats.total_conversations}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Toplam Mesaj</p>
            <p className="text-2xl font-bold">{stats.total_messages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Bugün Konuşma</p>
            <p className="text-2xl font-bold">{stats.today_conversations}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Bugün Mesaj</p>
            <p className="text-2xl font-bold">{stats.today_messages}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Konuşmalar</CardTitle>
            <CardDescription>{conversations.length} konuşma</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Henüz konuşma yok
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((conv) => (
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
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                        >
                          ×
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
                Bir konuşma seçin
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
  );
}
