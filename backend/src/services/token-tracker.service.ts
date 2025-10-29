/**
 * Token Tracker Service
 * Track token usage and calculate costs for all LLM operations
 */

import { Pool } from 'pg';

export interface TokenUsage {
  sessionId?: string;
  userId?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  operationType?: 'chat' | 'embedding' | 'search' | 'completion';
  metadata?: any;
}

export interface ModelPricing {
  provider: string;
  model: string;
  inputPricePer1M: number;    // USD per 1M tokens
  outputPricePer1M: number;   // USD per 1M tokens
}

export interface SessionSummary {
  sessionId: string;
  userId?: string;
  messageCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  modelsUsed: string[];
  sessionStart: Date;
  sessionEnd: Date;
}

export interface DailySummary {
  date: string;
  userId?: string;
  provider: string;
  model: string;
  operationType: string;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgTokensPerRequest: number;
}

export class TokenTrackerService {
  private pricingCache: Map<string, ModelPricing> = new Map();
  private lastPricingRefresh: number = 0;
  private readonly PRICING_CACHE_TTL = 300000; // 5 minutes

  constructor(private pool: Pool) {
    this.loadPricing().catch(err => {
      console.error('[TokenTracker] Failed to load pricing:', err);
    });
  }

  /**
   * Track token usage for a request
   */
  async trackUsage(usage: TokenUsage): Promise<void> {
    try {
      // Calculate cost if not provided
      if (usage.costUsd === undefined) {
        usage.costUsd = await this.calculateCost(
          usage.provider,
          usage.model,
          usage.promptTokens,
          usage.completionTokens
        );
      }

      // Insert into database
      await this.pool.query(
        `INSERT INTO token_usage (
          session_id, user_id, model, provider,
          prompt_tokens, completion_tokens, total_tokens,
          cost_usd, operation_type, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          usage.sessionId || null,
          usage.userId || null,
          usage.model,
          usage.provider,
          usage.promptTokens,
          usage.completionTokens,
          usage.totalTokens,
          usage.costUsd,
          usage.operationType || 'chat',
          usage.metadata ? JSON.stringify(usage.metadata) : null,
        ]
      );

      console.log(
        `[TokenTracker] Tracked: ${usage.model} | ` +
        `Tokens: ${usage.totalTokens} | ` +
        `Cost: $${usage.costUsd?.toFixed(4)}`
      );
    } catch (error) {
      console.error('[TokenTracker] Track error:', error);
    }
  }

  /**
   * Calculate cost for token usage
   */
  async calculateCost(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<number> {
    const pricing = await this.getModelPricing(provider, model);

    if (!pricing) {
      console.warn(`[TokenTracker] No pricing found for ${provider}/${model}`);
      return 0;
    }

    const inputCost = (promptTokens / 1_000_000) * pricing.inputPricePer1M;
    const outputCost = (completionTokens / 1_000_000) * pricing.outputPricePer1M;

    return inputCost + outputCost;
  }

  /**
   * Get model pricing (with caching)
   */
  async getModelPricing(provider: string, model: string): Promise<ModelPricing | null> {
    // Refresh cache if expired
    if (Date.now() - this.lastPricingRefresh > this.PRICING_CACHE_TTL) {
      await this.loadPricing();
    }

    const key = `${provider}:${model}`;
    return this.pricingCache.get(key) || null;
  }

  /**
   * Load all pricing from database
   */
  private async loadPricing(): Promise<void> {
    try {
      const result = await this.pool.query(
        `SELECT provider, model, input_price_per_1m, output_price_per_1m
         FROM model_pricing
         WHERE is_active = true
         ORDER BY effective_date DESC`
      );

      this.pricingCache.clear();

      for (const row of result.rows) {
        const key = `${row.provider}:${row.model}`;
        this.pricingCache.set(key, {
          provider: row.provider,
          model: row.model,
          inputPricePer1M: parseFloat(row.input_price_per_1m),
          outputPricePer1M: parseFloat(row.output_price_per_1m),
        });
      }

      this.lastPricingRefresh = Date.now();
      console.log(`[TokenTracker] Loaded pricing for ${this.pricingCache.size} models`);
    } catch (error) {
      console.error('[TokenTracker] Load pricing error:', error);
    }
  }

  /**
   * Get session summary
   */
  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM session_token_summary WHERE session_id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        sessionId: row.session_id,
        userId: row.user_id,
        messageCount: parseInt(row.message_count),
        totalPromptTokens: parseInt(row.total_prompt_tokens),
        totalCompletionTokens: parseInt(row.total_completion_tokens),
        totalTokens: parseInt(row.total_tokens),
        totalCostUsd: parseFloat(row.total_cost_usd),
        modelsUsed: row.models_used,
        sessionStart: row.session_start,
        sessionEnd: row.session_end,
      };
    } catch (error) {
      console.error('[TokenTracker] Get session summary error:', error);
      return null;
    }
  }

  /**
   * Get daily summary
   */
  async getDailySummary(date?: string, userId?: string): Promise<DailySummary[]> {
    try {
      let query = 'SELECT * FROM daily_token_summary WHERE 1=1';
      const params: any[] = [];

      if (date) {
        params.push(date);
        query += ` AND date = $${params.length}`;
      }

      if (userId) {
        params.push(userId);
        query += ` AND user_id = $${params.length}`;
      }

      query += ' ORDER BY date DESC, total_tokens DESC';

      const result = await this.pool.query(query, params);

      return result.rows.map(row => ({
        date: row.date,
        userId: row.user_id,
        provider: row.provider,
        model: row.model,
        operationType: row.operation_type,
        requestCount: parseInt(row.request_count),
        totalPromptTokens: parseInt(row.total_prompt_tokens),
        totalCompletionTokens: parseInt(row.total_completion_tokens),
        totalTokens: parseInt(row.total_tokens),
        totalCostUsd: parseFloat(row.total_cost_usd),
        avgTokensPerRequest: parseFloat(row.avg_tokens_per_request),
      }));
    } catch (error) {
      console.error('[TokenTracker] Get daily summary error:', error);
      return [];
    }
  }

  /**
   * Get user total usage
   */
  async getUserSummary(userId: string): Promise<any> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM user_token_summary WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        userId: row.user_id,
        totalRequests: parseInt(row.total_requests),
        totalPromptTokens: parseInt(row.total_prompt_tokens),
        totalCompletionTokens: parseInt(row.total_completion_tokens),
        totalTokens: parseInt(row.total_tokens),
        totalCostUsd: parseFloat(row.total_cost_usd),
        modelsUsed: row.models_used,
        firstRequest: row.first_request,
        lastRequest: row.last_request,
      };
    } catch (error) {
      console.error('[TokenTracker] Get user summary error:', error);
      return null;
    }
  }

  /**
   * Get model usage statistics
   */
  async getModelUsageStats(): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM model_usage_summary ORDER BY total_tokens DESC LIMIT 20`
      );

      return result.rows.map(row => ({
        provider: row.provider,
        model: row.model,
        requestCount: parseInt(row.request_count),
        totalTokens: parseInt(row.total_tokens),
        totalCostUsd: parseFloat(row.total_cost_usd),
        avgTokensPerRequest: parseFloat(row.avg_tokens_per_request),
        firstUsed: row.first_used,
        lastUsed: row.last_used,
      }));
    } catch (error) {
      console.error('[TokenTracker] Get model stats error:', error);
      return [];
    }
  }

