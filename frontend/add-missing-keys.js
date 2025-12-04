const fs = require('fs');
const path = require('path');

const MISSING_KEYS_FILE = path.join(__dirname, 'missing-keys-tr.txt');
const EN_TRANSLATION_FILE = path.join(__dirname, 'public/locales/en/translation.json');

if (!fs.existsSync(MISSING_KEYS_FILE)) {
    console.error('Missing keys file not found!');
    process.exit(1);
}

const missingKeysRaw = fs.readFileSync(MISSING_KEYS_FILE, 'utf8').split('\n');
const enTranslation = JSON.parse(fs.readFileSync(EN_TRANSLATION_FILE, 'utf8'));

// Filter keys
const validKeys = missingKeysRaw.filter(key => {
    key = key.trim();
    if (!key) return false;
    // Filter out obvious garbage
    if (key.includes('/') || key.includes('\\') || key.includes('=') || key.includes('${')) return false;
    if (key.length < 2) return false;
    return true;
});

console.log(`Found ${validKeys.length} potentially valid missing keys.`);

let addedCount = 0;

function addKey(obj, keyPath, value) {
    const keys = keyPath.split('.');
    let current = obj;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        // If it's the last key, set the value
        if (i === keys.length - 1) {
            if (!current[key]) {
                current[key] = value;
                addedCount++;
                return true;
            }
            return false; // Already exists
        }

        // If key doesn't exist or is not an object, create it
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
}

validKeys.forEach(key => {
    key = key.trim();
    // If key has spaces, it's likely a sentence key, so we add it at root level
    if (key.includes(' ')) {
        if (!enTranslation[key]) {
            enTranslation[key] = `[MISSING] ${key}`;
            addedCount++;
        }
    } else {
        // It's a dot-notation key
        // Use the last part of the key as the default value (capitalized)
        const parts = key.split('.');
        const lastPart = parts[parts.length - 1];
        const defaultValue = `[MISSING] ${lastPart.replace(/([A-Z])/g, ' $1').trim()}`; // Split camelCase

        addKey(enTranslation, key, defaultValue);
    }
});

fs.writeFileSync(EN_TRANSLATION_FILE, JSON.stringify(enTranslation, null, 2), 'utf8');

console.log(`✅ Added ${addedCount} missing keys to en/translation.json`);
