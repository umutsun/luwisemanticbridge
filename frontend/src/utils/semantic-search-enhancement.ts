/**
 * Semantic Search Enhancement Utilities
 * Provides intelligent query generation and semantic context for enhanced search capabilities
 */

import { getTableDisplayName as getDynamicTableDisplayName, getDynamicTables } from './table-names';

export interface SemanticContext {
  category?: string;
  sourceType: string;
  topic: string;
  excerpt?: string;
  relevanceScore?: number;
  hasLegalTerms?: boolean;
  hasTaxTerms?: boolean;
  isAboutProcedure?: boolean;
  isAboutDefinition?: boolean;
  isAboutPenalty?: boolean;
  isAboutException?: boolean;
  isAboutDeadline?: boolean;
  hasQuestionWords?: boolean;
}

export interface EnhancedQueryOptions {
  includeCrossSourceContext?: boolean;
  includeRelevanceContext?: boolean;
  maxSemanticTerms?: number;
  queryStyle?: 'formal' | 'conversational' | 'detailed' | 'concise';
  enableQuestionGeneration?: boolean; // Toggle question generation on source click
}

/**
 * Generates semantic search terms based on context analysis
 */
export function generateSemanticTerms(context: SemanticContext): string[] {
  const terms: string[] = [];

  // Add category-specific terms
  if (context.category === 'Mevzuat') {
    terms.push('yasal düzenleme', 'hukuki çerçeve', 'mevzuat');
  }
  if (context.sourceType === 'Danıştay') {
    terms.push('içtihat', 'emsal karar', 'yargı kararı');
  }
  if (context.sourceType === 'Soru-Cevap') {
    terms.push('uygulama', 'pratik bilgi', 'örnek olay');
  }

  // Add topic-specific terms based on keywords
  if (context.topic.includes('KDV')) {
    terms.push('katma değer vergisi', 'vergi iadesi', 'teslim', 'hizmet', 'mal');
  }
  if (context.topic.includes('gelir')) {
    terms.push('vergi matrahı', 'gelir unsurları', 'beyan', 'gelir vergisi');
  }
  if (context.topic.includes('kurumlar')) {
    terms.push('tüzel kişi', 'kurum kazancı', 'kurumlar vergisi', 'kurumlar vergisi beyannamesi');
  }
  if (context.topic.includes('stopaj')) {
    terms.push('tevkifat', 'kaynakta kesinti', 'muafiyet', 'stopaj oranı');
  }
  if (context.topic.includes('damga')) {
    terms.push('damga vergisi', 'damga resmi', 'kağıt', 'sözleşme');
  }
  if (context.topic.includes('ötv')) {
    terms.push('özel tüketim vergisi', 'luxury tax', 'tüketim', 'mal');
  }

  // Add context-specific terms
  if (context.isAboutProcedure) {
    terms.push('prosedür', 'süreç', 'uygulama', 'adım', ' aşama');
  }
  if (context.isAboutDefinition) {
    terms.push('tanım', 'kapsam', 'unsurlar', 'özellikler', 'nitelik');
  }
  if (context.isAboutPenalty) {
    terms.push('ceza', 'yaptırım', 'idari', 'hukuki', 'müeyyide');
  }
  if (context.isAboutException) {
    terms.push('istisna', 'muafiyet', 'hariç', 'dışlama', 'istisna kapsamı');
  }
  if (context.isAboutDeadline) {
    terms.push('süre', 'son tarih', 'zamanlama', 'teslim süresi', 'başvuru süresi');
  }

  return [...new Set(terms)]; // Remove duplicates
}

/**
 * Cleans and normalizes source titles
 */
export function cleanSourceTitle(title: string): string {
  return title
    .replace(/ - ID: \d+/g, '')
    .replace(/ \(Part \d+\/\d+\)/g, '')
    .replace(/^sorucevap -\s*/, '')
    .replace(/^ozelgeler -\s*/, '')
    .replace(/\s*\([^)]*\)$/, '') // Remove category suffixes
    .trim();
}

