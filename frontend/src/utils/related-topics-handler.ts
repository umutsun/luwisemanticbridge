/**
 * Related Topics Handler
 * Specialized utilities for handling related topics with enhanced semantic capabilities
 */

import { generateEnhancedQuery, SemanticContext, EnhancedQueryOptions } from './semantic-search-enhancement';

export interface RelatedTopicEnhancement {
  /**
   * Enables cross-source navigation by suggesting connections between different source types
   */
  enableCrossSourceNavigation: boolean;

  /**
   * Includes semantic similarity information in the generated queries
   */
  includeSimilarityContext: boolean;

  /**
   * Adds temporal context for time-sensitive topics
   */
  includeTemporalContext: boolean;

  /**
   * Enables progressive disclosure - starting with basic questions and building complexity
   */
  enableProgressiveDisclosure: boolean;

  /**
   * Maximum number of semantic relationships to include in a single query
   */
  maxRelationships: number;
}

export interface TopicRelationship {
  type: 'semantic' | 'temporal' | 'causal' | 'hierarchical' | 'contrastive';
  strength: number; // 0-1
  description: string;
  targetTopic: string;
}

export interface RelatedTopicBundle {
  primaryQuery: string;
  alternativeQueries: string[];
  semanticRelationships: TopicRelationship[];
  context: SemanticContext;
  confidence: number;
}

/**
 * Analyzes semantic relationships between topics
 */
export function analyzeTopicRelationships(
  primaryTopic: string,
  relatedTopics: string[],
  context: SemanticContext
): TopicRelationship[] {
  const relationships: TopicRelationship[] = [];

  // Analyze each related topic for relationship types
  relatedTopics.forEach(relatedTopic => {
    // Semantic similarity (based on shared keywords)
    const sharedKeywords = findSharedKeywords(primaryTopic, relatedTopic);
    if (sharedKeywords.length > 0) {
      relationships.push({
        type: 'semantic',
        strength: sharedKeywords.length / Math.max(primaryTopic.length, relatedTopic.length) * 10,
        description: `İlgili konu: ${relatedTopic} (${sharedKeywords.join(', ')})`,
        targetTopic: relatedTopic
      });
    }

    // Temporal relationships (if dates or time periods are mentioned)
    const temporalRelation = detectTemporalRelationship(primaryTopic, relatedTopic);
    if (temporalRelation) {
      relationships.push({
        type: 'temporal',
        strength: 0.8,
        description: temporalRelation,
        targetTopic: relatedTopic
      });
    }

    // Causal relationships (if one topic causes or affects another)
    const causalRelation = detectCausalRelationship(primaryTopic, relatedTopic, context);
    if (causalRelation) {
      relationships.push({
        type: 'causal',
        strength: 0.9,
        description: causalRelation,
        targetTopic: relatedTopic
      });
    }

    // Hierarchical relationships (broader/narrower terms)
    const hierarchicalRelation = detectHierarchicalRelationship(primaryTopic, relatedTopic);
    if (hierarchicalRelation) {
      relationships.push({
        type: 'hierarchical',
        strength: 0.7,
        description: hierarchicalRelation,
        targetTopic: relatedTopic
      });
    }

    // Contrastive relationships (opposing or alternative concepts)
    const contrastiveRelation = detectContrastiveRelationship(primaryTopic, relatedTopic);
    if (contrastiveRelation) {
      relationships.push({
        type: 'contrastive',
        strength: 0.6,
        description: contrastiveRelation,
        targetTopic: relatedTopic
      });
    }
  });

  // Sort by strength and limit to max relationships
  return relationships
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
}

/**
 * Finds shared keywords between two topics
 */
function findSharedKeywords(topic1: string, topic2: string): string[] {
  const keywords1 = extractKeywords(topic1);
  const keywords2 = extractKeywords(topic2);

  return keywords1.filter(keyword =>
    keywords2.includes(keyword) && keyword.length > 3
  );
}

/**
 * Extracts meaningful keywords from text
 */
