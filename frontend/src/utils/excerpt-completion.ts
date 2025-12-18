// Intelligent excerpt completion for natural language summaries
export interface ExcerptOptions {
  maxLength?: number;
  preserveSentences?: boolean;
  addEllipsis?: boolean;
  preserveKeywords?: boolean;
  highlightKeyTerms?: boolean;
}

// Complete partial excerpts into natural language sentences
export const completeExcerpt = (content: string, options: ExcerptOptions = {}): string => {
  const {
    maxLength = 600,
    preserveSentences = true,
    addEllipsis = true,
    preserveKeywords = true,
    highlightKeyTerms = false
  } = options;

  // Clean up content
  const cleanContent = content
    .replace(/^Cevap:\s*/i, '') // Remove "Cevap:" prefix
    .replace(/^Açıklama:\s*/i, '') // Remove "Açıklama:" prefix
    .replace(/^\d{2}\.\d{2}\.\d{4}\s*/i, '') // Remove date prefixes
    .trim();

  // If content is already short and complete, return as is
  if (cleanContent.length <= maxLength && isCompleteSentence(cleanContent)) {
    return cleanContent;
  }

  // Extract key information before truncation
  const keyInfo = extractKeyInformation(cleanContent);
  const importantTerms = preserveKeywords ? extractImportantTerms(cleanContent) : [];

  // Truncate intelligently
  let excerpt = cleanContent;

  if (excerpt.length > maxLength) {
    if (preserveSentences) {
      excerpt = truncateAtSentenceBoundary(excerpt, maxLength);
    } else {
      excerpt = truncateAtWordBoundary(excerpt, maxLength);
    }
  }

  // Complete partial sentences
  excerpt = completePartialSentence(excerpt, keyInfo);

  // Add context from important terms if space allows
  if (importantTerms.length > 0 && excerpt.length < maxLength * 0.8) {
    const context = addContextFromTerms(excerpt, importantTerms, maxLength);
    if (context) {
      excerpt = context;
    }
  }

  // Add ellipsis if truncated
  if (addEllipsis && excerpt.length < cleanContent.length) {
    excerpt += '...';
  }

  // Highlight key terms if requested
  if (highlightKeyTerms) {
    excerpt = highlightTerms(excerpt, importantTerms.slice(0, 3));
  }

  return excerpt;
};

// Check if text is a complete sentence
const isCompleteSentence = (text: string): boolean => {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) &&
         !/(?:gibi|için|üzerine|kadar|sonra|önce|daha)$/.test(trimmed);
};

// Extract key information from content
const extractKeyInformation = (content: string): {
  mainSubject?: string;
  action?: string;
  condition?: string;
  result?: string;
} => {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim());
  const firstSentence = sentences[0] || '';

  // Common patterns in legal/tax content
  const patterns = {
    subject: /([^.]*?(?:vergi|tazminat|sözleşme|kanun|mükellef|işçi|işveren))[^.]*/i,
    action: /([^.]*?(?:ödenir|alınır|hak kazanılır|uygulanır|tarif edilir))[^.]*/i,
    condition: /([^.]*?(?:şartında|durumunda|halinde|zamanında))[^.]*/i,
    result: /([^.]*?(?:sonuç olarak|bu nedenle|dolayısıyla))[^.]*/i
  };

  const info: any = {};

  Object.entries(patterns).forEach(([key, pattern]) => {
    const match = firstSentence.match(pattern);
    if (match) {
      info[key] = match[1].trim();
    }
  });

  return info;
};

// Extract important terms
const extractImportantTerms = (content: string): string[] => {
  const terms: string[] = [];

  // Legal/tax specific terms
  const legalTerms = [
    'KDV', 'ÖTV', 'GV', 'KV', 'stopaj', 'tevfikat', 'beyan',
    'tazminat', 'kıdem', 'ihbar', 'sosyal güvenlik',
    'iş sözleşmesi', 'iş akdi', 'feshetme', 'işe iade'
  ];

  // Numbers and percentages
  const numbers = content.match(/\d+(?:\.\d+)?%?/g) || [];
  terms.push(...numbers);

  // Legal terms
  legalTerms.forEach(term => {
    if (content.toLowerCase().includes(term.toLowerCase())) {
      terms.push(term);
    }
  });

  // Important nouns (heuristic)
  const words = content.match(/\b[a-zA-ZçğıöşüÇĞİÖŞÜ]{4,}\b/g) || [];
  const capitalized = words.filter(word =>
    word[0] === word[0].toUpperCase() &&
    !/^(?:ve|veya|ile|için|üzerine|gibi|kadar|sonra|önce)$/i.test(word)
  );

  terms.push(...capitalized.slice(0, 3));

  return [...new Set(terms)].slice(0, 6);
};

