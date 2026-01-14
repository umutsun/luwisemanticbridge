# formatTemplate Update Script

## Overview
This script updates the `ragRoutingSchema` formatTemplate to a simpler, LLM-friendly version that produces properly formatted markdown responses.

## Problem
The previous formatTemplate was too complex with emoji instructions and verbose rules. LLMs struggled to follow it consistently, resulting in:
- Missing `##` markdown headers
- Missing blank lines between sections
- Inconsistent formatting

## Solution
Simplified formatTemplate with clear structure:
- 2 main sections: **Yasal Çerçeve** and **Uygulama**
- Clean `##` headers
- Explicit blank line spacing
- Simple citation format `[1][2]`

## Usage

### Local Development
```bash
cd backend
node update-simple-format.js
```

### Production Deployment
```bash
# SSH to production server
ssh -p 2222 root@49.13.38.58

# Navigate to backend directory
cd /var/www/vergilex/backend

# Pull latest changes
git pull

# Run update script
node update-simple-format.js

# Restart backend to clear cache
pm2 restart vergilex-backend
```

## Before/After

### Before (Complex)
```
📚 MARKDOWN KURALLARI (KRİTİK - TAM BU FORMAT):
```
Bir cümlede konuyu özetle [1]. İkinci cümlede kapsamı belirt.

## Yasal Çerçeve

Hangi kanun ve tebliğlerin uygulandığını açıkla [2]...
```

✅ MUTLAKA:
- Her başlık ## ile başla
- Her paragraftan sonra BOŞ SATIR
...
```
(914 characters - too verbose)

### After (Simple)
```
## Yasal Çerçeve

İlgili kanun ve tebliğleri açıkla [1][2]. Temel kuralları belirt.

Detaylı düzenlemeleri ve istisnaları açıkla [3][4].

## Uygulama

Pratikte nasıl uygulandığını örneklerle göster [5].
```
(162 characters - concise and clear)

## Expected Results
After running this script, RAG responses should:
- ✅ Have proper `##` markdown headers
- ✅ Include blank lines between sections
- ✅ Show 5-15 sources (configurable via settings)
- ✅ Use simple `[1]` citation format in text
- ✅ Display detailed source metadata below

## Related Settings
These settings work together with formatTemplate:
- `ragSettings.minSourcesToShow`: 5 (min sources to display)
- `ragSettings.maxSourcesToShow`: 15 (max sources to display)
- `ragSettings.similarityThreshold`: 0.08 (quality gate)

## Notes
- Script is idempotent - safe to run multiple times
- Backs up by reading current value first
- Verifies changes after update
- Works with both `lsemb` (local) and production databases
