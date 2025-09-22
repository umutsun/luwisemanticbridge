/**
 * Semantic Keyword Extraction Utilities
 * Extracts meaningful keywords from source content for enhanced navigation and search
 */

export interface KeywordExtractionResult {
  keywords: string[];
  primaryTopic: string;
  secondaryTopics: string[];
  entities: string[];
  concepts: string[];
}

export interface ContentContext {
  title: string;
  excerpt: string;
  category: string;
  sourceType: string;
  relevanceScore?: number;
}

export interface SourceDetails {
  percentages: string[];
  monetaryValues: string[];
  dates: string[];
  legalReferences: string[];
  timePeriods: string[];
  specificTerms: string[];
  hasQuestionWords: boolean;
  isDefinition: boolean;
  isProcedure: boolean;
  isException: boolean;
  isPenalty: boolean;
}

type QuestionType =
  | 'direct_answer'
  | 'definition'
  | 'procedure'
  | 'exception'
  | 'penalty'
  | 'legal_reference'
  | 'calculation'
  | 'ruling'
  | 'court_decision'
  | 'faq'
  | 'general_explanation';

// Taxonomy keywords for legal/tax domain
const LEGAL_TAX_TAXONOMY = {
  // Tax types
  taxTypes: [
    'KDV', 'Katma Değer Vergisi', 'Gelir Vergisi', 'Kurumlar Vergisi', 'Stopaj',
    'Damga Vergisi', 'ÖTV', 'Özel Tüketim Vergisi', 'Emlak Vergisi',
    'Motorlu Taşıtlar Vergisi', 'Banka ve Sigorta Muameleleri Vergisi', 'Harçlar'
  ],

  // Legal procedures
  procedures: [
    'Başvuru', 'Beyan', 'İtiraz', 'Dava', 'Savunma', 'Talep',
    'Bildirim', 'Ödeme', 'İade', 'Tescil', 'Onay', 'Denetim'
  ],

  // Legal concepts
  concepts: [
    'İstisna', 'Muafiyet', 'Tevkifat', 'Matrah', 'Oran', 'Süre',
    'Ceza', 'Yaptırım', 'Sorumluluk', 'Yetki', 'Hüküm', 'Kapsam'
  ],

  // Document types
  documentTypes: [
    'Özelge', 'Danıştay Kararı', 'Kanun', 'Tüzük', 'Yönetmelik',
    'Tebliğ', 'Genelge', 'Sirküler', 'Makale', 'Soru-Cevap'
  ],

  // Common legal terms
  legalTerms: [
    'Hukuki', 'Yasal', 'Meşru', 'Geçerli', 'Uygulanabilir', 'İdari',
    'Yargı', 'İçtihat', 'Emsal', 'Karar', 'Delil', 'Beyan'
  ]
};

// Stop words for Turkish legal content
const TURKISH_STOP_WORDS = [
  've', 'veya', 'ile', 'için', 'bu', 'şu', 'bir', 'kadar', 'gibi', 'daha',
  'çok', 'az', 'içinde', 'üzerinde', 'altında', 'sonra', 'önce', 'şimdi',
  'burada', 'orada', 'nasıl', 'neden', 'ne', 'kim', 'hangi', 'kaç', 'nerede',
  'mi', 'mu', 'mü', 'mı', 'olarak', 'göre', 'yönünden', 'itibarıyla',
  'açısından', 'kapsamında', 'dolayısıyla', 'bu nedenle', 'böylece',
  'diğer', 'farklı', 'aynı', 'her', 'bütün', 'tüm', 'bazı', 'çeşitli'
];

/**
 * Extracts semantic keywords from content context
 */
