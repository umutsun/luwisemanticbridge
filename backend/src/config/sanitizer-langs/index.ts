/**
 * Sanitizer Language Packs
 *
 * Multi-language support for RAG sanitizer patterns.
 * Each language has its own:
 * - Temporal units (year, month, day...)
 * - Temporal suffixes (verb conjugations)
 * - Date patterns (ordinals)
 * - Percentage patterns
 * - Forbidden patterns (normative/modal verbs)
 * - Grounding keywords
 *
 * Usage:
 *   import { getSanitizerLangPack, SUPPORTED_LANGUAGES } from './sanitizer-langs';
 *   const langPack = getSanitizerLangPack('tr');
 */

import trLang from './tr.json';
import enLang from './en.json';

/**
 * Language pack interface
 */
export interface SanitizerLangPack {
  code: string;
  name: string;
  description: string;
  temporalUnits: string[];
  temporalSuffixes: {
    description: string;
    backVowels?: string;  // Turkish vowel harmony
    frontVowels?: string; // Turkish vowel harmony
    pattern?: string;     // Simple suffix (English)
  };
  datePatterns: {
    ordinal: string;
    description: string;
  };
  percentagePatterns: {
    symbol: string;
    word: string;
    description: string;
  };
  forbiddenPatterns: Array<{
    id: string;
    category: string;
    pattern: string;
    description: string;
  }>;
  groundingKeywords: string[];
}

/**
 * All supported languages
 */
export const SUPPORTED_LANGUAGES = ['tr', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/**
 * Language pack registry
 */
const LANG_PACKS: Record<SupportedLanguage, SanitizerLangPack> = {
  tr: trLang as SanitizerLangPack,
  en: enLang as SanitizerLangPack,
};

/**
 * Default language (Turkish for first customers)
 */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'tr';

/**
 * Get sanitizer language pack by code
 * Falls back to Turkish if language not found
 */
export function getSanitizerLangPack(langCode: string): SanitizerLangPack {
  const normalizedCode = langCode.toLowerCase().substring(0, 2) as SupportedLanguage;

  if (LANG_PACKS[normalizedCode]) {
    return LANG_PACKS[normalizedCode];
  }

  console.warn(`[SanitizerLang] Language '${langCode}' not supported, falling back to '${DEFAULT_LANGUAGE}'`);
  return LANG_PACKS[DEFAULT_LANGUAGE];
}

/**
 * Check if language is supported
 */
export function isLanguageSupported(langCode: string): boolean {
  const normalizedCode = langCode.toLowerCase().substring(0, 2);
  return SUPPORTED_LANGUAGES.includes(normalizedCode as SupportedLanguage);
}

/**
 * Get all available language packs
 */
export function getAllLangPacks(): Record<SupportedLanguage, SanitizerLangPack> {
  return LANG_PACKS;
}

/**
 * Build temporal pattern with suffixes for a language
 * Handles Turkish vowel harmony and English simplicity
 */
export function buildTemporalPattern(langPack: SanitizerLangPack): RegExp {
  const { temporalUnits, temporalSuffixes } = langPack;

  if (langPack.code === 'tr') {
    // Turkish: Apply vowel harmony
    const unitsWithSuffixes = temporalUnits.map(unit => {
      const suffix = /[aıou]/.test(unit)
        ? temporalSuffixes.backVowels || 'd[ıi]r'
        : temporalSuffixes.frontVowels || 'd[üu]r';
      return `${unit}(?:${suffix})?`;
    }).join('|');
    return new RegExp(`(\\d+)\\s*(${unitsWithSuffixes})`, 'gi');
  } else {
    // English and others: Simple optional 's' suffix
    const suffix = temporalSuffixes.pattern || 's?';
    const unitsPattern = temporalUnits.map(u => `${u}${suffix}`).join('|');
    return new RegExp(`(\\d+)\\s*(${unitsPattern})`, 'gi');
  }
}

/**
 * Build date ordinal pattern for a language
 */
export function buildDatePattern(langPack: SanitizerLangPack): RegExp {
  return new RegExp(langPack.datePatterns.ordinal, 'gi');
}

/**
 * Build percentage pattern for a language
 */
export function buildPercentagePattern(langPack: SanitizerLangPack): RegExp {
  const { symbol, word } = langPack.percentagePatterns;
  return new RegExp(`${symbol}|${word}`, 'gi');
}

export default {
  getSanitizerLangPack,
  isLanguageSupported,
  getAllLangPacks,
  buildTemporalPattern,
  buildDatePattern,
  buildPercentagePattern,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
};
