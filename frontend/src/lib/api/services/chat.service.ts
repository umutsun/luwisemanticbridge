import apiClient from '../client';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  metadata?: {
    sources?: string[];
    confidence?: number;
    processingTime?: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  context?: any;
  useRAG?: boolean;
  streamResponse?: boolean;
}

class ChatService {
  async sendMessage(request: ChatRequest): Promise<ChatMessage> {
    const response = await apiClient.post<ChatMessage>('/api/chat', request);
    return response.data;
  }

  async streamMessage(request: ChatRequest, onChunk: (chunk: string) => void): Promise<void> {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiClient.getToken()}`
      },
      body: JSON.stringify(request)
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error('Stream not available');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      onChunk(chunk);
    }
  }

  async getSessions(): Promise<ChatSession[]> {
    const response = await apiClient.get<ChatSession[]>('/api/chat/conversations');
    return response.data;
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const response = await apiClient.get<ChatSession>(`/api/chat/conversations/${sessionId}`);
    return response.data;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/api/chat/conversations/${sessionId}`);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await apiClient.put(`/api/chat/conversations/${sessionId}`, { title });
  }

  async clearSession(sessionId: string): Promise<void> {
    await apiClient.post(`/api/chat/conversations/${sessionId}/clear`);
  }

  async getChatSuggestions(context?: string): Promise<any> {
    const params = context ? `?context=${encodeURIComponent(context)}` : '';
    const response = await apiClient.get(`/api/chat/suggestions${params}`);
    return response.data;
  }
}

export default new ChatService();