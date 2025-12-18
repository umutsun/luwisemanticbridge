// Semantic search result to prompt converter with context awareness
export interface SearchResult {
  id?: string;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  sourceTable: string;
  score: number;
  relevanceScore?: number;
  keywords?: string[];
  similarity_score?: number;
}

export interface SearchContext {
  query: string;
  results: SearchResult[];
  topScore: number;
  averageScore: number;
  theme: string;
  intent?: 'informational' | 'procedural' | 'analytical' | 'comparative';
}

// Analyze search results to understand context and intent
export const analyzeSearchContext = (query: string, results: SearchResult[]): SearchContext => {
  const scores = results.map(r => r.score || r.relevanceScore || 0);
  const topScore = Math.max(...scores);
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Extract common theme from results
  const themes = results.map(r => extractTheme(r));
  const themeFrequency: { [key: string]: number } = {};
  themes.forEach(t => {
    themeFrequency[t] = (themeFrequency[t] || 0) + 1;
  });
  const dominantTheme = Object.entries(themeFrequency)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'general';

  // Determine intent from query patterns
  const intentPatterns = {
    informational: ['nedir', 'ne demek', 'açıklama', 'bilgi', 'tanım'],
    procedural: ['nasıl', 'nasıl yapılır', 'adımlar', 'prosedür', 'başvuru'],
    analytical: ['analiz', 'karşılaştır', 'değerlendir', 'sonuç', 'etki'],
    comparative: ['farkı', 'karşılaştır', 'hangisi', 'en iyi']
  };

  let intent: SearchContext['intent'] = 'informational';
  const queryLower = query.toLowerCase();

  for (const [key, patterns] of Object.entries(intentPatterns)) {
    if (patterns.some(pattern => queryLower.includes(pattern))) {
      intent = key as SearchContext['intent'];
      break;
    }
  }

  return {
    query,
    results,
    topScore,
    averageScore,
    theme: dominantTheme,
    intent
  };
};


// Generate contextual question from search result
export const generateContextualQuestion = (result: SearchResult, context: SearchContext): string => {
  const { title, content } = result;

  // Clean content and extract key phrase
  const cleanContent = content.replace(/^Cevap:\s*/i, '').trim();
  const cleanTitle = title.replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '');

  // Get the first meaningful phrase from content
  const firstPhrase = extractFirstMeaningfulPhrase(cleanContent);

  // Extract key terms for context
  const keyTerms = extractKeyTermsForQuestion(cleanContent);

  // Build natural question
  let question = '';

  // If we have a good first phrase, use it as base
  if (firstPhrase && firstPhrase.length > 20) {
    question = `${firstPhrase} hakkında detaylı bilgi`;
  } else {
    // Use title as base
    question = `${cleanTitle} konusunda açıklama`;
  }

  // Add context from key terms
  if (keyTerms.length > 0) {
    const topTerms = keyTerms.slice(0, 2);
    question += ` (${topTerms.join(', ')})`;
  }

  // Make it a proper question (without "Merhaba")
  if (!question.endsWith('?')) {
    // Remove "Merhaba" if present
    question = question.replace(/^Merhaba,\s*/i, '');
    question += ' nedir?';
  }

  return question;
};

// Extract the first meaningful phrase from content
const extractFirstMeaningfulPhrase = (content: string): string => {
  // Remove date prefixes
  content = content.replace(/^\d{2}\.\d{2}\.\d{4}\s*/, '');

  // Split by common sentence endings
  const sentences = content.split(/[.!?]/);

  // Find the first substantial sentence
  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    // Skip if too short or doesn't contain meaningful content
    if (trimmed.length < 20) continue;

    // Skip if it's just a question
    if (trimmed.includes('?')) continue;

    // Clean up common prefixes
    const phrase = trimmed
      .replace(/^Soru:\s*/i, '')
      .replace(/^Cevap:\s*/i, '')
      .trim();

    if (phrase.length > 20) {
      return phrase;
    }
  }

  return '';
};

