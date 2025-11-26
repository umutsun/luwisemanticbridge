#!/usr/bin/env node

/**
 * Extract Untranslated Strings
 * Finds all [AUTO] prefixed strings for manual review
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, 'public/locales');
const OUTPUT_DIR = path.join(__dirname, 'translations-to-review');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function extractAutoTranslations(obj, prefix = '', results = []) {
    for (const key in obj) {
        const currentPath = prefix ? `${prefix}.${key}` : key;

        if (typeof obj[key] === 'object' && obj[key] !== null) {
            extractAutoTranslations(obj[key], currentPath, results);
        } else if (typeof obj[key] === 'string' && obj[key].startsWith('[AUTO]')) {
            results.push({
                key: currentPath,
                original: obj[key].replace('[AUTO] ', ''),
                auto: obj[key]
            });
        }
    }

    return results;
}

function main() {
    console.log('🔍 Extracting untranslated strings...\n');

    const languages = fs.readdirSync(LOCALES_DIR).filter(f =>
        fs.statSync(path.join(LOCALES_DIR, f)).isDirectory()
    );

    languages.forEach(lang => {
        const filePath = path.join(LOCALES_DIR, lang, 'translation.json');

        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  ${lang}: No translation file found`);
            return;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const autoTranslations = extractAutoTranslations(data);

        if (autoTranslations.length === 0) {
            console.log(`✅ ${lang.toUpperCase()}: No auto-translations found`);
            return;
        }

        console.log(`📝 ${lang.toUpperCase()}: ${autoTranslations.length} auto-translations found`);

        // Save to file for manual review
        const outputPath = path.join(OUTPUT_DIR, `${lang}-to-review.txt`);
        const content = autoTranslations.map(item =>
            `${item.key}\n  EN: ${item.original}\n  ${lang.toUpperCase()}: [TRANSLATE THIS]\n`
        ).join('\n');

        fs.writeFileSync(outputPath, content, 'utf8');
        console.log(`   Saved to: ${outputPath}`);
    });

    console.log('\n✨ Extraction complete!');
    console.log(`📁 Review files in: ${OUTPUT_DIR}`);
}

main();
