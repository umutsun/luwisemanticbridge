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

    // ALWAYS generate question from source content for specificity
    // Don't use pre-generated questions as they may be generic
    const title = (source.title as string) || '';
    const excerpt = (source.excerpt as string) || '';
    const content = (source.content as string) || '';
    const category = (source.category as string) || (source.sourceTable as string) || '';
    const sourceTable = (source.sourceTable as string) || '';

    // Extract keywords from the source
    const keywords = extractKeywords(title + ' ' + excerpt + ' ' + content);

    // Generate content-specific question (not generic!)
    question = await generateContentSpecificQuestion(title, content || excerpt, category, sourceTable, keywords);

    console.log('Generated content-specific question:', question);

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
 * Does NOT use "bu/şu/o" pronouns - directly references the content
 */
async function generateContentSpecificQuestion(title: string, content: string, category: string, sourceTable: string, keywords: string[]): Promise<string> {
  // Clean title and extract first meaningful sentence from content
  const cleanTitle = cleanSourceTitle(title);
  const contentLower = content.toLowerCase();

  // Extract first 1-2 sentences as summary (up to 200 chars)
  let summary = content.trim();
  const firstSentenceEnd = summary.search(/[.!?]\s/);
  if (firstSentenceEnd > 0 && firstSentenceEnd < 200) {
    summary = summary.substring(0, firstSentenceEnd + 1).trim();
  } else {
    summary = summary.substring(0, 200).trim();
    // Try to end at word boundary
    const lastSpace = summary.lastIndexOf(' ');
    if (lastSpace > 100) {
      summary = summary.substring(0, lastSpace) + '...';
    }
  }

  // Analyze content to determine main topic/question type
  const hasStopaj = /stopaj|tevkifat/i.test(contentLower);
  const hasKDV = /kdv|katma değer/i.test(contentLower);
  const hasGelir = /gelir vergisi/i.test(contentLower);
  const hasBeyanname = /beyanname/i.test(contentLower);
  const hasMuafiyet = /muafiyet|istisna/i.test(contentLower);
  const hasOran = /oran|yüzde|%/i.test(contentLower);
  const hasSure = /süre|tarih|son gün/i.test(contentLower);
  const hasCeza = /ceza|yaptırım|idari/i.test(contentLower);
  const hasBasvuru = /başvuru|talep|dilekçe/i.test(contentLower);
  const hasHesaplama = /hesap|hesaplama|ödeme|tutar/i.test(contentLower);

  // Extract specific numbers/rates if present
  const percentMatch = content.match(/(%\s*\d+|\d+\s*%)/);
  const numberMatch = content.match(/(\d+)\s*(gün|ay|yıl|TL|lira)/);

  // Generate specific question based on content analysis
  // Avoid "bu/şu/o" - directly reference the topic

  // Rate/percentage questions
  if (hasOran && percentMatch) {
    if (hasStopaj) {
      return `Stopaj oranları hangi durumlarda ${percentMatch[0]} olarak uygulanır?`;
    }
    if (hasKDV) {
      return `KDV oranı ${percentMatch[0]} hangi mal ve hizmetler için geçerlidir?`;
    }
    return `${percentMatch[0]} oranı hangi hallerde uygulanır?`;
  }

  // Exemption/exception questions
  if (hasMuafiyet) {
    if (hasKDV) {
      return `KDV muafiyetinden yararlanmak için hangi şartlar aranır?`;
    }
    if (hasGelir) {
      return `Gelir vergisi muafiyeti hangi gelirler için uygulanır?`;
    }
    return `İstisna/muafiyet uygulaması için gerekli şartlar nelerdir?`;
  }

  // Time period questions
  if (hasSure && numberMatch) {
    return `${numberMatch[0]} içinde yapılması gereken işlemler nelerdir?`;
  }
  if (hasSure && hasBeyanname) {
    return `Beyanname verme süreleri hangi tarihler arasındadır?`;
  }

  // Application/procedure questions
  if (hasBasvuru) {
    return `Başvuru yapmak için hangi belgeler gereklidir?`;
  }

  // Calculation questions
  if (hasHesaplama) {
    if (hasStopaj) {
      return `Stopaj hesaplaması nasıl yapılır ve hangi tutarlar üzerinden hesaplanır?`;
    }
    if (hasKDV) {
      return `KDV matrahı nasıl hesaplanır ve hangi indirimler yapılabilir?`;
    }
    return `Hesaplama yaparken dikkat edilmesi gereken hususlar nelerdir?`;
  }

  // Penalty questions
  if (hasCeza) {
    return `Hangi durumlarda vergi cezası uygulanır ve ceza tutarı nasıl hesaplanır?`;
  }

  // Use keywords to generate specific question
  if (keywords.length > 0) {
    const mainKeyword = keywords[0];
    return `${mainKeyword} ile ilgili hangi düzenlemeler ve şartlar geçerlidir?`;
  }

  // Fallback: Extract main topic from title
  if (cleanTitle.length > 10) {
    return `${cleanTitle} konusunda hangi hükümler ve uygulamalar vardır?`;
  }

  // Last resort: Use content's main idea
  return `${summary.substring(0, 60)}... ile ilgili detaylı bilgi nedir?`;
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