// Truncate at sentence boundary
const truncateAtSentenceBoundary = (text: string, maxLength: number): string => {
  const truncated = text.substring(0, maxLength);

  // Find the last complete sentence
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );

  if (lastSentenceEnd > maxLength * 0.7) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }

  // Fallback to word boundary
  return truncateAtWordBoundary(truncated, maxLength);
};

// Truncate at word boundary
const truncateAtWordBoundary = (text: string, maxLength: number): string => {
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace);
  }

  return truncated;
};

// Complete partial sentences naturally
const completePartialSentence = (text: string, keyInfo: any): string => {
  if (/[.!?]$/.test(text)) {
    return text; // Already complete
  }

  const trimmed = text.trim();
  const lastWord = trimmed.split(' ').pop() || '';

  // Natural completion patterns based on last word
  const completions: { [key: string]: string[] } = {
    'için': ['gereklidir', 'uygulanır', 'hüküm söyler'],
    'kadar': ['sürebilir', 'geçerlidir', 'beklenir'],
    'üzerine': ['karar verilir', 'işlem yapılır'],
    'sonra': ['hak doğar', 'işlem başlar'],
    'önce': ['başvurulmalıdır', 'tamamlanmalıdır'],
    'gibi': ['durumlarda', 'hallerde'],
    'olarak': ['belirlenir', 'kabul edilir'],
    'ile': ['ilgili olarak', 'birlikte'],
    'değil': ['kabul edilmez', 'geçerli değildir'],
    'edilir': ['ve sonuçlanır'],
    'alınır': ['ve kaydedilir'],
    'verilir': ['ve tebliğ edilir']
  };

  // Check if we need to complete
  const lowerLastWord = lastWord.toLowerCase();
  for (const [pattern, options] of Object.entries(completions)) {
    if (lowerLastWord.includes(pattern)) {
      const completion = options[0];
      return trimmed + ' ' + completion;
    }
  }

  // Default completions based on context
  if (keyInfo.action) {
    return trimmed + ' ve bu işlem tamamlanır.';
  }

  if (keyInfo.condition) {
    return trimmed + ' bu durumda geçerli olur.';
  }

  // Generic completion
  return trimmed + ' ve bu konuda düzenleme bulunmaktadır.';
};

// Add context from important terms
const addContextFromTerms = (excerpt: string, terms: string[], maxLength: number): string | null => {
  if (excerpt.length >= maxLength * 0.9) return null;

  const missingTerms = terms.filter(term =>
    !excerpt.toLowerCase().includes(term.toLowerCase())
  );

  if (missingTerms.length === 0) return null;

  const availableSpace = maxLength - excerpt.length - 10; // 10 for punctuation and spaces

  if (availableSpace < 20) return null;

  let context = '';
  const term = missingTerms[0];

  // Create contextual addition
  if (/[.!?]$/.test(excerpt)) {
    context = ` Bu özellikle ${term} için önemlidir.`;
  } else {
    context = `, özellikle ${term} konusunda`;
  }

  if (context.length <= availableSpace) {
    return excerpt + context;
  }

  return null;
};

// Highlight terms in text
const highlightTerms = (text: string, terms: string[]): string => {
  let highlighted = text;

  terms.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    highlighted = highlighted.replace(regex, `**${term}**`);
  });

  return highlighted;
};

// Generate multiple excerpt variants
export const generateExcerptVariants = (content: string, count: number = 3): string[] => {
  const variants: string[] = [];

  // Standard excerpt
  variants.push(completeExcerpt(content, {
    maxLength: 300,
    preserveSentences: true
  }));

  // Short, keyword-focused excerpt
  variants.push(completeExcerpt(content, {
    maxLength: 200,
    preserveSentences: false,
    preserveKeywords: true
  }));

  // Question-oriented excerpt
  const questionVariant = completeExcerpt(content, {
    maxLength: 250,
    preserveSentences: false
  });

  if (questionVariant !== variants[0]) {
    variants.push(questionVariant);
  }

  return variants.slice(0, count);
};

// Format excerpt with natural language improvements
export const formatExcerptWithCompletion = (content: string, options?: ExcerptOptions): string => {
  // First, complete the excerpt
  const completed = completeExcerpt(content, options);

  // Additional formatting
  return completed
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/\s+([.!?])/g, '$1') // Space before punctuation
    .trim();
};