function extractKeywords(text: string): string[] {
  // Simple keyword extraction - in real implementation, this could use NLP
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);

  // Filter out common stop words
  const stopWords = ['ile', 'için', 'üzerine', 'hakkında', 'konusunda', 'konusu', 've', 'veya', 'ama', 'fakat'];

  return words.filter(word => !stopWords.includes(word));
}

/**
 * Detects temporal relationships between topics
 */
function detectTemporalRelationship(topic1: string, topic2: string): string | null {
  const temporalPatterns = [
    /(\d{4})/, // Years
    /(\d{1,2}\.\d{1,2}\.\d{4})/, // Dates
    /(?:öncesi|sonrası|öncesinde|sonrasında)/, // Temporal markers
    /(?:geçmiş|güncel|yakın)/ // Time references
  ];

  const hasTemporal1 = temporalPatterns.some(pattern => pattern.test(topic1));
  const hasTemporal2 = temporalPatterns.some(pattern => pattern.test(topic2));

  if (hasTemporal1 && hasTemporal2) {
    return `Zamansal ilişki: ${topic1} - ${topic2}`;
  }

  return null;
}

/**
 * Detects causal relationships between topics
 */
function detectCausalRelationship(topic1: string, topic2: string, context: SemanticContext): string | null {
  const causalWords = ['nedeniyle', 'sonucunda', 'dolayısıyla', 'bunun üzerine'];

  if (context.hasLegalTerms || context.hasTaxTerms) {
    const hasCausal1 = causalWords.some(word => topic1.toLowerCase().includes(word));
    const hasCausal2 = causalWords.some(word => topic2.toLowerCase().includes(word));

    if (hasCausal1 || hasCausal2) {
      return `Neden-sonuç ilişkisi: ${topic1} → ${topic2}`;
    }
  }

  return null;
}

/**
 * Detects hierarchical relationships between topics
 */
function detectHierarchicalRelationship(topic1: string, topic2: string): string | null {
  const broaderTerms = ['vergi', 'hukuk', 'mevzuat', 'sistem', 'kanun'];
  const narrowerTerms = ['kdv', 'stopaj', 'damga', 'istisna', 'muafiyet'];

  const is1Broader = broaderTerms.some(term => topic1.toLowerCase().includes(term));
  const is2Narrower = narrowerTerms.some(term => topic2.toLowerCase().includes(term));

  if (is1Broader && is2Narrower) {
    return `Kavramsal hiyerarşi: ${topic1} (genel) → ${topic2} (özel)`;
  }

  const is2Broader = broaderTerms.some(term => topic2.toLowerCase().includes(term));
  const is1Narrower = narrowerTerms.some(term => topic1.toLowerCase().includes(term));

  if (is2Broader && is1Narrower) {
    return `Kavramsal hiyerarşi: ${topic2} (genel) → ${topic1} (özel)`;
  }

  return null;
}

/**
 * Detects contrastive relationships between topics
 */
function detectContrastiveRelationship(topic1: string, topic2: string): string | null {
  const contrastiveWords = ['istisna', 'muafiyet', 'dışlama', 'hariç'];

  const hasContrast1 = contrastiveWords.some(word => topic1.toLowerCase().includes(word));
  const hasContrast2 = contrastiveWords.some(word => topic2.toLowerCase().includes(word));

  if (hasContrast1 && !hasContrast2) {
    return `Karşıtlık ilişkisi: ${topic1} (istisna) - ${topic2} (genel kural)`;
  }

  if (!hasContrast1 && hasContrast2) {
    return `Karşıtlık ilişkisi: ${topic1} (genel kural) - ${topic2} (istisna)`;
  }

  return null;
}

/**
 * Creates a bundle of related topic queries with different approaches
 */
