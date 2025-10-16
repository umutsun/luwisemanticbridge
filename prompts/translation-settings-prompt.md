# Translation API Settings Configuration Task

You are tasked with adding translation service configuration to the settings page. This is critical for the new document translation feature.

## Translation Services to Add

### 1. DeepL API Configuration
- API Key field (password type)
- Usage statistics (characters used, cost)
- Connection test button
- Supported languages list

### 2. Google Translate API Configuration
- API Key field (password type)
- Usage statistics (characters used, cost)
- Connection test button
- Supported languages list

## Implementation Details

### Settings Page Structure
Add translation section to settings page with:
1. **Translation Settings** card with provider selection
2. **API Configuration** tabs for each provider
3. **Usage Statistics** display
4. **Test Connection** functionality

### Backend Requirements
The backend expects these settings keys:
- `deepl.apiKey` for DeepL
- `google.translate.apiKey` for Google Translate

### Frontend Components to Create/Update

1. **Translation Settings Component**
   - Provider selector (DeepL/Google)
   - API key input fields
   - Save/Update buttons
   - Test connection buttons

2. **Usage Statistics Component**
   - Display usage metrics
   - Cost calculations
   - Rate limits

3. **Language Support Display**
   - Show supported languages for each provider
   - Language code mapping

### Important Notes
- Use the existing settings infrastructure
- Follow the current dark theme patterns
- Add loading states for API key validation
- Include error handling for invalid API keys
- Add cost estimation displays
- Show real-time character count estimates

### API Testing
Implement test functions that:
1. Validate API key format
2. Test actual API connection
3. Check account balance/usage
4. Return success/error messages

### Cost Information
- DeepL: ~$6 per 1M characters
- Google Translate: ~$20 per 1M characters
- Display these costs prominently

Make sure to integrate with the existing save/load settings functionality and maintain consistency with the current UI design patterns.

## Files to Update
- `frontend/src/app/dashboard/settings/page.tsx` - Add translation settings
- `backend/src/routes/settings.routes.ts` - Add translation API endpoints if needed

The translation feature is already integrated in DocumentOperations component, so we just need the settings configuration to make it work with real APIs.