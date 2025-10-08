import { chatService } from './chat.service';

// Mock fetch
global.fetch = jest.fn();

describe('Chat Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const mockResponse = {
        id: '1',
        sessionId: 'test-session',
        message: 'Test response',
        timestamp: new Date().toISOString(),
        type: 'bot',
        sources: [],
        relatedTopics: [],
        conversationId: 'test-conversation'
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await chatService.sendMessage({
        message: 'Test message',
        sessionId: 'session-123',
        conversationId: 'conv-123',
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/v2/chat',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'Test message',
            sessionId: 'session-123',
            conversationId: 'conv-123',
          }),
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle API error response', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      await expect(
        chatService.sendMessage({
          message: 'Test message',
        })
      ).rejects.toThrow('Failed to send message');
    });

    it('should handle network error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        chatService.sendMessage({
          message: 'Test message',
        })
      ).rejects.toThrow('Network error');
    });

    it('should use default values when not provided', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', message: 'Response' }),
      });

      await chatService.sendMessage({
        message: 'Test',
      });

      const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.sessionId).toBeDefined();
      expect(body.conversationId).toBeDefined();
    });
  });

  describe('getSuggestions', () => {
    it('should fetch suggestions successfully', async () => {
      const mockSuggestions = [
        'What is contract law?',
        'How to file a lawsuit?',
        'Legal document templates',
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuggestions,
      });

      const result = await chatService.getSuggestions();

      expect(fetch).toHaveBeenCalledWith('/api/v2/chat/suggestions', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(result).toEqual(mockSuggestions);
    });

    it('should handle empty suggestions', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await chatService.getSuggestions();

      expect(result).toEqual([]);
    });

    it('should handle error gracefully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await chatService.getSuggestions();

      expect(result).toEqual([]);
    });
  });

  describe('getChatHistory', () => {
    it('should fetch chat history', async () => {
      const mockHistory = {
        conversations: [
          {
            id: 'conv-1',
            title: 'Legal Advice',
            lastMessage: 'Thank you for your help',
            timestamp: new Date().toISOString(),
            messageCount: 5,
          },
        ],
        total: 1,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory,
      });

      const result = await chatService.getChatHistory({
        page: 1,
        limit: 10,
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/v2/chat/history?page=1&limit=10',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      expect(result).toEqual(mockHistory);
    });

    it('should include session ID in headers if provided', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [], total: 0 }),
      });

      await chatService.getChatHistory({
        sessionId: 'session-123',
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/v2/chat/history?page=1&limit=20',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Session-ID': 'session-123',
          }),
        })
      );
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation successfully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await chatService.deleteConversation('conv-123');

      expect(fetch).toHaveBeenCalledWith('/api/v2/chat/conversation/conv-123', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(result).toEqual({ success: true });
    });

    it('should handle deletion error', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Conversation not found' }),
      });

      await expect(
        chatService.deleteConversation('invalid-id')
      ).rejects.toThrow('Failed to delete conversation');
    });
  });

  describe('streamMessage', () => {
    it('should handle streaming response', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"chunk": "Hello"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"chunk": " world"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const chunks: string[] = [];
      const onChunk = jest.fn((chunk) => chunks.push(chunk));

      await chatService.streamMessage(
        {
          message: 'Test',
          sessionId: 'session-123',
        },
        onChunk
      );

      expect(chunks).toEqual(['Hello', ' world']);
      expect(onChunk).toHaveBeenCalledTimes(2);
    });

    it('should handle stream error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Stream error'));

      const onChunk = jest.fn();

      await expect(
        chatService.streamMessage(
          {
            message: 'Test',
          },
          onChunk
        )
      ).rejects.toThrow('Stream error');
    });
  });
});