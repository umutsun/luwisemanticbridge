import { lsembPool } from '../config/database.config';
import { OpenAI } from 'openai';

interface ScrapeContent {
  id: string;
  originalContent: string;
  sourceUrl: string;
  projectId: string;
  siteId?: string;
  contentType: string;
  metadata: any;
  entities: any[];
}

interface ProcessedContent {
  summary: string;
  processedContent: string;
  keyPoints: string[];
  entities: any[];
  language: string;
  qualityScore: number;
  topics: string[];
}

export class ScrapeContentProcessorService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Process scraped content with LLM before embedding
   */
  async processContent(content: ScrapeContent): Promise<ProcessedContent> {
    try {
      // Extract text content if it contains HTML
      const textContent = this.extractTextFromContent(content.originalContent);

      // Detect language
      const language = await this.detectLanguage(textContent);

      // Process content based on type
      let processedContent: ProcessedContent;

      switch (content.contentType) {
        case 'product':
          processedContent = await this.processProductContent(textContent, language);
          break;
        case 'article':
        case 'blog':
          processedContent = await this.processArticleContent(textContent, language);
          break;
        case 'news':
          processedContent = await this.processNewsContent(textContent, language);
          break;
        default:
          processedContent = await this.processGenericContent(textContent, language);
      }

      // Enhance entities with LLM detection
      const enhancedEntities = await this.enhanceEntities(textContent, content.entities);

      // Calculate quality score
      const qualityScore = this.calculateQualityScore(textContent, processedContent);

      return {
        ...processedContent,
        entities: enhancedEntities,
        language,
        qualityScore
      };
    } catch (error) {
      console.error('Error processing content:', error);
      throw error;
    }
  }

  /**
   * Extract plain text from HTML or other formats
   */
  private extractTextFromContent(content: string): string {
    // Simple HTML tag removal (can be enhanced with a proper HTML parser)
    return content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Detect content language
   */
  private async detectLanguage(content: string): Promise<string> {
    const sample = content.slice(0, 500);

    // Check for Turkish keywords
    const turkishKeywords = ['ve', 'bir', 'bu', 'için', 'ile', 'ama', 'ancak', 'çünkü'];
    const turkishCount = turkishKeywords.filter(keyword =>
      sample.toLowerCase().includes(keyword)
    ).length;

    if (turkishCount >= 2) {
      return 'tr';
    }

    // Check for English keywords
    const englishKeywords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all'];
    const englishCount = englishKeywords.filter(keyword =>
      sample.toLowerCase().includes(keyword)
    ).length;

    if (englishCount >= 2) {
      return 'en';
    }

    return 'tr'; // Default to Turkish
  }

  /**
   * Process product/e-commerce content
   */
  private async processProductContent(content: string, language: string): Promise<ProcessedContent> {
    const prompt = language === 'tr' ? `
Aşağıdaki ürün içeriğini analiz et ve şu bilgileri çıkar:
1. Ürünün kısa ve öz özeti (2-3 cümle)
2. Anahtar özellikleri (madde işaretleri ile)
3. Ürünün önemli noktaları
4. İlgili konular/etiketler

İçerik:
${content.slice(0, 2000)}

Cevabını JSON formatında ver:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
` : `
Analyze the following product content and extract:
1. Brief product summary (2-3 sentences)
2. Key features (bullet points)
3. Important points about the product
4. Relevant topics/tags

Content:
${content.slice(0, 2000)}

Respond in JSON format:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: language === 'tr' ? 'Yardımcı bir içerik analiz yardımcısıısın.' : 'You are a helpful content analysis assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');

    return {
      summary: response.summary || content.slice(0, 200) + '...',
      processedContent: response.processedContent || content,
      keyPoints: response.keyPoints || [],
      topics: response.topics || [],
      entities: [],
      language,
      qualityScore: 0
    };
  }

  /**
   * Process article/blog content
   */
  private async processArticleContent(content: string, language: string): Promise<ProcessedContent> {
    const prompt = language === 'tr' ? `
Aşağıdaki makale içeriğini analiz et ve şu bilgileri çıkar:
1. Makalenin ana fikri ve özeti
2. Önemli argümanlar veya noktalar
3. Makaledeki anahtar konular
4. Vurgulanması gereken önemli bilgiler

İçerik:
${content.slice(0, 2000)}

Cevabını JSON formatında ver:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
` : `
Analyze the following article content and extract:
1. Main idea and summary of the article
2. Important arguments or points
3. Key topics in the article
4. Important information that should be highlighted

Content:
${content.slice(0, 2000)}

Respond in JSON format:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: language === 'tr' ? 'Bir makale analiz asistanısın.' : 'You are an article analysis assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');

    return {
      summary: response.summary || content.slice(0, 200) + '...',
      processedContent: response.processedContent || content,
      keyPoints: response.keyPoints || [],
      topics: response.topics || [],
      entities: [],
      language,
      qualityScore: 0
    };
  }

  /**
   * Process news content
   */
  private async processNewsContent(content: string, language: string): Promise<ProcessedContent> {
    const prompt = language === 'tr' ? `
Aşağıdaki haber içeriğini analiz et ve şu bilgileri çıkar:
1. Haber ana başlığı ve özeti
2. 5W1H (Ne, Nerede, Ne zaman, Neden, Nasıl, Kim)
3. Haberdeki önemli detaylar
4. İlgili konular ve etiketler

İçerik:
${content.slice(0, 2000)}

Cevabını JSON formatında ver:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
` : `
Analyze the following news content and extract:
1. News headline and summary
2. 5W1H (What, Where, When, Why, How, Who)
3. Important details in the news
4. Related topics and tags

Content:
${content.slice(0, 2000)}

Respond in JSON format:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: language === 'tr' ? 'Bir haber analiz asistanısın.' : 'You are a news analysis assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 800
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');

    return {
      summary: response.summary || content.slice(0, 200) + '...',
      processedContent: response.processedContent || content,
      keyPoints: response.keyPoints || [],
      topics: response.topics || [],
      entities: [],
      language,
      qualityScore: 0
    };
  }

  /**
   * Process generic content
   */
  private async processGenericContent(content: string, language: string): Promise<ProcessedContent> {
    const prompt = language === 'tr' ? `
Aşağıdaki içeriği analiz et ve şu bilgileri çıkar:
1. İçeriğin ana fikri ve özeti
2. Önemli noktalar
3. İçeriğin ana konuları

İçerik:
${content.slice(0, 2000)}

Cevabını JSON formatında ver:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
` : `
Analyze the following content and extract:
1. Main idea and summary
2. Important points
3. Main topics of the content

Content:
${content.slice(0, 2000)}

Respond in JSON format:
{
  "summary": "...",
  "processedContent": "...",
  "keyPoints": ["..."],
  "topics": ["..."]
}
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: language === 'tr' ? 'Bir içerik analiz asistanısın.' : 'You are a content analysis assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const response = JSON.parse(completion.choices[0].message.content || '{}');

    return {
      summary: response.summary || content.slice(0, 200) + '...',
      processedContent: response.processedContent || content,
      keyPoints: response.keyPoints || [],
      topics: response.topics || [],
      entities: [],
      language,
      qualityScore: 0
    };
  }

  /**
   * Enhance entities with LLM detection
   */
  private async enhanceEntities(content: string, existingEntities: any[]): Promise<any[]> {
    const prompt = `
Analyze the following text and extract entities. Return in JSON format:
{
  "persons": ["..."],
  "organizations": ["..."],
  "locations": ["..."],
  "products": ["..."],
  "dates": ["..."],
  "custom": [{"type": "...", "value": "..."}]
}

Text:
${content.slice(0, 1500)}
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an entity extraction expert.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const llmEntities = JSON.parse(completion.choices[0].message.content || '{}');

      // Combine regex-detected entities with LLM-detected entities
      const combinedEntities = [...existingEntities];

      // Convert LLM entities to standard format
      Object.entries(llmEntities).forEach(([type, values]: [string, any]) => {
        if (Array.isArray(values)) {
          values.forEach(value => {
            combinedEntities.push({
              type: type.toUpperCase(),
              value: typeof value === 'string' ? value : value.value || value,
              confidence: 0.8,
              source: 'llm'
            });
          });
        } else if (Array.isArray(values.custom)) {
          values.custom.forEach((item: any) => {
            combinedEntities.push({
              type: item.type.toUpperCase(),
              value: item.value,
              confidence: 0.8,
              source: 'llm'
            });
          });
        }
      });

      return combinedEntities;
    } catch (error) {
      console.error('Error enhancing entities:', error);
      return existingEntities;
    }
  }

  /**
   * Calculate content quality score
   */
  private calculateQualityScore(originalContent: string, processed: ProcessedContent): number {
    let score = 0.5; // Base score

    // Length factor
    if (originalContent.length > 500) score += 0.1;
    if (originalContent.length > 1000) score += 0.1;

    // Summary quality
    if (processed.summary && processed.summary.length > 50 && processed.summary.length < 300) {
      score += 0.1;
    }

    // Key points
    if (processed.keyPoints && processed.keyPoints.length > 0) {
      score += 0.1;
    }

    // Content structure
    if (processed.processedContent && processed.processedContent !== originalContent) {
      score += 0.1;
    }

    // Entities
    if (processed.entities && processed.entities.length > 2) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Batch process unprocessed content
   */
  async processUnprocessedContent(batchSize: number = 10): Promise<void> {
    const query = `
      SELECT id, original_content, source_url, project_id, site_id,
             content_type, metadata, entities
      FROM scrape_embeddings
      WHERE llm_processed = FALSE
      AND processing_status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
    `;

    const results = await lsembPool.query(query, [batchSize]);

    for (const row of results.rows) {
      try {
        // Mark as processing
        await lsembPool.query(
          'UPDATE scrape_embeddings SET processing_status = $1 WHERE id = $2',
          ['processing', row.id]
        );

        // Process content
        const content: ScrapeContent = {
          id: row.id,
          originalContent: row.original_content,
          sourceUrl: row.source_url,
          projectId: row.project_id,
          siteId: row.site_id,
          contentType: row.content_type || 'general',
          metadata: row.metadata,
          entities: row.entities || []
        };

        const processed = await this.processContent(content);

        // Update database with processed content
        await lsembPool.query(`
          UPDATE scrape_embeddings
          SET
            processed_content = $1,
            summary = $2,
            entities = $3,
            entity_types = $4,
            language = $5,
            quality_score = $6,
            processing_status = 'completed',
            llm_processed = TRUE,
            processed_at = CURRENT_TIMESTAMP,
            metadata = metadata || $7
          WHERE id = $8
        `, [
          processed.processedContent,
          processed.summary,
          JSON.stringify(processed.entities),
          processed.entities.map(e => e.type),
          processed.language,
          processed.qualityScore,
          JSON.stringify({
            keyPoints: processed.keyPoints,
            topics: processed.topics
          }),
          row.id
        ]);

        console.log(`Processed content ${row.id}`);
      } catch (error) {
        console.error(`Error processing content ${row.id}:`, error);

        // Mark as failed
        await lsembPool.query(
          'UPDATE scrape_embeddings SET processing_status = $1, processing_errors = $2 WHERE id = $3',
          ['failed', [error.message]]
        );
      }
    }
  }

  /**
   * Process content for a specific session
   */
  async processSessionContent(sessionId: string): Promise<void> {
    const query = `
      SELECT id, original_content, source_url, project_id, site_id,
             content_type, metadata, entities
      FROM scrape_embeddings
      WHERE scrape_session_id = $1
      AND llm_processed = FALSE
      ORDER BY created_at ASC
    `;

    const results = await lsembPool.query(query, [sessionId]);

    for (const row of results.rows) {
      try {
        const content: ScrapeContent = {
          id: row.id,
          originalContent: row.original_content,
          sourceUrl: row.source_url,
          projectId: row.project_id,
          siteId: row.site_id,
          contentType: row.content_type || 'general',
          metadata: row.metadata,
          entities: row.entities || []
        };

        const processed = await this.processContent(content);

        await lsembPool.query(`
          UPDATE scrape_embeddings
          SET
            processed_content = $1,
            summary = $2,
            entities = $3,
            entity_types = $4,
            language = $5,
            quality_score = $6,
            processing_status = 'completed',
            llm_processed = TRUE,
            processed_at = CURRENT_TIMESTAMP
          WHERE id = $7
        `, [
          processed.processedContent,
          processed.summary,
          JSON.stringify(processed.entities),
          processed.entities.map(e => e.type),
          processed.language,
          processed.qualityScore,
          row.id
        ]);
      } catch (error) {
        console.error(`Error processing content ${row.id}:`, error);
      }
    }
  }
}

// Export singleton instance
export const scrapeContentProcessorService = new ScrapeContentProcessorService();