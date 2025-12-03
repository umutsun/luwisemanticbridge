/**
 * Text Utilities
 * Common text manipulation functions for the application
 */

/**
 * Turkish character to ASCII mapping
 */
const TURKISH_CHAR_MAP: Record<string, string> = {
  'ş': 's', 'Ş': 'S',
  'ğ': 'g', 'Ğ': 'G',
  'ı': 'i', 'İ': 'I',
  'ö': 'o', 'Ö': 'O',
  'ü': 'u', 'Ü': 'U',
  'ç': 'c', 'Ç': 'C',
  // Extended Turkish/common diacritics
  'â': 'a', 'Â': 'A',
  'î': 'i', 'Î': 'I',
  'û': 'u', 'Û': 'U',
};

/**
 * Normalize Turkish characters to ASCII equivalents
 * ş → s, ğ → g, ı → i, ö → o, ü → u, ç → c
 */
export function normalizeTurkishChars(text: string): string {
  return text.replace(/[şŞğĞıİöÖüÜçÇâÂîÎûÛ]/g, (char) => TURKISH_CHAR_MAP[char] || char);
}

/**
 * Generate a valid PostgreSQL table name from any string
 * - Normalizes Turkish characters to ASCII
 * - Converts to lowercase
 * - Replaces spaces and special characters with underscores
 * - Removes consecutive underscores
 * - Limits to 63 characters (PostgreSQL limit)
 */
export function generateTableName(input: string): string {
  return input
    .replace(/\.[^/.]+$/, '')           // Remove file extension
    .split('')
    .map(char => TURKISH_CHAR_MAP[char] || char)  // Normalize Turkish chars
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')        // Replace non-alphanumeric with underscore
    .replace(/_+/g, '_')                 // Remove consecutive underscores
    .replace(/^_|_$/g, '')               // Remove leading/trailing underscores
    .substring(0, 63);                   // PostgreSQL table name limit
}

/**
 * Generate a valid PostgreSQL column name from any string
 * Similar to generateTableName but with additional handling for common patterns
 */
export function generateColumnName(input: string): string {
  return input
    .split('')
    .map(char => TURKISH_CHAR_MAP[char] || char)  // Normalize Turkish chars
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')        // Replace non-alphanumeric with underscore
    .replace(/_+/g, '_')                 // Remove consecutive underscores
    .replace(/^_|_$/g, '')               // Remove leading/trailing underscores
    .replace(/^[0-9]/, '_$&')            // Prefix numbers with underscore
    .substring(0, 63);                   // PostgreSQL column name limit
}

/**
 * Slugify text for URL-safe strings
 * Converts "İstanbul Konut Fiyatları" → "istanbul-konut-fiyatlari"
 */
export function slugify(text: string): string {
  return text
    .split('')
    .map(char => TURKISH_CHAR_MAP[char] || char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
