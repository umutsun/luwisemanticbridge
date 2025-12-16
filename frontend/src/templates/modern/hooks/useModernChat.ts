'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, Source } from '../types';
import { getEndpoint } from '@/lib/api-config';

interface UseModernChatOptions {
    conversationId?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
    token?: string;
}

interface UseModernChatReturn {
    messages: Message[];
    inputText: string;
    isLoading: boolean;
    isStreaming: boolean;
    streamingMessageId: string | null;
    lastUserQuery: string;
    visibleSourcesCount: Record<string, number>;
    setInputText: (text: string) => void;
    sendMessage: (content?: string, isFromSource?: boolean) => Promise<void>;
    clearChat: () => void;
    setVisibleSourcesCount: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export function useModernChat(options: UseModernChatOptions = {}): UseModernChatReturn {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [lastUserQuery, setLastUserQuery] = useState('');
    const [visibleSourcesCount, setVisibleSourcesCount] = useState<Record<string, number>>({});
    const [conversationId, setConversationId] = useState(options.conversationId || uuidv4());

    const abortControllerRef = useRef<AbortController | null>(null);

    const clearChat = useCallback(() => {
        setMessages([]);
        setConversationId(uuidv4());
        setInputText('');
        setVisibleSourcesCount({});
        setLastUserQuery('');
    }, []);

    const sendMessage = useCallback(async (content?: string, isFromSource: boolean = false) => {
        const messageContent = content || inputText.trim();
        if (!messageContent || isLoading) return;

        // Abort any ongoing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const userMessageId = uuidv4();
        const assistantMessageId = uuidv4();
        const startTime = Date.now();

        // Add user message
        const userMessage: Message = {
            id: userMessageId,
            role: 'user',
            content: messageContent,
            timestamp: new Date(),
            isFromSource
        };

        // Add placeholder assistant message
        const assistantMessage: Message = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            startTime
        };

        setMessages(prev => [...prev, userMessage, assistantMessage]);
        setInputText('');
        setIsLoading(true);
        setIsStreaming(true);
        setStreamingMessageId(assistantMessageId);
        setLastUserQuery(messageContent);

        try {
            // Try streaming first
            let accumulatedContent = '';

            try {
                const streamResponse = await fetch(getEndpoint('chat', 'stream'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${options.token}`
                    },
                    body: JSON.stringify({
                        message: messageContent,
                        conversationId,
                        model: options.model,
                        temperature: options.temperature,
                        maxTokens: options.maxTokens,
                        systemPrompt: options.systemPrompt,
                        stream: true
                    }),
                    signal: abortControllerRef.current.signal
                });

                if (streamResponse.ok && streamResponse.body) {
                    const reader = streamResponse.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (!line.trim() || !line.startsWith('data:')) continue;
                            try {
                                const data = JSON.parse(line.slice(5));
                                if (data.type === 'chunk' && data.content) {
                                    accumulatedContent += data.content;
                                    setMessages(prev => prev.map(msg =>
                                        msg.id === assistantMessageId
                                            ? { ...msg, content: accumulatedContent }
                                            : msg
                                    ));
                                }
                            } catch {
                                // Skip invalid JSON
                            }
                        }
                    }
                }
            } catch (streamError) {
                // Stream failed, will use fallback
                console.warn('Streaming failed, using fallback:', streamError);
            }

            // Fetch final response for sources and metadata
            interface FinalResponseData {
                sources?: Source[];
                relatedTopics?: Message['relatedTopics'];
                context?: string[];
                response?: string;
                tokens?: Message['tokens'];
                usage?: Message['tokens'];
                fastMode?: boolean;
            }

            let finalData: FinalResponseData = {};
            try {
                const finalResponse = await fetch(getEndpoint('chat', 'send'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${options.token}`
                    },
                    body: JSON.stringify({
                        message: messageContent,
                        conversationId,
                        model: options.model,
                        temperature: options.temperature,
                        maxTokens: options.maxTokens,
                        systemPrompt: options.systemPrompt,
                        stream: false
                    })
                });
                if (finalResponse.ok) {
                    finalData = await finalResponse.json();
                }
            } catch {
                // Continue without final data
            }

            // Update message with final data
            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: accumulatedContent || finalData.response || msg.content,
                        isStreaming: false,
                        sources: finalData.fastMode ? [] : finalData.sources,
                        relatedTopics: finalData.relatedTopics,
                        context: finalData.context,
                        responseTime: Date.now() - startTime,
                        tokens: finalData.tokens || finalData.usage,
                        fastMode: finalData.fastMode
                    }
                    : msg
            ));

        } catch (error) {
            console.error('Chat error:', error);

            let errorMessage = 'Bir hata oluştu.';
            if (error instanceof Error) {
                if (error.message.includes('429') || error.message.includes('QUERY_LIMIT_EXCEEDED')) {
                    errorMessage = 'Aylık soru limitinizi doldurdunuz.';
                }
            }

            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                    ? { ...msg, content: errorMessage, isStreaming: false, isError: true }
                    : msg
            ));
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingMessageId(null);
        }
    }, [inputText, isLoading, conversationId, options]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return {
        messages,
        inputText,
        isLoading,
        isStreaming,
        streamingMessageId,
        lastUserQuery,
        visibleSourcesCount,
        setInputText,
        sendMessage,
        clearChat,
        setVisibleSourcesCount
    };
}

export default useModernChat;
