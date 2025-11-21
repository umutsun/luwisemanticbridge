import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enTranslations from '../../public/locales/en/translation.json';
import trTranslations from '../../public/locales/tr/translation.json';
import frTranslations from '../../public/locales/fr/translation.json';
import esTranslations from '../../public/locales/es/translation.json';
import deTranslations from '../../public/locales/de/translation.json';
import zhTranslations from '../../public/locales/zh/translation.json';
import elTranslations from '../../public/locales/el/translation.json';
import thTranslations from '../../public/locales/th/translation.json';
import ruTranslations from '../../public/locales/ru/translation.json';
import arTranslations from '../../public/locales/ar/translation.json';
import jaTranslations from '../../public/locales/ja/translation.json';
import koTranslations from '../../public/locales/ko/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // we init with resources
    resources: {
      en: {
        translations: enTranslations
      },
      tr: {
        translations: trTranslations
      },
      fr: {
        translations: frTranslations
      },
      es: {
        translations: esTranslations
      },
      de: {
        translations: deTranslations
      },
      zh: {
        translations: zhTranslations
      },
      el: {
        translations: elTranslations
      },
      th: {
        translations: thTranslations
      },
      ru: {
        translations: ruTranslations
      },
      ar: {
        translations: arTranslations
      },
      ja: {
        translations: jaTranslations
      },
      ko: {
        translations: koTranslations
      }
    },
    fallbackLng: 'en',
    debug: false,

    // have a common namespace used around the full app
    ns: ['translations'],
    defaultNS: 'translations',

    keySeparator: false, // we use content as keys

    interpolation: {
      escapeValue: false, // not needed for react!!
      formatSeparator: ','
    },

    react: {
      useSuspense: true,
    }
  });

export default i18n;