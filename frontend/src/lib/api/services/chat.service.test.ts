import { TextEncoder, TextDecoder } from 'util';
import chatService from './chat.service';
import apiClient from '../client';

// Mock apiClient
jest.mock('../client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    put: jest.fn(),
    getToken: jest.fn(),
  },
}));

// Mock fetch for streaming
global.fetch = jest.fn();

describe('Chat Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const mockResponse = {
        data: {
          id: '1',
          content: 'Test response', // Adjusted to match ChatMessage interface
          role: 'assistant',
          timestamp: new Date().toISOString(),
        }
      };

      (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await chatService.sendMessage({
        message: 'Test message',
        sessionId: 'session-123',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/chat',
        {
          message: 'Test message',
          sessionId: 'session-123',
        }
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should handle API error response', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Failed to send message'));

      await expect(
        chatService.sendMessage({
          message: 'Test message',
        })
      ).rejects.toThrow('Failed to send message');
    });
  });

  describe('getSessions', () => {
    it('should fetch sessions successfully', async () => {
      const mockSessions = {
        data: [
          { id: '1', title: 'Test Session', messages: [], createdAt: '', updatedAt: '' }
        ]
      };
      (apiClient.get as jest.Mock).mockResolvedValueOnce(mockSessions);

      const result = await chatService.getSessions();

      expect(apiClient.get).toHaveBeenCalledWith('/api/chat/conversations');
      expect(result).toEqual(mockSessions.data);
    });
  });

  describe('streamMessage', () => {
    it('should handle streaming response', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('Hello') })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(' world') })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const chunks: string[] = [];
      const onChunk = jest.fn((chunk) => chunks.push(chunk));

      await chatService.streamMessage(
        {
          message: 'Test',
        },
        onChunk
      );

      expect(chunks).toEqual(['Hello', ' world']);
      expect(onChunk).toHaveBeenCalledTimes(2);
    });
  });
  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

      await chatService.deleteSession('session-123');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/chat/conversations/session-123');
    });
  });

  describe('getChatSuggestions', () => {
    it('should fetch suggestions successfully', async () => {
      const mockSuggestions = {
        data: ['Suggestion 1', 'Suggestion 2']
      };
      (apiClient.get as jest.Mock).mockResolvedValueOnce(mockSuggestions);

      const result = await chatService.getChatSuggestions('context');

      expect(apiClient.get).toHaveBeenCalledWith('/api/chat/suggestions?context=context');
      expect(result).toEqual(mockSuggestions.data);
    });
  });
});