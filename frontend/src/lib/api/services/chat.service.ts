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
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/stream`, {
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
    const response = await apiClient.get<ChatSession[]>('/api/chat/sessions');
    return response.data;
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const response = await apiClient.get<ChatSession>(`/api/chat/sessions/${sessionId}`);
    return response.data;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/api/chat/sessions/${sessionId}`);
  }
}

export default new ChatService();