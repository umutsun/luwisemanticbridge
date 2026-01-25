/**
 * Slash Commands Configuration
 * Available commands for the chat input
 */

import type { SlashCommand } from '../types';

export const SLASH_COMMANDS: SlashCommand[] = [
  // Translation commands
  {
    id: 'translate-en',
    trigger: '/en',
    label: 'English',
    description: 'Translate to English',
    icon: '🇬🇧',
    category: 'translation',
    targetLanguage: 'en'
  },
  {
    id: 'translate-tr',
    trigger: '/tr',
    label: 'Türkçe',
    description: 'Türkçe\'ye çevir',
    icon: '🇹🇷',
    category: 'translation',
    targetLanguage: 'tr'
  },
  {
    id: 'translate-de',
    trigger: '/de',
    label: 'Deutsch',
    description: 'Auf Deutsch übersetzen',
    icon: '🇩🇪',
    category: 'translation',
    targetLanguage: 'de'
  },
  // Navigation commands
  {
    id: 'history',
    trigger: '/history',
    label: 'Geçmiş',
    description: 'Konuşma geçmişini göster',
    icon: '📜',
    category: 'navigation'
  },
  {
    id: 'new',
    trigger: '/new',
    label: 'Yeni',
    description: 'Yeni konuşma başlat',
    icon: '✨',
    category: 'navigation'
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
    cmd.label.toLowerCase().includes(search) ||
    cmd.targetLanguage?.toLowerCase().startsWith(search)
  );
}
