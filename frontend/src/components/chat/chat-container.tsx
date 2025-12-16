'use client';

import { useEffect, useState } from 'react';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { useChatStore } from '@/lib/store/chat-store';
import { useChat } from '@/lib/hooks/use-chat';
import { useChatStream } from '@/lib/hooks/use-chat-stream';
import { useConfig } from '@/contexts/ConfigContext';

export function ChatContainer() {
  const { config } = useConfig();
  const {
    getCurrentMessages,
    isLoading,
    currentConversationId,
    createNewConversation
  } = useChatStore();

  const [useStreaming, setUseStreaming] = useState(true); // Enable streaming by default

  // Use streaming or regular chat based on flag
  const { sendMessage: sendStreamingMessage } = useChatStream();
  const { sendMessage: sendRegularMessage } = useChat();

  const sendMessage = useStreaming ? sendStreamingMessage : sendRegularMessage;
  const messages = getCurrentMessages();

  useEffect(() => {
    // Create a new conversation if none exists
    if (!currentConversationId) {
      const chatTitle = config?.app?.name
        ? `${config.app.name} Chat`
        : 'AI Assistant Chat';
      createNewConversation(chatTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId]);
  
  return (
    <div className="flex flex-col h-full w-full bg-gray-50/50 dark:bg-gray-900">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto h-full">
          <MessageList messages={messages} isLoading={isLoading} />
        </div>
      </div>
      <div className="border-t border-gray-200/60 dark:border-gray-700/60 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80">
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}