'use client';

import { useState, useCallback } from 'react';
import { getEndpoint } from '@/config/api.config';

/**
 * Conversation summary for list view
 */
export interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string | null;
}

/**
 * Message from conversation
 */
export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: unknown[];
  created_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Full conversation with messages
 */
export interface ConversationFull extends Conversation {
  user_id: string;
  messages: ConversationMessage[];
}

/**
 * Hook for managing conversation history
 */
export function useConversationHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all conversations for the current user
   */
  const fetchConversations = useCallback(async (): Promise<Conversation[]> => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Oturum bulunamadı');
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(getEndpoint('chat', 'history'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.status}`);
      }

      const data = await response.json();
      const convList = data.conversations || [];
      setConversations(convList);
      return convList;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Konuşmalar yüklenemedi';
      setError(errorMsg);
      console.error('[useConversationHistory] Fetch error:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load a specific conversation with all messages
   */
  const loadConversation = useCallback(async (
    conversationId: string
  ): Promise<ConversationFull | null> => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Oturum bulunamadı');
      return null;
    }

    try {
      // Use base API URL since this endpoint is not in the config
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/chat/conversation/${conversationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load conversation: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('[useConversationHistory] Load error:', err);
      return null;
    }
  }, []);

  /**
   * Delete a conversation
   */
  const deleteConversation = useCallback(async (
    conversationId: string
  ): Promise<boolean> => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Oturum bulunamadı');
      return false;
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/chat/conversation/${conversationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete conversation: ${response.status}`);
      }

      // Remove from local state
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      return true;
    } catch (err) {
      console.error('[useConversationHistory] Delete error:', err);
      return false;
    }
  }, []);

  return {
    conversations,
    isLoading,
    error,
    fetchConversations,
    loadConversation,
    deleteConversation,
    setConversations
  };
}

export default useConversationHistory;
