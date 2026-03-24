'use client';

import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../lib/i18n';
import { useConfig } from '@/contexts/ConfigContext';

interface Props {
  children: React.ReactNode;
}

export default function I18nProvider({ children }: Props) {
  const { config } = useConfig();
  const [currentLang, setCurrentLang] = useState(i18n.language);

  useEffect(() => {
    // Listen to language change events
    const handleLanguageChanged = (lng: string) => {
      setCurrentLang(lng);
      console.log('Language changed to:', lng);
    };

    i18n.on('languageChanged', handleLanguageChanged);

    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    // Config'ten gelen dil ayarını uygula
    if (config?.app?.locale && i18n.language !== config.app.locale) {
      i18n.changeLanguage(config.app.locale).then(() => {
        // HTML lang attribute'ini güncelle
        if (typeof document !== 'undefined') {
          document.documentElement.lang = config.app.locale;
        }

        // Local storage'a kaydet
        if (typeof window !== 'undefined') {
          localStorage.setItem('selectedLanguage', config.app.locale);
        }

        // Force re-render
        setCurrentLang(config.app.locale);
      });
    }
  }, [config?.app?.locale]);

  return <I18nextProvider i18n={i18n} key={currentLang}>{children}</I18nextProvider>;
}
