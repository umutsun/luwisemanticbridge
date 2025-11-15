# 🎨 Chat Template System - Quick Start Guide

## 📌 Overview

Template-based chat interface system for customizing chat UI per customer/project **without modifying core codebase**.

### Key Features
- ✅ **Zero disruption**: Mevcut ChatInterface bozulmadan çalışır
- ✅ **Git-friendly**: Custom template'ler `.gitignore`'da, sadece base template versiyonlanır
- ✅ **Inheritance-based**: Base template'i extend ederek custom template'ler oluşturulur
- ✅ **Hot-swap**: API ile template değiştirince anında aktif olur
- ✅ **Config-driven**: Çoğu customization sadece JSON config ile yapılır

---

## 🏗️ Architecture

```
frontend/src/
├── templates/
│   ├── base/                    # ✅ Git'te (default)
│   │   ├── ChatInterface.tsx
│   │   ├── chat/                # Chat components
│   │   └── config.json
│   │
│   ├── example-custom/          # ⛔ Gitignore (örnek)
│   │   ├── ChatInterface.tsx
│   │   └── config.json
│   │
│   ├── registry.ts              # Template registry
│   └── README.md
│
├── lib/
│   └── template-loader.ts       # Dynamic loader
│
├── components/
│   ├── ChatInterface.tsx        # Original (unchanged)
│   └── TemplateChatInterface.tsx # Template wrapper
│
└── app/
    └── page.tsx                 # Uses TemplateChatInterface

backend/
├── config/
│   └── active-template.json     # Active template config
│
└── src/routes/
    └── template.routes.ts       # Template API
```

---

## 🚀 Quick Start: Create Custom Template

### 1. Copy Base Template

```bash
cd frontend/src/templates
cp -r base custom-acme
```

### 2. Edit Config

Edit `custom-acme/config.json`:

```json
{
  "id": "custom-acme",
  "name": "Acme Corp Template",
  "extends": "base",
  "theme": {
    "primaryColor": "#ff0000",
    "borderRadius": "16px"
  }
}
```

### 3. Register Template

Edit `frontend/src/templates/registry.ts`:

```typescript
export const chatTemplates = {
  'base': { ... },

  // Add your template
  'custom-acme': {
    id: 'custom-acme',
    name: 'Acme Corp Template',
    ChatInterface: () => import('./custom-acme/ChatInterface'),
    config: () => import('./custom-acme/config.json')
  }
};
```

### 4. Update Backend Config

Edit `backend/config/active-template.json`:

```json
{
  "active": "custom-acme",
  "available": ["base", "custom-acme"]
}
```

### 5. Restart & Test

```bash
# Restart backend (template API needs it)
pm2 restart scriptus-backend

# Frontend hot-reloads automatically
npm run dev
```

---

## 🎯 Customization Levels

### Level 1: Config Only (Easiest) ⭐

Most customizations can be done via `config.json`:

```json
{
  "theme": {
    "primaryColor": "#6366f1",
    "backgroundColor": "#ffffff",
    "borderRadius": "12px"
  },
  "features": {
    "showSuggestions": false,
    "enableVoiceInput": true
  },
  "widget": {
    "position": "bottom-right",
    "buttonColor": "#ff0000"
  }
}
```

### Level 2: CSS Override ⭐⭐

Add custom CSS in config:

```json
{
  "customCSS": ".chat-message { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }"
}
```

### Level 3: Component Override ⭐⭐⭐

Override `ChatInterface.tsx` for full control:

```tsx
import BaseChatInterface from '../base/ChatInterface';

export default function CustomChatInterface(props) {
  return (
    <div className="custom-wrapper">
      <CustomHeader />
      <BaseChatInterface {...props} />
      <CustomFooter />
    </div>
  );
}
```

---

## 🔧 API Endpoints

### Get Active Template

```bash
GET /api/v2/settings/active-template

Response:
{
  "active": "base",
  "available": ["base", "custom-acme"],
  "updatedAt": "2025-01-10T00:00:00Z"
}
```

### Set Active Template (Admin Only)

```bash
POST /api/v2/settings/set-active-template
Content-Type: application/json

{
  "templateId": "custom-acme"
}

Response:
{
  "success": true,
  "active": "custom-acme",
  "message": "Template activated successfully"
}
```

### Register New Template (Admin Only)

```bash
POST /api/v2/settings/register-template
Content-Type: application/json

{
  "templateId": "custom-newclient",
  "name": "New Client Template",
  "description": "Custom theme for new client"
}
```

