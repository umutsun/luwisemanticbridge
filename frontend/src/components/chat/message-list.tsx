'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Message } from '@/types/chat';
import { MessageItem } from './message-item';
import { TypingIndicator } from './typing-indicator';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

interface ChatbotSettings {
  title: string;
  welcomeMessage: string;
  placeholder: string;
  primaryColor: string;
  suggestions: string;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // CRITICAL: NO hardcoded defaults - load from database only
  const [settings, setSettings] = useState<ChatbotSettings>({
    title: '',
    welcomeMessage: '',
    placeholder: '',
    primaryColor: '',
    suggestions: '[]'
  });
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    // Fetch chatbot settings
    fetch(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/chatbot/settings`)
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        try {
          const parsedSuggestions = JSON.parse(data.suggestions || '[]');
          setSuggestions(Array.isArray(parsedSuggestions) ? parsedSuggestions : []);
        } catch {
          setSuggestions([]);
        }
      })
      .catch(err => console.error('Failed to fetch chatbot settings:', err));
  }, []);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-lg mx-auto p-8 animate-in fade-in-50 slide-in-from-bottom-4 duration-700">
          <div 
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg ring-2 ring-blue-100 dark:ring-blue-900/30 animate-pulse"
            style={{ 
              background: `linear-gradient(135deg, ${settings.primaryColor}, ${settings.primaryColor}dd)`
            }}
          >
            <MessageSquare className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {settings.title}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            {settings.welcomeMessage}
          </p>
          {suggestions.length > 0 && (
            <div className="grid grid-cols-1 gap-3 text-left">
              {suggestions.map((suggestion, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {suggestion.icon} {suggestion.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {suggestion.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 bg-gradient-to-b from-gray-50/30 to-transparent dark:from-gray-900/30">
      {messages.map((message, index) => (
        <div
          key={message.id}
          className="animate-in slide-in-from-bottom-4 fade-in-50"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <MessageItem message={message} />
        </div>
      ))}
      {isLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}