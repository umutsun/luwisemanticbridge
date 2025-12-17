# Database Migrations

## Overview
This directory contains SQL migration scripts for the LSEMB project.

## Running Migrations

### Local Development (lsemb database)
```bash
# Windows (using psql from XAMPP/PostgreSQL)
psql -U postgres -d lsemb -f backend/database/migrations/20251216_add_theme_and_features_to_chatbot_settings.sql

# Or using pgAdmin:
# 1. Open pgAdmin
# 2. Connect to lsemb database
# 3. Open Query Tool
# 4. Load and execute the SQL file
```

### Production (SSH to server)
```bash
# SSH to server
ssh root@91.99.229.96

# Run migration for each instance
# Vergilex
psql -U postgres -d vergilex_db -f /var/www/vergilex/backend/database/migrations/20251216_add_theme_and_features_to_chatbot_settings.sql

# Emlakai
psql -U postgres -d emlakai_db -f /var/www/emlakai/backend/database/migrations/20251216_add_theme_and_features_to_chatbot_settings.sql

# Bookie
psql -U postgres -d bookie_db -f /var/www/bookie/backend/database/migrations/20251216_add_theme_and_features_to_chatbot_settings.sql
```

## Migration: Theme and Features (2025-12-16)

### What it does:
- Adds `theme` column to `chatbot_settings` table
  - Options: 'base', 'modern', 'spark', 'unified'
  - Default: 'modern'

- Adds `features` column (JSONB) for feature flags
  - Controls UI behavior
  - Enables/disables features per instance

### Default Feature Configuration:
```json
{
  "enableSourcesSection": true,
  "enableKeywordHighlighting": true,
  "enableSourceExpansion": true,
  "sourceDisplayStyle": "detailed",
  "enableResponseTime": true,
  "enableTokenCount": true,
  "enableConfidenceScore": true,
  "enableFollowUpQuestions": false,
  "enableActionButtons": false,
  "enableSourceClick": true,
  "inputStyle": "inline",
  "headerStyle": "modern",
  "messageStyle": "card",
  "enableWelcomeMessage": true,
  "enableSuggestions": true,
  "suggestionsCount": 4,
  "enableStreaming": true,
  "enableTypingIndicator": true,
  "enableAutoScroll": true
}
```

### Recommended Instance Configurations:

**Vergilex (Legal/Tax Platform):**
```sql
UPDATE chatbot_settings
SET theme = 'base',
    features = jsonb_set(features, '{sourceDisplayStyle}', '"detailed"')
WHERE instance_name = 'vergilex';
```

**Bookie (Accounting Platform):**
```sql
UPDATE chatbot_settings
SET theme = 'modern',
    features = jsonb_set(
      jsonb_set(features, '{sourceDisplayStyle}', '"minimal"'),
      '{inputStyle}', '"floating"'
    )
WHERE instance_name = 'bookie';
```

**Emlakai (Real Estate Platform):**
```sql
UPDATE chatbot_settings
SET theme = 'modern',
    features = jsonb_set(
      jsonb_set(features, '{enableFollowUpQuestions}', 'true'),
      '{inputStyle}', '"floating"'
    )
WHERE instance_name = 'emlakai';
```

## Rollback

If you need to rollback this migration:

```sql
ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS theme;
ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS features;
DROP INDEX IF EXISTS idx_chatbot_settings_theme;
```

## Verification

After running migration, verify with:

```sql
-- Check if columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'chatbot_settings'
  AND column_name IN ('theme', 'features');

-- Check current settings
SELECT id, title, theme, features
FROM chatbot_settings;
```

## Notes

- Migration is idempotent (can be run multiple times safely)
- Uses `IF NOT EXISTS` clauses
- Includes rollback script
- Sets default values for existing rows
- Creates index for performance optimization
