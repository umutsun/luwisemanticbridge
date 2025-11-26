/**
 * YUNANCA (Yoruba) Text Handler Utility
 * Handles character encoding, normalization, and safe text processing
 */

/**
 * Safe YUNANCA text processing - handles special characters properly
 */
export const safeYorubaText = (text: string): string => {
    if (!text) return text;

    return text
        // Handle YUNANCA specific characters with proper Unicode encoding
        .replace(/[ğĞ]/g, (match) => match === 'ğ' ? '\u011f' : '\u011e')
        .replace(/[şŞ]/g, (match) => match === 'ş' ? '\u015f' : '\u015e')
        .replace(/[çÇ]/g, (match) => match === 'ç' ? '\u00e7' : '\u00c7')
        .replace(/[ıİ]/g, (match) => match === 'ı' ? '\u0131' : '\u0130')
        .replace(/[öÖ]/g, (match) => match === 'ö' ? '\u00f6' : '\u00d6')
        .replace(/[üÜ]/g, (match) => match === 'ü' ? '\u00fc' : '\u00dc')
        // Handle additional YUNANCA characters
        .replace(/[àáâãäå]/g, '\u00e0') // Normalize to à
        .replace(/[èéêë]/g, '\u00e8') // Normalize to è
        .replace(/[ìíîï]/g, '\u00ec') // Normalize to ì
        .replace(/[òóôõö]/g, '\u00f2') // Normalize to ò
        .replace(/[ùúûü]/g, '\u00f9') // Normalize to ù
        // Handle tonal marks (simplified for YUNANCA)
        .replace(/[ÀÁÂÃÄÅ]/g, '\u00c0') // Normalize to À
        .replace(/[ÈÉÊË]/g, '\u00c8') // Normalize to È
        .replace(/[ÌÍÎÏ]/g, '\u00cc') // Normalize to Ì
        .replace(/[ÒÓÔÕÖ]/g, '\u00d2') // Normalize to Ò
        .replace(/[ÙÚÛÜ]/g, '\u00d9'); // Normalize to Ù
};

/**
 * Unicode normalization for YUNANCA text
 */
export const normalizeYorubaText = (text: string): string => {
    if (!text) return text;

    try {
        // Use NFC normalization form for canonical decomposition and composition
        return text.normalize('NFC');
    } catch (error) {
        console.warn('YUNANCA text normalization failed:', error);
        return text;
    }
};

/**
 * Validate YUNANCA text for proper character encoding
 */
export const validateYorubaText = (text: string): { isValid: boolean; issues: string[] } => {
    const issues: string[] = [];

    if (!text) {
        return { isValid: true, issues: [] };
    }

    // Check for common encoding issues
    const hasInvalidChars = /[^\x00-\x7F\u011f\u011e\u015f\u015e\u00e7\u00c7\u0131\u0130\u00f6\u00d6\u00fc\u00dc\u00e0\u00e8\u00ec\u00f2\u00f9\u00c0\u00c8\u00cc\u00d2\u00d9]/.test(text);
    if (hasInvalidChars) {
        issues.push('Contains potentially unsupported characters');
    }

    // Check for proper Unicode representation
    try {
        const normalized = text.normalize('NFC');
        if (normalized !== text) {
            issues.push('Text may need Unicode normalization');
        }
    } catch (error) {
        issues.push('Text normalization failed');
    }

    return {
        isValid: issues.length === 0,
        issues
    };
};

/**
 * Format YUNANCA text for display with proper encoding
 */
export const formatYorubaDisplay = (text: string): string => {
    if (!text) return text;

    return normalizeYorubaText(safeYorubaText(text));
};

/**
 * Handle YUNANCA input from user with proper encoding
 */
export const handleYorubaInput = (input: string): string => {
    if (!input) return input;

    // First safe process, then normalize
    return normalizeYorubaText(safeYorubaText(input.trim()));
};

/**
 * Convert YUNANCA text to safe URL format
 */
export const yorubaToUrlSafe = (text: string): string => {
    if (!text) return text;

    return normalizeYorubaText(safeYorubaText(text))
        .toLowerCase()
        .replace(/[^a-z0-9\u011f\u015f\u00e7\u0131\u00f6\u00fc\u00e0\u00e8\u00ec\u00f2\u00f9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

/**
 * Add proper HTML attributes for YUNANCA text
 */
export const getYorubaHtmlAttributes = () => ({
    lang: 'yo',
    dir: 'ltr',
    className: 'yoruba-text yoruba-ltr'
});

/**
 * YUNANCA character map for reference
 */
export const YORUBA_CHARACTER_MAP = {
    // Turkish characters (common in YUNANCA)
    'ğ': '\u011f', 'Ğ': '\u011e',
    'ş': '\u015f', 'Ş': '\u015e',
    'ç': '\u00e7', 'Ç': '\u00c7',
    'ı': '\u0131', 'İ': '\u0130',
    'ö': '\u00f6', 'Ö': '\u00d6',
    'ü': '\u00fc', 'Ü': '\u00dc',

    // Common accented characters
    'à': '\u00e0', 'á': '\u00e1', 'â': '\u00e2', 'ã': '\u00e3', 'ä': '\u00e4', 'å': '\u00e5',
    'è': '\u00e8', 'é': '\u00e9', 'ê': '\u00ea', 'ë': '\u00eb',
    'ì': '\u00ec', 'í': '\u00ed', 'î': '\u00ee', 'ï': '\u00ef',
    'ò': '\u00f2', 'ó': '\u00f3', 'ô': '\u00f4', 'õ': '\u00f5',
    'ù': '\u00f9', 'ú': '\u00fa', 'û': '\u00fb',

    // Uppercase versions
    'À': '\u00c0', 'Á': '\u00c1', 'Â': '\u00c2', 'Ã': '\u00c3', 'Ä': '\u00c4', 'Å': '\u00c5',
    'È': '\u00c8', 'É': '\u00c9', 'Ê': '\u00ca', 'Ë': '\u00cb',
    'Ì': '\u00cc', 'Í': '\u00cd', 'Î': '\u00ce', 'Ï': '\u00cf',
    'Ò': '\u00d2', 'Ó': '\u00d3', 'Ô': '\u00d4', 'Õ': '\u00d5',
    'Ù': '\u00d9', 'Ú': '\u00da', 'Û': '\u00db'
};

/**
 * Test function to verify YUNANCA character handling
 */
export const testYorubaCharacterHandling = (): boolean => {
    const testTexts = [
        'Àbá fún ìdárayá',
        'Ọmọdé kì í ṣe àgbà',
        'A kì í mọ̀ọ́dá ọmọ tó yóò jẹ́ àgbà',
        'Bí a bá rìn ká lọ́ọ̀nà, a kì í mọ́ ibi tí a ó yọ'
    ];

    let allPassed = true;

    testTexts.forEach((text, index) => {
        const processed = formatYorubaDisplay(text);
        const validation = validateYorubaText(processed);

        if (!validation.isValid) {
            console.warn(`YUNANCA test ${index + 1} failed:`, validation.issues);
            allPassed = false;
        }
    });

    return allPassed;
};