export function extractSemanticKeywords(context: ContentContext): KeywordExtractionResult {
  const { title, excerpt, category, sourceType } = context;
  const fullText = `${title} ${excerpt}`.toLowerCase();

  const keywords: string[] = [];
  const entities: string[] = [];
  const concepts: string[] = [];

  // Extract specific tax and legal terms
  extractTaxKeywords(fullText, keywords);
  extractLegalKeywords(fullText, keywords);
  extractProceduralKeywords(fullText, keywords);

  // Extract named entities (basic)
  extractNamedEntities(title, excerpt, entities);

  // Extract conceptual keywords
  extractConceptualKeywords(fullText, concepts);

  // Remove duplicates and stop words
  const uniqueKeywords = [...new Set(keywords)]
    .filter(keyword => !TURKISH_STOP_WORDS.includes(keyword.toLowerCase()))
    .filter(keyword => keyword.length > 2);

  // Determine primary and secondary topics
  const primaryTopic = determinePrimaryTopic(uniqueKeywords, category, sourceType);
  const secondaryTopics = determineSecondaryTopics(uniqueKeywords, primaryTopic);

  return {
    keywords: uniqueKeywords.slice(0, 8), // Limit to top 8 keywords
    primaryTopic,
    secondaryTopics: secondaryTopics.slice(0, 3),
    entities: entities.slice(0, 3),
    concepts: concepts.slice(0, 3)
  };
}

/**
 * Extracts tax-related keywords
 */
function extractTaxKeywords(text: string, keywords: string[]): void {
  // Check for specific tax types
  LEGAL_TAX_TAXONOMY.taxTypes.forEach(taxType => {
    if (text.includes(taxType.toLowerCase()) ||
        text.includes(taxType.toLowerCase().replace(/\s+/g, ''))) {
      keywords.push(taxType);
    }
  });

  // Extract percentages and rates
  const rateMatches = text.match(/(\d+)%/g);
  if (rateMatches) {
    rateMatches.forEach(rate => keywords.push(`${rate} oran`));
  }

  // Extract monetary values
  const monetaryMatches = text.match(/(\d+(?:\.\d+)?)\s*(?:tl|türk\s*lirası|ytl|€|\$|£)/gi);
  if (monetaryMatches) {
    keywords.push('finansal sınır', 'tutar');
  }
}

/**
 * Extracts legal keywords
 */
function extractLegalKeywords(text: string, keywords: string[]): void {
  // Check for legal terms
  LEGAL_TAX_TAXONOMY.legalTerms.forEach(term => {
    if (text.includes(term.toLowerCase())) {
      keywords.push(term);
    }
  });

  // Check for document types
  LEGAL_TAX_TAXONOMY.documentTypes.forEach(docType => {
    if (text.includes(docType.toLowerCase())) {
      keywords.push(docType);
    }
  });

  // Extract legal procedures
  LEGAL_TAX_TAXONOMY.procedures.forEach(procedure => {
    if (text.includes(procedure.toLowerCase())) {
      keywords.push(procedure);
    }
  });
}

/**
 * Extracts procedural keywords
 */
function extractProceduralKeywords(text: string, keywords: string[]): void {
  // Check for legal concepts
  LEGAL_TAX_TAXONOMY.concepts.forEach(concept => {
    if (text.includes(concept.toLowerCase())) {
      keywords.push(concept);
    }
  });

  // Extract time-related keywords
  const timePatterns = [
    /(\d+)\s*(?:gün|hafta|ay|yıl)/g,
    /son\s*(?:tarih|süre|gün)/g,
    /süresi\s*içinde/g
  ];

  timePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      keywords.push('zaman sınırlaması', 'süre');
    }
  });

  // Extract authority/permission keywords
  const authorityPatterns = [
    /yetki|yetkili/g,
    /sorumluluk|sorumlu/g,
    /görev|görevli/g
  ];

  authorityPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      keywords.push('yetki', 'sorumluluk');
    }
  });
}

/**
 * Extracts named entities (basic implementation)
 */
function extractNamedEntities(title: string, excerpt: string, entities: string[]): void {
  // Extract law/article references
  const lawMatches = title.match(/(?:Kanun|Tüzük|Yönetmelik)\s+(?:No\s*)?\d+/gi);
  if (lawMatches) {
    entities.push(...lawMatches);
  }

  // Extract article references
  const articleMatches = excerpt.match(/(?:madde|hüküm)\s+\d+/gi);
  if (articleMatches) {
    entities.push(...articleMatches);
  }

  // Extract date references
  const dateMatches = excerpt.match(/\d{1,2}\.\d{1,2}\.\d{4}/g);
  if (dateMatches) {
    entities.push(...dateMatches);
  }
}

/**
 * Extracts conceptual keywords
 */
