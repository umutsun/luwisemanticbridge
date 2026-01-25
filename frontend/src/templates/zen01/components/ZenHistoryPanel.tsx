'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

  // Filter out empty groups
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
    // Today: show time
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } else {
    // Other days: show short date
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }
}

/**
 * ZenHistoryPanel
 * Slide-out panel for viewing conversation history
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
  const groupedConversations = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations]
  );

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Bu konuşmayı silmek istediğinizden emin misiniz?')) {
      onDeleteConversation(id);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="zen01-history-panel p-0 w-80 sm:w-96">
        {/* Header */}
        <div className="zen01-history-header">
          <SheetHeader className="p-4 pb-0">
            <SheetTitle className="zen01-history-title">
              Konuşma Geçmişi
            </SheetTitle>
          </SheetHeader>

          {/* New Conversation Button */}
          <div className="px-4 py-3">
            <button
              onClick={() => {
                onNewConversation();
                onClose();
              }}
              className="zen01-new-conversation-btn"
            >
              <Plus className="h-4 w-4" />
              Yeni Konuşma
            </button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="px-4 pb-4">
            {isLoading ? (
              // Loading skeleton
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="zen01-history-skeleton" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              // Empty state
              <div className="zen01-history-empty">
                <div className="zen01-history-empty-icon">💬</div>
                <p className="text-sm font-medium">Henüz konuşma yok</p>
                <p className="text-xs opacity-70 mt-1">
                  Yeni bir konuşma başlatın
                </p>
              </div>
            ) : (
              // Grouped conversations
              <AnimatePresence mode="popLayout">
                {groupedConversations.map(([group, convs]) => (
                  <motion.div
                    key={group}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="zen01-history-date-group">{group}</div>
                    {convs.map(conv => (
                      <motion.div
                        key={conv.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => {
                          onSelectConversation(conv.id);
                          onClose();
                        }}
                        className={`zen01-conversation-item ${
                          conv.id === currentConversationId ? 'active' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0 opacity-60" />
                          <div className="flex-1 min-w-0">
                            <p className="zen01-conversation-title">
                              {conv.title || 'Adsız konuşma'}
                            </p>
                            <p className="zen01-conversation-meta">
                              {conv.message_count} mesaj • {formatTime(conv.updated_at || conv.created_at)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDelete(e, conv.id)}
                            className="zen01-delete-btn"
                            title="Konuşmayı sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default ZenHistoryPanel;
