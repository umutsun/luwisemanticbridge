#!/usr/bin/env node

/**
 * Find ALL missing translation keys by scanning actual component usage
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DIR = path.join(__dirname, 'src');
const LOCALES_DIR = path.join(__dirname, 'public/locales');

console.log('🔍 Scanning for t() usage in components...\n');

// Find all t('key') usage in source files
const tUsageRegex = /t\(['"`]([^'"`]+)['"`]\)/g;
const allKeys = new Set();

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            scanDirectory(filePath);
        } else if (file.match(/\.(tsx?|jsx?)$/)) {
            const content = fs.readFileSync(filePath, 'utf8');
            let match;

            while ((match = tUsageRegex.exec(content)) !== null) {
                allKeys.add(match[1]);
            }
        }
    });
}

scanDirectory(SRC_DIR);

console.log(`✅ Found ${allKeys.size} unique translation keys in source code\n`);

// Check which keys are missing in translation files
const languages = ['tr', 'en'];

languages.forEach(lang => {
    const translationPath = path.join(LOCALES_DIR, lang, 'translation.json');

    if (!fs.existsSync(translationPath)) {
        console.log(`❌ ${lang}: translation.json not found`);
        return;
    }

    const translations = JSON.parse(fs.readFileSync(translationPath, 'utf8'));

    function hasKey(obj, keyPath) {
        const keys = keyPath.split('.');
        let current = obj;

        for (const key of keys) {
            if (!current || typeof current !== 'object' || !(key in current)) {
                return false;
            }
            current = current[key];
        }

        return true;
    }

    const missingKeys = [];

    allKeys.forEach(key => {
        if (!hasKey(translations, key)) {
            missingKeys.push(key);
        }
    });

    console.log(`\n📊 ${lang.toUpperCase()}:`);
    console.log(`   Total keys in code: ${allKeys.size}`);
    console.log(`   Missing keys: ${missingKeys.length}`);

    if (missingKeys.length > 0) {
        console.log(`\n   Missing keys:`);
        missingKeys.slice(0, 20).forEach(key => {
            console.log(`   - ${key}`);
        });

        if (missingKeys.length > 20) {
            console.log(`   ... and ${missingKeys.length - 20} more`);
        }

        // Save to file
        const outputPath = path.join(__dirname, `missing-keys-${lang}.txt`);
        fs.writeFileSync(outputPath, missingKeys.join('\n'), 'utf8');
        console.log(`\n   💾 Saved to: ${outputPath}`);
    }
});

console.log('\n\n✨ Scan complete!');
