import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatContainer } from './chat-container';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
}));

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('ChatContainer', () => {
  let queryClient: QueryClient;
  let user: any;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    user = userEvent.setup();
    mockFetch.mockClear();

    // Default successful responses
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'ASB Hukuki Asistan',
          subtitle: 'Yapay Zeka Asistanınız',
          welcomeMessage: 'Merhaba! Size nasıl yardımcı olabilirim?',
          primaryColor: '#3B82F6',
          placeholder: 'Sorunuzu yazın...'
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          'Hukuki sistem hakkında bilgi verir misiniz?',
          'Hangi konularda yardımcı olabilirsiniz?',
          'Mevzuat taraması nasıl yapılır?'
        ]),
      });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ChatContainer />
      </QueryClientProvider>
    );
  };

  it('renders chat container with welcome message', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Merhaba! Size nasıl yardımcı olabilirim?')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Sorunuzu yazın...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('displays suggestions when loaded', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Hukuki sistem hakkında bilgi verir misiniz?')).toBeInTheDocument();
      expect(screen.getByText('Hangi konularda yardımcı olabilirsiniz?')).toBeInTheDocument();
      expect(screen.getByText('Mevzuat taraması nasıl yapılır?')).toBeInTheDocument();
    });
  });

  it('sends message when form is submitted', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: '1',
        sessionId: 'test-session',
        message: 'Test response',
        timestamp: new Date().toISOString(),
        type: 'bot',
        sources: [],
        relatedTopics: [],
        conversationId: 'test-conversation'
      }),
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Sorunuzu yazın...');
    const sendButton = screen.getByRole('button');

    await user.type(input, 'Test message');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v2/chat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            message: 'Test message',
            sessionId: expect.any(String),
            conversationId: expect.any(String),
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test response')).toBeInTheDocument();
    });
  });

  it('handles send message error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    const input = screen.getByPlaceholderText('Sorunuzu yazın...');
    const sendButton = screen.getByRole('button');

    await user.type(input, 'Test message');
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText(/error/i, { ignoreCase: true })).toBeInTheDocument();
    });
  });

  it('clears input after sending message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: '1',
        message: 'Response',
        type: 'bot',
      }),
    });

    renderComponent();

    const input = screen.getByPlaceholderText('Sorunuzu yazun...') as HTMLInputElement;
    const sendButton = screen.getByRole('button');

    await user.type(input, 'Test message');
    expect(input.value).toBe('Test message');

    await user.click(sendButton);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('disables send button when input is empty', async () => {
    renderComponent();

    const sendButton = screen.getByRole('button');
    expect(sendButton).toBeDisabled();

    const input = screen.getByPlaceholderText('Sorunuzu yazın...');
    await user.type(input, 'Test');

    expect(sendButton).not.toBeDisabled();
  });

  it('handles suggestion click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: '1',
        message: 'Response about legal system',
        type: 'bot',
      }),
    });

    renderComponent();

    await waitFor(() => {
      const suggestion = screen.getByText('Hukuki sistem hakkında bilgi verir misiniz?');
      user.click(suggestion);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v2/chat',
        expect.objectContaining({
          body: JSON.stringify({
            message: 'Hukuki sistem hakkında bilgi verir misiniz?',
          }),
        })
      );
    });
  });

  it('shows typing indicator while waiting for response', async () => {
    // Delay the response
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({
                id: '1',
                message: 'Delayed response',
                type: 'bot',
              }),
            });
          }, 100)
        )
    );

    renderComponent();

    const input = screen.getByPlaceholderText('Sorunuzu yazın...');
    const sendButton = screen.getByRole('button');

    await user.type(input, 'Test');
    await user.click(sendButton);

    // Check for typing indicator
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();

    // Wait for response
    await waitFor(() => {
      expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
      expect(screen.getByText('Delayed response')).toBeInTheDocument();
    }, { timeout: 200 });
  });
});