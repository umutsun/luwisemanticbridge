/**
 * Slash Commands Configuration
 * Available commands for the chat input
 */

import type { SlashCommand } from '../types';

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'translate-en',
    trigger: '/en',
    label: 'English',
    description: 'Translate to English',
    icon: '\uD83C\uDDEC\uD83C\uDDE7',
    category: 'translation',
    targetLanguage: 'en'
  },
  {
    id: 'translate-tr',
    trigger: '/tr',
    label: 'Türkçe',
    description: 'Türkçe\'ye çevir',
    icon: '\uD83C\uDDF9\uD83C\uDDF7',
    category: 'translation',
    targetLanguage: 'tr'
  },
  {
    id: 'translate-de',
    trigger: '/de',
    label: 'Deutsch',
    description: 'Auf Deutsch übersetzen',
    icon: '\uD83C\uDDE9\uD83C\uDDEA',
    category: 'translation',
    targetLanguage: 'de'
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
