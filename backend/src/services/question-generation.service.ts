import { LLMManager } from './llm-manager.service';
import { tableConfigService } from '../config/table-config.service';
import { lsembPool } from '../config/database.config';
import { dataSchemaService } from './data-schema.service';
import crypto from 'crypto';

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
 * Clean title from PDF/file metadata and technical noise
 */
function cleanTitle(title: string): string {
  return title
    // Remove PDF/file extensions and patterns
    .replace(/\.pdf$/i, '')
    .replace(/\s*-\s*(?:page|sayfa|bölüm|part)\s*\d+/gi, '')
    .replace(/\s*\((?:page|sayfa|bölüm|part)\s*\d+[^)]*\)/gi, '')
    // Remove ID patterns
    .replace(/\s*-\s*ID:\s*\d+/gi, '')
    .replace(/\s*\[ID:\s*\d+\]/gi, '')
    // Remove chunk/part indicators
    .replace(/\s*\(Part\s*\d+\/\d+\)/gi, '')
    .replace(/\s*\(Chunk\s*\d+\)/gi, '')
    // Remove common prefixes from table names
    .replace(/^(?:sorucevap|ozelgeler|mevzuat|makaleler)\s*-\s*/gi, '')
    // Clean up multiple spaces and trim
    .replace(/\s+/g, ' ')
    .trim();
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
      const result = await this.llmManager.generateChatResponse(prompt, {
        maxTokens: 300,
        temperature: 0.8 // Higher temperature for more diversity
      });

      // Parse and validate questions
      const questions = this.parseQuestionsResponse(result.content, context);

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
    const cleanedTitle = cleanTitle(title);
    const { language, type, complexity } = analysis;

    const isTurkish = language === 'tr';

    let prompt = isTurkish ?
      `Aşağıdaki belge analizine dayalı olarak ${count} adet farklı ve anlamlı soru üret:\n\n` :
      `Generate ${count} diverse and meaningful questions based on the following document analysis:\n\n`;

    prompt += `Konu: ${cleanedTitle}\n`;
    prompt += `İçerik: ${content.substring(0, 500)}...\n`;
    prompt += `Kaynak: ${sourceTable}\n`;
    prompt += `Tür: ${type}\n`;
    prompt += `Karmaşıklık: ${complexity}\n\n`;

    if (isTurkish) {
      prompt += `Yönergeler:\n`;
      prompt += `1. Sorular çeşitli tiplerde olmalı (tanım, prosedür, hesaplama, yasal referans)\n`;
      prompt += `2. Sorular doğal ve insan gibi olmalı, robotik değil\n`;
      prompt += `3. Her soru farklı bir açıdan yaklaşmalı\n`;
      prompt += `4. Sorular 15-20 kelime arasında olmalı\n`;
      prompt += `5. Numaralandırma kullanmadan her soruyu yeni satıra yaz\n`;
      prompt += `6. ASLA dosya adı (.pdf, .docx vb.) veya teknik terimler (ID, chunk, page) kullanma\n`;
      prompt += `7. Bağlama uygun, konuya odaklı sorular üret\n\n`;
    } else {
      prompt += `Guidelines:\n`;
      prompt += `1. Questions should be diverse types (definition, procedure, calculation, legal reference)\n`;
      prompt += `2. Questions should be natural and human-like, not robotic\n`;
      prompt += `3. Each question should approach from different angle\n`;
      prompt += `4. Questions should be 15-20 words each\n`;
      prompt += `5. Write each question on new line without numbering\n`;
      prompt += `6. NEVER use file names (.pdf, .docx etc.) or technical terms (ID, chunk, page)\n`;
      prompt += `7. Generate context-aware, topic-focused questions\n\n`;
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
    const { title, content } = context;
    const cleanedTitle = cleanTitle(title);
    const { language, hasPercentages } = analysis;
    const isTurkish = language === 'tr';

    // Extract key entities from content (not from title to avoid PDF names)
    const entities = this.extractEntities(content);
    // Use cleanedTitle as fallback if no entities found
    const topic = entities[0] || cleanedTitle;

    for (let i = 0; i < count; i++) {
      let question: string;
      let questionType: GeneratedQuestion['type'] = 'general';

      // Generate different question types based on iteration
      switch (i % 5) {
        case 0: // Definition type
          question = isTurkish ?
            `${topic} kavramının kapsamı ve uygulama alanları nelerdir?` :
            `What are the scope and application areas of ${topic}?`;
          questionType = 'definition';
          break;

        case 1: // Procedure type
          question = isTurkish ?
            `${entities[1] || topic} sürecinde dikkat edilmesi gereken hususlar var mıdır?` :
            `Are there important considerations to be aware of in the ${entities[1] || topic} process?`;
          questionType = 'procedure';
          break;

        case 2: // Calculation type (if percentages/numbers exist)
          if (hasPercentages) {
            question = isTurkish ?
              `Bu konu ile ilgili oranların hesaplama yöntemi nasıldır?` :
              `What is the calculation method for the rates related to this topic?`;
            questionType = 'calculation';
          } else {
            question = isTurkish ?
              `${topic} konusundaki mali yükümlülükler nelerdir?` :
              `What are the financial obligations related to ${topic}?`;
            questionType = 'general';
          }
          break;

        case 3: // Legal reference type
          question = isTurkish ?
            `${topic} ile ilgili yasal düzenlemeler ve temel referanslar hangileridir?` :
            `What are the legal regulations and fundamental references related to ${topic}?`;
          questionType = 'legal_reference';
          break;

        case 4: // Scenario type
          question = isTurkish ?
            `${entities[2] || topic} konusunda pratik uygulamada karşılaşılan durumlar nelerdir?` :
            `What are the practical situations encountered regarding ${entities[2] || topic}?`;
          questionType = 'scenario';
          break;

        default:
          question = isTurkish ?
            `${topic} hakkında detaylı bilgi alabilir miyim?` :
            `Can I get detailed information about ${topic}?`;
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
    const { title, content, sourceTable } = context;
    const cleanedTitle = cleanTitle(title);
    // Try to extract a topic from content if title is generic
    const entities = this.extractEntities(content);
    const topic = entities[0] || cleanedTitle;
    const questions: GeneratedQuestion[] = [];

    for (let i = 0; i < count; i++) {
      questions.push({
        question: `${topic} hakkında bilgi verir misiniz?`,
        type: 'general',
        confidence: 0.3,
        keywords: entities.slice(0, 2)
      });
    }

    return questions;
  }

  /**
   * Generate single dynamic fallback question
   */
  private generateDynamicFallback(context: QuestionGenerationContext, analysis: any, index: number): GeneratedQuestion {
    const { title, content } = context;
    const cleanedTitle = cleanTitle(title);
    const entities = this.extractEntities(content);
    const topic = entities[0] || cleanedTitle;
    const { type } = analysis;

    const templates = {
      definition: [
        `${topic} ne anlama gelir?`,
        `Bu kavramı açıklar mısınız?`
      ],
      procedure: [
        `Bu işlem nasıl yapılır?`,
        `${topic} sürecini izah eder misiniz?`
      ],
      calculation: [
        `Hesaplama nasıl yapılır?`,
        `Bu konudaki oran ve tutarlar nedir?`
      ],
      legal_reference: [
        `${topic} ile ilgili yasal dayanaklar nelerdir?`,
        `Bu konu hangi mevzuata tabidir?`
      ]
    };

    const typeTemplates = templates[type] || templates.definition;
    const question = typeTemplates[index % typeTemplates.length];

    return {
      question,
      type: type as GeneratedQuestion['type'],
      confidence: 0.5,
      keywords: entities.slice(0, 2)
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
   * Generate schema-aware welcome questions using Redis cache pool
   * Combines LLM-generated questions with user query history
   * Returns random selection from cached pool
   */
  async generateWelcomeQuestions(schemaContext: {
    schemaName: string;
    description?: string;
    categories?: string[];
    sampleContent?: string;
    userId?: string;
  }, count: number = 4): Promise<string[]> {
    console.log(`[QuestionGen] generateWelcomeQuestions called for schema: ${schemaContext.schemaName}`);
    try {
      const { redis } = await import('../config/redis');
      const redisKey = `suggestions:${schemaContext.schemaName}`;

      // Try to get questions from Redis pool
      const cachedPool = await redis.get(redisKey);

      if (cachedPool) {
        const questionPool = JSON.parse(cachedPool);
        // Return random selection from pool
        return this.getRandomQuestions(questionPool, count);
      }

      // No cache: generate new pool
      console.log(`[QuestionGen] No cache found, building question pool...`);
      const questionPool = await this.buildQuestionPool(schemaContext);
      console.log(`[QuestionGen] Question pool built with ${questionPool.length} questions`);

      // Store in Redis with 1 hour expiry (shorter for more variety)
      if (questionPool.length > 0) {
        await redis.setex(redisKey, 3600, JSON.stringify(questionPool));
        console.log(`[QuestionGen] Pool cached in Redis for 1 hour`);
      }

      return this.getRandomQuestions(questionPool, count);
    } catch (error) {
      console.error('[QuestionGen] Error generating welcome questions:', error);
      return this.generateFallbackWelcomeQuestions(schemaContext, count);
    }
  }

  /**
   * Build question pool from multiple sources
   */
  private async buildQuestionPool(schemaContext: {
    schemaName: string;
    description?: string;
    categories?: string[];
    sampleContent?: string;
    userId?: string;
  }): Promise<string[]> {
    const questionPool: string[] = [];

    // 1. Get questions from schema's example_questions (tenant-specific)
    console.log('[QuestionGen] Fetching schema example questions...');
    const schemaQuestions = await this.getSchemaExampleQuestions();
    if (schemaQuestions.length > 0) {
      console.log(`[QuestionGen] Added ${schemaQuestions.length} questions from schema`);
      questionPool.push(...schemaQuestions);
    }

    // 2. Get questions from user pool (real user questions)
    console.log('[QuestionGen] Fetching user pool questions...');
    const userPoolQuestions = await this.getUserPoolQuestions(15);
    if (userPoolQuestions.length > 0) {
      console.log(`[QuestionGen] Added ${userPoolQuestions.length} questions from user pool`);
      questionPool.push(...userPoolQuestions);
    }

    // 3. Get actual data source statistics for richer context
    const dataSourceStats = await this.getDataSourceStats();

    // 4. Enrich schema context with real data info
    const enrichedContext = {
      ...schemaContext,
      dataSourceStats
    };

    // 5. Generate LLM questions with rich context (complement existing questions)
    const targetLLMCount = Math.max(5, 25 - questionPool.length); // Fill up to ~25 total
    const llmQuestions = await this.generateLLMQuestionsEnriched(enrichedContext, targetLLMCount);
    questionPool.push(...llmQuestions);

    console.log(`[QuestionGen] Total pool: ${questionPool.length} questions (${schemaQuestions.length} schema + ${userPoolQuestions.length} user + ${llmQuestions.length} LLM)`);

    // Remove duplicates and return
    return [...new Set(questionPool)];
  }

  /**
   * Get example questions from active schema configuration
   */
  private async getSchemaExampleQuestions(): Promise<string[]> {
    try {
      const config = await dataSchemaService.loadConfig();
      const activeSchema = config.schemas.find(s => s.id === config.activeSchemaId);

      if (activeSchema?.templates?.example_questions) {
        return activeSchema.templates.example_questions;
      }

      return [];
    } catch (error) {
      console.log('[QuestionGen] Could not load schema example questions');
      return [];
    }
  }

  /**
   * Get data source statistics for context
   */
  private async getDataSourceStats(): Promise<{ table: string; count: number; displayName: string }[]> {
    try {
      const result = await lsembPool.query(`
        SELECT source_table, COUNT(*) as cnt
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY cnt DESC
        LIMIT 6
      `);

      // Map table names to Turkish display names
      const tableDisplayNames: Record<string, string> = {
        'csv_danistaykararlari': 'Danıştay Kararları',
        'csv_ozelge': 'Özelgeler (Vergi Görüşleri)',
        'csv_sorucevap': 'Soru-Cevap Arşivi',
        'csv_makale_arsiv_2022': 'Vergi Makaleleri (2022)',
        'csv_makale_arsiv_2021': 'Vergi Makaleleri (2021)',
        'csv_makale_arsiv_2023': 'Vergi Makaleleri (2023)',
        'csv_makale_arsiv_2024': 'Vergi Makaleleri (2024)',
        'csv_maliansiklopedi': 'Mali Ansiklopedi',
        'documents': 'Yüklenen Belgeler'
      };

      return result.rows.map(row => ({
        table: row.source_table,
        count: parseInt(row.cnt),
        displayName: tableDisplayNames[row.source_table] || row.source_table
      }));
    } catch (error) {
      console.error('Error fetching data source stats:', error);
      return [];
    }
  }

  /**
   * Generate LLM questions with enriched context
   */
  private async generateLLMQuestionsEnriched(context: {
    schemaName: string;
    description?: string;
    categories?: string[];
    sampleContent?: string;
    dataSourceStats?: { table: string; count: number; displayName: string }[];
  }, count: number = 15): Promise<string[]> {
    console.log(`[QuestionGen] generateLLMQuestionsEnriched called`);
    try {
      // Build rich context description
      let contextDesc = `Bu sistem aşağıdaki vergi ve hukuk kaynaklarına erişim sağlar:\n\n`;

      if (context.dataSourceStats && context.dataSourceStats.length > 0) {
        context.dataSourceStats.forEach(source => {
          contextDesc += `• ${source.displayName}: ${source.count.toLocaleString('tr-TR')} kayıt\n`;
        });
      }

      const prompt = `Sen Türkiye'nin önde gelen vergi danışmanlık platformunun soru öneri asistanısın.

${contextDesc}

Kullanıcılar bu kapsamlı veritabanını kullanarak vergi sorunlarına cevap arıyor.

Lütfen GERÇEK VERGİ SORUNLARINA dayalı ${count} adet ETKİLEYİCİ ve PROFESYONEL soru öner:

Soru türleri (karışık olmalı):
1. DANIŞTAY KARARLARI: "Danıştay hangi durumlarda KDV iadesini reddetti?", "Vergi kaçakçılığında emsal kararlar nelerdir?"
2. ÖZELGELER: "Gayrimenkul satışında tapu harcı hesaplaması nasıl yapılır?", "E-fatura zorunluluğu hangi mükellefleri kapsıyor?"
3. PRATİK SORULAR: "Limited şirket kar dağıtımında vergi avantajları nelerdir?", "Serbest meslek kazançlarında indirilecek giderler nelerdir?"
4. GÜNCEL KONULAR: "2024 yılı vergi takvimi nasıl?", "Enflasyon düzeltmesi nasıl uygulanır?"

Her soru:
- Spesifik ve profesyonel olmalı (genel değil)
- Gerçek bir vergi sorununun çözümüne yönelik olmalı
- Türkiye vergi mevzuatına uygun olmalı
- Türkçe ve düzgün formatta olmalı

SADECE soruları listele, her satırda bir soru:`;

      console.log(`[QuestionGen] Calling LLM with enriched prompt...`);
      const result = await this.llmManager.generateChatResponse(prompt, {
        temperature: 0.85,
        maxTokens: 1200
      });
      console.log(`[QuestionGen] LLM response: ${result.content?.length} chars`);

      const questions = this.parseQuestionsFromResponse(result.content);
      console.log(`[QuestionGen] Parsed ${questions.length} enriched questions`);
      return questions;
    } catch (error) {
      console.error('[QuestionGen] Error generating enriched questions:', error);
      // Fallback to original method
      return this.generateLLMQuestions(context, count);
    }
  }

  /**
   * Get user questions from message history
   */
  private async getUserQuestions(schemaName: string, limit: number = 10): Promise<string[]> {
    try {
      // Query messages table for user questions
      const result = await lsembPool.query(`
        SELECT DISTINCT content
        FROM messages
        WHERE role = 'user'
          AND content IS NOT NULL
          AND LENGTH(content) > 10
          AND LENGTH(content) < 200
          AND content LIKE '%?%'
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => row.content.trim());
    } catch (error) {
      console.error('Error fetching user questions:', error);
      return [];
    }
  }

  /**
   * Generate questions using LLM
   */
  private async generateLLMQuestions(schemaContext: {
    schemaName: string;
    description?: string;
    categories?: string[];
    sampleContent?: string;
  }, count: number = 20): Promise<string[]> {
    console.log(`[QuestionGen] generateLLMQuestions called for schema: ${schemaContext.schemaName}, count: ${count}`);
    try {
      const context = this.buildSchemaContext(schemaContext);
      console.log(`[QuestionGen] Built context: ${context.substring(0, 200)}...`);

      const prompt = `Sen bir soru öneri asistanısın. Kullanıcı aşağıdaki veri setine erişebilir ve bunlar hakkında sorular sorabilir:

${context}

Lütfen bu veri seti hakkında kullanıcıların sorabileceği ${count} adet ÇEŞİTLİ ve İLGİNÇ soru öner. Her soru:
- Net ve anlaşılır olmalı
- Veri setinin farklı yönlerini keşfetmeli
- Kullanıcı için değerli bilgi sağlamalı
- Türkçe olmalı
- Doğrudan sorulabilir formatta olmalı (placeholder yok)

Sadece soruları listele, her satırda bir soru. Numaralandırma veya açıklama ekleme.`;

      console.log(`[QuestionGen] Calling LLM for questions...`);
      const result = await this.llmManager.generateChatResponse(prompt, {
        temperature: 0.9, // Very high for maximum diversity
        maxTokens: 1000
      });
      console.log(`[QuestionGen] LLM response received, provider: ${result.provider}, length: ${result.content?.length}`);

      const questions = this.parseQuestionsFromResponse(result.content);
      console.log(`[QuestionGen] Parsed ${questions.length} questions from LLM response`);
      return questions;
    } catch (error) {
      console.error('[QuestionGen] Error generating LLM questions:', error);
      return [];
    }
  }

  /**
   * Get random questions from pool
   */
  private getRandomQuestions(pool: string[], count: number): string[] {
    if (pool.length <= count) {
      return pool;
    }

    // Fisher-Yates shuffle and take first N
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  }

  /**
   * Build context description from schema
   */
  private buildSchemaContext(schemaContext: {
    schemaName: string;
    description?: string;
    categories?: string[];
    sampleContent?: string;
  }): string {
    let context = `Veri Seti: ${schemaContext.schemaName}\n`;

    if (schemaContext.description) {
      context += `Açıklama: ${schemaContext.description}\n`;
    }

    if (schemaContext.categories && schemaContext.categories.length > 0) {
      context += `Kategoriler: ${schemaContext.categories.join(', ')}\n`;
    }

    if (schemaContext.sampleContent) {
      context += `Örnek İçerik: ${schemaContext.sampleContent.substring(0, 500)}...\n`;
    }

    return context;
  }

  /**
   * Parse questions from LLM response
   */
  private parseQuestionsFromResponse(response: string): string[] {
    return response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 10 && line.includes('?'))
      .map(line => line.replace(/^[-*•]\s*/, '').replace(/^\d+[\.)]\s*/, ''))
      .slice(0, 10); // Max 10 questions
  }

  /**
   * Generate fallback welcome questions without LLM
   */
  private generateFallbackWelcomeQuestions(schemaContext: {
    schemaName: string;
    description?: string;
    categories?: string[];
  }, count: number = 4): string[] {
    const schemaName = schemaContext.schemaName;
    const fallbacks = [
      `${schemaName} veri setinde neler var?`,
      `Bu sistem hakkında bilgi verir misiniz?`,
      `Hangi konularda size yardımcı olabilirim?`,
      `En çok aranan konular nelerdir?`
    ];

    return fallbacks.slice(0, count);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  // ============================================
  // USER QUESTION POOL MANAGEMENT
  // ============================================

  /**
   * Check if a question is quality enough to be added to the pool
   */
  isQualityQuestion(question: string): { isQuality: boolean; score: number; reason?: string } {
    const trimmed = question.trim();

    // Basic validation
    if (!trimmed || trimmed.length < 15) {
      return { isQuality: false, score: 0, reason: 'Too short' };
    }

    if (trimmed.length > 250) {
      return { isQuality: false, score: 0, reason: 'Too long' };
    }

    // Must contain a question mark or question word
    const hasQuestionMark = trimmed.includes('?');
    const hasQuestionWord = /\b(ne|nasıl|neden|kim|hangi|kaç|nedir|midir|mıdır|mı|mi|what|how|why|when|where|who|which)\b/i.test(trimmed);

    if (!hasQuestionMark && !hasQuestionWord) {
      return { isQuality: false, score: 0, reason: 'Not a question' };
    }

    // Filter out junk patterns
    const junkPatterns = [
      /\bhttp/i,           // URLs
      /\bwww\./i,          // URLs
      /\.pdf\b/i,          // File references
      /\.docx?\b/i,        // File references
      /@/,                 // Email addresses
      /\b\d{10,}\b/,       // Long numbers (phone, ID)
      /test\s*\d*/i,       // Test messages
      /deneme/i,           // Test messages (Turkish)
      /selam|merhaba|hey\b/i, // Greetings only
      /^[a-z]{1,3}$/i,     // Single letters/abbreviations
      /^\d+$/,             // Only numbers
    ];

    for (const pattern of junkPatterns) {
      if (pattern.test(trimmed)) {
        return { isQuality: false, score: 0, reason: 'Contains junk pattern' };
      }
    }

    // Calculate quality score
    let score = 0.5; // Base score

    // Bonus for question mark
    if (hasQuestionMark) score += 0.1;

    // Bonus for proper length (sweet spot: 30-150 chars)
    if (trimmed.length >= 30 && trimmed.length <= 150) score += 0.15;

    // Bonus for domain-specific keywords (vergi/hukuk)
    const domainKeywords = /\b(vergi|kdv|gelir|kurumlar|stopaj|matrah|beyanname|fatura|iade|indirim|mükellef|gider|kanun|yönetmelik|mahkeme|dava|karar|hüküm|madde|tebliğ|özelge)\b/i;
    if (domainKeywords.test(trimmed)) score += 0.2;

    // Bonus for professional tone (ends with question mark, starts with capital)
    if (hasQuestionMark && /^[A-ZÇĞİÖŞÜ]/.test(trimmed)) score += 0.05;

    // Cap at 1.0
    score = Math.min(1.0, score);

    return {
      isQuality: score >= 0.5,
      score: Math.round(score * 100) / 100
    };
  }

  /**
   * Add a user question to the pool if it's quality
   */
  async addToUserQuestionPool(question: string, source: string = 'user_chat'): Promise<boolean> {
    try {
      const qualityCheck = this.isQualityQuestion(question);

      if (!qualityCheck.isQuality) {
        console.log(`[QuestionPool] Rejected: "${question.substring(0, 50)}..." - ${qualityCheck.reason}`);
        return false;
      }

      const trimmed = question.trim();
      const hash = crypto.createHash('md5').update(trimmed.toLowerCase()).digest('hex');

      // Insert or ignore if exists
      await lsembPool.query(`
        INSERT INTO user_question_pool (question, question_hash, source, quality_score, language)
        VALUES ($1, $2, $3, $4, 'tr')
        ON CONFLICT (question_hash) DO UPDATE SET
          usage_count = user_question_pool.usage_count,
          updated_at = CURRENT_TIMESTAMP
      `, [trimmed, hash, source, qualityCheck.score]);

      console.log(`[QuestionPool] Added: "${trimmed.substring(0, 50)}..." (score: ${qualityCheck.score})`);

      // Invalidate Redis cache to include new question
      try {
        const { redis } = await import('../config/redis');
        const keys = await redis.keys('suggestions:*');
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(`[QuestionPool] Cleared ${keys.length} suggestion cache keys`);
        }
      } catch (e) {
        // Redis might not be available
      }

      return true;
    } catch (error) {
      console.error('[QuestionPool] Error adding question:', error);
      return false;
    }
  }

  /**
   * Get questions from user pool for suggestions
   */
  async getUserPoolQuestions(limit: number = 20): Promise<string[]> {
    try {
      const result = await lsembPool.query(`
        SELECT question
        FROM user_question_pool
        WHERE is_active = true
          AND quality_score >= 0.5
        ORDER BY
          quality_score DESC,
          click_count DESC,
          created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => row.question);
    } catch (error) {
      // Table might not exist yet
      console.log('[QuestionPool] user_question_pool table not found, skipping');
      return [];
    }
  }

  /**
   * Record that a suggestion was clicked
   */
  async recordSuggestionClick(question: string): Promise<void> {
    try {
      const hash = crypto.createHash('md5').update(question.trim().toLowerCase()).digest('hex');

      await lsembPool.query(`
        UPDATE user_question_pool
        SET click_count = click_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE question_hash = $1
      `, [hash]);
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Record that a suggestion was shown
   */
  async recordSuggestionUsage(questions: string[]): Promise<void> {
    try {
      const hashes = questions.map(q =>
        crypto.createHash('md5').update(q.trim().toLowerCase()).digest('hex')
      );

      await lsembPool.query(`
        UPDATE user_question_pool
        SET usage_count = usage_count + 1
        WHERE question_hash = ANY($1)
      `, [hashes]);
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Simplified 2-tier suggestion generator
   * Tier 1: Schema example questions (from active schema config)
   * Tier 2: User pool questions (quality user questions from chat history)
   *
   * No LLM fallback - keeps it simple and fast
   */
  async generateSimpleSuggestions(schemaName: string, count: number = 4): Promise<string[]> {
    console.log(`[Suggestions] generateSimpleSuggestions called for schema: ${schemaName}, count: ${count}`);

    try {
      const { redis } = await import('../config/redis');
      const redisKey = `simple_suggestions:${schemaName}`;

      // Try Redis cache first
      const cached = await redis.get(redisKey);
      if (cached) {
        const pool = JSON.parse(cached);
        console.log(`[Suggestions] Using cached pool (${pool.length} questions)`);
        return this.getRandomQuestions(pool, count);
      }

      // Build question pool from 2 sources
      const questionPool: string[] = [];

      // Tier 1: Schema example questions
      const schemaQuestions = await this.getSchemaExampleQuestions();
      if (schemaQuestions.length > 0) {
        questionPool.push(...schemaQuestions);
        console.log(`[Suggestions] Added ${schemaQuestions.length} schema questions`);
      }

      // Tier 2: User pool questions
      const userPoolQuestions = await this.getUserPoolQuestions(20);
      if (userPoolQuestions.length > 0) {
        // Add user questions that aren't already in schema questions
        const schemaSet = new Set(schemaQuestions.map(q => q.toLowerCase().trim()));
        const uniqueUserQuestions = userPoolQuestions.filter(
          q => !schemaSet.has(q.toLowerCase().trim())
        );
        questionPool.push(...uniqueUserQuestions);
        console.log(`[Suggestions] Added ${uniqueUserQuestions.length} unique user pool questions`);
      }

      // Remove exact duplicates
      const uniquePool = [...new Set(questionPool)];

      // Cache for 1 hour
      if (uniquePool.length > 0) {
        await redis.setex(redisKey, 3600, JSON.stringify(uniquePool));
        console.log(`[Suggestions] Cached ${uniquePool.length} questions for 1 hour`);
      }

      console.log(`[Suggestions] Total pool: ${uniquePool.length} questions`);
      return this.getRandomQuestions(uniquePool, count);
    } catch (error) {
      console.error('[Suggestions] Error generating simple suggestions:', error);
      // Return empty array on error - no fallback
      return [];
    }
  }
}

// Export singleton instance
export const questionGenerationService = new QuestionGenerationService();
export default questionGenerationService;