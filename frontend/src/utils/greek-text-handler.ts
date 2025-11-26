/**
 * YUNANCA (Greek) Text Handler Utility
 * Handles character encoding, normalization, and safe text processing
 */

/**
 * Safe YUNANCA text processing - handles special characters properly
 */
export const safeGreekText = (text: string): string => {
    if (!text) return text;

    return text
        // Handle Greek specific characters with proper Unicode encoding
        .replace(/[αά]/g, '\u03b1') // Normalize to alpha
        .replace(/[ά]/g, '\u03ac')  // Alpha with tonos
        .replace(/[έε]/g, '\u03b5') // Normalize to epsilon
        .replace(/[έ]/g, '\u03ad')  // Epsilon with tonos
        .replace(/[ηή]/g, '\u03b7') // Normalize to eta
        .replace(/[ή]/g, '\u03ae')  // Eta with tonos
        .replace(/[ίιϊΐ]/g, '\u03b9') // Normalize to iota
        .replace(/[ί]/g, '\u03af')  // Iota with tonos
        .replace(/[ϊ]/g, '\u03ca')  // Iota with dialytika
        .replace(/[ΐ]/g, '\u0390')  // Iota with dialytika and tonos
        .replace(/[οό]/g, '\u03bf') // Normalize to omicron
        .replace(/[ό]/g, '\u03cc')  // Omicron with tonos
        .replace(/[ύυϋΰ]/g, '\u03c5') // Normalize to upsilon
        .replace(/[ύ]/g, '\u03cd')  // Upsilon with tonos
        .replace(/[ϋ]/g, '\u03cb')  // Upsilon with dialytika
        .replace(/[ΰ]/g, '\u03b0')  // Upsilon with dialytika and tonos
        .replace(/[ωώ]/g, '\u03c9') // Normalize to omega
        .replace(/[ώ]/g, '\u03ce')  // Omega with tonos

        // Uppercase versions
        .replace(/[ΑΆ]/g, '\u0391') // Normalize to Alpha
        .replace(/[Ά]/g, '\u0386')  // Alpha with tonos
        .replace(/[ΕΈ]/g, '\u0395') // Normalize to Epsilon
        .replace(/[Έ]/g, '\u0388')  // Epsilon with tonos
        .replace(/[ΗΉ]/g, '\u0397') // Normalize to Eta
        .replace(/[Ή]/g, '\u0389')  // Eta with tonos
        .replace(/[ΙΊΪΐ]/g, '\u0399') // Normalize to Iota
        .replace(/[Ί]/g, '\u038a')  // Iota with tonos
        .replace(/[Ϊ]/g, '\u03aa')  // Iota with dialytika
        .replace(/[ΐ]/g, '\u0390')  // Iota with dialytika and tonos
        .replace(/[ΟΌ]/g, '\u039f') // Normalize to Omicron
        .replace(/[Ό]/g, '\u038c')  // Omicron with tonos
        .replace(/[ΥΎΫΰ]/g, '\u03a5') // Normalize to Upsilon
        .replace(/[Ύ]/g, '\u038e')  // Upsilon with tonos
        .replace(/[Ϋ]/g, '\u03ab')  // Upsilon with dialytika
        .replace(/[ΰ]/g, '\u03b0')  // Upsilon with dialytika and tonos
        .replace(/[ΩΏ]/g, '\u03a9') // Normalize to Omega
        .replace(/[Ώ]/g, '\u038f'); // Omega with tonos
};

/**
 * Unicode normalization for YUNANCA text
 */
