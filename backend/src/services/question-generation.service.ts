import { LLMManager } from './llm-manager.service';
import { tableConfigService } from '../config/table-config.service';
import { lsembPool } from '../config/database.config';

export interface QuestionGenerationContext {
  title: string;
  content: string;
  sourceTable: string;
  sourceId: string;
  category?: string;
  relevanceScore?: number;
  language?: string;
}

export interface GeneratedQuestion {
  question: string;
  type: 'definition' | 'procedure' | 'calculation' | 'legal_reference' | 'comparison' | 'scenario' | 'general';
  confidence: number;
  keywords: string[];
}

/**
 * Dynamic Question Generation Service
 * Generates diverse, context-aware questions without hardcoded templates
 */
class QuestionGenerationService {
  private llmManager: LLMManager;
  private cache: Map<string, GeneratedQuestion[]> = new Map();
  private cacheExpiry = 1800000; // 30 minutes

  constructor() {
    this.llmManager = LLMManager.getInstance();
  }

  /**
   * Generate questions from content dynamically
   */
  async generateQuestions(context: QuestionGenerationContext, count: number = 1): Promise<GeneratedQuestion[]> {
    const cacheKey = `${context.sourceTable}-${context.sourceId}`;
    const cached = this.cache.get(cacheKey);

    // Return cached questions if available
    if (cached && Date.now() - this.getCacheTimestamp(cacheKey) < this.cacheExpiry) {
      return cached.slice(0, count);
    }

    try {
      // Analyze content to determine question type
      const contentType = await this.analyzeContentType(context);

      // Generate questions based on content analysis
      const questions = await this.generateQuestionsByType(context, contentType, count);

      // Cache the results
      this.cache.set(cacheKey, questions);
      this.setCacheTimestamp(cacheKey);

      return questions;
    } catch (error) {
      console.error('Error generating questions:', error);
      return this.generateFallbackQuestions(context, count);
    }
  }

  /**
   * Analyze content to determine its type and characteristics
   */
  private async analyzeContentType(context: QuestionGenerationContext): Promise<{
    type: string;
    hasNumbers: boolean;
    hasPercentages: boolean;
    hasDates: boolean;
    hasLegalRefs: boolean;
    hasQuestions: boolean;
    complexity: 'low' | 'medium' | 'high';
    language: 'en' | 'tr' | 'unknown';
  }> {
    const content = `${context.title} ${context.content}`.toLowerCase();

    // Detect language
    const turkishChars = /[çğıöşü]/i;
    const turkishWords = /\b(ve|ile|için|hakkında|nedir|nasıl|neden|kim|hangi)\b/i;
    const language = turkishChars.test(content) || turkishWords.test(content) ? 'tr' : 'en';

    // Detect content characteristics
    const hasNumbers = /\d+/.test(content);
    const hasPercentages = /%\d+|\d+%/.test(content);
    const hasDates = /\d{1,4}[/-]\d{1,2}[/-]\d{2,4}/.test(content);
    const hasLegalRefs = /(kanun|tüzük|yönetmelik|madde|hüküm|law|article|section)/i.test(content);
    const hasQuestions = /\?|nedir|what|how|why|nasıl|kaç|how many/i.test(content);

    // Determine complexity based on content length and structure
    const wordCount = content.split(/\s+/).length;
    const complexity = wordCount < 50 ? 'low' : wordCount < 200 ? 'medium' : 'high';

    // Determine primary content type
    let type = 'general';
    if (hasLegalRefs) type = 'legal_reference';
    else if (hasPercentages || /\d+(?:\.\d+)?\s*(?:tl|€|$|£)/i.test(content)) type = 'calculation';
    else if (hasDates || /süre|zaman|time|deadline/i.test(content)) type = 'procedure';
    else if (/tanımı|definition|what is|nedir/i.test(content)) type = 'definition';

    return {
      type,
      hasNumbers,
      hasPercentages,
      hasDates,
      hasLegalRefs,
      hasQuestions,
      complexity,
      language
    };
  }

  /**
   * Generate questions based on content type analysis
   */
  private async generateQuestionsByType(
    context: QuestionGenerationContext,
    analysis: any,
    count: number
  ): Promise<GeneratedQuestion[]> {
    const { language, type, hasPercentages, hasLegalRefs } = analysis;

    // Build dynamic prompt based on analysis
    const prompt = this.buildDynamicPrompt(context, analysis, count);

    try {
      // Generate questions using LLM
      const response = await this.llmManager.generateCompletion({
        prompt,
        maxTokens: 300,
        temperature: 0.8, // Higher temperature for more diversity
        model: 'gpt-3.5-turbo-instruct' // Use instruction-tuned model
      });

      // Parse and validate questions
      const questions = this.parseQuestionsResponse(response, context);

      // Ensure we have enough questions
      while (questions.length < count) {
        const fallback = this.generateDynamicFallback(context, analysis, questions.length);
        questions.push(fallback);
      }

      return questions.slice(0, count);
    } catch (error) {
      console.error('LLM question generation failed:', error);
      return this.generateDynamicFallbackQuestions(context, analysis, count);
    }
  }

