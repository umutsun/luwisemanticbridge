import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatContainer } from '../../templates/base/chat/chat-container';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock hooks
const mockSendMessage = jest.fn();
const mockCreateNewConversation = jest.fn();
const mockGetCurrentMessages = jest.fn().mockReturnValue([]);

jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(() => ({
    getCurrentMessages: mockGetCurrentMessages,
    isLoading: false,
    currentConversationId: 'test-conversation-id',
    createNewConversation: mockCreateNewConversation,
  })),
}));

jest.mock('@/lib/hooks/use-chat', () => ({
  useChat: jest.fn(() => ({
    sendMessage: mockSendMessage,
  })),
}));

jest.mock('@/lib/hooks/use-chat-stream', () => ({
  useChatStream: jest.fn(() => ({
    sendMessage: mockSendMessage,
  })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string) => defaultValue,
  }),
}));

// Mock MessageList and ChatInput components to simplify testing container logic
jest.mock('../../templates/base/chat/message-list', () => ({
  MessageList: ({ messages }: { messages: any[] }) => (
    <div data-testid="message-list">
      {messages.map((msg, idx) => (
        <div key={idx}>{msg.content}</div>
      ))}
    </div>
  ),
}));

jest.mock('../../templates/base/chat/chat-input', () => ({
  ChatInput: ({ onSend }: { onSend: (msg: string) => void }) => (
    <button onClick={() => onSend('Test message')}>Send</button>
  ),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe('ChatContainer', () => {
  let queryClient: QueryClient;
  let user: any;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    user = userEvent.setup();
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ChatContainer />
      </QueryClientProvider>
    );
  };

  it('renders chat container', () => {
    renderComponent();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('initializes conversation if none exists', () => {
    // Override mock for this specific test
    const { useChatStore } = require('@/lib/store/chat-store');
    useChatStore.mockImplementation(() => ({
      getCurrentMessages: mockGetCurrentMessages,
      isLoading: false,
      currentConversationId: null, // No conversation initially
      createNewConversation: mockCreateNewConversation,
    }));

    renderComponent();

    expect(mockCreateNewConversation).toHaveBeenCalledWith('Legal Assistant Chat');
  });

  it('sends message when input triggers onSend', async () => {
    renderComponent();

    const sendButton = screen.getByText('Send');
    await user.click(sendButton);

    expect(mockSendMessage).toHaveBeenCalledWith('Test message');
  });
});