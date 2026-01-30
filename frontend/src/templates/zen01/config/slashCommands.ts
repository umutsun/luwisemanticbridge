/**
 * Slash Commands Configuration
 * Available commands for the chat input
 */

import type { SlashCommand } from '../types';

export const SLASH_COMMANDS: SlashCommand[] = [
  // Translation command with submenu
  {
    id: 'translate',
    trigger: '/translate',
    label: 'Çevir',
    description: 'Mesajı çevir',
    icon: '',
    category: 'translation',
    hasSubmenu: true,
    submenuItems: [
      { id: 'en', label: 'English', targetLanguage: 'en' },
      { id: 'de', label: 'Deutsch', targetLanguage: 'de' },
      { id: 'fr', label: 'Français', targetLanguage: 'fr' },
      { id: 'es', label: 'Español', targetLanguage: 'es' },
      { id: 'ar', label: 'العربية', targetLanguage: 'ar' },
      { id: 'ru', label: 'Русский', targetLanguage: 'ru' },
      { id: 'zh', label: '中文', targetLanguage: 'zh' },
      { id: 'ja', label: '日本語', targetLanguage: 'ja' },
      { id: 'ko', label: '한국어', targetLanguage: 'ko' },
    ]
  },
  // Navigation commands
  {
    id: 'history',
    trigger: '/history',
    label: 'Geçmiş',
    description: 'Konuşma geçmişini göster',
    icon: '',
    category: 'navigation'
  },
  {
    id: 'new',
    trigger: '/new',
    label: 'Yeni',
    description: 'Yeni konuşma başlat',
    icon: '',
    category: 'navigation'
  },
  // Suggestion command - shows recent conversations
  {
    id: 'suggest',
    trigger: '/suggest',
    label: 'Öneriler',
    description: 'Son konuşmalara devam et',
    icon: '',
    category: 'suggestion',
    hasSubmenu: true,
    hasDynamicSubmenu: true,  // Populated at runtime with conversations
    submenuItems: []  // Will be filled dynamically
  }
];

/**
 * Filter commands based on search text
 */
export function filterCommands(searchText: string): SlashCommand[] {
  if (!searchText) return SLASH_COMMANDS;

  const search = searchText.toLowerCase();
  return SLASH_COMMANDS.filter(cmd =>
    cmd.trigger.toLowerCase().includes('/' + search) ||
    cmd.trigger.toLowerCase().slice(1).startsWith(search) ||
    cmd.label.toLowerCase().includes(search)
  );
}
