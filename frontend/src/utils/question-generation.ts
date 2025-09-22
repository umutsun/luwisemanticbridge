// Utility functions for generating questions from sources
export interface Source {
  id?: string;
  title?: string;
  content?: string;
  excerpt?: string;
  category?: string;
  sourceTable?: string;
  relevanceScore?: number;
  score?: number;
}

// Generate a contextual question from source content
export const generateQuestionFromSource = (source: Source): string => {
  const { title, content, excerpt, category, sourceTable } = source;

  // Clean up title and content
  const cleanTitle = (title || '').replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '');
  const mainContent = excerpt || content || '';
  const cleanContent = mainContent.replace(/^Cevap:\s*/i, '').trim();

  // Extract key information
  const firstSentence = cleanContent.split(/[.!?]/)[0]?.trim() || '';
  const keyTerms = extractKeyTerms(cleanTitle + ' ' + firstSentence);

  // Category-specific templates
  const templatesByCategory = {
    'Mevzuat': [
      `${cleanTitle} hükmünün uygulama alanı nedir?`,
      `${cleanTitle} hakkında detaylı açıklama yapabilir misiniz?`,
      `${cleanTitle} kimleri kapsar ve istisnaları nelerdir?`
    ],
    'Soru-Cevap': [
      `${cleanTitle} konusunda benzer durumlar için ne önerirsiniz?`,
      `${cleanContent.substring(0, 60)}... bu durumda nasıl bir yol izlenmeli?`,
      `${cleanTitle} ile ilgili örnek bir uygulama gösterebilir misiniz?`
    ],
    'Makale': [
      `${cleanTitle} başlıklı makalenin ana argümanları nelerdir?`,
      `${cleanTitle} konusundaki güncel tartışmalar nelerdir?`,
      `${cleanTitle} ile ilgili pratik önerileriniz nelerdir?`
    ],
    'Özelge': [
      `${cleanTitle} özelgesinin kapsamı nedir?`,
      `${cleanTitle} hangi durumlarda uygulanır?`,
      `${cleanTitle} hakkında emsal kararlar var mı?`
    ],
    'Danıştay': [
      `${cleanTitle} kararının hukuki dayanakları nelerdir?`,
      `${cleanTitle} kararı emsal teşkil eder mi?`,
      `${cleanTitle} kararının uygulama sonuçları nelerdir?`
    ]
  };

  // Get relevant templates or use default
  const categoryKey = category as keyof typeof templatesByCategory || 'default';
  const templates = templatesByCategory[categoryKey] || templatesByCategory['Mevzuat'];

  // Select template based on content characteristics
  let selectedTemplate = templates[0];

  if (cleanContent.length > 100) {
    selectedTemplate = templates[1];
  } else if (keyTerms.includes('örnek') || keyTerms.includes('nasıl')) {
    selectedTemplate = templates[2];
  }

  // Replace placeholders with actual content
  let question = selectedTemplate;

  // Add context if available
  if (keyTerms.length > 0 && !question.includes(keyTerms[0])) {
    question += ` (${keyTerms.slice(0, 3).join(', ')})`;
  }

  return question;
};

// Extract key terms from text
const extractKeyTerms = (text: string): string[] => {
  const terms: string[] = [];

  // Common legal/tax terms in Turkish
  const legalTerms = [
    'vergi', 'tazminat', 'sözleşme', 'kanun', 'yönetmelik', 'tebliğ',
    'karar', 'emsal', 'istisna', 'muafiyet', 'oran', 'tutar', 'süre',
    'başvuru', 'dava', 'itiraz', 'uzlaşma', 'tarhiyat', 'ceza'
  ];

  // Extract percentages
  const percentMatches = text.match(/(\d+)%/g);
  if (percentMatches) {
    terms.push(...percentMatches);
  }

  // Extract amounts
  const amountMatches = text.match(/(\d+(?:\.\d+)?)\s*(TL|TRY|€|\$)/g);
  if (amountMatches) {
    terms.push(...amountMatches);
  }

  // Extract legal terms
  legalTerms.forEach(term => {
    if (text.toLowerCase().includes(term)) {
      terms.push(term);
    }
  });

  // Extract unique words longer than 4 characters
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 4);

  const wordFreq: { [key: string]: number } = {};
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });

  // Get most frequent words
  const frequentWords = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);

  return [...terms, ...frequentWords].slice(0, 6);
};

// Generate multiple question options
export const generateQuestionOptions = (source: Source, count: number = 3): string[] => {
  const questions: string[] = [];
  const baseQuestion = generateQuestionFromSource(source);

  questions.push(baseQuestion);

  // Variations
  const variations = [
    `${source.title} hakkında daha fazla detay verebilir misiniz?`,
    `${source.category || 'Bu konu'} ile ilgili pratik bilgiler paylaşır mısınız?`,
    `${source.title} konusunda dikkat edilmesi gereken önemli noktalar nelerdir?`
  ];

  for (let i = 1; i < count && i < variations.length; i++) {
    questions.push(variations[i - 1]);
  }

  return questions;
};