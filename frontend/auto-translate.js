#!/usr/bin/env node

/**
 * Auto-Translation Script for Missing i18n Keys
 * Uses free translation methods (no API key required)
 * 
 * Strategy:
 * 1. Use existing translations as reference (TR → EN already complete)
 * 2. Copy structure from EN to missing languages
 * 3. Use simple word-by-word mapping for common terms
 * 4. Mark untranslated strings with [AUTO] prefix for manual review
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../frontend/public/locales');
const SOURCE_LANG = 'en'; // Source language (most complete)
const TARGET_LANGS = ['fr', 'es', 'de', 'zh', 'el', 'th', 'ru', 'ar', 'ja', 'ko'];

// Simple translation dictionary for common UI terms
const COMMON_TRANSLATIONS = {
    fr: {
        'Settings': 'Paramètres',
        'Dashboard': 'Tableau de bord',
        'Save': 'Enregistrer',
        'Cancel': 'Annuler',
        'Delete': 'Supprimer',
        'Edit': 'Modifier',
        'Add': 'Ajouter',
        'Search': 'Rechercher',
        'Loading': 'Chargement',
        'Error': 'Erreur',
        'Success': 'Succès',
        'Users': 'Utilisateurs',
        'Documents': 'Documents',
        'Messages': 'Messages',
        'Active': 'Actif',
        'Inactive': 'Inactif'
    },
    es: {
        'Settings': 'Configuración',
        'Dashboard': 'Panel de control',
        'Save': 'Guardar',
        'Cancel': 'Cancelar',
        'Delete': 'Eliminar',
        'Edit': 'Editar',
        'Add': 'Agregar',
        'Search': 'Buscar',
        'Loading': 'Cargando',
        'Error': 'Error',
        'Success': 'Éxito',
        'Users': 'Usuarios',
        'Documents': 'Documentos',
        'Messages': 'Mensajes',
        'Active': 'Activo',
        'Inactive': 'Inactivo'
    },
    de: {
        'Settings': 'Einstellungen',
        'Dashboard': 'Dashboard',
        'Save': 'Speichern',
        'Cancel': 'Abbrechen',
        'Delete': 'Löschen',
        'Edit': 'Bearbeiten',
        'Add': 'Hinzufügen',
        'Search': 'Suchen',
        'Loading': 'Laden',
        'Error': 'Fehler',
        'Success': 'Erfolg',
        'Users': 'Benutzer',
        'Documents': 'Dokumente',
        'Messages': 'Nachrichten',
        'Active': 'Aktiv',
        'Inactive': 'Inaktiv'
    }
};

// Load JSON file
function loadJSON(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error.message);
        return null;
    }
}

// Save JSON file
function saveJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error saving ${filePath}:`, error.message);
        return false;
    }
}

// Simple auto-translate using dictionary
function autoTranslate(text, targetLang) {
    if (!text || typeof text !== 'string') return text;

    const dict = COMMON_TRANSLATIONS[targetLang];
    if (!dict) return `[AUTO] ${text}`;

    // Try exact match first
    if (dict[text]) return dict[text];

    // Try word-by-word replacement
    let translated = text;
    Object.keys(dict).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        translated = translated.replace(regex, dict[key]);
    });

    // If nothing changed, mark as auto-translated
    if (translated === text) {
        return `[AUTO] ${text}`;
    }

    return translated;
}

// Recursively fill missing keys
function fillMissingKeys(source, target, targetLang, path = '') {
    const result = { ...target };

    for (const key in source) {
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof source[key] === 'object' && source[key] !== null) {
            // Recursive for nested objects
            result[key] = fillMissingKeys(
                source[key],
                result[key] || {},
                targetLang,
                currentPath
            );
        } else {
            // If key doesn't exist in target, auto-translate
            if (!result[key]) {
                result[key] = autoTranslate(source[key], targetLang);
                console.log(`  + Added: ${currentPath} = "${result[key]}"`);
            }
        }
    }

    return result;
}

// Main function
function main() {
    console.log('🌍 Auto-Translation Script Starting...\n');

    // Load source language
    const sourcePath = path.join(LOCALES_DIR, SOURCE_LANG, 'translation.json');
    const sourceData = loadJSON(sourcePath);

    if (!sourceData) {
        console.error('❌ Failed to load source language file');
        return;
    }

    console.log(`✅ Loaded source language: ${SOURCE_LANG}`);
    console.log(`📊 Total keys in source: ${JSON.stringify(sourceData).match(/"[^"]+"\s*:/g).length}\n`);

    // Process each target language
    TARGET_LANGS.forEach(lang => {
        console.log(`\n🔄 Processing: ${lang.toUpperCase()}`);

        const targetPath = path.join(LOCALES_DIR, lang, 'translation.json');
        let targetData = loadJSON(targetPath) || {};

        // Fill missing keys
        const updatedData = fillMissingKeys(sourceData, targetData, lang);

        // Save updated file
        if (saveJSON(targetPath, updatedData)) {
            console.log(`✅ Saved: ${targetPath}`);
        } else {
            console.log(`❌ Failed to save: ${targetPath}`);
        }
    });

    console.log('\n\n✨ Auto-translation complete!');
    console.log('\n📝 Next Steps:');
    console.log('1. Review files with [AUTO] prefix');
    console.log('2. Use Google Translate or DeepL for better quality');
    console.log('3. Ask native speakers to review translations');
    console.log('\n💡 Tip: Search for "[AUTO]" in translation files to find auto-generated content\n');
}

// Run
main();
