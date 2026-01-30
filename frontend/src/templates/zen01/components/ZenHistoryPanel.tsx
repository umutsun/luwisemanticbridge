'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, MessageSquare, Trash2, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '../hooks/useConversationHistory';

interface ZenHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  isLoading: boolean;
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

/**
 * Group conversations by date (Today, Yesterday, This Week, Earlier)
 */
function groupConversationsByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 7);

  const groups: Record<string, Conversation[]> = {
    'Bugün': [],
    'Dün': [],
    'Bu Hafta': [],
    'Daha Önce': []
  };

  conversations.forEach(conv => {
    const convDate = new Date(conv.updated_at || conv.created_at);
    const convDay = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate());

    if (convDay >= today) {
      groups['Bugün'].push(conv);
    } else if (convDay >= yesterday) {
      groups['Dün'].push(conv);
    } else if (convDay >= thisWeek) {
      groups['Bu Hafta'].push(conv);
    } else {
      groups['Daha Önce'].push(conv);
    }
  });

  return Object.entries(groups).filter(([_, convs]) => convs.length > 0);
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
 * ZenHistoryPanel - Minimal dropdown style (like Claude Code)
 */
export const ZenHistoryPanel: React.FC<ZenHistoryPanelProps> = ({
  isOpen,
  onClose,
  conversations,
  isLoading,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv =>
      conv.title?.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
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
      if (e.key === 'Escape') {
        if (confirmDeleteId) {
          setConfirmDeleteId(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, confirmDeleteId]);

  // Reset confirm state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      // Second click - confirm delete
      onDeleteConversation(id);
      setConfirmDeleteId(null);
    } else {
      // First click - show confirm
      setConfirmDeleteId(id);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="zen01-history-dropdown"
      >
        {/* Search */}
        <div className="zen01-history-search">
          <Search className="h-4 w-4 text-current opacity-50" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Konuşma ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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

        {/* New Conversation */}
        <button
          onClick={() => {
            onNewConversation();
            onClose();
          }}
          className="zen01-history-new-btn"
        >
          <Plus className="h-4 w-4" />
          <span>Yeni Konuşma</span>
        </button>

        {/* Divider */}
        <div className="zen01-history-divider" />

        {/* Conversations List */}
        <ScrollArea className="zen01-history-list">
          {isLoading ? (
            <div className="zen01-history-loading">
              <div className="zen01-history-skeleton-sm" />
              <div className="zen01-history-skeleton-sm" />
              <div className="zen01-history-skeleton-sm" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="zen01-history-empty-minimal">
              {searchQuery ? 'Sonuç bulunamadı' : 'Henüz konuşma yok'}
            </div>
          ) : (
            groupedConversations.map(([group, convs]) => (
              <div key={group}>
                <div className="zen01-history-group-label">{group}</div>
                {convs.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      onSelectConversation(conv.id);
                      onClose();
                    }}
                    className={`zen01-history-item ${
                      conv.id === currentConversationId ? 'active' : ''
                    }`}
                  >
                    <div className="zen01-history-item-content">
                      <span className="zen01-history-item-title">
                        {conv.title || 'Adsız konuşma'}
                      </span>
                      <span className="zen01-history-item-time">
                        {formatTime(conv.updated_at || conv.created_at)}
                      </span>
                    </div>
                    {confirmDeleteId === conv.id ? (
                      <div className="zen01-history-delete-confirm">
                        <button
                          onClick={(e) => handleDeleteClick(e, conv.id)}
                          className="zen01-history-confirm-yes"
                        >
                          Sil
                        </button>
                        <button
                          onClick={handleCancelDelete}
                          className="zen01-history-confirm-no"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => handleDeleteClick(e, conv.id)}
                        className="zen01-history-item-delete"
                        title="Sil"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </ScrollArea>
      </motion.div>
    </AnimatePresence>
  );
};

export default ZenHistoryPanel;
