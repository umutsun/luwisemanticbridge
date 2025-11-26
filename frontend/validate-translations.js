#!/usr/bin/env node

/**
 * Translation Validation Script
 * Checks for missing keys, empty values, and consistency
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, 'public/locales');
const REFERENCE_LANG = 'en';

function getAllKeys(obj, prefix = '') {
    let keys = [];

    for (const key in obj) {
        const currentPath = prefix ? `${prefix}.${key}` : key;

        if (typeof obj[key] === 'object' && obj[key] !== null) {
            keys = keys.concat(getAllKeys(obj[key], currentPath));
        } else {
            keys.push(currentPath);
        }
    }

    return keys;
}

function getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

function main() {
    console.log('🔍 Validating translations...\n');

    // Load reference language
    const refPath = path.join(LOCALES_DIR, REFERENCE_LANG, 'translation.json');
    const refData = JSON.parse(fs.readFileSync(refPath, 'utf8'));
    const refKeys = getAllKeys(refData);

    console.log(`📊 Reference (${REFERENCE_LANG}): ${refKeys.length} keys\n`);

    // Check all languages
    const languages = fs.readdirSync(LOCALES_DIR).filter(f =>
        fs.statSync(path.join(LOCALES_DIR, f)).isDirectory() && f !== REFERENCE_LANG
    );

    const report = [];

    languages.forEach(lang => {
        const filePath = path.join(LOCALES_DIR, lang, 'translation.json');

        if (!fs.existsSync(filePath)) {
            report.push({
                lang,
                status: '❌ MISSING',
                missing: refKeys.length,
                auto: 0,
                empty: 0,
                total: 0
            });
            return;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const langKeys = getAllKeys(data);

        // Find missing keys
        const missingKeys = refKeys.filter(key => !langKeys.includes(key));

        // Find auto-translated keys
        const autoKeys = langKeys.filter(key => {
            const value = getValueByPath(data, key);
            return typeof value === 'string' && value.startsWith('[AUTO]');
        });

        // Find empty values
        const emptyKeys = langKeys.filter(key => {
            const value = getValueByPath(data, key);
            return !value || value.trim() === '';
        });

        const completeness = ((langKeys.length - missingKeys.length - autoKeys.length) / refKeys.length * 100).toFixed(1);

        let status = '✅ COMPLETE';
        if (missingKeys.length > 0) status = '⚠️  INCOMPLETE';
        if (autoKeys.length > 0) status = '🔄 AUTO';
        if (emptyKeys.length > 0) status = '❌ ERRORS';

        report.push({
            lang: lang.toUpperCase(),
            status,
            total: langKeys.length,
            missing: missingKeys.length,
            auto: autoKeys.length,
            empty: emptyKeys.length,
            completeness: `${completeness}%`
        });
    });

    // Print report
    console.log('┌─────────┬────────────┬───────┬─────────┬──────┬───────┬──────────────┐');
    console.log('│ Lang    │ Status     │ Total │ Missing │ Auto │ Empty │ Completeness │');
    console.log('├─────────┼────────────┼───────┼─────────┼──────┼───────┼──────────────┤');

    report.forEach(r => {
        console.log(
            `│ ${r.lang.padEnd(7)} │ ${r.status.padEnd(10)} │ ${String(r.total).padStart(5)} │ ` +
            `${String(r.missing).padStart(7)} │ ${String(r.auto).padStart(4)} │ ${String(r.empty).padStart(5)} │ ` +
            `${r.completeness.padStart(12)} │`
        );
    });

    console.log('└─────────┴────────────┴───────┴─────────┴──────┴───────┴──────────────┘');

    console.log('\n📊 Summary:');
    const complete = report.filter(r => r.missing === 0 && r.auto === 0 && r.empty === 0).length;
    const needsWork = report.length - complete;

    console.log(`   ✅ Complete: ${complete}/${report.length}`);
    console.log(`   ⚠️  Needs work: ${needsWork}/${report.length}`);

    if (needsWork > 0) {
        console.log('\n💡 Next steps:');
        console.log('   1. Run: node auto-translate.js');
        console.log('   2. Run: node extract-untranslated.js');
        console.log('   3. Review and fix auto-translations');
    }
}

main();
