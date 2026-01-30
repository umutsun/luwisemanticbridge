'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Sparkles, Loader2 } from 'lucide-react';

interface ZenSuggestPanelProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: string[];
  isLoading: boolean;
  onSelectSuggestion: (question: string) => void;
}

/**
 * ZenSuggestPanel - Shows suggestion questions with search
 */
export const ZenSuggestPanel: React.FC<ZenSuggestPanelProps> = ({
  isOpen,
  onClose,
  suggestions,
  isLoading,
  onSelectSuggestion,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter suggestions by search
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return suggestions;
    const query = searchQuery.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(query));
  }, [suggestions, searchQuery]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset search when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="zen01-suggest-dropdown"
      >
        {/* Search Box */}
        <div className="zen01-history-search">
          <Search className="h-4 w-4 opacity-50" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Önerilerde ara..."
            className="zen01-history-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="opacity-50 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Suggestions List */}
        <div className="zen01-suggest-list">
          {isLoading ? (
            <div className="zen01-suggest-loading">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-500" />
              <span className="text-xs text-slate-400 mt-2">Öneriler yükleniyor...</span>
            </div>
          ) : filteredSuggestions.length === 0 ? (
            <div className="zen01-suggest-empty">
              {searchQuery ? 'Sonuç bulunamadı' : 'Henüz öneri yok'}
            </div>
          ) : (
            filteredSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => {
                  onSelectSuggestion(suggestion);
                  onClose();
                }}
                className="zen01-suggest-item"
              >
                <Sparkles className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                <span className="zen01-suggest-item-title">
                  {suggestion}
                </span>
              </button>
            ))
          )}
        </div>

      </motion.div>
    </AnimatePresence>
  );
};

export default ZenSuggestPanel;
