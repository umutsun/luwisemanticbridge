# Multi-Language Support Implementation Summary

## 📋 Overview
LSEMB artık 12 dil desteğine sahip. Dil yönetimi **merkezi** ve **admin-controlled**.

## 🌍 Supported Languages

| Code | Language | Flag | Status |
|------|----------|------|--------|
| `tr` | Türkçe | 🇹🇷 | ✅ Default |
| `en` | English | 🇺🇸 | ✅ Ready |
| `fr` | Français | 🇫🇷 | ✅ Ready |
| `es` | Español | 🇪🇸 | ✅ Ready |
| `de` | Deutsch | 🇩🇪 | ✅ Ready |
| `zh` | 中文 | 🇨🇳 | ✅ Ready |
| `el` | Ελληνικά | 🇬🇷 | ✅ Ready + Special Handler |
| `th` | ไทย | 🇹🇭 | ✅ Ready |
| `ru` | Русский | 🇷🇺 | ✅ Ready |
| `ar` | العربية | 🇸🇦 | ✅ Ready |
| `ja` | 日本語 | 🇯🇵 | ✅ Ready |
| `ko` | 한국어 | 🇰🇷 | ✅ Ready |

## 🎯 Architecture

### Single Source of Truth
```
Backend Settings (PostgreSQL)
  └─ app.locale: "tr"
       ↓
  ConfigContext
       ↓
  I18nProvider (auto-sync)
       ↓
  react-i18next
       ↓
  All Components
```

### Key Components

#### 1. **Backend Settings** (`/api/v2/settings`)
```json
{
  "app": {
    "name": "LSEMB",
    "locale": "tr"  // ← Single source of truth
  }
}
```

#### 2. **ConfigContext** (`src/contexts/ConfigContext.tsx`)
- Fetches settings from backend
- Provides `config.app.locale` to entire app
- Auto-updates when settings change

#### 3. **I18nProvider** (`src/components/I18nProvider.tsx`)
```typescript
useEffect(() => {
  if (config?.app?.locale && i18n.language !== config.app.locale) {
    i18n.changeLanguage(config.app.locale);
    document.documentElement.lang = config.app.locale;
  }
}, [config?.app?.locale]);
```

#### 4. **useLanguage Hook** (`src/hooks/useLanguage.ts`)
- Provides `currentLanguage` and `availableLanguages`
- Syncs with backend when language changes
- Used by Settings page

## 🔧 How to Change Language

### For Admins:
1. Go to **Dashboard → Settings → General**
2. Find **"App Language"** dropdown
3. Select desired language
4. Click **Save**
5. ✅ Entire application switches to new language

### For Users:
- **Cannot change** - Language is controlled by admin
- Automatically uses the language set in settings

## 📁 File Structure

```
frontend/
├── public/locales/          # Translation files
│   ├── tr/translation.json  # Turkish
│   ├── en/translation.json  # English
│   ├── fr/translation.json  # French
│   ├── es/translation.json  # Spanish
│   ├── de/translation.json  # German
│   ├── zh/translation.json  # Chinese
│   ├── el/translation.json  # Greek
│   ├── th/translation.json  # Thai
│   ├── ru/translation.json  # Russian
│   ├── ar/translation.json  # Arabic
│   ├── ja/translation.json  # Japanese
│   └── ko/translation.json  # Korean
├── src/
│   ├── lib/i18n.ts          # i18next configuration
│   ├── components/
│   │   └── I18nProvider.tsx # Auto-sync with backend
│   ├── hooks/
│   │   └── useLanguage.ts   # Language management hook
│   ├── utils/
│   │   ├── greek-text-handler.ts   # Greek character support
│   │   └── yoruba-text-handler.ts  # Yoruba character support
│   └── contexts/
│       └── ConfigContext.tsx # Backend settings provider
```

## 🎨 Special Language Support

### Greek (Ελληνικά)
- **Text Handler**: `src/utils/greek-text-handler.ts`
- **Input Components**: `src/components/ui/greek-input.tsx`
- **CSS Support**: `src/app/globals.css` (`.greek-text`, `.greek-font`)
- **Font**: Noto Sans Greek
- **Features**:
  - Unicode normalization (NFC)
  - Diacritic handling (tonos, dialytika)
  - URL-safe conversion
  - Character validation

### Yoruba (YUNANCA)
- **Text Handler**: `src/utils/yoruba-text-handler.ts`
- **Input Components**: `src/components/ui/yoruba-input.tsx`
- **CSS Support**: `src/app/globals.css` (`.yoruba-text`, `.yoruba-font`)
- **Font**: Noto Sans
- **Features**:
  - Turkish character support (ğ, ş, ç, ı, ö, ü)
  - Accented character normalization
  - Unicode NFC normalization

## 🔄 Translation Workflow

### Adding New Translations
1. **Create translation file**: `public/locales/{lang}/translation.json`
2. **Add to i18n config**: `src/lib/i18n.ts`
   ```typescript
   import {lang}Translations from '../../public/locales/{lang}/translation.json';
   
   resources: {
     {lang}: { translation: {lang}Translations }
   }
   ```
3. **Add to useLanguage**: `src/hooks/useLanguage.ts`
   ```typescript
   { code: '{lang}', name: 'Language Name', flag: '🏴' }
   ```

### Translation Keys Structure
```json
{
  "common": {
    "loading": "Loading...",
    "save": "Save",
    "cancel": "Cancel"
  },
  "header": {
    "menu": {
      "dashboard": "Dashboard",
      "users": "Users"
    }
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Welcome"
  }
}
```

### Usage in Components
```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.welcome')}</p>
    </div>
  );
}
```

## ✅ Benefits

1. **Centralized Control**: Admin manages language for entire organization
2. **Consistent Experience**: All users see same language
3. **No User Confusion**: No language selector in UI
4. **Backend Persistence**: Language setting saved in database
5. **Auto-Sync**: Changes reflect immediately across all sessions
6. **Special Character Support**: Greek and Yoruba text handlers
7. **12 Languages Ready**: Comprehensive international support

## 🚀 Testing

### Test Greek Support
Visit: `http://localhost:3000/test-greek`
- Test Greek input components
- Validate character handling
- Check Unicode normalization

### Test Language Switching
1. Login as admin
2. Go to Settings → General
3. Change "App Language" to different language
4. Verify entire UI updates
5. Check translations in:
   - Header menu
   - Dashboard
   - Forms
   - Buttons

## 📝 Notes

- **Default Language**: Turkish (`tr`)
- **Fallback Language**: English (`en`)
- **RTL Support**: Arabic (`ar`) ready
- **Font Loading**: Google Fonts (Noto Sans family)
- **Browser Compatibility**: All modern browsers
- **Performance**: Lazy-loaded translation files

## 🔐 Security

- Language setting requires admin authentication
- Settings endpoint protected by JWT
- No client-side language override
- XSS protection in translation rendering

---

**Last Updated**: 2025-11-25
**Version**: 1.0.0
**Status**: ✅ Production Ready
