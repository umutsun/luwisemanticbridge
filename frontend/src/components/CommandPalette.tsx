'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAppStore from '@/stores/app.store';
import useChatStore from '@/stores/chat.store';
import { useTranslation } from 'react-i18next';
import { Command } from 'cmdk';
import {
  Search,
  Home,
  MessageSquare,
  Settings,
  FileText,
  Database,
  Brain,
  RefreshCw,
  Moon,
  Sun,
  Monitor,
  Globe,
  Code,
  Activity,
  Upload,
  Download,
  Trash2,
  X,
  ChevronRight,
  Command as CommandIcon
} from 'lucide-react';

const CommandPalette = () => {
  const { t } = useTranslation();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setTheme,
    addNotification
  } = useAppStore();
  const { clearMessages } = useChatStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [setCommandPaletteOpen]);

  const commands = [
    {
      category: t('commandPalette.categories.navigation'),
      items: [
        { icon: Home, label: t('commandPalette.commands.navigation.goToDashboard'), shortcut: 'G D', action: () => window.location.href = '/' },
        { icon: MessageSquare, label: t('commandPalette.commands.navigation.newChat'), shortcut: 'N C', action: () => { clearMessages(); setCommandPaletteOpen(false); } },
        { icon: Activity, label: t('commandPalette.commands.navigation.viewAnalytics'), shortcut: 'V A', action: () => { addNotification('info', t('commandPalette.messages.openingAnalytics')); setCommandPaletteOpen(false); } },
      ]
    },
    {
      category: t('commandPalette.categories.theme'),
      items: [
        { icon: Sun, label: t('commandPalette.commands.theme.lightMode'), shortcut: 'T L', action: () => { setTheme('light'); setCommandPaletteOpen(false); } },
        { icon: Moon, label: t('commandPalette.commands.theme.darkMode'), shortcut: 'T D', action: () => { setTheme('dark'); setCommandPaletteOpen(false); } },
        { icon: Monitor, label: t('commandPalette.commands.theme.systemMode'), shortcut: 'T S', action: () => { setTheme('system'); setCommandPaletteOpen(false); } },
      ]
    },
    {
      category: t('commandPalette.categories.actions'),
      items: [
        { icon: RefreshCw, label: t('commandPalette.commands.actions.refreshData'), shortcut: 'R', action: () => { window.location.reload(); } },
        { icon: Database, label: t('commandPalette.commands.data.viewDatabase'), shortcut: 'D B', action: () => { addNotification('info', t('commandPalette.messages.viewingDatabase')); setCommandPaletteOpen(false); } },
        { icon: Brain, label: t('commandPalette.commands.actions.aiSettings'), shortcut: 'A I', action: () => { addNotification('info', t('commandPalette.messages.openingAISettings')); setCommandPaletteOpen(false); } },
        { icon: Globe, label: t('commandPalette.commands.actions.webScraper'), shortcut: 'W S', action: () => { addNotification('info', t('commandPalette.messages.openingWebScraper')); setCommandPaletteOpen(false); } },
        { icon: Code, label: t('commandPalette.commands.actions.apiDocumentation'), shortcut: 'A P I', action: () => { window.open('/api-docs', '_blank'); setCommandPaletteOpen(false); } },
      ]
    },
    {
      category: t('commandPalette.categories.data'),
      items: [
        { icon: Upload, label: t('commandPalette.commands.actions.importData'), shortcut: 'I', action: () => { addNotification('info', t('commandPalette.messages.openingImportDialog')); setCommandPaletteOpen(false); } },
        { icon: Download, label: t('commandPalette.commands.actions.exportData'), shortcut: 'E', action: () => { addNotification('info', t('commandPalette.messages.preparingExport')); setCommandPaletteOpen(false); } },
        {
          icon: Trash2, label: t('commandPalette.commands.actions.clearAllData'), shortcut: 'C A', action: () => {
            if (confirm(t('commandPalette.messages.confirmClearAllData'))) {
              addNotification('warning', t('commandPalette.messages.clearingAllData'));
              setCommandPaletteOpen(false);
            }
          }
        },
      ]
    },
  ];

  if (!commandPaletteOpen) return null;

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={() => setCommandPaletteOpen(false)}
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-[9999]"
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
              <Command className="max-h-[500px]">
                <div className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                  <Search className="w-5 h-5 text-gray-400 mr-3" />
                  <Command.Input
                    placeholder={t('commandPalette.placeholder')}
                    value={search}
                    onValueChange={setSearch}
                    className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500"
                  />
                  <button
                    onClick={() => setCommandPaletteOpen(false)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                <Command.List className="max-h-[400px] overflow-y-auto p-2">
                  <Command.Empty className="py-6 text-center text-gray-500">
                    {t('commandPalette.noResults')}
                  </Command.Empty>

                  {commands.map((group) => (
                    <Command.Group key={group.category} heading={group.category} className="mb-2">
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5">
                        {group.category}
                      </div>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Command.Item
                            key={item.label}
                            onSelect={item.action}
                            className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700">
                                <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              </div>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {item.label}
                              </span>
                            </div>
                            <kbd className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded-md text-gray-500 dark:text-gray-400 font-mono">
                              {item.shortcut}
                            </kbd>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  ))}
                </Command.List>

                <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↑↓</kbd>
                        {t('commandPalette.keyboardShortcuts.navigate')}
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↵</kbd>
                        {t('commandPalette.keyboardShortcuts.select')}
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">Esc</kbd>
                        {t('commandPalette.keyboardShortcuts.close')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CommandIcon className="w-3 h-3" />
                      <span>{t('commandPalette.title')}</span>
                    </div>
                  </div>
                </div>
              </Command>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;