/**
 * Analyzes content to determine semantic context
 */
export function analyzeSemanticContext(title: string, excerpt: string, category: string, sourceType: string): SemanticContext {
  const cleanTitle = cleanSourceTitle(title);

  return {
    category,
    sourceType,
    topic: cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle,
    excerpt,
    hasLegalTerms: /(?:tevkiğ|kararı|kanunu|tüzüğü|yönetmeliği|tebliği|genelge|sirküler)/i.test(cleanTitle),
    hasTaxTerms: /(?:vergi|stopaj|kdv|ötv|gv|kv|kurumlar|damga|harç|beyanname)/i.test(cleanTitle),
    isAboutProcedure: /(?:prosedür|süreç|uygulama|başvuru|talep|bildirim)/i.test(cleanTitle),
    isAboutDefinition: /(?:tanımı|kapsamı|unsurları|özellikleri|şartları)/i.test(cleanTitle),
    isAboutPenalty: /(?:ceza|yaptırım|idari|hukuki)/i.test(cleanTitle),
    isAboutException: /(?:istisna|muafiyet|hariç)/i.test(cleanTitle),
    isAboutDeadline: /(?:süre|son|tarih|zamanlama)/i.test(cleanTitle),
    hasQuestionWords: /(?:nedir|nasıl|neden|hangi|kim|ne zaman|kaç|nerede|ne|mi|mu|mü|mı)/i.test(excerpt),
  };
}

/**
 * Generates enhanced search queries with semantic context and relevance-based confidence
 */
