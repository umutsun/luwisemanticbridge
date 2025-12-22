/**
 * HTML Utility Functions
 * Used to sanitize and clean HTML content from embedded data
 */

/**
 * Strip HTML tags and decode HTML entities from text
 * Used to clean embedded content that may contain raw HTML
 *
 * @param text - The text that may contain HTML tags
 * @returns Clean text without HTML tags
 *
 * @example
 * stripHtml('<p><strong>Hello</strong></p>') // 'Hello'
 * stripHtml('Price: &amp;nbsp;100 TL') // 'Price: 100 TL'
 */
export function stripHtml(text: string | undefined | null): string {
  if (!text) return '';

  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '...')
    .replace(/&copy;/gi, '©')
    .replace(/&reg;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/&euro;/gi, '€')
    .replace(/&pound;/gi, '£')
    .replace(/&yen;/gi, '¥')
    // Turkish specific entities
    .replace(/&#305;/gi, 'ı')
    .replace(/&#350;/gi, 'Ş')
    .replace(/&#351;/gi, 'ş')
    .replace(/&#286;/gi, 'Ğ')
    .replace(/&#287;/gi, 'ğ')
    .replace(/&#304;/gi, 'İ')
    .replace(/&#220;/gi, 'Ü')
    .replace(/&#252;/gi, 'ü')
    .replace(/&#214;/gi, 'Ö')
    .replace(/&#246;/gi, 'ö')
    .replace(/&#199;/gi, 'Ç')
    .replace(/&#231;/gi, 'ç')
    // Clean up multiple spaces and newlines
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length of the output
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string | undefined | null, maxLength: number = 100): string {
  if (!text) return '';
  const clean = stripHtml(text);
  if (clean.length <= maxLength) return clean;
  return clean.substring(0, maxLength - 3) + '...';
}

/**
 * Clean and format source title for display
 * Removes common prefixes and cleans HTML
 *
 * @param title - The raw title from source
 * @returns Clean formatted title
 */
export function cleanSourceTitle(title: string | undefined | null): string {
  if (!title) return '';

  return stripHtml(title)
    .replace(/ - ID: \d+/g, '')
    .replace(/^sorucevap -\s*/i, '')
    .replace(/^ozelgeler -\s*/i, '')
    .replace(/^danıştay kararları -\s*/i, '')
    .replace(/^makaleler -\s*/i, '')
    .replace(/\s*\([^)]*\)$/, '')
    .trim();
}
