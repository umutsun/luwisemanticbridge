'use client';

import { useChatStore } from '@/lib/store/chat-store';
import { Message } from '../types/chat';
import { chatClient } from '@/lib/api/chat-client';

export function useChat() {
  const {
    addMessage,
    updateMessage,
    setLoading,
    setError,
    currentConversationId,
    isLoading,
  } = useChatStore();

  const sendMessage = async (content: string) => {
    if (!currentConversationId) {
      setError('No active conversation');
      return;
    }

    // Create user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Add user message to store
    addMessage(userMessage);
    setLoading(true);
    setError(null);

    // Create temporary assistant message
    const assistantMessageId = `msg-${Date.now() + 1}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    addMessage(assistantMessage);

    try {
      // Send to API - Use Next.js API route as proxy to backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          conversationId: currentConversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();

      // Update assistant message with response
      updateMessage(assistantMessageId, {
        content: data.message.content,
        sources: data.sources,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setError('Failed to send message. Please try again.');
      
      // Update message to show error
      updateMessage(assistantMessageId, {
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        isLoading: false,
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    sendMessage,
    isLoading,
  };
}