export const normalizeGreekText = (text: string): string => {
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
export const validateGreekText = (text: string): { isValid: boolean; issues: string[] } => {
    const issues: string[] = [];

    if (!text) {
        return { isValid: true, issues: [] };
    }

    // Check for common encoding issues
    const hasInvalidChars = /[^\x00-\x7F\u0370-\u03FF\u1F00-\u1FFF]/.test(text);
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
export const formatGreekDisplay = (text: string): string => {
    if (!text) return text;

    return normalizeGreekText(safeGreekText(text));
};

/**
 * Handle YUNANCA input from user with proper encoding
 */
export const handleGreekInput = (input: string): string => {
    if (!input) return input;

    // First safe process, then normalize
    return normalizeGreekText(safeGreekText(input.trim()));
};

/**
 * Convert YUNANCA text to safe URL format
 */
export const greekToUrlSafe = (text: string): string => {
    if (!text) return text;

    return normalizeGreekText(safeGreekText(text))
        .toLowerCase()
        .replace(/[^\u0370-\u03ff\u1f00-\u1fff0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

/**
 * Add proper HTML attributes for YUNANCA text
 */
export const getGreekHtmlAttributes = () => ({
    lang: 'el',
    dir: 'ltr',
    className: 'greek-text greek-ltr'
});

/**
 * YUNANCA character map for reference
 */
export const GREEK_CHARACTER_MAP = {
    // Lowercase vowels with diacritics
    'ά': '\u03ac', 'α': '\u03b1',
    'έ': '\u03ad', 'ε': '\u03b5',
    'ή': '\u03ae', 'η': '\u03b7',
    'ί': '\u03af', 'ι': '\u03b9',
    'ϊ': '\u03ca', 'ΐ': '\u0390',
    'ό': '\u03cc', 'ο': '\u03bf',
    'ύ': '\u03cd', 'υ': '\u03c5',
    'ϋ': '\u03cb', 'ΰ': '\u03b0',
    'ώ': '\u03ce', 'ω': '\u03c9',

    // Uppercase vowels with diacritics
    'Ά': '\u0386', 'Α': '\u0391',
    'Έ': '\u0388', 'Ε': '\u0395',
    'Ή': '\u0389', 'Η': '\u0397',
    'Ί': '\u038a', 'Ι': '\u0399',
    'Ϊ': '\u03aa',
    'Ό': '\u038c', 'Ο': '\u039f',
    'Ύ': '\u038e', 'Υ': '\u03a5',
    'Ϋ': '\u03ab',
    'Ώ': '\u038f', 'Ω': '\u03a9',

    // Consonants
    'β': '\u03b2', 'γ': '\u03b3', 'δ': '\u03b4', 'ζ': '\u03b6',
    'θ': '\u03b8', 'κ': '\u03ba', 'λ': '\u03bb', 'μ': '\u03bc',
    'ν': '\u03bd', 'ξ': '\u03be', 'π': '\u03c0', 'ρ': '\u03c1',
    'σ': '\u03c3', 'ς': '\u03c2', 'τ': '\u03c4', 'φ': '\u03c6',
    'χ': '\u03c7', 'ψ': '\u03c8',

    // Uppercase consonants
    'Β': '\u0392', 'Γ': '\u0393', 'Δ': '\u0394', 'Ζ': '\u0396',
    'Θ': '\u0398', 'Κ': '\u039a', 'Λ': '\u039b', 'Μ': '\u039c',
    'Ν': '\u039d', 'Ξ': '\u039e', 'Π': '\u03a0', 'Ρ': '\u03a1',
    'Σ': '\u03a3', 'Τ': '\u03a4', 'Φ': '\u03a6', 'Χ': '\u03a7',
    'Ψ': '\u03a8'
};

/**
 * Test function to verify YUNANCA character handling
 */
export const testGreekCharacterHandling = (): boolean => {
    const testTexts = [
        'Καλημέρα',
        'Πώς είστε;',
        'Αυτό είναι ένα τεστ',
        'Ελληνικά γράμματα: αβγδεζηθικλμνξοπρστυφχψω',
        'Διακριτικά: άέήίόύώ'
    ];

    let allPassed = true;

    testTexts.forEach((text, index) => {
        const processed = formatGreekDisplay(text);
        const validation = validateGreekText(processed);

        if (!validation.isValid) {
            console.warn(`YUNANCA test ${index + 1} failed:`, validation.issues);
            allPassed = false;
        }
    });

    return allPassed;
};