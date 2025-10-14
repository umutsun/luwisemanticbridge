import axios from 'axios';
import { ChatResponse, SendMessageParams, Message } from '../types/chat';
import { API_CONFIG } from '@/lib/config';

const API_BASE_URL = API_CONFIG.baseUrl;

class ChatClient {
  private client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 seconds timeout
  });

  async sendMessage(params: SendMessageParams): Promise<ChatResponse> {
    try {
      // Call LSEM backend RAG chat endpoint
      const response = await this.client.post('/api/v2/chat', {
        query: params.content,
        conversation_id: params.conversationId,
        settings: {
          temperature: 0.7,
          max_tokens: 1000,
          include_sources: true,
        }
      });

      // Transform response to match frontend format
      const data = response.data;
      
      return {
        message: {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: data.response || data.answer || 'No response received',
          timestamp: new Date(),
        },
        sources: data.sources?.map((source: any) => ({
          id: source.id || `source-${Date.now()}`,
          title: source.title || source.document || 'Unknown Source',
          url: source.url,
          excerpt: source.excerpt || source.content?.substring(0, 200),
          relevanceScore: source.score || source.similarity,
        })) || [],
        conversationId: params.conversationId || `conv-${Date.now()}`,
      };
    } catch (error: any) {
      console.error('Chat API error:', error);
      
      // Return error message as assistant response
      return {
        message: {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error.response?.data?.message || error.message || 'Unknown error'}`,
          timestamp: new Date(),
        },
        sources: [],
        conversationId: params.conversationId || `conv-${Date.now()}`,
      };
    }
  }

  async searchDocuments(query: string, limit = 10) {
    try {
      // Call LSEM backend search endpoint
      const response = await this.client.post('/api/v2/search', {
        query,
        limit,
        threshold: 0.7,
      });
      
      return response.data;
    } catch (error) {
      console.error('Search API error:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v2/health');
      return response.status === 200;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

export const chatClient = new ChatClient();