function extractConceptualKeywords(text: string, concepts: string[]): void {
  // Extract relationship concepts
  if (text.includes('sorumlu') || text.includes('yükümlü')) concepts.push('sorumluluk');
  if (text.includes('hak') || text.includes('yetki')) concepts.push('yetki');
  if (text.includes('sınır') || text.includes('limit')) concepts.push('sınırlandırma');
  if (text.includes('koşul') || text.includes('şart')) concepts.push('koşulluluk');
  if (text.includes('istisna') || text.includes('muaf')) concepts.push('istisna');
  if (text.includes('ceza') || text.includes('yaptırım')) concepts.push('cezai');
  if (text.includes('prosedür') || text.includes('süreç')) concepts.push('prosedürel');
  if (text.includes('belge') || text.includes('evrak')) concepts.push('dokümantasyon');
}

/**
 * Determines the primary topic based on keywords and context
 */
function determinePrimaryTopic(keywords: string[], category: string, sourceType: string): string {
  // Check for tax type dominance
  const taxTypeKeywords = keywords.filter(k =>
    LEGAL_TAX_TAXONOMY.taxTypes.some(taxType =>
      k.includes(taxType) || taxType.includes(k)
    )
  );

  if (taxTypeKeywords.length > 0) {
    return taxTypeKeywords[0]; // Return the first tax type found
  }

  // Check for procedural dominance
  const proceduralKeywords = keywords.filter(k =>
    LEGAL_TAX_TAXONOMY.procedures.some(proc =>
      k.includes(proc) || proc.includes(k)
    )
  );

  if (proceduralKeywords.length > 0) {
    return proceduralKeywords[0];
  }

  // Fall back to source type or category
  if (sourceType && sourceType !== 'Kaynak') {
    return sourceType;
  }

  if (category && category !== 'Genel') {
    return category;
  }

  // Default to most relevant keyword
  return keywords[0] || 'Hukuki Konu';
}

/**
 * Determines secondary topics
 */
function determineSecondaryTopics(keywords: string[], primaryTopic: string): string[] {
  return keywords
    .filter(keyword => keyword !== primaryTopic)
    .filter(keyword => keyword.length > 3)
    .slice(0, 3);
}

/**
 * Generates tag-friendly keyword strings
 */
export function generateTagKeywords(result: KeywordExtractionResult): string[] {
  const tags: string[] = [];

  // Add primary topic
  if (result.primaryTopic) {
    tags.push(result.primaryTopic);
  }

  // Add secondary topics
  tags.push(...result.secondaryTopics);

  // Add key concepts
  tags.push(...result.concepts);

  // Add important entities
  tags.push(...result.entities);

  // Remove duplicates and clean up
  return [...new Set(tags)]
    .filter(tag => tag.length > 2 && tag.length < 30)
    .map(tag => tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase())
    .slice(0, 5); // Limit to 5 tags
}

/**
 * Generates contextual search query from keywords with source-specific details
 */
export function generateSearchQueryFromKeywords(keywords: string[], context: ContentContext): string {
  const primaryKeywords = keywords.slice(0, 3);
  const relevanceScore = context.relevanceScore || 0;

  // Extract specific details from source content
  const sourceDetails = extractSourceDetails(context);

  // Determine the best question type based on content analysis
  const questionType = determineQuestionType(context, sourceDetails);

  // Generate contextual question based on source type and content
  return selectNaturalQuestionPattern(questionType, primaryKeywords, context, sourceDetails);
}

/**
 * Extracts specific details from source content for question generation
 */