// Extract key terms specifically for question generation
const extractKeyTermsForQuestion = (content: string): string[] => {
  const terms: string[] = [];

  // Look for specific patterns
  const patterns = [
    /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+ Vergisi)/g,  // "Gelir Vergisi", "Kurumlar Vergisi"
    /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+ Kanunu)/g,   // "Vergi Usul Kanunu"
    /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+ Sözleşmesi)/g, // "İş Sözleşmesi"
    /(\d+%\s*oranında?)/g,                 // "15% oranında"
    /(\d+\s*(?:gün|ay|yıl))/g,            // "6 ay", "1 yıl"
    /(serbest bölge|stopaj|kdv|ötv)/gi     // Specific terms
  ];

  patterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      terms.push(...matches);
    }
  });

  return [...new Set(terms)];
};

// Extract entities (nouns, proper nouns, numbers)
const extractEntities = (text: string): string[] => {
  const entities: string[] = [];

  // Numbers and percentages
  const numbers = text.match(/\d+(?:\.\d+)?%?/g) || [];
  entities.push(...numbers);

  // Proper nouns (capitalized words)
  const capitalized = text.match(/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\b/g) || [];
  entities.push(...capitalized);

  // Legal terms
  const legalTerms = [
    'mükellef', 'vergi daire', 'sosyal güvenlik', 'iş mahkemesi',
    'danıştay', 'kanun', 'yönetmelik', 'tebliğ'
  ];

  legalTerms.forEach(term => {
    if (text.toLowerCase().includes(term)) {
      entities.push(term);
    }
  });

  return [...new Set(entities)].slice(0, 5);
};

// Extract procedures (action phrases)
const extractProcedures = (text: string): string[] => {
  const procedures: string[] = [];

  // Common procedure patterns
  const procedurePatterns = [
    /başvurulur|başvuru yapılır/i,
    /ödenir|ödeme yapılır/i,
    /dava açılır|dava edilir/i,
    /itiraz edilir|itiraz yapılır/i,
    /beyan edilir|beyanname verilir/i,
    /talep edilir|talep yapılır/i
  ];

  procedurePatterns.forEach(pattern => {
    const match = text.match(pattern);
    if (match) {
      procedures.push(match[0]);
    }
  });

  return procedures;
};

// Extract conditions
const extractConditions = (text: string): string[] => {
  const conditions: string[] = [];

  // Condition indicators
  const conditionPatterns = [
    /şartında|durumunda|halinde/gi,
    /zamanında|süresi içinde/gi,
    /eğer|şayet/gi,
    /dolayısıyla|bu nedenle/gi
  ];

  conditionPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      conditions.push(...matches);
    }
  });

  return [...new Set(conditions)];
};

// Generate refined prompt based on tags/keywords
export const generateRefinedPrompt = (basePrompt: string, tags: string[], context: SearchContext): string => {
  const refinements: string[] = [];

  // Add intent refinement
  if (context.intent === 'procedural') {
    refinements.push('adımlarıyla açıkla');
  } else if (context.intent === 'analytical') {
    refinements.push('analiz yap');
  }

  // Add tag refinements
  tagRefinements: {
    if (tags.includes('Örnek')) {
      refinements.push('örneklerle göster');
    }
    if (tags.includes('İstisna')) {
      refinements.push('istisnaları belirt');
    }
    if (tags.includes('Şart')) {
      refinements.push('şartları açıkla');
    }
    if (tags.some(t => t.includes('%') || t.includes('TL'))) {
      refinements.push('miktar ve oranları belirt');
    }
  }

  // Build refined prompt
  let refinedPrompt = basePrompt;

  if (refinements.length > 0) {
    refinedPrompt += ' (' + refinements.join(', ') + ')';
  }

  // Add context theme
  if (context.theme !== 'general') {
    refinedPrompt += ` [${context.theme}]`;
  }

  return refinedPrompt;
};

// Convert search results to comprehensive prompt
export const searchResultsToPrompt = (context: SearchContext): string => {
  const { query, results, intent, theme } = context;

  // Start with the original query
  let prompt = query;

  // Add intent modifier
  const intentModifiers = {
    informational: 'detaylı bilgi',
    procedural: 'adım adım prosedür',
    analytical: 'detaylı analiz',
    comparative: 'karşılaştırmalı analiz'
  };

  prompt += ` (${intentModifiers[intent]})`;

  // Add high-confidence results context
  const highConfidenceResults = results.filter(r => (r.score || r.relevanceScore || 0) > 70);
  if (highConfidenceResults.length > 0) {
    const topTopics = highConfidenceResults.slice(0, 3).map(r => {
      const title = r.title.replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '');
      return title;
    });
    prompt += ` [Özel ilgi alanları: ${topTopics.join(', ')}]`;
  }

  // Add theme context
  if (theme !== 'general') {
    prompt += ` [Ana tema: ${theme}]`;
  }

  return prompt;
};

