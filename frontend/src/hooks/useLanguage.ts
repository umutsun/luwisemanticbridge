'use client';

import { useTranslation } from 'react-i18next';
import { useConfig } from '@/contexts/ConfigContext';
import { useEffect } from 'react';

export function useLanguage() {
  const { i18n } = useTranslation('translations');
  const { config, updateConfig } = useConfig();

  // Dil değiştirme fonksiyonu
  const changeLanguage = async (language: string) => {
    try {
      // i18n dilini değiştir
      await i18n.changeLanguage(language);
      
      // HTML lang attribute'ini güncelle
      if (typeof document !== 'undefined') {
        document.documentElement.lang = language;
      }
      
      // Config context'teki locale'u güncelle
      if (config && updateConfig) {
        try {
          await updateConfig({
            ...config,
            app: {
              ...config.app,
              locale: language
            }
          });
        } catch (error) {
          console.error('Failed to update language in config:', error);
        }
      }
      
      // Local storage'a kaydet
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedLanguage', language);
      }
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  // Sayfa yüklendiğinde kaydedilmiş dili ayarla
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem('selectedLanguage');
      const configLocale = config?.app?.locale;
      
      // Öncelik: 1. Config'ten gelen locale, 2. Kaydedilmiş dil, 3. Browser dili
      const targetLanguage = configLocale || savedLanguage || i18n.language;
      
      if (targetLanguage && targetLanguage !== i18n.language) {
        i18n.changeLanguage(targetLanguage);
        document.documentElement.lang = targetLanguage;
      }
    }
  }, [config?.app?.locale, i18n]);

  return {
    currentLanguage: i18n.language,
    changeLanguage,
    availableLanguages: [
      { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'zh', name: '中文', flag: '🇨🇳' },
      { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
      { code: 'th', name: 'ไทย', flag: '🇹🇭' },
      { code: 'ru', name: 'Русский', flag: '🇷🇺' },
      { code: 'ar', name: 'العربية', flag: '🇸🇦' },
      { code: 'ja', name: '日本語', flag: '🇯🇵' },
      { code: 'ko', name: '한국어', flag: '🇰🇷' }
    ]
  };
}