  /**
   * Get total costs for a date range
   */
  async getTotalCosts(startDate: string, endDate: string, userId?: string): Promise<any> {
    try {
      let query = `
        SELECT
          SUM(total_tokens) as total_tokens,
          SUM(cost_usd) as total_cost_usd,
          COUNT(*) as request_count,
          COUNT(DISTINCT model) as unique_models,
          AVG(total_tokens) as avg_tokens_per_request
        FROM token_usage
        WHERE created_at >= $1 AND created_at < $2
      `;

      const params: any[] = [startDate, endDate];

      if (userId) {
        params.push(userId);
        query += ` AND user_id = $${params.length}`;
      }

      const result = await this.pool.query(query, params);

      if (result.rows.length === 0) {
        return {
          totalTokens: 0,
          totalCostUsd: 0,
          requestCount: 0,
          uniqueModels: 0,
          avgTokensPerRequest: 0,
        };
      }

      const row = result.rows[0];
      return {
        totalTokens: parseInt(row.total_tokens || '0'),
        totalCostUsd: parseFloat(row.total_cost_usd || '0'),
        requestCount: parseInt(row.request_count || '0'),
        uniqueModels: parseInt(row.unique_models || '0'),
        avgTokensPerRequest: parseFloat(row.avg_tokens_per_request || '0'),
      };
    } catch (error) {
      console.error('[TokenTracker] Get total costs error:', error);
      return {
        totalTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
        uniqueModels: 0,
        avgTokensPerRequest: 0,
      };
    }
  }

  /**
   * Update model pricing
   */
  async updateModelPricing(pricing: ModelPricing): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO model_pricing (provider, model, input_price_per_1m, output_price_per_1m, effective_date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)
         ON CONFLICT (provider, model, effective_date)
         DO UPDATE SET
           input_price_per_1m = $3,
           output_price_per_1m = $4,
           updated_at = NOW()`,
        [pricing.provider, pricing.model, pricing.inputPricePer1M, pricing.outputPricePer1M]
      );

      // Refresh cache
      await this.loadPricing();

      console.log(`[TokenTracker] Updated pricing for ${pricing.provider}/${pricing.model}`);
    } catch (error) {
      console.error('[TokenTracker] Update pricing error:', error);
    }
  }
}

export default TokenTrackerService;
