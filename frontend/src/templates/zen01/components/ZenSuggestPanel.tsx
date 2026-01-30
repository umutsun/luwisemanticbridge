'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import type { Conversation } from '../hooks/useConversationHistory';

interface ZenSuggestPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  isLoading: boolean;
  onSelectConversation: (id: string) => void;
}

/**
 * Format time for display
 */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const convDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (convDay >= today) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }
}

/**
 * ZenSuggestPanel - Shows recent 12 conversations as suggestions with search
 */
export const ZenSuggestPanel: React.FC<ZenSuggestPanelProps> = ({
  isOpen,
  onClose,
  conversations,
  isLoading,
  onSelectConversation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    const recent = conversations.slice(0, 12);
    if (!searchQuery.trim()) return recent;
    const query = searchQuery.toLowerCase();
    return recent.filter(conv =>
      (conv.title || '').toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

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
            placeholder="Konuşmalarda ara..."
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

        {/* Conversations List */}
        <div className="zen01-suggest-list">
          {isLoading ? (
            <div className="zen01-suggest-loading">
              {[1, 2, 3].map(i => (
                <div key={i} className="zen01-suggest-skeleton" />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="zen01-suggest-empty">
              {searchQuery ? 'Sonuç bulunamadı' : 'Henüz konuşma yok'}
            </div>
          ) : (
            filteredConversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => {
                  onSelectConversation(conv.id);
                  onClose();
                }}
                className="zen01-suggest-item"
              >
                <span className="zen01-suggest-item-title">
                  {conv.title || 'Adsız konuşma'}
                </span>
                <span className="zen01-suggest-item-time">
                  {formatTime(conv.updated_at || conv.created_at)}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Hint */}
        <div className="zen01-suggest-hint">
          <kbd>↵</kbd> seç <kbd>esc</kbd> kapat
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ZenSuggestPanel;
