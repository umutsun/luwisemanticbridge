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
  numberWords?: {
    description: string;
    cardinals: Record<string, number>;
    ordinals: Record<string, number>;
    compoundPattern?: string;
    ordinalSuffix?: string;
  };
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

// ═══════════════════════════════════════════════════════════════
// TURKISH NUMBER WORD NORMALIZATION v11
// Converts between digit and word forms for claim verification
// e.g., "24" ↔ "yirmidört" / "yirmi dört" / "yirmidördüncü"
// ═══════════════════════════════════════════════════════════════

/**
 * Build reverse mapping from digits to word forms
 */
function buildDigitToWordMap(langPack: SanitizerLangPack): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const numberWords = langPack.numberWords;
  if (!numberWords) return map;

  // Process cardinals: "yirmidört" → 24
  for (const [word, num] of Object.entries(numberWords.cardinals)) {
    if (!map.has(num)) map.set(num, []);
    map.get(num)!.push(word);

    // Also add spaced compound form for 11-31 (onbir → on bir, yirmidört → yirmi dört)
    if (num >= 11 && num <= 31) {
      const spacedForm = addSpaceToCompound(word);
      if (spacedForm !== word) {
        map.get(num)!.push(spacedForm);
      }
    }
  }

  // Process ordinals: "yirmidördüncü" → 24
  for (const [word, num] of Object.entries(numberWords.ordinals)) {
    if (!map.has(num)) map.set(num, []);
    map.get(num)!.push(word);

    // Also add spaced compound form for 11-31
    if (num >= 11 && num <= 31) {
      const spacedForm = addSpaceToCompound(word);
      if (spacedForm !== word) {
        map.get(num)!.push(spacedForm);
      }
    }
  }

  return map;
}

/**
 * Add space to compound Turkish numbers (yirmidört → yirmi dört)
 */
function addSpaceToCompound(word: string): string {
  const prefixes = ['on', 'yirmi', 'otuz'];
  for (const prefix of prefixes) {
    if (word.startsWith(prefix) && word.length > prefix.length) {
      const suffix = word.substring(prefix.length);
      // Only split if suffix starts with a valid unit word
      if (/^(bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz)/.test(suffix)) {
        return `${prefix} ${suffix}`;
      }
    }
  }
  return word;
}

/**
 * Build word to digit mapping from language pack
 */
function buildWordToDigitMap(langPack: SanitizerLangPack): Map<string, number> {
  const map = new Map<string, number>();
  const numberWords = langPack.numberWords;
  if (!numberWords) return map;

  // Add cardinals
  for (const [word, num] of Object.entries(numberWords.cardinals)) {
    map.set(word.toLowerCase(), num);
    // Also add spaced form
    const spacedForm = addSpaceToCompound(word);
    if (spacedForm !== word) {
      map.set(spacedForm.toLowerCase(), num);
    }
  }

  // Add ordinals
  for (const [word, num] of Object.entries(numberWords.ordinals)) {
    map.set(word.toLowerCase(), num);
    // Also add spaced form
    const spacedForm = addSpaceToCompound(word);
    if (spacedForm !== word) {
      map.set(spacedForm.toLowerCase(), num);
    }
  }

  return map;
}

// Cache the maps for performance
const digitToWordCache = new Map<string, Map<number, string[]>>();
const wordToDigitCache = new Map<string, Map<string, number>>();

/**
 * Get all word forms for a digit (e.g., 24 → ["yirmidört", "yirmi dört", "yirmidördüncü", ...])
 */
export function getNumberWordForms(digit: number, langCode: string = 'tr'): string[] {
  const langPack = getSanitizerLangPack(langCode);
  if (!langPack.numberWords) return [];

  // Get or build cache
  if (!digitToWordCache.has(langCode)) {
    digitToWordCache.set(langCode, buildDigitToWordMap(langPack));
  }
  const map = digitToWordCache.get(langCode)!;

  return map.get(digit) || [];
}

/**
 * Convert a Turkish number word to digit
 * e.g., "yirmidördüncü" → 24, "yirmi dört" → 24
 */
export function numberWordToDigit(word: string, langCode: string = 'tr'): number | null {
  const langPack = getSanitizerLangPack(langCode);
  if (!langPack.numberWords) return null;

  // Get or build cache
  if (!wordToDigitCache.has(langCode)) {
    wordToDigitCache.set(langCode, buildWordToDigitMap(langPack));
  }
  const map = wordToDigitCache.get(langCode)!;

  const normalized = word.toLowerCase().trim();
  return map.get(normalized) || null;
}

/**
 * Normalize text by converting all number words to digits
 * This allows matching "yirmidördüncü günü" with "24. günü"
 */
export function normalizeNumberWords(text: string, langCode: string = 'tr'): string {
  const langPack = getSanitizerLangPack(langCode);
  if (!langPack.numberWords) return text;

  // Get or build cache
  if (!wordToDigitCache.has(langCode)) {
    wordToDigitCache.set(langCode, buildWordToDigitMap(langPack));
  }
  const map = wordToDigitCache.get(langCode)!;

  // Build pattern that matches all number words (longer words first to avoid partial matches)
  const sortedWords = Array.from(map.keys()).sort((a, b) => b.length - a.length);
  if (sortedWords.length === 0) return text;

  // Escape special regex characters in words
  const escapedWords = sortedWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');

  return text.replace(pattern, (match) => {
    const digit = map.get(match.toLowerCase());
    return digit !== undefined ? digit.toString() : match;
  });
}

/**
 * Build a regex pattern that matches both digit and word forms of a number
 * e.g., buildNumberMatchPattern(24, 'tr') → /24|yirmidört|yirmi\s+dört|yirmidördüncü|.../i
 */
export function buildNumberMatchPattern(digit: number, langCode: string = 'tr'): RegExp {
  const wordForms = getNumberWordForms(digit, langCode);

  // Start with the digit itself
  const patterns = [digit.toString()];

  // Add all word forms
  for (const word of wordForms) {
    // Escape special characters and allow flexible whitespace for compound forms
    const escaped = word
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+'); // Allow flexible whitespace
    patterns.push(escaped);
  }

  return new RegExp(`(?:${patterns.join('|')})`, 'i');
}

export default {
  getSanitizerLangPack,
  isLanguageSupported,
  getAllLangPacks,
  buildTemporalPattern,
  buildDatePattern,
  buildPercentagePattern,
  getNumberWordForms,
  numberWordToDigit,
  normalizeNumberWords,
  buildNumberMatchPattern,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
};
