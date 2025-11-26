'use client';

import { useEffect, useState } from 'react';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { useChatStore } from '@/lib/store/chat-store';
import { useChat } from '@/lib/hooks/use-chat';
import { useChatStream } from '@/lib/hooks/use-chat-stream';
import { useTranslation } from 'react-i18next';

export function ChatContainer() {
  const { t } = useTranslation();

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
      createNewConversation(t('chatInterface.legalAssistantChat', 'Legal Assistant Chat'));
    }
  }, [currentConversationId, createNewConversation]);

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