function extractSourceDetails(context: ContentContext): SourceDetails {
  const details: SourceDetails = {
    percentages: [],
    monetaryValues: [],
    dates: [],
    legalReferences: [],
    timePeriods: [],
    specificTerms: [],
    hasQuestionWords: false,
    isDefinition: false,
    isProcedure: false,
    isException: false,
    isPenalty: false
  };

  const fullText = `${context.title} ${context.excerpt}`;

  // Extract percentages and rates
  const percentageMatches = fullText.match(/(\d+(?:\.\d+)?)%/g);
  if (percentageMatches) {
    details.percentages = percentageMatches.map(p => p.replace('%', ''));
  }

  // Extract monetary values
  const monetaryMatches = fullText.match(/(\d+(?:\.\d+)?)\s*(?:tl|türk\s*lirası|ytl|€|\$|£)/gi);
  if (monetaryMatches) {
    details.monetaryValues = monetaryMatches;
  }

  // Extract dates
  const dateMatches = fullText.match(/\d{1,2}\.\d{1,2}\.\d{4}/g);
  if (dateMatches) {
    details.dates = dateMatches;
  }

  // Extract legal references
  const lawMatches = fullText.match(/(?:Kanun|Tüzük|Yönetmelik)\s+(?:No\s*)?\d+/gi);
  const articleMatches = fullText.match(/(?:madde|hüküm)\s+\d+/gi);
  if (lawMatches) details.legalReferences.push(...lawMatches);
  if (articleMatches) details.legalReferences.push(...articleMatches);

  // Extract time periods
  const timeMatches = fullText.match(/(\d+)\s*(?:gün|hafta|ay|yıl)/g);
  if (timeMatches) {
    details.timePeriods = timeMatches;
  }

  // Check for question words
  details.hasQuestionWords = /(?:nedir|nasıl|neden|hangi|kim|ne zaman|kaç|nerede|ne|mi|mu|mü|mı)/i.test(fullText);

  // Check for content type indicators
  details.isDefinition = /(?:tanımı|kapsamı|unsurları|özellikleri|şartları)/i.test(fullText);
  details.isProcedure = /(?:prosedür|süreç|uygulama|başvuru|talep|bildirim)/i.test(fullText);
  details.isException = /(?:istisna|muafiyet|hariç|dışlama)/i.test(fullText);
  details.isPenalty = /(?:ceza|yaptırım|idari|hukuki|müeyyide)/i.test(fullText);

  // Extract specific tax/legal terms
  const specificTerms = [];
  if (fullText.includes('KDV')) specificTerms.push('KDV');
  if (fullText.includes('stopaj')) specificTerms.push('stopaj');
  if (fullText.includes('ötv')) specificTerms.push('ÖTV');
  if (fullText.includes('gelir vergisi')) specificTerms.push('gelir vergisi');
  if (fullText.includes('kurumlar vergisi')) specificTerms.push('kurumlar vergisi');
  if (fullText.includes('damga vergisi')) specificTerms.push('damga vergisi');

  details.specificTerms = specificTerms;

  return details;
}

/**
 * Determines the most appropriate question type based on content analysis
 */
function determineQuestionType(context: ContentContext, details: SourceDetails): QuestionType {
  if (details.hasQuestionWords) return 'direct_answer';
  if (details.isDefinition) return 'definition';
  if (details.isProcedure) return 'procedure';
  if (details.isException) return 'exception';
  if (details.isPenalty) return 'penalty';
  if (details.legalReferences.length > 0) return 'legal_reference';
  if (details.percentages.length > 0 || details.monetaryValues.length > 0) return 'calculation';
  if (context.sourceType.toLowerCase().includes('özelge')) return 'ruling';
  if (context.sourceType.toLowerCase().includes('danıştay')) return 'court_decision';
  if (context.sourceType.toLowerCase().includes('soru')) return 'faq';

  return 'general_explanation';
}

/**
 * Enhanced natural question patterns for different types of legal/tax inquiries
 * These patterns avoid robotic templates and create more human-like questions
 */