  /**
   * Build dynamic prompt based on content analysis
   */
  private buildDynamicPrompt(context: QuestionGenerationContext, analysis: any, count: number): string {
    const { title, content, sourceTable } = context;
    const { language, type, complexity } = analysis;

    const isTurkish = language === 'tr';

    let prompt = isTurkish ?
      `Aşağıdaki belge analizine dayalı olarak ${count} adet farklı ve anlamlı soru üret:\n\n` :
      `Generate ${count} diverse and meaningful questions based on the following document analysis:\n\n`;

    prompt += `Başlık: ${title}\n`;
    prompt += `İçerik: ${content.substring(0, 500)}...\n`;
    prompt += `Tablo: ${sourceTable}\n`;
    prompt += `Tür: ${type}\n`;
    prompt += `Karmaşıklık: ${complexity}\n\n`;

    if (isTurkish) {
      prompt += `Yönergeler:\n`;
      prompt += `1. Sorular çeşitli tiplerde olmalı (tanım, prosedür, hesaplama, yasal referans)\n`;
      prompt += `2. Sorular doğal ve insan gibi olmalı, robotik değil\n`;
      prompt += `3. Her soru farklı bir açıdan yaklaşmalı\n`;
      prompt += `4. Sorular 15-20 kelime arasında olmalı\n`;
      prompt += `5. Numaralandırma kullanmadan her soruyu yeni satıra yaz\n\n`;
    } else {
      prompt += `Guidelines:\n`;
      prompt += `1. Questions should be diverse types (definition, procedure, calculation, legal reference)\n`;
      prompt += `2. Questions should be natural and human-like, not robotic\n`;
      prompt += `3. Each question should approach from different angle\n`;
      prompt += `4. Questions should be 15-20 words each\n`;
      prompt += `5. Write each question on new line without numbering\n\n`;
    }

    return prompt;
  }

  /**
   * Parse LLM response into structured questions
   */
  private parseQuestionsResponse(response: string, context: QuestionGenerationContext): GeneratedQuestion[] {
    const lines = response.split('\n').filter(line => line.trim().length > 10);
    const questions: GeneratedQuestion[] = [];

    lines.forEach(line => {
      const cleanLine = line.replace(/^\d+[\.\)]\s*/, '').trim();

      if (cleanLine.length > 10 && !cleanLine.match(/^(soru|question)/i)) {
        questions.push({
          question: cleanLine,
          type: this.determineQuestionType(cleanLine),
          confidence: 0.8,
          keywords: this.extractKeywords(cleanLine)
        });
      }
    });