// Generate question from excerpt
export const generateQuestionFromExcerpt = (result: SearchResult): string => {
  const { excerpt, title } = result;

  // Use excerpt as the primary source for question generation
  const cleanExcerpt = excerpt.replace(/^Cevap:\s*/i, '').trim();
  const cleanTitle = title.replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '');

  // Extract the core concept from excerpt
  const firstSentence = cleanExcerpt.split(/[.!?]/)[0].trim();

  // If excerpt is meaningful, use it directly
  if (firstSentence.length > 20) {
    // Create a question based on the excerpt content
    return `${firstSentence} hakkında detaylı bilgi verir misiniz?`;
  }

  // Fallback to title-based question
  return `${cleanTitle} nedir?`;
};

// Generate multiple question options based on search result
// Export extractTheme function for use in other components
export const extractTheme = (result: SearchResult): string => {
  const { title, content, category } = result;
  const text = (title + ' ' + content).toLowerCase();

  // Common themes in legal/tax documents
  const themeKeywords = {
    'vergi': ['vergi', 'stopaj', 'kdv', 'ötv', 'gv', 'kurumlar', 'beyan'],
    'iş hukuku': ['işçi', 'işveren', 'kıdem', 'ihbar', 'iş sözleşmesi', 'iş akdi'],
    'tazminat': ['tazminat', 'tazmin', 'madde', 'hak', 'alacak'],
    'sözleşme': ['sözleşme', 'akdi', 'anlaşma', 'taahhüt'],
    'prosedür': ['başvuru', 'dava', 'itiraz', 'şikayet', 'uzlaşma'],
    'ceza': ['ceza', 'idari', 'yaptırım', 'hapis', 'para']
  };

  let maxMatches = 0;
  let detectedTheme = 'general';

  Object.entries(themeKeywords).forEach(([theme, keywords]) => {
    const matches = keywords.filter(keyword => text.includes(keyword)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedTheme = theme;
    }
  });

  // More specific theme detection
  if (title.includes('kdv') || content.includes('kdv')) return 'KDV';
  if (title.includes('gelir') || content.includes('gelir vergisi')) return 'Gelir Vergisi';
  if (title.includes('kurumlar') || content.includes('kurumlar vergisi')) return 'Kurumlar Vergisi';
  if (title.includes('stopaj') || content.includes('tevkifat')) return 'Stopaj';
  if (title.includes('damga') || content.includes('damga vergisi')) return 'Damga Vergisi';
  if (title.includes('ötv') || content.includes('özel tüketim')) return 'ÖTV';
  if (title.includes('danıştay') || content.includes('karar')) return 'Danıştay Kararı';
  if (title.includes('soru') || content.includes('cevap')) return 'Soru-Cevap';
  if (title.includes('özelge') || content.includes('özelge')) return 'Özelge';

  return detectedTheme.charAt(0).toUpperCase() + detectedTheme.slice(1);
};

export const generateQuestionOptionsForResult = (result: SearchResult, context: SearchContext, count: number = 3): string[] => {
  const questions: string[] = [];

  // Primary question from excerpt (more focused)
  questions.push(generateQuestionFromExcerpt(result));

  // Extract key terms for variations
  const cleanContent = result.content.replace(/^Cevap:\s*/i, '').trim();
  const cleanTitle = result.title.replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '');
  const keyTerms = extractKeyTermsForQuestion(cleanContent);

  // Generate variations based on excerpt content
  const excerptQuestion = generateQuestionFromExcerpt(result);

  // More specific variations
  const variations = [
    excerptQuestion, // Already added as primary
    keyTerms.length > 0 ? `${keyTerms[0]} ile ilgili açıklama yapar mısınız?` : `${cleanTitle} hakkında bilgi verir misiniz?`,
    `${cleanTitle} uygulamasında dikkat edilmesi gerekenler nelerdir?`
  ];

  // Add variations (skip first one since it's already added)
  questions.push(...variations.slice(1, 3));

  return questions.slice(0, count);
};