const NATURAL_QUESTION_PATTERNS = {
  // Direct inquiries - more conversational
  direct_answer: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `Sormak istediğim, ${keywords[0]} konusunda ${context.sourceType}'da ne gibi bilgiler var? Bu konuyu biraz açar mısınız?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} ile ilgili olarak, ${context.sourceType} kaynağına göre neler söyleyebilirsiniz? Detaylı bilgi alabilir miyim?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `Merhaba, ${keywords[0]} konusunda yardım istiyorum. ${context.sourceType} bu konuda ne diyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} hakkında biraz konuşabilir miyiz? ${context.sourceType} kaynaklı bilgilerle aydınlatır mısınız?`
  ],

  // Definition requests - more curious and engaging
  definition: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} tam olarak nedir? ${context.sourceType}'a göre tanımını ve kapsamını merak ediyorum.`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} kavramını tam olarak anlayamadım. ${context.sourceType} ne söylüyor bu konuda? Açıklayabilir misiniz?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} hakkında bilgi alabilir miyim? ${context.sourceType} perspektifinden değerlendirirseniz sevinirim.`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} denince aklıma ne gelmeli? ${context.sourceType} nasıl tanımlıyor bu kavramı?`
  ],

  // Procedure inquiries - more practical and action-oriented
  procedure: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} sürecini nasıl takip etmeliyim? ${context.sourceType} bu konuda ne öneriyor? Adım adım anlatır mısınız?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} için ne yapmam gerekiyor? ${context.sourceType} açısından bu süreci nasıl yönetmeliyim?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} işlemine başlamak istiyorum, ancak tam olarak ne yapmam gerektiğini bilmiyorum. ${context.sourceType} bu konuda bana yol gösterebilir mi?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda uzmanınıza sormak istiyorum. Bu süreci ${context.sourceType} bilgileri ışığında nasıl anlatırsınız?`
  ],

  // Exception inquiries - more specific and scenario-based
  exception: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} için bir istisna durumu olabilir mi? Kimler bu istisnadan faydalanabilir? ${context.sourceType} ne diyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda istisnai durumlar var mı? ${context.sourceType} bunları nasıl düzenlemiş?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `Benim durumumda ${keywords[0]} istisnası geçerli olabilir mi? ${context.sourceType} bu konuda ne söylüyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} için hangi özel şartlarda istisna uygulanır? ${context.sourceType} bilgilerini öğrenebilir miyim?`
  ],

  // Penalty inquiries - more consequence-focused
  penalty: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda dikkat etmezsem ne olur? Cezai sonuçları var mı? ${context.sourceType} ne diyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} yükümlülüğünü yerine getirmezsem karşılaşabileceğim sonuçlar nelerdir? ${context.sourceType} bu konuda bana yol gösterebilir mi?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusundaki yaptırımları merak ediyorum. ${context.sourceType} ne tür cezai uygulamalar öngörüyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} ihlalinde ne gibi risklerle karşılaşırım? ${context.sourceType} bu konuda bilgi veriyor mu?`
  ],

  // Legal reference inquiries - more analytical
  legal_reference: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} ile ilgili yasal düzenlemeler nelerdir? ${context.sourceType} bu konuda ne diyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} mevzuatı ne yönde gelişiyor? ${context.sourceType} bilgilerini paylaşır mısınız?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda güncel yasal durum nedir? ${context.sourceType} kaynaklı bilgi alabilir miyim?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} mevzuatı ile ilgili karşımıza çıkabilecek sorunlar nelerdir? ${context.sourceType} bunu nasıl ele alıyor?`
  ],

  // Calculation inquiries - more practical and numerical
  calculation: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} hesaplamasını nasıl yapmalıyım? ${context.sourceType} bu konuda örnek veriyor mu?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} için ödeme tutarını nasıl belirlerim? ${context.sourceType} bilgilerine göre hesaplama yöntemi nedir?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda rakamlarla karşılaşacağım. ${context.sourceType} bunları nasıl açıklıyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} için matrah hesaplamasını merak ediyorum. ${context.sourceType} bu konuda pratik bilgiler veriyor mu?`
  ],

  // Ruling inquiries - more interpretive
  ruling: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} özelgesinin pratikteki anlamı nedir? Bu özelgeyi nasıl uygulamalıyız?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} özelgesi ne anlama geliyor? Bu konuda bana yol gösterir misiniz?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} özelgesini uygulamakta zorlanıyorum. Bu özelgenin gerekçesi nedir?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} özelgesinin bizim durumumuzda bir anlamı var mı? Bunu nasıl değerlendirmeliyiz?`
  ],

  // Court decision inquiries - more jurisprudential
  court_decision: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} kararının bizim için anlamı ne? Bu karar emsal teşkil eder mi?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} kararını nasıl yorumlamalıyız? Bu karar bizi nasıl etkiler?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} kararı ile ilgili yorumlarınızı alabilir miyim? Bu kararın emsal değeri var mı?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} kararı bizi doğrudan ilgilendiriyor mu? Bu kararın sonuçları neler olabilir?`
  ],

  // FAQ inquiries - more problem-solving oriented
  faq: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda sıkça sorulan soruları öğrenebilir miyim? Pratik cevaplar var mı?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} ile ilgili karşılaşılan sorunlar nelerdir? Çözüm önerileri var mı?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} hakkında en çok ne soruluyor? ${context.sourceType} bu sorulara nasıl cevap veriyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda pratik bilgiler arıyorum. ${context.sourceType} örnek olaylar sunuyor mu?`
  ],

  // General explanations - more open and conversational
  general_explanation: [
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} hakkında konuşabilir miyiz? ${context.sourceType} bu konuda ne diyor?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunu anlamaya çalışıyorum. ${context.sourceType} bilgilerini paylaşır mısınız?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} hakkında biraz bilgi alabilir miyim? ${context.sourceType} bu konuda yardımcı olabilir mi?`,
    (keywords: string[], context: ContentContext, details: SourceDetails) =>
      `${keywords[0]} konusunda uzman görüşünü öğrenmek istiyorum. ${context.sourceType} ne diyor bu konuda?`
  ]
};

