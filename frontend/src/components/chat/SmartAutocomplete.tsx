'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Hash, Loader2, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SmartAutocompleteSuggestion {
  text: string;
  type: 'local' | 'llm' | 'recent';
  category?: string;
}

interface SmartAutocompleteProps {
  value: string;
  onSelect: (term: string) => void;
  keyTerms?: string[];
  recentQueries?: string[];
  position?: 'above' | 'below';
  enabled?: boolean;
  llmEnabled?: boolean;
  token?: string | null;
}

export function SmartAutocomplete({
  value,
  onSelect,
  keyTerms = [],
  recentQueries = [],
  position = 'above',
  enabled = true,
  llmEnabled = true,
  token
}: SmartAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SmartAutocompleteSuggestion[]>([]);
  const [llmSuggestions, setLlmSuggestions] = useState<SmartAutocompleteSuggestion[]>([]);
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const llmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Extract current word being typed
  const getCurrentWord = useCallback((text: string) => {
    const words = text.split(/\s+/);
    return words[words.length - 1]?.toLowerCase() || '';
  }, []);

  // Local matching - instant
  const getLocalSuggestions = useCallback((query: string): SmartAutocompleteSuggestion[] => {
    if (!query || query.length < 2) return [];

    const results: SmartAutocompleteSuggestion[] = [];
    const queryLower = query.toLowerCase();

    // Match from keyTerms
    keyTerms.forEach(term => {
      const termLower = term.toLowerCase();
      if (termLower.startsWith(queryLower) || termLower.includes(queryLower)) {
        results.push({
          text: term,
          type: 'local',
          category: 'terim'
        });
      }
    });

    // Match from recent queries
    recentQueries.forEach(recent => {
      const recentLower = recent.toLowerCase();
      if (recentLower.includes(queryLower) && !results.some(r => r.text.toLowerCase() === recentLower)) {
        results.push({
          text: recent,
          type: 'recent',
          category: 'son soru'
        });
      }
    });

    return results.slice(0, 5);
  }, [keyTerms, recentQueries]);

  // LLM-powered suggestions - debounced
  const fetchLlmSuggestions = useCallback(async (query: string) => {
    if (!llmEnabled || !query || query.length < 3) {
      setLlmSuggestions([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLlmLoading(true);

    try {
      const response = await fetch('/api/v2/data-schema/smart-autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          query,
          context: value,
          field: 'chat',
          maxSuggestions: 3
        }),
        signal: abortControllerRef.current.signal
      });

      if (response.ok) {
        const data = await response.json();
        const llmResults: SmartAutocompleteSuggestion[] = (data.suggestions || []).map((s: string) => ({
          text: s,
          type: 'llm' as const,
          category: 'akıllı öneri'
        }));
        setLlmSuggestions(llmResults);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('LLM autocomplete error:', error);
      }
    } finally {
      setIsLlmLoading(false);
    }
  }, [llmEnabled, token, value]);

  // Update suggestions when value changes
  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      setLlmSuggestions([]);
      return;
    }

    const currentWord = getCurrentWord(value);

    // Instant local suggestions
    const local = getLocalSuggestions(currentWord);
    setSuggestions(local);

    // Debounced LLM suggestions
    if (llmTimeoutRef.current) {
      clearTimeout(llmTimeoutRef.current);
    }

    if (currentWord.length >= 3) {
      llmTimeoutRef.current = setTimeout(() => {
        fetchLlmSuggestions(currentWord);
      }, 500); // 500ms debounce
    } else {
      setLlmSuggestions([]);
    }

    return () => {
      if (llmTimeoutRef.current) {
        clearTimeout(llmTimeoutRef.current);
      }
    };
  }, [value, enabled, getCurrentWord, getLocalSuggestions, fetchLlmSuggestions]);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestions, llmSuggestions]);

  // Combine all suggestions
  const allSuggestions = useMemo(() => {
    const combined = [...suggestions, ...llmSuggestions];
    // Remove duplicates
    const unique = combined.filter((item, index, self) =>
      index === self.findIndex(t => t.text.toLowerCase() === item.text.toLowerCase())
    );
    return unique.slice(0, 8);
  }, [suggestions, llmSuggestions]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (allSuggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % allSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev <= 0 ? allSuggestions.length - 1 : prev - 1);
      } else if (e.key === 'Tab' && selectedIndex >= 0) {
        e.preventDefault();
        onSelect(allSuggestions[selectedIndex].text);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allSuggestions, selectedIndex, onSelect]);

  // Don't render if no suggestions
  if (allSuggestions.length === 0 && !isLlmLoading) {
    return null;
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'llm':
        return <Sparkles className="w-3 h-3 text-purple-500" />;
      case 'recent':
        return <ArrowUp className="w-3 h-3 text-blue-500" />;
      default:
        return <Hash className="w-3 h-3 text-gray-500" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'llm':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'recent':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: position === 'above' ? 10 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: position === 'above' ? 10 : -10 }}
        className={`absolute ${position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'} left-0 right-0 z-50`}
      >
        <div className="bg-popover border rounded-lg shadow-lg overflow-hidden">
          {/* LLM Loading indicator */}
          {isLlmLoading && (
            <div className="px-3 py-1.5 border-b bg-purple-50/50 dark:bg-purple-900/10 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
              <span className="text-xs text-purple-600 dark:text-purple-400">Akıllı öneri yükleniyor...</span>
            </div>
          )}

          {/* Suggestions list */}
          <div className="max-h-[200px] overflow-y-auto">
            {allSuggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.type}-${suggestion.text}-${index}`}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                  selectedIndex === index
                    ? 'bg-accent'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => onSelect(suggestion.text)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getTypeIcon(suggestion.type)}
                  <span className="text-sm truncate">{suggestion.text}</span>
                </div>
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getTypeBadgeColor(suggestion.type)}`}>
                  {suggestion.category}
                </Badge>
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-1.5 border-t bg-muted/30 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              ↑↓ gezin • Tab seç • Esc kapat
            </span>
            {llmEnabled && (
              <span className="text-[10px] text-purple-500 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                LLM destekli
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default SmartAutocomplete;
