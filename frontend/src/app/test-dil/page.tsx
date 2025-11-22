'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/hooks/useLanguage';

export default function TestDilPage() {
  const { t, i18n } = useTranslation();
  const { changeLanguage, currentLanguage } = useLanguage();
  const [htmlLang, setHtmlLang] = useState<string>('');

  useEffect(() => {
    // Update HTML lang attribute
    setHtmlLang(document.documentElement.lang);
  }, []);

  const handleLanguageChange = (lang: string) => {
    changeLanguage(lang);
    // Update HTML lang attribute
    setTimeout(() => {
      setHtmlLang(document.documentElement.lang);
    }, 100);
  };

  const languages = [
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
  ];

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{t('testPage.title')}</h1>
        <p className="text-muted-foreground">
          {t('testPage.description')}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle>{t('testPage.currentStatus')}</CardTitle>
            <CardDescription>
              {t('testPage.statusDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold">{t('testPage.useLanguageHook')}</h3>
              <p>{t('testPage.currentLanguage')} <Badge variant="secondary">{currentLanguage}</Badge></p>
            </div>
            <div>
              <h3 className="font-semibold">{t('testPage.htmlLangAttribute')}</h3>
              <p>{t('testPage.htmlLang')} <Badge variant="secondary">{htmlLang}</Badge></p>
            </div>
            <div>
              <h3 className="font-semibold">{t('testPage.i18nLanguage')}</h3>
              <p>{t('testPage.i18nLanguageField')} <Badge variant="secondary">{i18n.language}</Badge></p>
            </div>
            <div>
              <h3 className="font-semibold">{t('testPage.localStorage')}</h3>
              <p>{t('testPage.selectedLanguageField')} <Badge variant="secondary">{localStorage.getItem('selectedLanguage') || t('testPage.notSet')}</Badge></p>
            </div>
          </CardContent>
        </Card>

        {/* Translation Tests */}
        <Card>
          <CardHeader>
            <CardTitle>{t('testPage.translationTests')}</CardTitle>
            <CardDescription>
              {t('testPage.testsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold">{t('testPage.settingsKeys')}</h3>
              <p>settings.generalSettingsTitle: <Badge variant="outline">{t('settings.generalSettingsTitle')}</Badge></p>
              <p>settings.languageLabel: <Badge variant="outline">{t('settings.languageLabel')}</Badge></p>
              <p>settings.appNameLabel: <Badge variant="outline">{t('settings.appNameLabel')}</Badge></p>
              <p>settings.saveButton: <Badge variant="outline">{t('settings.saveButton')}</Badge></p>
            </div>
            <div>
              <h3 className="font-semibold">{t('testPage.headerKeys')}</h3>
              <p>header.dashboard: <Badge variant="outline">{t('header.dashboard')}</Badge></p>
              <p>header.settings: <Badge variant="outline">{t('header.settings')}</Badge></p>
              <p>header.menu.settings: <Badge variant="outline">{t('header.menu.settings')}</Badge></p>
            </div>
          </CardContent>
        </Card>

        {/* Language Switching Buttons */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('testPage.languageSwitching')}</CardTitle>
            <CardDescription>
              {t('testPage.switchingDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {languages.map((lang) => (
                <Button
                  key={lang.code}
                  variant={currentLanguage === lang.code ? "default" : "outline"}
                  className="h-16 flex flex-col items-center justify-center gap-1"
                  onClick={() => handleLanguageChange(lang.code)}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="text-xs">{lang.name}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}