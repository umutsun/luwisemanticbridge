import OpenAI from 'openai';

interface Entity {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence?: number;
}

interface NERResult {
  entities: Entity[];
  text: string;
  processedAt: string;
  model: string;
}

export class NERService {
  private openai: OpenAI | null = null;
  private patterns: Map<string, RegExp[]> = new Map();

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    this.initializePatterns();
  }

  /**
   * Initialize regex patterns for common entities
   */
  private initializePatterns() {
    // Email patterns
    this.patterns.set('EMAIL', [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    ]);

    // Phone number patterns
    this.patterns.set('PHONE', [
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      /\+?1?\s*\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g
    ]);

    // URL patterns
    this.patterns.set('URL', [
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
      /www\.[^\s<]+\b/g
    ]);

    // Date patterns
    this.patterns.set('DATE', [
      /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
      /\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/g,
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi
    ]);

    // Money patterns
    this.patterns.set('MONEY', [
      /\$\d+(?:,\d{3})*(?:\.\d{2})?/g,
      /USD\s+\d+(?:,\d{3})*(?:\.\d{2})?/g,
      /\d+(?:,\d{3})*(?:\.\d{2})?\s+(?:dollars?|USD)/gi,
      /\d+(?:,\d{3})*(?:\.\d{2})?\s?TL/gi,
      /\d+(?:,\d{3})*(?:\.\d{2})?\s?₺/g
    ]);

    // Product/ISBN patterns
    this.patterns.set('PRODUCT_ID', [
      /ISBN[:\s]*978[-\d\s]{10,17}/gi,
      /ISBN[:\s]*979[-\d\s]{10,17}/gi,
      /\b978\d{10}\b/g,
      /\b979\d{10}\b/g
    ]);

    // Image URL patterns
    this.patterns.set('IMAGE_URL', [
      /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)/gi,
      /src=["']([^"']+\.(jpg|jpeg|png|gif|webp|svg))["']/gi
    ]);

    // Source URL patterns
    this.patterns.set('SOURCE_URL', [
      /https?:\/\/www\.kitapyurdu\.com\/[^\s]+/gi,
      /https?:\/\/www\.amazon\.com\/[^\s]+/gi,
      /https?:\/\/[^\s]*\/product\/[^\s]+/gi
    ]);

    // Organization patterns (LLM-based for better accuracy)
    // Person patterns (LLM-based for better accuracy)
    // Location patterns (LLM-based for better accuracy)
  }

  /**
   * Extract entities using regex patterns
   */
  private extractWithRegex(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const [label, patterns] of this.patterns) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          entities.push({
            text: match[0],
            label,
            start: match.index,
            end: match.index + match[0].length,
            confidence: 0.9 // High confidence for regex matches
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract entities using OpenAI LLM
   */
  async extractWithLLM(text: string, entities: string[] = ['PERSON', 'ORG', 'GPE', 'EVENT', 'WORK_OF_ART', 'LAW', 'LANGUAGE']): Promise<Entity[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a Named Entity Recognition expert. Extract entities from the text and respond in JSON format.

            Entity types to extract:
            - PERSON: People names
            - ORG: Organizations, companies, institutions
            - GPE: Geopolitical entities (countries, cities, states)
            - EVENT: Named events (wars, sports events, etc.)
            - WORK_OF_ART: Books, songs, movies titles
            - LAW: Legal documents, laws
            - LANGUAGE: Named languages

            Response format:
            {
              "entities": [
                {
                  "text": "entity text",
                  "label": "PERSON|ORG|GPE|EVENT|WORK_OF_ART|LAW|LANGUAGE",
                  "start": start_index,
                  "end": end_index
                }
              ]
            }

            Important:
            - Return ONLY valid JSON
            - Calculate start/end positions correctly
            - Be accurate with entity boundaries
            - Don't include entities not in the list`
          },
          {
            role: 'user',
            content: `Extract entities from this text:\n\n${text}`
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      });

      const content = response.choices[0].message.content;
      if (!content) return [];

      try {
        const parsed = JSON.parse(content);
        if (parsed.entities && Array.isArray(parsed.entities)) {
          return parsed.entities.map((e: any) => ({
            ...e,
            confidence: 0.85 // LLM confidence
          }));
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError);
        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.entities || [];
        }
      }

      return [];
    } catch (error) {
      console.error('LLM NER extraction failed:', error);
      return [];
    }
  }

  /**
   * Main NER extraction method
   */
  async extractEntities(
    text: string,
    options: {
      useRegex?: boolean;
      useLLM?: boolean;
      entityTypes?: string[];
      combineResults?: boolean;
    } = {}
  ): Promise<NERResult> {
    const {
      useRegex = true,
      useLLM = true,
      entityTypes = ['PERSON', 'ORG', 'GPE', 'EVENT', 'WORK_OF_ART', 'LAW', 'LANGUAGE', 'EMAIL', 'PHONE', 'URL', 'DATE', 'MONEY'],
      combineResults = true
    } = options;

    let allEntities: Entity[] = [];

    // Extract with regex patterns
    if (useRegex) {
      const regexEntities = this.extractWithRegex(text);
      allEntities.push(...regexEntities);
    }

    // Extract with LLM
    if (useLLM && this.openai) {
      const llmEntityTypes = entityTypes.filter(type =>
        !['EMAIL', 'PHONE', 'URL', 'DATE', 'MONEY'].includes(type)
      );
      const llmEntities = await this.extractWithLLM(text, llmEntityTypes);
      allEntities.push(...llmEntities);
    }

    // Filter by requested entity types
    if (entityTypes && entityTypes.length > 0) {
      allEntities = allEntities.filter(e => entityTypes.includes(e.label));
    }

    // Remove overlapping entities (prioritize higher confidence)
    if (combineResults) {
      allEntities = this.mergeOverlappingEntities(allEntities);
    }

    return {
      entities: allEntities.sort((a, b) => a.start - b.start),
      text,
      processedAt: new Date().toISOString(),
      model: useLLM ? 'gpt-4' : 'regex'
    };
  }

  /**
   * Merge overlapping entities, keeping higher confidence ones
   */
  private mergeOverlappingEntities(entities: Entity[]): Entity[] {
    if (entities.length === 0) return [];

    // Sort by start position
    entities.sort((a, b) => a.start - b.start);

    const merged: Entity[] = [];
    let current = entities[0];

    for (let i = 1; i < entities.length; i++) {
      const next = entities[i];

      // Check for overlap
      if (current.end > next.start) {
        // Overlap detected, keep the one with higher confidence
        // or the longer one if confidences are equal
        if (
          (current.confidence || 0) < (next.confidence || 0) ||
          ((current.confidence || 0) === (next.confidence || 0) && next.text.length > current.text.length)
        ) {
          current = next;
        }
      } else {
        // No overlap, add current and move to next
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * Extract entities from scraped content
   */
  async extractFromScrapedContent(
    content: string,
    title?: string,
    url?: string
  ): Promise<{
    entities: Entity[];
    summary: string;
    keyInsights: string[];
  }> {
    // Extract entities from both title and content
    const fullText = title ? `${title}\n\n${content}` : content;
    const nerResult = await this.extractEntities(fullText);

    // Generate summary and insights using LLM
    let summary = '';
    let keyInsights: string[] = [];

    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `Analyze the extracted entities and content to provide:
              1. A brief summary (2-3 sentences)
              2. Key insights (3-5 bullet points)

              Focus on the relationships between entities and their significance.`
            },
            {
              role: 'user',
              content: `Content: ${content.substring(0, 2000)}...\n\nEntities: ${JSON.stringify(nerResult.entities, null, 2)}\n\nSource URL: ${url || 'N/A'}\nTitle: ${title || 'N/A'}`
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        });

        const result = response.choices[0].message.content;
        if (result) {
          // Parse the response to extract summary and insights
          const lines = result.split('\n').filter(line => line.trim());
          const summaryEndIndex = lines.findIndex(line =>
            line.includes('Key insights') || line.includes('Insights')
          );

          summary = lines.slice(0, summaryEndIndex).join(' ').trim();

          keyInsights = lines.slice(summaryEndIndex + 1)
            .filter(line => line.startsWith('-') || line.startsWith('•') || line.startsWith('*'))
            .map(line => line.replace(/^[-•*]\s*/, '').trim());
        }
      } catch (error) {
        console.error('Failed to generate summary:', error);
      }
    }

    return {
      entities: nerResult.entities,
      summary,
      keyInsights
    };
  }

  /**
   * Add custom pattern for entity extraction
   */
  addPattern(label: string, pattern: RegExp): void {
    if (!this.patterns.has(label)) {
      this.patterns.set(label, []);
    }
    this.patterns.get(label)!.push(pattern);
  }

  /**
   * Get statistics about entities
   */
  getEntityStats(entities: Entity[]): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const entity of entities) {
      stats[entity.label] = (stats[entity.label] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const nerService = new NERService();