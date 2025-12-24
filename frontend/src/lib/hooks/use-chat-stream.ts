'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { Message, PdfAttachment } from '../types/chat';
import { fetchWithAuth } from '@/lib/auth-fetch';

// Simple UUID generator
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

interface ChatStreamOptions {
  onSource?: (sources: any[]) => void;
  onStatus?: (status: string, message: string) => void;
  onComplete?: (message: string) => void;
  onError?: (error: string) => void;
}

export function useChatStream() {
  const {
    addMessage,
    updateMessage,
    setLoading,
    setError,
    currentConversationId,
  } = useChatStore();

  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(() => generateUUID());

  useEffect(() => {
    // Initialize WebSocket connection
    const wsUrl = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8083'}/ws/chat?userId=${clientId}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WebSocket] Chat connected');
        setIsConnected(true);

        // Send client ID for identification
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'connect',
            clientId: clientId
          }));
        }
      };

      wsRef.current.onclose = () => {
        console.log('[WebSocket] Chat disconnected');
        setIsConnected(false);
      };

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Chat error:', error);
        setIsConnected(false);
      };

      // Keep connection alive
      const pingInterval = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      return () => {
        clearInterval(pingInterval);
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
    }
  }, [clientId]);

  const sendMessage = async (
    content: string,
    pdfFile?: File,
    options: ChatStreamOptions = {}
  ) => {
    if (!currentConversationId) {
      setError('No active conversation');
      return;
    }

    // Build PDF attachment info if file is provided
    let pdfAttachment: PdfAttachment | undefined;
    if (pdfFile) {
      pdfAttachment = {
        filename: pdfFile.name,
        size: pdfFile.size,
      };
    }

    // Create user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      pdfAttachment,
    };

    // Add user message to store
    addMessage(userMessage);
    setLoading(true);
    setError(null);

    // Create temporary assistant message with skeleton loading
    const assistantMessageId = `msg-${Date.now() + 1}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
      isStreaming: true,
      status: pdfFile ? 'searching' : undefined,
      statusMessage: pdfFile ? 'PDF isleniyor...' : undefined,
    };
    addMessage(assistantMessage);

    try {
      // If PDF file is provided, use the PDF chat endpoint
      if (pdfFile) {
        const formData = new FormData();
        formData.append('message', content);
        formData.append('pdf', pdfFile);
        formData.append('conversationId', currentConversationId);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
        const pdfResponse = await fetchWithAuth(`${apiUrl}/api/v2/chat/with-pdf`, {
          method: 'POST',
          body: formData,
          // Note: Don't set Content-Type for FormData - browser will set it with boundary
        });

        if (!pdfResponse.ok) {
          const errorData = await pdfResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `PDF processing failed: ${pdfResponse.status}`);
        }

        const pdfData = await pdfResponse.json();

        // Update assistant message with response
        updateMessage(assistantMessageId, {
          content: pdfData.response,
          sources: pdfData.sources,
          relatedTopics: pdfData.relatedTopics,
          pdfAttachment: pdfData.pdfAttachment,
          isLoading: false,
          isStreaming: false,
          status: 'complete',
        });

        options.onComplete?.(pdfData.response);
        setLoading(false);
        return;
      }

      // Normal WebSocket streaming for non-PDF messages
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setError('WebSocket connection not available');
        return;
      }

      // Send message via API with streaming flag
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          conversationId: currentConversationId,
          stream: true,
          clientId: clientId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (data.streaming) {
        // Listen for WebSocket messages
        wsRef.current.onmessage = (event) => {
          try {
            const wsData = JSON.parse(event.data);

            switch (wsData.type) {
              case 'status':
                options.onStatus?.(wsData.status, wsData.message);
                // Update message with status
                updateMessage(assistantMessageId, {
                  status: wsData.status,
                  statusMessage: wsData.message,
                });
                break;

              case 'sources':
                options.onSource?.(wsData.sources);
                // Update message with sources
                updateMessage(assistantMessageId, {
                  sources: wsData.sources,
                });
                break;

              case 'complete':
                // Final message received
                updateMessage(assistantMessageId, {
                  content: wsData.response,
                  sources: wsData.sources,
                  relatedTopics: wsData.relatedTopics,
                  isLoading: false,
                  isStreaming: false,
                });
                options.onComplete?.(wsData.response);
                setLoading(false);
                break;

              case 'error':
                updateMessage(assistantMessageId, {
                  content: 'Sorry, I encountered an error processing your message.',
                  isLoading: false,
                  isStreaming: false,
                });
                options.onError?.(wsData.error);
                setError(wsData.error);
                setLoading(false);
                break;
            }
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };
      } else {
        // Fallback to non-streaming
        const fallbackResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content,
            conversationId: currentConversationId,
          }),
        });

        const fallbackData = await fallbackResponse.json();
        updateMessage(assistantMessageId, {
          content: fallbackData.message.content,
          sources: fallbackData.sources,
          isLoading: false,
          isStreaming: false,
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('[Chat Stream] Failed to send message:', error);
      setError('Failed to send message. Please try again.');

      updateMessage(assistantMessageId, {
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        isLoading: false,
        isStreaming: false,
      });
      setLoading(false);
    }
  };

  return {
    sendMessage,
    isConnected,
    isLoading,
  };
}