export function generateEnhancedQuery(context: SemanticContext, options: EnhancedQueryOptions = {}): string {
  const {
    includeCrossSourceContext = true,
    includeRelevanceContext = true,
    maxSemanticTerms = 3,
    queryStyle = 'detailed'
  } = options;

  const semanticTerms = generateSemanticTerms(context);
  const relevantTerms = semanticTerms.slice(0, maxSemanticTerms);
  const relevanceScore = context.relevanceScore || 0;

  // Determine confidence level based on relevance score
  const getConfidenceLevel = (score: number): 'high' | 'medium' | 'low' => {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  };

  const confidenceLevel = getConfidenceLevel(relevanceScore);

  // Enhanced natural query patterns that avoid robotic templates
  const queryPatterns = {
    formal: {
      generic: `${context.topic} konusunda bilgilendirme yapabilir misiniz? Özellikle ${relevantTerms.join(', ')} konularına değinirseniz sevinirim.`,
      procedural: `${context.topic} sürecini nasıl yönetmeliyim? ${relevantTerms.join(' ve ')} açısından yol gösterir misiniz?`,
      definitional: `${context.topic} kavramını tam olarak anlamak istiyorum. ${relevantTerms.join(', ')} ile ilgili detayları açıklar mısınız?`
    },
    conversational: {
      generic: `${context.topic} hakkında biraz konuşabilir miyiz? ${relevantTerms.slice(0, 2).join(' ve ')} konusunda bilgi verir misin?`,
      procedural: `${context.topic} için ne yapmam gerekiyor? Adımları ${relevantTerms.join(' ve ')} ile birlikte anlatır mısın?`,
      definitional: `${context.topic} nedir? ${relevantTerms.slice(0, 2).join(' ve ')} kapsamını merak ediyorum.`
    },
    detailed: {
      generic: `${context.topic} konusunda derinlemesine bilgi almak istiyorum. ${relevantTerms.join(', ')} bağlamında yasal çerçeveyi ve pratik uygulamaları açıklar mısınız?`,
      procedural: `${context.topic} sürecinin tüm detaylarını öğrenmek istiyorum. ${relevantTerms.join(' ve ')} hususlarında karşılaşabileceğim zorluklar ve çözümleri de anlatır mısınız?`,
      definitional: `${context.topic} kavramını kapsamlı bir şekilde ele alabilir miyiz? ${relevantTerms.join(', ')} ve uygulamadaki yansımaları hakkında bilgi verir misiniz?`
    },
    concise: {
      generic: `${context.topic} ve ${relevantTerms.slice(0, 2).join(', ')}`,
      procedural: `${context.topic} süreci: ${relevantTerms.slice(0, 2).join(' ve ')}`,
      definitional: `${context.topic} tanımı - ${relevantTerms.slice(0, 2).join(', ')}`
    }
  };

  let query = '';

  // Enhanced context-specific query generation with natural language patterns
  if (context.sourceType === 'Soru-Cevap' && (context.excerpt?.includes('Cevap:') || context.excerpt?.includes('Yanıt:'))) {
    query = generateConfidenceBasedQuery(
      `${context.topic} konusunda bana yardımcı olabilir misin? Bu konuda sıkça sorulan soruları ve ${relevantTerms.slice(0, 2).join(' ve ')} ile ilgili pratik bilgileri öğrenmek istiyorum.`,
      confidenceLevel,
      relevanceScore
    );
  } else if (context.category === 'Mevzuat' && context.hasLegalTerms) {
    query = generateConfidenceBasedQuery(
      `${context.topic} ile ilgili yasal düzenlemeleri anlamaya çalışıyorum. ${relevantTerms.join(' ve ')} konularında ${context.sourceType === 'Danıştay' ? 'içtihatlarda' : 'uygulamada'} nasıl bir yol izlenmiş?`,
      confidenceLevel,
      relevanceScore
    );
  } else if (context.category === 'Mevzuat' && context.hasTaxTerms) {
    query = generateConfidenceBasedQuery(
      `${context.topic} konusunda vergisel düzenlemeleri merak ediyorum. Oranlar, istisnalar ve ${relevantTerms.join(', ')} hakkında bilgi alabilir miyim?`,
      confidenceLevel,
      relevanceScore
    );
  } else if (context.sourceType === 'Danıştay' || context.category === 'İçtihat') {
    query = generateConfidenceBasedQuery(
      `${context.topic} kararını nasıl yorumlamalıyız? Bu kararın ${relevantTerms.slice(0, 2).join(' ve ')} üzerindeki etkileri ve emsal değeri nedir?`,
      confidenceLevel,
      relevanceScore
    );
  } else if (context.isAboutProcedure) {
    query = generateConfidenceBasedQuery(queryPatterns[queryStyle].procedural, confidenceLevel, relevanceScore);
  } else if (context.isAboutDefinition) {
    query = generateConfidenceBasedQuery(queryPatterns[queryStyle].definitional, confidenceLevel, relevanceScore);
  } else if (context.isAboutException) {
    query = generateConfidenceBasedQuery(
      `${context.topic} için bir istisna olabilir mi? Hangi durumlarda bu istisnadan faydalanabilirim? ${relevantTerms.join(' ve ')} konularında nelere dikkat etmeliyim?`,
      confidenceLevel,
      relevanceScore
    );
  } else if (context.isAboutPenalty) {
    query = generateConfidenceBasedQuery(
      `${context.topic} konusunda dikkat etmezsem ne olur? ${relevantTerms.slice(0, 2).join(' ve ')} bağlamında karşılaşabileceğim sonuçlar nelerdir?`,
      confidenceLevel,
      relevanceScore
    );
  } else if (context.isAboutDeadline) {
    query = generateConfidenceBasedQuery(
      `${context.topic} için zaman sınırlamaları var mı? ${relevantTerms.join(' ve ')} hususunda süre hesaplamasında nelere dikkat etmeliyim?`,
      confidenceLevel,
      relevanceScore
    );
  } else if (context.hasQuestionWords) {
    query = generateConfidenceBasedQuery(
      `${context.topic} konusundaki sorulara cevap arıyorum. ${relevantTerms.slice(0, 2).join(' ve ')} ile ilgili detaylı bilgi alabilir miyim?`,
      confidenceLevel,
      relevanceScore
    );
  } else {
    query = generateConfidenceBasedQuery(queryPatterns[queryStyle].generic, confidenceLevel, relevanceScore);
  }

  // Add natural cross-source navigation context
  if (includeCrossSourceContext && relevantTerms.length > 0) {
    if (context.sourceType === 'Danıştay' || context.category === 'İçtihat') {
      query += ' Bu karar emsal teşkil ediyor mu?';
    } else if (context.sourceType === 'Soru-Cevap') {
      query += ' Buna benzer durumlar için başka örnekler var mı?';
    }
  }

  // Add natural relevance context if score is available
  if (includeRelevanceContext && relevanceScore > 0) {
    // Already handled in confidence-based query generation
  }

  return query;
}

