/**
 * Test script for enhanced question generation system
 * This demonstrates the improvements made to natural language question generation
 */

import {
  extractSemanticKeywords,
  generateSearchQueryFromKeywords,
  selectNaturalQuestionPattern,
  extractSourceDetails,
  determineQuestionType
} from './src/utils/keyword-extraction.js';

// Test cases for different source types and content
const testCases = [
  {
    title: 'KDV iade işlemleri',
    excerpt: 'KDV iade talepleri için gerekli belgeler ve başvuru süreci',
    category: 'Mevzuat',
    sourceType: 'Özelgeler',
    relevanceScore: 85
  },
  {
    title: 'Stopaj oranları ve istisnaları',
    excerpt: 'Stopaj uygulamasında 15% oran ve belirli şartlarda istisna',
    category: 'Mevzuat',
    sourceType: 'Soru-Cevap',
    relevanceScore: 72
  },
  {
    title: 'Danıştay Kararı: Vergi Ziyaı Cezası',
    excerpt: 'Karar No: 2024/1234, vergi ziyaı cezasının uygulanması ve hukuki dayanakları',
    category: 'İçtihat',
    sourceType: 'Danıştay Kararları',
    relevanceScore: 90
  },
  {
    title: 'Gelir Vergisi Matrahı Hesaplaması',
    excerpt: 'Gelir vergisi matrahının tespiti ve 500 TL limiti',
    category: 'Mevzuat',
    sourceType: 'Mevzuat',
    relevanceScore: 68
  }
];

console.log('=== ENHANCED QUESTION GENERATION TEST ===\n');

testCases.forEach((testCase, index) => {
  console.log(`Test Case ${index + 1}:`);
  console.log(`Title: ${testCase.title}`);
  console.log(`Source: ${testCase.sourceType}`);
  console.log(`Category: ${testCase.category}`);
  console.log(`Relevance: ${testCase.relevanceScore}%`);

  const context = {
    title: testCase.title,
    excerpt: testCase.excerpt,
    category: testCase.category,
    sourceType: testCase.sourceType,
    relevanceScore: testCase.relevanceScore
  };

  // Test enhanced keyword extraction
  const keywords = extractSemanticKeywords(context);
  console.log(`Keywords: ${keywords.keywords.join(', ')}`);
  console.log(`Primary Topic: ${keywords.primaryTopic}`);

  // Test source details extraction
  const details = extractSourceDetails(context);
  console.log(`Details: ${details.percentages.join(', ') || 'N/A'} rates, ${details.specificTerms.join(', ') || 'N/A'} terms`);

  // Test question type determination
  const questionType = determineQuestionType(context, details);
  console.log(`Question Type: ${questionType}`);

  // Test enhanced question generation
  const generatedQuery = generateSearchQueryFromKeywords(keywords.keywords.slice(0, 3), context);
  console.log(`Generated Question: ${generatedQuery}`);

  // Test natural pattern selection
  const naturalQuestion = selectNaturalQuestionPattern(questionType, keywords.keywords.slice(0, 3), context, details);
  console.log(`Natural Question: ${naturalQuestion}`);

  console.log('---\n');
});

console.log('=== IMPROVEMENTS SUMMARY ===');
console.log('1. More natural Turkish language patterns');
console.log('2. Context-aware question generation');
console.log('3. Varied question patterns instead of templates');
console.log('4. Conversational tone while maintaining professionalism');
console.log('5. Better utilization of actual source content');
console.log('6. Smart pattern selection based on content characteristics');
console.log('7. Natural phrase extraction from source content');