export function createRelatedTopicBundle(
  primarySource: any,
  relatedSources: any[] = [],
  enhancement: RelatedTopicEnhancement = {
    enableCrossSourceNavigation: true,
    includeSimilarityContext: true,
    includeTemporalContext: false,
    enableProgressiveDisclosure: false,
    maxRelationships: 3
  }
): RelatedTopicBundle {
  const context: SemanticContext = {
    category: primarySource.category || '',
    sourceType: primarySource.sourceTable || 'unknown',
    topic: primarySource.title || '',
    excerpt: primarySource.excerpt || primarySource.content || '',
    relevanceScore: primarySource.score || primarySource.relevanceScore || 0,
    hasLegalTerms: /(?:tevkiğ|kararı|kanunu|tüzüğü|yönetmeliği|tebliği|genelge|sirküler)/i.test(primarySource.title || ''),
    hasTaxTerms: /(?:vergi|stopaj|kdv|ötv|gv|kv|kurumlar|damga|harç|beyanname)/i.test(primarySource.title || ''),
    isAboutProcedure: /(?:prosedür|süreç|uygulama|başvuru|talep|bildirim)/i.test(primarySource.title || ''),
    isAboutDefinition: /(?:tanımı|kapsamı|unsurları|özellikleri|şartları)/i.test(primarySource.title || ''),
    isAboutPenalty: /(?:ceza|yaptırım|idari|hukuki)/i.test(primarySource.title || ''),
    isAboutException: /(?:istisna|muafiyet|hariç)/i.test(primarySource.title || ''),
    isAboutDeadline: /(?:süre|son|tarih|zamanlama)/i.test(primarySource.title || ''),
    hasQuestionWords: /(?:nedir|nasıl|neden|hangi|kim|ne zaman|kaç|nerede|ne|mi|mu|mü|mı)/i.test(primarySource.excerpt || primarySource.content || ''),
  };

  // Generate primary query
  const primaryQuery = generateEnhancedQuery(context, {
    includeCrossSourceContext: enhancement.enableCrossSourceNavigation,
    includeRelevanceContext: enhancement.includeSimilarityContext,
    maxSemanticTerms: enhancement.maxRelationships,
    queryStyle: 'detailed'
  });

  // Generate alternative queries
  const alternativeQueries: string[] = [];

  if (enhancement.enableProgressiveDisclosure) {
    // Simple question first
    alternativeQueries.push(generateEnhancedQuery(context, {
      queryStyle: 'conversational',
      maxSemanticTerms: 1
    }));

    // Detailed question later
    alternativeQueries.push(generateEnhancedQuery(context, {
      queryStyle: 'detailed',
      maxSemanticTerms: 5
    }));
  }

  // Add cross-source queries if enabled
  if (enhancement.enableCrossSourceNavigation && relatedSources.length > 0) {
    const relatedTopics = relatedSources.map(source => source.title).filter(Boolean);
    const relationships = analyzeTopicRelationships(primarySource.title, relatedTopics, context);

    relationships.slice(0, enhancement.maxRelationships).forEach(relationship => {
      alternativeQueries.push(`"${primarySource.title}" ve "${relationship.targetTopic}" arasındaki ${relationship.type} ilişkiyi açıklar mısınız? ${relationship.description}`);
    });
  }

  // Analyze semantic relationships
  const semanticRelationships = enhancement.enableCrossSourceNavigation && relatedSources.length > 0
    ? analyzeTopicRelationships(primarySource.title, relatedSources.map(s => s.title), context)
    : [];

  return {
    primaryQuery,
    alternativeQueries,
    semanticRelationships,
    context,
    confidence: Math.min(1, (context.relevanceScore || 0) / 100 + (semanticRelationships.length * 0.1))
  };
}

/**
 * Creates an enhanced click handler for related topics with bundle support
 */
export function createRelatedTopicsClickHandler(
  setInputText: (text: string) => void,
  focusInput: () => void,
  showAlternativeQueries?: (queries: string[]) => void,
  enhancement?: RelatedTopicEnhancement
) {
  return async (primarySource: any, relatedSources?: any[]) => {
    const bundle = createRelatedTopicBundle(primarySource, relatedSources || [], enhancement);

    // Set the primary query
    setInputText(bundle.primaryQuery);
    focusInput();

    // Show alternative queries if callback provided
    if (showAlternativeQueries && bundle.alternativeQueries.length > 0) {
      showAlternativeQueries(bundle.alternativeQueries);
    }

    // Log the relationships for debugging/analytics
    console.log('Related topic relationships:', bundle.semanticRelationships);
    console.log('Query confidence:', bundle.confidence);

    return bundle;
  };
}