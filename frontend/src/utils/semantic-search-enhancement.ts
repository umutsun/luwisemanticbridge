/**
 * Semantic Search Enhancement Utilities
 * Provides intelligent query generation and semantic context for enhanced search capabilities
 */

import {
  extractSemanticKeywords,
  generateTagKeywords,
  generateSearchQueryFromKeywords
} from './keyword-extraction';

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
  setInputText: (text: string) => void,
  focusInput: () => void,
  options: EnhancedQueryOptions = {}
) {
  return async (source: Record<string, unknown>) => {
    const cleanTitle = cleanSourceTitle(source.title || '');
    const sourceType = getTableDisplayName(source.sourceTable || (source.databaseInfo && source.databaseInfo.table));
    const context = analyzeSemanticContext(
      cleanTitle,
      source.excerpt || source.content || '',
      source.category || '',
      sourceType
    );

    context.relevanceScore = source.score || source.relevanceScore || 0;

    // Use keyword extraction for better query generation
    const keywordContext = {
      title: cleanTitle,
      excerpt: source.excerpt || source.content || '',
      category: source.category || '',
      sourceType: sourceType,
      relevanceScore: context.relevanceScore
    };

    try {
      // Use enhanced keyword extraction for contextual question generation
      const semanticKeywords = extractSemanticKeywords(keywordContext);
      const tagKeywords = generateTagKeywords(semanticKeywords);

      if (tagKeywords.length > 0) {
        // Use the improved contextual question generation
        const contextualQuery = generateSearchQueryFromKeywords(tagKeywords.slice(0, 4), keywordContext);
        setInputText(contextualQuery);
      } else {
        // Use semantic context for question generation
        const semanticQuery = generateEnhancedQuery(context, options);
        setInputText(semanticQuery);
      }
    } catch {
      // Fallback to semantic query generation if enhanced extraction fails
      const semanticQuery = generateEnhancedQuery(context, options);
      setInputText(semanticQuery);
    }

    focusInput();
  };
}

/**
 * Helper function to get table display names (consistent with frontend)
 */
function getTableDisplayName(tableName: string): string {
  const tableMap: { [key: string]: string } = {
    'OZELGELER': 'Özelgeler',
    'DANISTAYKARARLARI': 'Danıştay',
    'MAKALELER': 'Makaleler',
    'DOKUMAN': 'Dokümanlar',
    'MEVZUAT': 'Mevzuat',
    'sorucevap': 'Soru-Cevap',
    'documents': 'Dokümanlar',
    'conversations': 'Sohbetler',
    'messages': 'Mesajlar'
  };
  return tableMap[tableName] || tableName;
}