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

// Extract theme from a search result
const extractTheme = (result: SearchResult): string => {
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

  return detectedTheme;
};

// Generate contextual question from search result
export const generateContextualQuestion = (result: SearchResult, context: SearchContext): string => {
  const { intent, theme } = context;
  const { title, content, category } = result;

  // Clean content
  const cleanContent = content.replace(/^Cevap:\s*/i, '').trim();
  const cleanTitle = title.replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '');

  // Extract key entities
  const entities = extractEntities(cleanContent);
  const procedures = extractProcedures(cleanContent);
  const conditions = extractConditions(cleanContent);

  // Intent-specific question templates
  const templates = {
    informational: [
      `${cleanTitle} hakkında detaylı bilgi verebilir misiniz?`,
      `${cleanTitle} konusunu açıklar mısınız?`,
      `${cleanTitle} nedir ve nasıl uygulanır?`
    ],
    procedural: [
      `${cleanTitle} için gerekli adımlar nelerdir?`,
      `${cleanTitle} nasıl yapılır?`,
      `${cleanTitle} süreci nasıl işler?`
    ],
    analytical: [
      `${cleanTitle} etkileri nelerdir?`,
      `${cleanTitle} analizi nasıl yapılır?`,
      `${cleanTitle} sonuçları değerlendirildiğinde ne çıkar?`
    ],
    comparative: [
      `${cleanTitle} ile benzer konular arasındaki farklar nelerdir?`,
      `${cleanTitle} alternatifleri nelerdir?`,
      `${cleanTitle} en iyi uygulama yöntemi nedir?`
    ]
  };

  // Select base template
  const baseTemplates = templates[intent] || templates.informational;
  let question = baseTemplates[0];

  // Enhance with context based on entities and procedures
  if (entities.length > 0) {
    question += ` (${entities[0]} özelinde)`;
  }
  if (procedures.length > 0) {
    question = `${procedures[0]} konusunda detaylı açıklama yapar mısınız?`;
  }

  // Add category context if meaningful
  if (category && category !== 'Genel' && category !== 'Kaynak') {
    question += ` [${category}]`;
  }

  return question;
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

// Generate multiple question options based on search result
export const generateQuestionOptionsForResult = (result: SearchResult, context: SearchContext, count: number = 3): string[] => {
  const questions: string[] = [];

  // Primary contextual question
  questions.push(generateContextualQuestion(result, context));

  // Variations based on content analysis
  const { content, category } = result;
  const cleanTitle = result.title.replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '');

  // Generate variations based on intent and content
  const variations = [
    `${cleanTitle} ile ilgili uygulama örnekleri gösterir misiniz?`,
    `${cleanTitle} konusunda dikkat edilmesi gereken hususlar nelerdir?`,
    `${cleanTitle} konusuyla ilgili genel bilgi verir misiniz?`,
    `${cleanTitle} benzeri durumlarda ne yapılır?`
  ];

  // Add variations
  questions.push(...variations.slice(0, 2));

  // Category-specific variation
  if (category === 'Mevzuat') {
    questions.push(`${cleanTitle} hükmünün güncel yorumları nelerdir?`);
  }

  return questions.slice(0, count);
};