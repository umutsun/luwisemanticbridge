import OpenAI from 'openai';
import { lsembPool } from '../config/database.config';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { webScraperService } from './web-scraper.service';
import { deduplicationService } from './deduplication.service';

interface ContentAnalysisRequest {
  concept: string;
  projectId?: string;
  siteIds?: string[];
  maxContentItems?: number;
  rewritePrompt?: string;
}

interface AnalyzedContent {
  originalContent: string;
  rewrittenContent: string;
  keyPoints: string[];
  relevanceScore: number;
  sourceUrl: string;
  sourceTitle: string;
  metadata: any;
}

interface ProcessedContent {
  id: string;
  concept: string;
  content: string;
  summary: string;
  keyPoints: string[];
  embedding?: number[];
  sources: Array<{
    url: string;
    title: string;
    relevanceScore: number;
  }>;
  projectId?: string;
  createdAt: Date;
}

export class ContentAnalyzerService {
  private openai: OpenAI | null = null;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 4000,
      chunkOverlap: 200,
      separators: ['\n\n\n', '\n\n', '\n', '. ', ' ']
    });
  }

  /**
   * Analyze and synthesize content from multiple sources based on a concept
   */
  async analyzeAndSynthesizeContent(request: ContentAnalysisRequest): Promise<ProcessedContent> {
    const { concept, projectId, siteIds, maxContentItems = 20, rewritePrompt } = request;

    try {
      // Step 1: Gather all relevant content
      const relevantContent = await this.gatherRelevantContent(
        concept,
        projectId,
        siteIds,
        maxContentItems
      );

      if (relevantContent.length === 0) {
        throw new Error('No relevant content found for the concept');
      }

      // Step 2: Analyze each content piece
      const analyzedContents: AnalyzedContent[] = [];
      for (const content of relevantContent) {
        const analysis = await this.analyzeContent(concept, content);
        analyzedContents.push(analysis);
      }

      // Step 3: Synthesize all analyzed content into a comprehensive piece
      const synthesizedContent = await this.synthesizeContent(
        concept,
        analyzedContents,
        rewritePrompt
      );

      // Step 4: Generate key points from the synthesized content
      const keyPoints = await this.extractKeyPoints(concept, synthesizedContent);

      // Step 5: Create a concise summary
      const summary = await this.createSummary(concept, synthesizedContent, keyPoints);

      // Step 6: Generate embedding for the synthesized content
      let embedding: number[] | undefined;
      if (this.openai) {
        embedding = await this.generateEmbedding(synthesizedContent);
      }

      // Step 7: Save to database
      const processedContent = await this.saveProcessedContent({
        concept,
        content: synthesizedContent,
        summary,
        keyPoints,
        embedding,
        sources: analyzedContents.map(ac => ({
          url: ac.sourceUrl,
          title: ac.sourceTitle,
          relevanceScore: ac.relevanceScore
        })),
        projectId
      });

      return processedContent;
    } catch (error) {
      console.error('Content analysis failed:', error);
      throw error;
    }
  }

  /**
   * Gather relevant content from database
   */
  private async gatherRelevantContent(
    concept: string,
    projectId?: string,
    siteIds?: string[],
    maxItems: number = 20
  ): Promise<any[]> {
    let query = `
      SELECT DISTINCT ON (se.source_url)
        se.source_url,
        se.title,
        se.content,
        se.metadata,
        sp.name as project_name,
        sc.name as site_name,
        se.created_at
      FROM scrape_embeddings se
      LEFT JOIN scraping_projects sp ON se.project_id = sp.id
      LEFT JOIN site_configurations sc ON se.site_id = sc.id
      WHERE se.content IS NOT NULL
      AND LENGTH(se.content) > 200
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (projectId) {
      query += ` AND se.project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    if (siteIds && siteIds.length > 0) {
      query += ` AND se.site_id = ANY($${paramIndex++})`;
      params.push(siteIds);
    }

    // Add text search for concept relevance
    query += ` AND (
      to_tsvector('english', se.content) @@ plainto_tsquery('english', $${paramIndex}) OR
      to_tsvector('english', se.title) @@ plainto_tsquery('english', $${paramIndex})
    )`;
    params.push(concept);

    query += `
      ORDER BY se.source_url, se.created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(maxItems);

    const result = await lsembPool.query(query, params);
    return result.rows;
  }

  /**
   * Analyze individual content piece
   */
  private async analyzeContent(concept: string, content: any): Promise<AnalyzedContent> {
    if (!this.openai) {
      return {
        originalContent: content.content,
        rewrittenContent: content.content,
        keyPoints: [],
        relevanceScore: 0.5,
        sourceUrl: content.source_url,
        sourceTitle: content.title,
        metadata: content.metadata
      };
    }

    try {
      const prompt = `
Analyze the following content in relation to the concept: "${concept}"

Content:
Title: ${content.title}
URL: ${content.source_url}
Text: ${content.content.substring(0, 3000)}...

Provide your analysis in JSON format:
{
  "relevanceScore": 0.0-1.0,
  "keyPoints": ["point1", "point2", "point3"],
  "mainTopics": ["topic1", "topic2"],
  "sentiment": "positive/negative/neutral",
  "summary": "brief summary"
}

Focus on how this content relates to the concept and extract the most relevant information.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');

      return {
        originalContent: content.content,
        rewrittenContent: content.content, // Will be rewritten in synthesis step
        keyPoints: analysis.keyPoints || [],
        relevanceScore: analysis.relevanceScore || 0.5,
        sourceUrl: content.source_url,
        sourceTitle: content.title,
        metadata: {
          ...content.metadata,
          analysis,
          mainTopics: analysis.mainTopics || [],
          sentiment: analysis.sentiment || 'neutral'
        }
      };
    } catch (error) {
      console.error('Content analysis error:', error);
      return {
        originalContent: content.content,
        rewrittenContent: content.content,
        keyPoints: [],
        relevanceScore: 0.5,
        sourceUrl: content.source_url,
        sourceTitle: content.title,
        metadata: content.metadata
      };
    }
  }

  /**
   * Synthesize multiple analyzed contents into one comprehensive piece
   */
  private async synthesizeContent(
    concept: string,
    analyzedContents: AnalyzedContent[],
    customPrompt?: string
  ): Promise<string> {
    if (!this.openai) {
      // Fallback: concatenate all content
      return analyzedContents
        .map(ac => `${ac.sourceTitle}\n${ac.originalContent}`)
        .join('\n\n---\n\n');
    }

    // Sort by relevance score
    analyzedContents.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Prepare content for synthesis
    const contentText = analyzedContents
      .slice(0, 10) // Limit to top 10 for token limits
      .map((ac, index) => `
Source ${index + 1}:
Title: ${ac.sourceTitle}
URL: ${ac.sourceUrl}
Relevance: ${ac.relevanceScore}
Content: ${ac.originalContent.substring(0, 1500)}...
`)
      .join('\n');

    const defaultPrompt = `
Based on the concept "${concept}" and the following collected information from multiple sources, create a comprehensive, well-structured article that synthesizes all relevant information.

Requirements:
1. Create a coherent narrative that flows naturally
2. Integrate information from all sources, citing key points
3. Focus specifically on the concept "${concept}"
4. Remove redundant information
5. Organize content logically (introduction, main points, conclusion)
6. Maintain factual accuracy based on the sources
7. Write in a clear, informative style

${contentText}

${customPrompt ? `Additional instructions: ${customPrompt}` : ''}

Generate a comprehensive article about "${concept}":
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: defaultPrompt }],
        temperature: 0.5,
        max_tokens: 3000
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('Content synthesis error:', error);
      // Fallback to concatenation
      return analyzedContents
        .map(ac => ac.originalContent)
        .join('\n\n---\n\n');
    }
  }

  /**
   * Extract key points from synthesized content
   */
  private async extractKeyPoints(concept: string, content: string): Promise<string[]> {
    if (!this.openai) return [];

    try {
      const prompt = `
Extract the 5-7 most important key points from this content about "${concept}":

${content.substring(0, 4000)}...

Return the key points as a JSON array of strings:
["key point 1", "key point 2", ...]
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      });

      return JSON.parse(response.choices[0].message.content || '[]');
    } catch (error) {
      console.error('Key points extraction error:', error);
      return [];
    }
  }

  /**
   * Create a concise summary
   */
  private async createSummary(concept: string, content: string, keyPoints: string[]): Promise<string> {
    if (!this.openai) {
      return content.substring(0, 500) + '...';
    }

    try {
      const prompt = `
Create a concise summary (2-3 paragraphs) of this content about "${concept}". Include the key points.

Content: ${content.substring(0, 3000)}...

Key Points:
${keyPoints.map(kp => `- ${kp}`).join('\n')}
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('Summary creation error:', error);
      return content.substring(0, 500) + '...';
    }
  }

  /**
   * Generate embedding for content
   */
  private async generateEmbedding(content: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: content
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw error;
    }
  }

  /**
   * Save processed content to database
   */
  private async saveProcessedContent(data: {
    concept: string;
    content: string;
    summary: string;
    keyPoints: string[];
    embedding?: number[];
    sources: Array<{
      url: string;
      title: string;
      relevanceScore: number;
    }>;
    projectId?: string;
  }): Promise<ProcessedContent> {
    try {
      // First ensure the table exists
      await this.ensureTableExists();

      // Insert processed content
      const result = await lsembPool.query(`
        INSERT INTO processed_contents
        (concept, content, summary, key_points, embedding, sources, project_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        RETURNING id, created_at
      `, [
        data.concept,
        data.content,
        data.summary,
        JSON.stringify(data.keyPoints),
        data.embedding ? `[${data.embedding.join(',')}]` : null,
        JSON.stringify(data.sources),
        data.projectId || null
      ]);

      return {
        id: result.rows[0].id,
        ...data,
        createdAt: result.rows[0].created_at
      };
    } catch (error) {
      console.error('Failed to save processed content:', error);
      throw error;
    }
  }

  /**
   * Ensure processed_contents table exists
   */
  private async ensureTableExists(): Promise<void> {
    try {
      await lsembPool.query(`
        CREATE TABLE IF NOT EXISTS processed_contents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          concept TEXT NOT NULL,
          content TEXT NOT NULL,
          summary TEXT,
          key_points JSONB DEFAULT '[]',
          embedding vector(1536),
          sources JSONB DEFAULT '[]',
          project_id UUID REFERENCES scraping_projects(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes
      await lsembPool.query(`
        CREATE INDEX IF NOT EXISTS idx_processed_contents_concept ON processed_contents(concept);
        CREATE INDEX IF NOT EXISTS idx_processed_contents_project_id ON processed_contents(project_id);
        CREATE INDEX IF NOT EXISTS idx_processed_contents_embedding ON processed_contents
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      `);
    } catch (error) {
      console.error('Failed to create processed_contents table:', error);
    }
  }

  /**
   * Get processed content by concept
   */
  async getProcessedContent(concept: string, projectId?: string): Promise<ProcessedContent[]> {
    try {
      let query = `
        SELECT * FROM processed_contents
        WHERE concept ILIKE $1
      `;
      const params: any[] = [`%${concept}%`];

      if (projectId) {
        query += ` AND project_id = $2`;
        params.push(projectId);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await lsembPool.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        concept: row.concept,
        content: row.content,
        summary: row.summary,
        keyPoints: row.key_points || [],
        embedding: row.embedding,
        sources: row.sources || [],
        projectId: row.project_id,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Failed to get processed content:', error);
      return [];
    }
  }

  /**
   * Update embedding for existing content
   */
  async updateEmbedding(contentId: string): Promise<void> {
    if (!this.openai) return;

    try {
      // Get content
      const result = await lsembPool.query(
        'SELECT content FROM processed_contents WHERE id = $1',
        [contentId]
      );

      if (result.rows.length === 0) return;

      const content = result.rows[0].content;

      // Generate embedding
      const embedding = await this.generateEmbedding(content);

      // Update database
      await lsembPool.query(
        'UPDATE processed_contents SET embedding = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [`[${embedding.join(',')}]`, contentId]
      );
    } catch (error) {
      console.error('Failed to update embedding:', error);
    }
  }
}

// Export singleton instance
export const contentAnalyzerService = new ContentAnalyzerService();