/**
 * Smart question selector based on content characteristics and user intent patterns
 */
export function selectNaturalQuestionPattern(
  questionType: QuestionType,
  keywords: string[],
  context: ContentContext,
  details: SourceDetails
): string {
  const patterns = NATURAL_QUESTION_PATTERNS[questionType];
  if (!patterns || patterns.length === 0) {
    // Fallback to a simple conversational pattern
    return `${keywords[0]} hakkında ${context.sourceType} bilgisini öğrenebilir miyim?`;
  }

  // Select pattern based on content characteristics for more natural variation
  let patternIndex = 0;

  // Vary patterns based on source type for more natural conversation flow
  if (context.sourceType.includes('Özelge')) {
    patternIndex = keywords.length > 1 ? 1 : 2;
  } else if (context.sourceType.includes('Danıştay')) {
    patternIndex = keywords.length > 1 ? 3 : 0;
  } else if (context.sourceType.includes('Soru')) {
    patternIndex = 2;
  } else if (details.hasQuestionWords) {
    patternIndex = 1;
  } else {
    // Use content length and complexity to vary patterns
    const contentComplexity = (context.title.length + context.excerpt.length) / 2;
    patternIndex = Math.floor(contentComplexity / 50) % patterns.length;
  }

  // Get the selected pattern
  const selectedPattern = patterns[patternIndex % patterns.length];

  // Generate the natural question
  let question = selectedPattern(keywords, context, details);

  // Add natural context enhancers based on source details
  question = enhanceQuestionWithContext(question, context, details);

  return question;
}

/**
 * Extracts natural language phrases from source content for more authentic questions
 */
function extractNaturalPhrases(context: ContentContext): string[] {
  const phrases: string[] = [];
  const fullText = `${context.title} ${context.excerpt}`.toLowerCase();

  // Extract common legal phrase patterns
  const phrasePatterns = [
    /hükmünü [^.]*(bulunur|sair|gerektirir)/gi,
    /kapsamına [^.]*(girer|almaz|girmez)/gi,
    /süresi [^.]*(içinde|sonra)/gi,
    /şartı [^.]*(aranır|gereklidir)/gi,
    /sonuçu [^.]*(doğar|ortaya çıkar)/gi,
    /yükümlülük [^.]*(doğar|ortaya çıkar)/gi,
    /yasal [^.]*(dayanak|temel)/gi,
    /uygulama [^.]*(esasları|ilkeleri)/gi
  ];

  phrasePatterns.forEach(pattern => {
    const matches = fullText.match(pattern);
    if (matches) {
      phrases.push(...matches.map(m => m.charAt(0).toUpperCase() + m.slice(1)));
    }
  });

  // Extract action-oriented phrases
  const actionPatterns = [
    /başvuru [^.]*(yapılır|edilir)/gi,
    /beyan [^.]*(verilir)/gi,
    /ödeme [^.]*(yapılır)/gi,
    /tespit [^.]*(edilir)/gi,
    /denetim [^.]*(yapılır)/gi
  ];

  actionPatterns.forEach(pattern => {
    const matches = fullText.match(pattern);
    if (matches) {
      phrases.push(...matches.map(m => m.charAt(0).toUpperCase() + m.slice(1)));
    }
  });

  return phrases.slice(0, 3); // Limit to top 3 phrases
}

