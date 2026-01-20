'use client';

import React from 'react';
import { Languages } from 'lucide-react';

interface TranslationBadgeProps {
  targetLanguage: string;
  isShowingTranslation: boolean;
  onToggle: () => void;
}

const LANGUAGE_FLAGS: Record<string, string> = {
  en: '\uD83C\uDDEC\uD83C\uDDE7',
  tr: '\uD83C\uDDF9\uD83C\uDDF7',
  de: '\uD83C\uDDE9\uD83C\uDDEA',
  fr: '\uD83C\uDDEB\uD83C\uDDF7',
  es: '\uD83C\uDDEA\uD83C\uDDF8',
  ar: '\uD83C\uDDF8\uD83C\uDDE6',
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'EN',
  tr: 'TR',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  ar: 'AR',
};

/**
 * TranslationBadge
 * Small toggle badge showing translation status
 */
export const TranslationBadge: React.FC<TranslationBadgeProps> = ({
  targetLanguage,
  isShowingTranslation,
  onToggle,
}) => {
  const flag = LANGUAGE_FLAGS[targetLanguage] || '';
  const langCode = LANGUAGE_NAMES[targetLanguage] || targetLanguage.toUpperCase();

  return (
    <button
      onClick={onToggle}
      className={`zen01-translation-badge ${isShowingTranslation ? 'active' : ''}`}
      title={isShowingTranslation ? 'Orijinali göster' : 'Çeviriyi göster'}
    >
      {isShowingTranslation ? (
        <>
          <span className="zen01-translation-badge-flag">{flag}</span>
          <span className="zen01-translation-badge-lang">{langCode}</span>
        </>
      ) : (
        <>
          <Languages className="h-3 w-3" />
          <span className="zen01-translation-badge-lang">Orijinal</span>
        </>
      )}
    </button>
  );
};

export default TranslationBadge;
