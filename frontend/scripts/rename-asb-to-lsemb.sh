#!/bin/bash

# Script to replace all 'asb' references with 'lsemb' in frontend

echo "Replacing 'asb' references with 'lsemb'..."

# Find all relevant files
files=$(find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" \) 2>/dev/null)

# Replace patterns
for file in $files; do
    if [ -f "$file" ]; then
        # Make backup
        cp "$file" "$file.backup"

        # Replace patterns
        sed -i 's/\bAsb\b/LSEM/g' "$file"
        sed -i 's/\bASB\b/LSEM/g' "$file"
        sed -i 's/\basb\b/lsem/g' "$file"

        echo "Processed: $file"
    fi
done

# Also process config files
for file in config.json package.json public/locales/*/*.json; do
    if [ -f "$file" ]; then
        cp "$file" "$file.backup"
        sed -i 's/\bAsb\b/LSEM/g' "$file"
        sed -i 's/\bASB\b/LSEM/g' "$file"
        sed -i 's/\basb\b/lsem/g' "$file"
        echo "Processed: $file"
    fi
done

echo "Replacement complete. Backups created with .backup extension."