/**
 * Enhances questions with natural context based on source details
 */
function enhanceQuestionWithContext(
  baseQuestion: string,
  context: ContentContext,
  details: SourceDetails
): string {
  let enhancedQuestion = baseQuestion;

  // Extract and use natural phrases from source content
  const naturalPhrases = extractNaturalPhrases(context);
  if (naturalPhrases.length > 0) {
    const phrase = naturalPhrases[0];
    enhancedQuestion += ` Özellikle "${phrase}" ifadesi dikkat çekici.`;
  }

  // Add monetary context naturally
  if (details.monetaryValues.length > 0 && details.monetaryValues.length <= 2) {
    const amounts = details.monetaryValues.join(' ve ');
    enhancedQuestion += ` ${amounts} gibi tutarlar için nasıl bir yol izlenmeli?`;
  }

  // Add percentage context naturally
  if (details.percentages.length > 0 && details.percentages.length <= 2) {
    const rates = details.percentages.join('% ve ') + '%';
    enhancedQuestion += ` ${rates} gibi oranlar ne anlama geliyor?`;
  }

  // Add time period context naturally
  if (details.timePeriods.length > 0) {
    const periods = details.timePeriods.join(' ve ');
    enhancedQuestion += ` ${periods} zamanlaması nasıl takip edilmeli?`;
  }

  // Add specific terms context naturally
  if (details.specificTerms.length > 0) {
    const terms = details.specificTerms.slice(0, 2).join(' ve ');
    enhancedQuestion += ` ${terms} ile ilişkisi nasıl?`;
  }

  // Add legal references context naturally
  if (details.legalReferences.length > 0 && details.legalReferences.length <= 2) {
    const references = details.legalReferences.join(' ve ');
    enhancedQuestion += ` ${references} hükümleri nasıl uygulanıyor?`;
  }

  // Add confidence context naturally
  if (context.relevanceScore) {
    const confidence = context.relevanceScore >= 80 ? 'yüksek' :
                     context.relevanceScore >= 60 ? 'orta' : 'düşük';
    enhancedQuestion += ` (Benzerlik: ${Math.round(context.relevanceScore)}% - ${confidence} doğrulukta)`;
  }

  return enhancedQuestion;
}


/**
 * Gets color for keyword based on type using light marker colors with proper dark mode support
 */
export function getKeywordColor(keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();

  // Use light marker colors with black text for light mode and adjusted colors for dark mode
  if (lowerKeyword.includes('kdv') || lowerKeyword.includes('vergi')) {
    return 'bg-blue-200 text-gray-900 hover:bg-blue-300 dark:bg-blue-800 dark:text-blue-100';
  }
  if (lowerKeyword.includes('danıştay') || lowerKeyword.includes('karar')) {
    return 'bg-purple-200 text-gray-900 hover:bg-purple-300 dark:bg-purple-800 dark:text-purple-100';
  }
  if (lowerKeyword.includes('özelge')) {
    return 'bg-green-200 text-gray-900 hover:bg-green-300 dark:bg-green-800 dark:text-green-100';
  }
  if (lowerKeyword.includes('soru') || lowerKeyword.includes('cevap')) {
    return 'bg-yellow-200 text-gray-900 hover:bg-yellow-300 dark:bg-yellow-700 dark:text-yellow-100';
  }
  if (lowerKeyword.includes('kanun') || lowerKeyword.includes('yönetmelik')) {
    return 'bg-indigo-200 text-gray-900 hover:bg-indigo-300 dark:bg-indigo-800 dark:text-indigo-100';
  }
  if (lowerKeyword.includes('süre') || lowerKeyword.includes('tarih')) {
    return 'bg-pink-200 text-gray-900 hover:bg-pink-300 dark:bg-pink-800 dark:text-pink-100';
  }
  if (lowerKeyword.includes('ceza') || lowerKeyword.includes('yaptırım')) {
    return 'bg-red-200 text-gray-900 hover:bg-red-300 dark:bg-red-800 dark:text-red-100';
  }

  return 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100';
}