/**
 * Generates confidence-based queries with natural language context
 */
function generateConfidenceBasedQuery(baseQuery: string, confidenceLevel: 'high' | 'medium' | 'low', relevanceScore: number): string {
  // Natural confidence prefixes that sound more conversational
  const confidencePrefixes = {
    high: '',
    medium: '',
    low: ''
  };

  // Natural confidence suffixes that provide helpful context
  const confidenceSuffixes = {
    high: ' (Bu konuda yüksek benzerlik bulundu)',
    medium: ' (Orta düzeyde benzerlik mevcut)',
    low: ' (Temel düzeyde bilgiler)'
  };

  // The relevanceScore parameter is included for potential future use
  // For high confidence, we don't add prefixes to keep it natural
  if (confidenceLevel === 'high') {
    return baseQuery + confidenceSuffixes[confidenceLevel];
  } else {
    return `${confidencePrefixes[confidenceLevel]}${baseQuery}${confidenceSuffixes[confidenceLevel]}`;
  }
}

/**
 * Enhanced source click handler for React components
 */
export function createEnhancedSourceClickHandler(
  getInputText: () => string,
  setInputText: (text: string) => void,
  focusInput: () => void,
  options: EnhancedQueryOptions = {}
) {
  return async (source: Record<string, unknown>) => {
    // Check if question generation is disabled
    // Default to true for backward compatibility
    const enableQuestionGeneration = options.enableQuestionGeneration !== false;

    if (!enableQuestionGeneration) {
      console.log('[SourceClick] Question generation disabled - skipping');
      return;
    }

    // Check if user is currently editing a question
    const currentText = getInputText();

    // Allow changing question even if input is not empty
    // This lets users click different sources to see different questions

    // Prioritize LLM-generated question if available
    let question = '';

    // Debug: Log source object structure
    console.log('Source click handler received:', {
      hasQuestion: !!(source.question && typeof source.question === 'string' && source.question.trim().length > 0),
      question: source.question,
      title: source.title,
      content: source.content ? (source.content as string).substring(0, 100) + '...' : 'No content',
      excerpt: source.excerpt ? (source.excerpt as string).substring(0, 100) + '...' : 'No excerpt',
      sourceTable: source.sourceTable
    });

    // USE backend-generated question if available (uses configured RAG patterns)
    // Backend generates questions using patterns configured in Settings > RAG
    if (source.question && typeof source.question === 'string' && source.question.trim().length > 10) {
      question = source.question.trim();
      console.log('Using backend-generated question:', question);
    } else {
      // Fallback: Generate locally if backend didn't provide a question
      const title = (source.title as string) || '';
      const excerpt = (source.excerpt as string) || '';
      const content = (source.content as string) || '';
      const category = (source.category as string) || (source.sourceTable as string) || '';
      const sourceTable = (source.sourceTable as string) || '';

      // Extract keywords from the source
      const keywords = extractKeywords(title + ' ' + excerpt + ' ' + content);

      // Generate content-specific question (not generic!)
      question = await generateContentSpecificQuestion(title, content || excerpt, category, sourceTable, keywords);
      console.log('Generated fallback question:', question);
    }

    console.log('Final question to be set:', question);
    console.log('Current input text:', getInputText());

    // Set the generated question
    console.log('Setting input text to:', question);

    // Update both React state and DOM directly
    setInputText(question);

    // Also update DOM directly for immediate effect
    setTimeout(() => {
      const inputElement = document.querySelector('textarea') as HTMLTextAreaElement;
      if (inputElement) {
        inputElement.value = question;
        inputElement.focus();
        inputElement.setSelectionRange(question.length, question.length);
        // Trigger React to recognize the change
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 0);
  };
}

/**
 * Extract keywords from text for question generation
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  // Common tax and legal terms
  const terms = [
    'KDV', 'ÖTV', 'Stopaj', 'Damga Vergisi', 'Gelir Vergisi', 'Kurumlar Vergisi',
    'vergi', 'tazminat', 'sözleşme', 'kanun', 'yönetmelik', 'tebliğ',
    'karar', 'emsal', 'istisna', 'muafiyet', 'oran', 'tutar', 'süre',
    'başvuru', 'dava', 'itiraz', 'uzlaşma', 'tarhiyat', 'ceza',
    'kıdem', 'ihbar', 'işçi', 'işveren', 'mükellef', 'beyan'
  ];

  const textLower = text.toLowerCase();
  terms.forEach(term => {
    if (textLower.includes(term.toLowerCase())) {
      keywords.push(term);
    }
  });

  // Extract percentages
  const percentMatch = text.match(/(\d+)%/);
  if (percentMatch) {
    keywords.push(`${percentMatch[1]}%`);
  }

  return keywords.slice(0, 3);
}

/**
 * Generate content-specific question from source title and content
 * Creates questions specific to the actual content, avoiding generic questions
 * Extracts the REAL topic from content and generates meaningful questions
 */
async function generateContentSpecificQuestion(title: string, content: string, category: string, sourceTable: string, keywords: string[]): Promise<string> {
  // Clean title and content
  const cleanTitle = cleanSourceTitle(title);
  const contentLower = content.toLowerCase();
  const titleLower = cleanTitle.toLowerCase();

  // ==== STEP 1: Extract the MAIN TOPIC from content ====
  // Look for specific entity mentions, legal terms, case subjects
  const mainTopic = extractMainTopic(cleanTitle, content);

  // ==== STEP 2: Identify content TYPE (question, case, ruling, article) ====
  const contentType = identifyContentType(content, sourceTable);

  // ==== STEP 3: Extract KEY ENTITIES (law numbers, dates, amounts, parties) ====
  const entities = extractEntities(content);

  // ==== STEP 4: Generate SMART question based on extracted info ====

  // If we found a clear main topic, use it
  if (mainTopic && mainTopic.length > 5) {
    // Check what aspect of the topic is being discussed
    if (contentType === 'soru-cevap') {
      // For Q&A content, ask about similar situations
      return `${mainTopic} durumunda nasıl bir yol izlenmeli?`;
    }

    if (contentType === 'danistay') {
      // For court decisions, ask about the ruling's implications
      if (entities.lawNumber) {
        return `${entities.lawNumber} kapsamında ${mainTopic} konusunda Danıştay ne diyor?`;
      }
      return `${mainTopic} konusundaki içtihat nedir?`;
    }

    if (contentType === 'ozelge') {
      // For tax rulings, ask about applicability
      return `${mainTopic} için özelge kapsamında hangi şartlar aranır?`;
    }

    if (contentType === 'makale') {
      // For articles, ask about practical implications
      return `${mainTopic} uygulamasında dikkat edilmesi gereken noktalar nelerdir?`;
    }

    // Generic but topic-specific question
    return `${mainTopic} hakkında ayrıntılı bilgi verir misin?`;
  }

  // ==== FALLBACK: Use extracted entities for more specific questions ====

  // If we found a law/article reference
  if (entities.lawNumber && entities.articleNumber) {
    return `${entities.lawNumber} ${entities.articleNumber}. madde nasıl uygulanır?`;
  }

  if (entities.lawNumber) {
    return `${entities.lawNumber} kapsamında bu durumda ne yapılmalı?`;
  }

  // If we found specific amounts or rates
  if (entities.amount) {
    return `${entities.amount} tutarı/oranı hangi hallerde geçerlidir?`;
  }

  // If we found a specific date/period
  if (entities.period) {
    return `${entities.period} süresi için geçerli kurallar nelerdir?`;
  }

  // ==== LAST RESORT: Use title intelligently ====
  if (cleanTitle.length > 10 && cleanTitle.length < 100) {
    // Check if title is a question
    if (/\?$/.test(cleanTitle)) {
      return cleanTitle; // Use the title itself as the question
    }

    // Check if title describes a specific topic
    if (/hakkında|ilgili|dair|kapsamında/.test(titleLower)) {
      return `${cleanTitle} detaylarını açıklar mısın?`;
    }

    // Check if title mentions a specific case/situation
    if (/durumunda|halinde|olması/.test(titleLower)) {
      return `${cleanTitle} - bu durumda nasıl hareket edilmeli?`;
    }

    return `${cleanTitle} konusunu açıklar mısın?`;
  }

  // Absolute fallback - use keywords
  if (keywords.length > 0) {
    return `${keywords.slice(0, 2).join(' ve ')} konusunda bilgi verir misin?`;
  }

  return `Bu konuda detaylı bilgi verir misin?`;
}

/**
 * Extract the main topic from content - looks for subject matter
 */
function extractMainTopic(title: string, content: string): string {
  const text = title + ' ' + content;
  const textLower = text.toLowerCase();

  // Pattern 1: Look for "X hakkında" or "X ile ilgili" patterns
  const aboutMatch = text.match(/([^.,:;!?\n]{5,60})\s+(?:hakkında|hakkındaki|ilgili|dair|kapsamında)/i);
  if (aboutMatch) {
    return aboutMatch[1].trim();
  }

  // Pattern 2: Look for specific tax/legal terms with context
  const taxTerms = [
    { pattern: /(\w+\s+)?stopaj(ı|ın|a)?\s+(\w+\s+)?/i, extract: (m: RegExpMatchArray) => m[0].trim() },
    { pattern: /KDV\s+(?:oranı|istisnası|muafiyeti|iadesi|matrahı)/i, extract: (m: RegExpMatchArray) => m[0].trim() },
    { pattern: /gelir\s+vergisi\s+(?:beyannamesi|matrahı|istisnası|oranı)/i, extract: (m: RegExpMatchArray) => m[0].trim() },
    { pattern: /kurumlar\s+vergisi\s+(?:beyannamesi|matrahı|istisnası)/i, extract: (m: RegExpMatchArray) => m[0].trim() },
    { pattern: /damga\s+vergisi\s+(?:oranı|istisnası|tutarı)/i, extract: (m: RegExpMatchArray) => m[0].trim() },
    { pattern: /(?:kıdem|ihbar)\s+tazminatı/i, extract: (m: RegExpMatchArray) => m[0].trim() },
    { pattern: /(?:fatura|e-fatura|irsaliye)/i, extract: (m: RegExpMatchArray) => m[0].trim() },
  ];

  for (const term of taxTerms) {
    const match = text.match(term.pattern);
    if (match) {
      return term.extract(match);
    }
  }

  // Pattern 3: Look for question content (Soru: ... )
  const questionMatch = content.match(/(?:Soru|SORU)[:\s]+([^?]+\?)/i);
  if (questionMatch) {
    const question = questionMatch[1].trim();
    if (question.length < 100) {
      return question;
    }
  }

  // Pattern 4: Look for subject in title (before " - " or ":")
  const titleParts = title.split(/\s*[-:]\s*/);
  if (titleParts.length > 0 && titleParts[0].length > 5 && titleParts[0].length < 80) {
    return titleParts[0].trim();
  }

  // Pattern 5: First sentence if it's descriptive (not too long)
  const firstSentence = content.match(/^[^.!?]+[.!?]/);
  if (firstSentence && firstSentence[0].length < 100 && firstSentence[0].length > 20) {
    // Check if it's not just a generic introduction
    if (!/merhaba|sayın|tarafından|tarihinde/i.test(firstSentence[0])) {
      return firstSentence[0].replace(/[.!?]$/, '').trim();
    }
  }

  return '';
}

/**
 * Identify the type of content (for generating appropriate questions)
 */
function identifyContentType(content: string, sourceTable: string): string {
  const contentLower = content.toLowerCase();
  const tableLower = sourceTable.toLowerCase();

  if (tableLower.includes('danistay') || tableLower.includes('içtihat')) {
    return 'danistay';
  }
  if (tableLower.includes('ozelge') || contentLower.includes('özelge')) {
    return 'ozelge';
  }
  if (tableLower.includes('sorucevap') || tableLower.includes('soru') ||
      /soru[:\s]/i.test(content) || /cevap[:\s]/i.test(content)) {
    return 'soru-cevap';
  }
  if (tableLower.includes('makale') || tableLower.includes('yazi')) {
    return 'makale';
  }
  if (tableLower.includes('mevzuat') || /kanun|yönetmelik|tebliğ/i.test(content)) {
    return 'mevzuat';
  }

  return 'generic';
}

/**
 * Extract specific entities from content (law numbers, dates, amounts)
 */
function extractEntities(content: string): {
  lawNumber?: string;
  articleNumber?: string;
  amount?: string;
  period?: string;
  date?: string;
} {
  const entities: {
    lawNumber?: string;
    articleNumber?: string;
    amount?: string;
    period?: string;
    date?: string;
  } = {};

  // Extract law number (e.g., "193 sayılı Kanun", "5520 sayılı KVK")
  const lawMatch = content.match(/(\d{3,4})\s+sayılı\s+(?:Gelir Vergisi |Kurumlar Vergisi |Katma Değer Vergisi |)?(?:Kanun|KVK|GVK|KDVK)/i);
  if (lawMatch) {
    entities.lawNumber = lawMatch[0].trim();
  }

  // Extract article number (e.g., "94. madde", "madde 94")
  const articleMatch = content.match(/(?:(\d+)(?:\s*[./]\s*\d+)?\s*\.?\s*(?:üncü|inci|nci|ncı|uncu)?\s*madde|madde\s*(\d+))/i);
  if (articleMatch) {
    const num = articleMatch[1] || articleMatch[2];
    entities.articleNumber = num;
  }

  // Extract percentage/rate
  const rateMatch = content.match(/%\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*%/);
  if (rateMatch) {
    entities.amount = rateMatch[0].trim();
  }

  // Extract time period
  const periodMatch = content.match(/(\d+)\s*(gün|ay|yıl|hafta)\s*(?:içinde|süre)/i);
  if (periodMatch) {
    entities.period = periodMatch[0].trim();
  }

  // Extract specific date
  const dateMatch = content.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dateMatch) {
    entities.date = dateMatch[0];
  }

  return entities;
}

/**
 * Generate contextual question from title and metadata (DEPRECATED - use generateContentSpecificQuestion instead)
 * Generates natural, conversational questions based on content analysis
 */
async function generateQuestionFromContext(title: string, content: string, category: string, sourceTable: string, keywords: string[]): Promise<string> {
  // Clean title for question generation
  const cleanTitle = cleanSourceTitle(title);
  const contentLower = content.toLowerCase();
  const titleLower = cleanTitle.toLowerCase();

  // Get dynamic table names
  const tables = await getDynamicTables();

  // Detect key tax/legal terms for context-aware questions
  const hasStopaj = /stopaj|tevkifat/i.test(contentLower);
  const hasKDV = /kdv|katma değer/i.test(contentLower);
  const hasGelir = /gelir vergisi/i.test(contentLower);
  const hasBeyanname = /beyanname/i.test(contentLower);
  const hasMuafiyet = /muafiyet|istisna/i.test(contentLower);
  const hasOran = /oran|yüzde|%/i.test(contentLower);
  const hasSure = /süre|tarih|son gün/i.test(contentLower);
  const hasCeza = /ceza|yaptırım|idari/i.test(contentLower);

  // Source-specific natural questions
  if (sourceTable === tables.DANISTAY_KARARLARI || sourceTable === 'DANISTAYKARARLARI' || category === 'İçtihat') {
    return `Bu karar hangi durumlarda emsal teşkil eder?`;
  }

  if (sourceTable === tables.OZELGELER || sourceTable === 'OZELGELER') {
    if (hasSure) {
      return `Bu özelge için başvuru süreleri nedir?`;
    }
    return `Bu özelgeden kimler yararlanabilir?`;
  }

  if (sourceTable === tables.MAKALELER || sourceTable === 'Makaleler') {
    if (hasKDV) {
      return `KDV uygulaması bu durumda nasıl olur?`;
    }
    if (hasStopaj) {
      return `Stopaj kesintisi hangi hallerde uygulanır?`;
    }
    return `Bu konuda uygulamada nelere dikkat edilmeli?`;
  }

  if (sourceTable === tables.SORU_CEVAP || sourceTable === 'sorucevap') {
    if (hasStopaj && hasOran) {
      return `Stopaj oranı bu işlemde ne kadardır?`;
    }
    if (hasKDV && hasMuafiyet) {
      return `KDV muafiyeti bu durumda uygulanabilir mi?`;
    }
    if (hasBeyanname && hasSure) {
      return `Beyanname için son tarih ne zaman?`;
    }
    return `Benzer durumda ne yapmalıyım?`;
  }

  // Content-based natural questions
  if (hasStopaj && hasOran) {
    return `Stopaj oranları hangi durumlarda değişir?`;
  }

  if (hasStopaj) {
    return `Bu stopaj uygulaması kimler için geçerlidir?`;
  }

  if (hasKDV && hasOran) {
    return `KDV oranı bu işlem için ne kadardır?`;
  }

  if (hasKDV && hasMuafiyet) {
    return `KDV muafiyeti hangi şartlarda uygulanır?`;
  }

  if (hasBeyanname && hasSure) {
    return `Beyanname verme süreleri ne zaman doluyor?`;
  }

  if (hasBeyanname) {
    return `Bu beyanname hangi gelirleri kapsar?`;
  }

  if (hasMuafiyet) {
    return `Muafiyetten kimler yararlanabilir?`;
  }

  if (hasGelir) {
    return `Gelir vergisi matrahı nasıl hesaplanır?`;
  }

  if (hasCeza) {
    return `Bu ihlalin yaptırımları nelerdir?`;
  }

  if (hasSure) {
    return `Bu işlem için süre sınırı var mı?`;
  }

  // Mevzuat-specific questions
  if (category === 'Mevzuat' || sourceTable === tables.MEVZUAT || sourceTable === 'MEVZUAT') {
    if (keywords.some(k => k.includes('Vergi'))) {
      return `Bu düzenleme hangi vergi türlerini etkiliyor?`;
    }
    return `Bu hüküm hangi durumlarda uygulanır?`;
  }

  // Generic but natural fallback
  if (cleanTitle.length > 10 && cleanTitle.length < 60) {
    return `${cleanTitle} hakkında detaylar neler?`;
  }

  return `Bu düzenleme hangi durumları kapsıyor?`;
}

/**
 * Helper function to get table display names (consistent with frontend)
 */
async function getTableDisplayName(tableName: string): Promise<string> {
  return await getDynamicTableDisplayName(tableName);
}