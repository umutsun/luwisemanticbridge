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
import kmTranslations from '../../public/locales/km/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // we init with resources
    resources: {
      en: {
        translation: enTranslations
      },
      tr: {
        translation: trTranslations
      },
      fr: {
        translation: frTranslations
      },
      es: {
        translation: esTranslations
      },
      de: {
        translation: deTranslations
      },
      zh: {
        translation: zhTranslations
      },
      el: {
        translation: elTranslations
      },
      th: {
        translation: thTranslations
      },
      ru: {
        translation: ruTranslations
      },
      ar: {
        translation: arTranslations
      },
      ja: {
        translation: jaTranslations
      },
      ko: {
        translation: koTranslations
      },
      km: {
        translation: kmTranslations
      }
    },
    fallbackLng: 'en',
    debug: false,

    // have a common namespace used around the full app
    ns: ['translation'],
    defaultNS: 'translation',

    keySeparator: '.', // use dot notation for nested keys

    interpolation: {
      escapeValue: false, // not needed for react!!
      formatSeparator: ',',
      prefix: '{',
      suffix: '}'
    },

    react: {
      useSuspense: false,
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed',
      transEmptyNodeValue: '',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p']
    }
  });

export default i18n;