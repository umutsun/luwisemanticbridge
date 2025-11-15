# Chat Template System

Template-based chat interface system for customizing chat UI per customer/project without modifying core codebase.

## 📁 Structure

```
templates/
├── base/                      # Default template (versioned in Git)
│   ├── ChatInterface.tsx
│   ├── chat/                  # Chat components
│   └── config.json
│
├── example-custom/            # Example custom template (Git ignored)
│   ├── ChatInterface.tsx
│   └── config.json
│
└── custom-acme/               # Customer-specific template (Git ignored)
    ├── ChatInterface.tsx
    ├── Widget.tsx             # Optional: custom widget
    └── config.json
```

## 🚀 Quick Start

### 1. Create New Template

Copy the example template:

```bash
cd frontend/src/templates
cp -r example-custom custom-yourproject
```

### 2. Edit Configuration

Edit `custom-yourproject/config.json`:

```json
{
  "id": "custom-yourproject",
  "name": "Your Project Template",
  "extends": "base",
  "theme": {
    "primaryColor": "#your-color",
    "borderRadius": "12px"
  }
}
```

### 3. Register Template

Edit `registry.ts` and add your template:

```typescript
export const chatTemplates = {
  // ... existing templates
  'custom-yourproject': {
    id: 'custom-yourproject',
    name: 'Your Project Template',
    ChatInterface: () => import('./custom-yourproject/ChatInterface'),
    config: () => import('./custom-yourproject/config.json')
  }
};
```

### 4. Activate Template

Update `backend/config/active-template.json`:

```json
{
  "active": "custom-yourproject",
  "available": ["base", "custom-yourproject"]
}
```

Or use the API:

```bash
curl -X POST http://localhost:8086/api/v2/settings/set-active-template \
  -H "Content-Type: application/json" \
  -d '{"templateId": "custom-yourproject"}'
```

## 🎨 Customization Levels

### Level 1: Config Only (Easiest)

Just edit `config.json` - no code changes needed:

```json
{
  "theme": {
    "primaryColor": "#ff0000",
    "backgroundColor": "#ffffff",
    "borderRadius": "12px"
  },
  "features": {
    "showSuggestions": false,
    "enableVoiceInput": true
  }
}
```

### Level 2: CSS Override

Add custom CSS in `config.json`:

```json
{
  "customCSS": ".chat-message { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }"
}
```

### Level 3: Component Override

Override `ChatInterface.tsx` for full control:

```typescript
import BaseChatInterface from '../base/ChatInterface';

export default function CustomChatInterface(props) {
  return (
    <div className="custom-wrapper">
      {/* Your custom header */}
      <CustomHeader />

      {/* Base chat interface */}
      <BaseChatInterface {...props} />

      {/* Your custom footer */}
      <CustomFooter />
    </div>
  );
}
```

## 📦 Deployment

### Method 1: Git (for base template)

```bash
git add frontend/src/templates/base/
git commit -m "Update base template"
git push
```

### Method 2: ZIP Upload (for custom templates)

```bash
# Create ZIP
cd frontend/src/templates
zip -r custom-yourproject.zip custom-yourproject/

# Upload via API (TODO: implement upload endpoint)
curl -X POST http://localhost:8086/api/v2/settings/upload-template \
  -F "template=@custom-yourproject.zip" \
  -F "templateId=custom-yourproject"
```

### Method 3: Manual Deployment

```bash
# Copy to production server
scp -r custom-yourproject/ user@server:/path/to/frontend/src/templates/

# Register template
ssh user@server "cd /path/to/backend && node scripts/register-template.js custom-yourproject"
```

## 🔧 Config Options

### Theme Properties

```json
{
  "theme": {
    "primaryColor": "#000000",      // Main brand color
    "secondaryColor": "#666666",    // Secondary color
    "backgroundColor": "#ffffff",   // Page background
    "panelBackground": "#f5f5f5",   // Chat panel background
    "textColor": "#000000",         // Text color
    "borderRadius": "12px",         // Border radius for elements
    "fontFamily": "Inter, sans-serif", // Font stack
    "messageSpacing": "1rem",       // Spacing between messages
    "headerHeight": "60px"          // Header height
  }
}
```

### Feature Flags

```json
{
  "features": {
    "showLogo": true,               // Show logo in header
    "showSuggestions": true,        // Show suggested questions
    "showSources": true,            // Show source citations
    "showTimestamp": true,          // Show message timestamps
    "showAvatar": true,             // Show user/bot avatars
    "enableFullPage": true,         // Allow full-page mode
    "enableVoiceInput": false,      // Voice input button
    "enableFileUpload": true        // File upload support
  }
}
```

### Widget Configuration

```json
{
  "widget": {
    "enabled": true,                // Enable floating widget
    "position": "bottom-right",     // "bottom-left" | "bottom-right"
    "buttonIcon": "💬",             // Button emoji/text
    "buttonColor": "#000000",       // Button background color
    "buttonSize": 60,               // Button size in pixels
    "panelWidth": 400,              // Chat panel width
    "panelHeight": 600,             // Chat panel height
    "autoOpen": false,              // Auto-open on page load
    "autoOpenDelay": 3000           // Delay before auto-open (ms)
  }
}
```

## 📝 Best Practices

1. **Always extend base template** - Don't copy entire ChatInterface, just override what you need
2. **Use config.json first** - Try to solve with config before writing custom code
3. **Keep it simple** - Less custom code = easier maintenance
4. **Test before deployment** - Always test custom template locally first
5. **Document changes** - Add comments explaining custom logic
6. **Version your templates** - Use semantic versioning in config.json

## 🔄 Template Inheritance

```
base (default)
  └── extends by: custom-project1
       └── extends by: custom-project1-variant

custom-project2 (standalone, also extends base)
```

## 🛠️ Troubleshooting

### Template not loading?

1. Check registry.ts - is your template registered?
2. Check active-template.json - is it set as active?
3. Check browser console for import errors
4. Verify file paths are correct

### Styles not applying?

1. Check config.json syntax
2. Use browser DevTools to inspect CSS variables
3. Ensure customCSS is valid CSS

### Widget not showing?

1. Check widget.enabled in config.json
2. Verify position is valid
3. Check z-index conflicts with existing page styles

## 📚 Examples

See `example-custom/` for a working example template.

## 🤝 Contributing

When creating templates for clients:

1. Create folder: `custom-clientname/`
2. Copy base or example template
3. Customize config.json
4. Test locally
5. Register in registry.ts
6. Deploy to production
7. Activate via API

## 📄 License

Same as parent project.