---

## 📦 Deployment Workflow

### Scenario 1: New Customer Arrives

```bash
# 1. Developer creates custom template locally
cd frontend/src/templates
cp -r base custom-newclient

# 2. Customize config and components
vim custom-newclient/config.json
vim custom-newclient/ChatInterface.tsx

# 3. Register in registry.ts
vim registry.ts

# 4. Test locally
npm run dev

# 5. Deploy to production
# (custom templates are gitignored, so deploy manually or via ZIP)

# Method A: Manual copy
scp -r custom-newclient/ user@server:/path/to/frontend/src/templates/

# Method B: ZIP upload (TODO: implement upload endpoint)
zip -r custom-newclient.zip custom-newclient/
# Upload via admin UI

# 6. Activate template
curl -X POST https://api.yourapp.com/api/v2/settings/set-active-template \
  -H "Content-Type: application/json" \
  -d '{"templateId": "custom-newclient"}'
```

### Scenario 2: Update Base Template

```bash
# Base template is versioned in Git
cd frontend/src/templates/base
# Make changes...

git add base/
git commit -m "Update base template"
git push

# Deploy normally via CI/CD
```

---

## 🛡️ How It Works (No Core Changes)

1. **Original ChatInterface** (`components/ChatInterface.tsx`) remains **unchanged**
2. **Base template** (`templates/base/ChatInterface.tsx`) is a **copy** of original
3. **TemplateChatInterface** wrapper dynamically loads active template
4. **App page** uses wrapper instead of original:
   ```tsx
   // Before: import ChatInterface from '@/components/ChatInterface';
   // After:  import ChatInterface from '@/components/TemplateChatInterface';
   ```

5. **Fallback safety**: If template fails to load, falls back to base

### To Revert (Disable Template System):

```tsx
// frontend/src/app/page.tsx
// Just change import back:
import ChatInterface from '@/components/ChatInterface';
```

---

## 🎨 Widget Support (Coming Soon)

Template system will also support custom widgets:

```json
{
  "widget": {
    "enabled": true,
    "position": "bottom-right",
    "buttonIcon": "💬",
    "panelWidth": 400
  }
}
```

---

## 📚 Examples

### Example 1: Just Change Colors

```json
{
  "id": "blue-theme",
  "extends": "base",
  "theme": {
    "primaryColor": "#3b82f6",
    "backgroundColor": "#f0f9ff"
  }
}
```

### Example 2: Hide Features

```json
{
  "features": {
    "showSuggestions": false,
    "showSources": false,
    "showTimestamp": false
  }
}
```

### Example 3: Custom Layout

```tsx
// templates/custom-layout/ChatInterface.tsx
import { ChatMessages, ChatInput } from '../base/ChatInterface';

export default function CustomLayout(props) {
  return (
    <div className="grid grid-cols-3">
      <div className="col-span-2">
        <ChatMessages {...props} />
      </div>
      <div className="col-span-1">
        <Sidebar />
      </div>
      <div className="col-span-3">
        <ChatInput {...props} />
      </div>
    </div>
  );
}
```

---

## ⚠️ Important Notes

1. **Custom templates are NOT versioned** - They're in `.gitignore`
2. **Base template IS versioned** - Updates to base affect all customers (unless overridden)
3. **Always test locally first** - Template errors break chat interface
4. **Keep extensions simple** - Less custom code = easier maintenance
5. **Document your changes** - Add comments explaining custom logic

---

## 🐛 Troubleshooting

### Template not loading?

1. Check `registry.ts` - is template registered?
2. Check `active-template.json` - is it set as active?
3. Check browser console for errors
4. Verify file paths are correct

### Styles not applying?

1. Check `config.json` syntax (valid JSON?)
2. Inspect CSS variables in DevTools
3. Check if `customCSS` is valid CSS

### Fallback to base template?

Check backend logs:
```bash
pm2 logs scriptus-backend | grep template
```

---

## 📞 Support

For issues or questions:
- Read: `frontend/src/templates/README.md`
- Example: `frontend/src/templates/example-custom/`
- Docs: This file

---

## ✅ Checklist for New Template

- [ ] Copied base or example template
- [ ] Updated `config.json` with unique `id`
- [ ] Registered in `registry.ts`
- [ ] Tested locally
- [ ] Deployed to production
- [ ] Updated `active-template.json`
- [ ] Verified activation via API
- [ ] Tested in production

---

**Created**: 2025-01-10
**Status**: ✅ Production Ready
**Impact**: Zero disruption to existing codebase