    return questions;
  }

  /**
   * Determine question type from content
   */
  private determineQuestionType(question: string): GeneratedQuestion['type'] {
    const lower = question.toLowerCase();

    if (lower.includes('nedir') || lower.includes('what is') || lower.includes('tanımı')) {
      return 'definition';
    }
    if (lower.includes('nasıl') || lower.includes('how to') || lower.includes('prosedür')) {
      return 'procedure';
    }
    if (lower.includes('hesap') || lower.includes('calculate') || lower.includes('kaç')) {
      return 'calculation';
    }
    if (lower.includes('kanun') || lower.includes('law') || lower.includes('madde')) {
      return 'legal_reference';
    }
    if (lower.includes('fark') || lower.includes('karşılaştır') || lower.includes('compare')) {
      return 'comparison';
    }
    if (lower.includes('durumunda') || lower.includes('if') || lower.includes('senaryo')) {
      return 'scenario';
    }

    return 'general';
  }

  /**
   * Extract keywords from question
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['ve', 'ile', 'için', 'hakkında', 'nasıl', 'ne', 'the', 'and', 'for', 'about', 'how', 'what']);

    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 5);
  }

  /**
   * Generate dynamic fallback questions
   */
  private generateDynamicFallbackQuestions(
    context: QuestionGenerationContext,
    analysis: any,
    count: number
  ): GeneratedQuestion[] {
    const questions: GeneratedQuestion[] = [];
    const { title, content, sourceTable } = context;
    const { type, language, hasPercentages, hasLegalRefs } = analysis;
    const isTurkish = language === 'tr';

    // Extract key entities from content
    const entities = this.extractEntities(content);

    for (let i = 0; i < count; i++) {
      let question: string;
      let questionType: GeneratedQuestion['type'] = 'general';

      // Generate different question types based on iteration
      switch (i % 5) {
        case 0: // Definition type
          question = isTurkish ?
            `${entities[0] || title} kavramının kapsamı ve uygulama alanları nelerdir?` :
            `What are the scope and application areas of ${entities[0] || title}?`;
          questionType = 'definition';
          break;

        case 1: // Procedure type
          question = isTurkish ?
            `${entities[1] || title} sürecinde dikkat edilmesi gereken hususlar var mıdır?` :
            `Are there important considerations to be aware of in the ${entities[1] || title} process?`;
          questionType = 'procedure';
          break;

        case 2: // Calculation type (if percentages/numbers exist)
          if (hasPercentages) {
            question = isTurkish ?
              `${title} ile ilgili oranların hesaplama yöntemi nasıldır?` :
              `What is the calculation method for the rates related to ${title}?`;
            questionType = 'calculation';
          } else {
            question = isTurkish ?
              `${title} konusundaki mali yükümlülükler nelerdir?` :
              `What are the financial obligations related to ${title}?`;
            questionType = 'general';
          }
          break;

        case 3: // Legal reference type
          question = isTurkish ?
            `${title} ile ilgili yasal düzenlemeler ve temel referanslar hangileridir?` :
            `What are the legal regulations and fundamental references related to ${title}?`;
          questionType = 'legal_reference';
          break;

        case 4: // Scenario type
          question = isTurkish ?
            `${entities[2] || title} konusunda pratik uygulamada karşılaşılan durumlar nelerdir?` :
            `What are the practical situations encountered regarding ${entities[2] || title}?`;
          questionType = 'scenario';
          break;

        default:
          question = isTurkish ?
            `${title} hakkında detaylı bilgi alabilir miyim?` :
            `Can I get detailed information about ${title}?`;
          questionType = 'general';
      }

      questions.push({
        question,
        type: questionType,
        confidence: 0.6,
        keywords: entities.slice(0, 3)
      });
    }

    return questions;
  }

  /**
   * Extract entities from content
   */
  private extractEntities(content: string): string[] {
    const entities: string[] = [];

    // Extract capitalized phrases
    const matches = content.match(/[A-ZÇĞÖŞÜİ][a-zçğıöşü]+(?:\s+[A-ZÇĞÖŞÜİ][a-zçğıöşü]+)*/g);
    if (matches) {
      entities.push(...matches.slice(0, 3));
    }

    // Extract percentages
    const percents = content.match(/\d+(?:\.\d+)?%/g);
    if (percents) {
      entities.push(percents[0]);
    }

    // Extract monetary values
    const money = content.match(/\d+(?:\.\d+)?\s*(?:TL|€|$|£|₺)/gi);
    if (money) {
      entities.push(money[0]);
    }

    return entities.filter(e => e.length > 2);
  }

  /**
   * Generate fallback questions without LLM
   */
  private generateFallbackQuestions(context: QuestionGenerationContext, count: number): GeneratedQuestion[] {
    const { title, sourceTable } = context;
    const questions: GeneratedQuestion[] = [];

    for (let i = 0; i < count; i++) {
      questions.push({
        question: `${title} hakkında bilgi verir misiniz?`,
        type: 'general',
        confidence: 0.3,
        keywords: [title, sourceTable]
      });
    }

    return questions;
  }

  /**
   * Generate single dynamic fallback question
   */
  private generateDynamicFallback(context: QuestionGenerationContext, analysis: any, index: number): GeneratedQuestion {
    const { title } = context;
    const { type } = analysis;

    const templates = {
      definition: [
        `${title} ne anlama gelir?`,
        `${title} kavramını açıklar mısınız?`
      ],
      procedure: [
        `${title} nasıl yapılır?`,
        `${title} sürecini izah eder misiniz?`
      ],
      calculation: [
        `${title} hesabı nasıl yapılır?`,
        `${title} için formül nedir?`
      ],
      legal_reference: [
        `${title} ile ilgili yasal dayanaklar?`,
        `${title} hangi kanuna tabidir?`
      ]
    };

    const typeTemplates = templates[type] || templates.definition;
    const question = typeTemplates[index % typeTemplates.length];

    return {
      question,
      type: type as GeneratedQuestion['type'],
      confidence: 0.5,
      keywords: [title]
    };
  }

  // Cache helper methods
  private cacheTimestamps: Map<string, number> = new Map();

  private getCacheTimestamp(key: string): number {
    return this.cacheTimestamps.get(key) || 0;
  }

  private setCacheTimestamp(key: string): void {
    this.cacheTimestamps.set(key, Date.now());
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }
}

// Export singleton instance
export const questionGenerationService = new QuestionGenerationService();
export default questionGenerationService;