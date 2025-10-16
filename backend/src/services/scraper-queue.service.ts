import { initializeRedis } from "../config/redis";
import { loggingService } from "./logging.service";
import scraperService from "./scraper.service";
import { EventEmitter } from "events";
import crypto from "crypto";

export interface ScrapeJob {
  id: string;
  url: string;
  priority: number;
  options: any;
  retryCount: number;
  maxRetries: number;
  status: "pending" | "processing" | "completed" | "failed" | "dead_letter";
  createdAt: string;
  scheduledAt?: string;
  processedAt?: string;
  error?: string;
  metadata?: {
    domain: string;
    projectId?: string;
    siteId?: string;
    batchId?: string;
    useCache: boolean;
    llmFiltering: boolean;
    entityExtraction: boolean;
  };
  result?: any;
  processingStats?: {
    cacheHit: boolean;
    processingTime: number;
    qualityScore?: number;
    entityCount?: number;
  };
}

export interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  totalProcessed: number;
  avgProcessingTime: number;
  successRate: number;
  cacheHitRate: number;
  llmProcessed: number;
  tokenUsage: {
    input: number;
    output: number;
    cost: number;
  };
}

export interface RateLimitConfig {
  defaultRpm: number;
  perDomainLimits: Map<string, number>;
  burstLimit: number;
  windowMs: number;
}

export class ScraperQueueService extends EventEmitter {
  private redis: any = null;
  private processing = new Set<string>();
  private rateLimits = new Map<string, { count: number; resetTime: number }>();
  private metrics: QueueMetrics = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    deadLetter: 0,
    totalProcessed: 0,
    avgProcessingTime: 0,
    successRate: 100,
    cacheHitRate: 0,
    llmProcessed: 0,
    tokenUsage: {
      input: 0,
      output: 0,
      cost: 0,
    },
  };

  private rateLimitConfig: RateLimitConfig = {
    defaultRpm: 60,
    perDomainLimits: new Map(),
    burstLimit: 10,
    windowMs: 60000, // 1 minute
  };

  private concurrencyLimit = 5;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  // Dead letter queue settings
  private deadLetterMaxRetries = 3;
  private deadLetterTTL = 86400000; // 24 hours

  constructor() {
    super();
    this.initializeService();
  }

  private async initializeService() {
    try {
      this.redis = await initializeRedis();
      if (this.redis && this.redis.status === "ready") {
        console.log("✅ Scraper Queue Service initialized with Redis");
        this.startProcessing();
        this.startMetricsCollection();
      } else {
        console.warn("⚠️ Redis not available, queue service in local mode");
        this.startLocalProcessing();
      }
    } catch (error) {
      console.error("❌ Failed to initialize Scraper Queue Service:", error);
      this.startLocalProcessing();
    }
  }

  // Add job to queue
  async addJob(job: Partial<ScrapeJob>): Promise<string> {
    const fullJob: ScrapeJob = {
      id: job.id || crypto.randomUUID(),
      url: job.url!,
      priority: job.priority || 5,
      options: job.options || {},
      retryCount: 0,
      maxRetries: job.maxRetries || 3,
      status: "pending",
      createdAt: new Date().toISOString(),
      scheduledAt: job.scheduledAt,
      metadata: {
        domain: new URL(job.url!).hostname,
        ...job.metadata,
      },
    };

    try {
      // Add to priority queue
      await this.redis.zadd("scraper:queue:pending", [
        fullJob.priority,
        fullJob.id,
      ]);

      // Store job details
      await this.redis.hset(
        "scraper:jobs",
        fullJob.id,
        JSON.stringify(fullJob)
      );

      // Set expiration for job (24 hours)
      await this.redis.expire(`scraper:job:${fullJob.id}`, 86400);

      // Add to domain-specific queue for rate limiting
      await this.redis.lpush(
        `scraper:domain:${fullJob.metadata!.domain}`,
        fullJob.id
      );

      this.metrics.pending++;
      this.emit("jobAdded", fullJob);

      console.log(`📋 Job added to queue: ${fullJob.id} (${fullJob.url})`);
      return fullJob.id;
    } catch (error) {
      console.error("❌ Failed to add job to queue:", error);
      throw error;
    }
  }

  // Add multiple jobs (bulk)
  async addBulkJobs(jobs: Partial<ScrapeJob>[]): Promise<string[]> {
    const jobIds: string[] = [];
    const pipeline = this.redis.pipeline();

    for (const job of jobs) {
      const fullJob: ScrapeJob = {
        id: job.id || crypto.randomUUID(),
        url: job.url!,
        priority: job.priority || 5,
        options: job.options || {},
        retryCount: 0,
        maxRetries: job.maxRetries || 3,
        status: "pending",
        createdAt: new Date().toISOString(),
        scheduledAt: job.scheduledAt,
        metadata: {
          domain: new URL(job.url!).hostname,
          ...job.metadata,
        },
      };

      jobIds.push(fullJob.id);

      pipeline.zadd("scraper:queue:pending", [fullJob.priority, fullJob.id]);
      pipeline.hset("scraper:jobs", fullJob.id, JSON.stringify(fullJob));
      pipeline.expire(`scraper:job:${fullJob.id}`, 86400);
      pipeline.lpush(`scraper:domain:${fullJob.metadata!.domain}`, fullJob.id);
    }

    await pipeline.exec();
    this.metrics.pending += jobs.length;

    console.log(`📦 Added ${jobs.length} jobs to queue`);
    return jobIds;
  }

  // Get job status
  async getJobStatus(jobId: string): Promise<ScrapeJob | null> {
    try {
      const jobData = await this.redis.hget("scraper:jobs", jobId);
      if (jobData) {
        return JSON.parse(jobData);
      }
      return null;
    } catch (error) {
      console.error("Failed to get job status:", error);
      return null;
    }
  }

  // Get multiple job statuses
  async getBulkJobStatus(jobIds: string[]): Promise<Map<string, ScrapeJob>> {
    const results = new Map<string, ScrapeJob>();

    try {
      const jobDataList = await this.redis.hmget("scraper:jobs", ...jobIds);

      for (let i = 0; i < jobIds.length; i++) {
        const jobId = jobIds[i];
        const jobData = jobDataList[i];

        if (jobData) {
          results.set(jobId, JSON.parse(jobData));
        }
      }
    } catch (error) {
      console.error("Failed to get bulk job status:", error);
    }

    return results;
  }

  // Cancel job
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJobStatus(jobId);
      if (!job) return false;

      if (job.status === "pending") {
        // Remove from queue
        await this.redis.zrem("scraper:queue:pending", jobId);
        await this.redis.lrem(
          `scraper:domain:${job.metadata!.domain}`,
          1,
          jobId
        );

        // Update job status
        job.status = "failed";
        job.error = "Cancelled by user";
        await this.redis.hset("scraper:jobs", jobId, JSON.stringify(job));

        this.metrics.pending--;
        this.metrics.failed++;

        this.emit("jobCancelled", job);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Failed to cancel job:", error);
      return false;
    }
  }

  // Process queue
  private async startProcessing() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    console.log("🔄 Starting queue processing...");

    this.processingInterval = setInterval(async () => {
      if (this.processing.size < this.concurrencyLimit) {
        await this.processNextJobs();
      }
    }, 1000);
  }

  private async processNextJobs() {
    try {
      // Get next batch of jobs respecting rate limits
      const availableSlots = this.concurrencyLimit - this.processing.size;
      if (availableSlots <= 0) return;

      // Get jobs from priority queue
      const jobIds = await this.redis.zrange(
        "scraper:queue:pending",
        0,
        availableSlots - 1
      );

      if (jobIds.length === 0) return;

      // Filter jobs that respect rate limits
      const eligibleJobs = [];
      for (const jobId of jobIds) {
        const jobData = await this.redis.hget("scraper:jobs", jobId);
        if (jobData) {
          const job: ScrapeJob = JSON.parse(jobData);

          // Check rate limit for domain
          if (await this.checkRateLimit(job.metadata!.domain)) {
            eligibleJobs.push(job);
          }
        }
      }

      // Process eligible jobs
      for (const job of eligibleJobs) {
        // Remove from pending queue
        await this.redis.zrem("scraper:queue:pending", job.id);
        await this.redis.lrem(
          `scraper:domain:${job.metadata!.domain}`,
          1,
          job.id
        );

        // Mark as processing
        job.status = "processing";
        job.processedAt = new Date().toISOString();
        await this.redis.hset("scraper:jobs", job.id, JSON.stringify(job));

        this.processing.add(job.id);
        this.metrics.pending--;
        this.metrics.processing++;

        // Process job
        this.processJob(job).catch((error) => {
          console.error(`Job processing error: ${job.id}`, error);
        });
      }
    } catch (error) {
      console.error("Queue processing error:", error);
    }
  }

  private async processJob(job: ScrapeJob) {
    const startTime = Date.now();

    try {
      console.log(`🔄 Processing job: ${job.id} (${job.url})`);

      // Update rate limit
      await this.updateRateLimit(job.metadata!.domain);

      // Perform scraping
      const results = await scraperService.scrapeWebsite(job.url, {
        ...job.options,
        useCache: job.metadata?.useCache || true,
        llmFiltering: job.metadata?.llmFiltering || true,
        entityExtraction: job.metadata?.entityExtraction || true,
        saveToDatabase: true,
      });

      const processingTime = Date.now() - startTime;

      // Update job with results
      job.status = "completed";
      job.result = results;
      job.processingStats = {
        cacheHit: results[0]?.cacheHit || false,
        processingTime,
        qualityScore: results[0]?.llmAnalysis?.qualityScore || 0,
        entityCount: results[0]?.entities?.length || 0,
      };

      // Update metrics
      this.metrics.processing--;
      this.metrics.completed++;
      this.metrics.totalProcessed++;

      if (job.processingStats.cacheHit) {
        this.updateCacheHitRate(true);
      }

      if (job.processingStats.qualityScore > 0) {
        this.metrics.llmProcessed++;
      }

      this.updateAvgProcessingTime(processingTime);
      this.updateSuccessRate(true);

      // Save job
      await this.redis.hset("scraper:jobs", job.id, JSON.stringify(job));

      // Add to completed queue with TTL
      await this.redis.zadd("scraper:queue:completed", [Date.now(), job.id]);
      await this.redis.expire(`scraper:job:${job.id}`, 86400);

      // Emit success
      this.emit("jobCompleted", job);

      console.log(`✅ Job completed: ${job.id} in ${processingTime}ms`);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.error(`❌ Job failed: ${job.id}`, errorMessage);

      // Handle retry logic
      job.retryCount++;
      job.error = errorMessage;

      if (job.retryCount < job.maxRetries) {
        // Retry with exponential backoff
        const retryDelay = Math.pow(2, job.retryCount) * 1000; // 2s, 4s, 8s
        const retryAt = Date.now() + retryDelay;

        job.status = "pending";
        job.scheduledAt = new Date(retryAt).toISOString();

        // Add to retry queue
        await this.redis.zadd("scraper:queue:retry", [retryAt, job.id]);

        console.log(
          `🔄 Job scheduled for retry: ${job.id} (attempt ${job.retryCount}/${job.maxRetries})`
        );
      } else {
        // Move to dead letter queue
        job.status = "dead_letter";

        await this.redis.zadd("scraper:queue:dead_letter", [
          Date.now(),
          job.id,
        ]);
        await this.redis.expire(`scraper:job:${job.id}`, this.deadLetterTTL);

        this.metrics.deadLetter++;

        console.log(`💀 Job moved to dead letter queue: ${job.id}`);

        this.emit("jobDeadLettered", job);
      }

      // Update metrics
      this.metrics.processing--;
      this.metrics.failed++;
      this.updateSuccessRate(false);

      // Save job
      await this.redis.hset("scraper:jobs", job.id, JSON.stringify(job));

      this.emit("jobFailed", job);
    } finally {
      this.processing.delete(job.id);
    }
  }

  // Rate limiting
  private async checkRateLimit(domain: string): Promise<boolean> {
    const limit =
      this.rateLimitConfig.perDomainLimits.get(domain) ||
      this.rateLimitConfig.defaultRpm;
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowMs;

    const key = `scraper:rate:${domain}`;

    try {
      const count = await this.redis.zcount(key, windowStart, now);

      if (count >= limit) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Rate limit check failed:", error);
      return true; // Allow if Redis fails
    }
  }

  private async updateRateLimit(domain: string): Promise<void> {
    const key = `scraper:rate:${domain}`;
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowMs;

    try {
      // Clean old entries
      await this.redis.zremrangebyscore(key, 0, windowStart);

      // Add current request
      await this.redis.zadd(key, [now, crypto.randomUUID()]);

      // Set expiration
      await this.redis.expire(
        key,
        Math.ceil(this.rateLimitConfig.windowMs / 1000)
      );
    } catch (error) {
      console.error("Failed to update rate limit:", error);
    }
  }

  // Metrics collection
  private startMetricsCollection() {
    this.metricsInterval = setInterval(async () => {
      await this.collectMetrics();
      this.emit("metricsUpdated", this.metrics);
    }, 30000); // Every 30 seconds
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Get queue sizes
      const pending = await this.redis.zcard("scraper:queue:pending");
      const completed = await this.redis.zcard("scraper:queue:completed");
      const deadLetter = await this.redis.zcard("scraper:queue:dead_letter");

      this.metrics.pending = pending;
      this.metrics.completed = completed;
      this.metrics.deadLetter = deadLetter;
      this.metrics.processing = this.processing.size;

      // Clean old completed jobs (older than 1 hour)
      const oneHourAgo = Date.now() - 3600000;
      await this.redis.zremrangebyscore(
        "scraper:queue:completed",
        0,
        oneHourAgo
      );
    } catch (error) {
      console.error("Metrics collection failed:", error);
    }
  }

  private updateCacheHitRate(isHit: boolean): void {
    const total = this.metrics.totalProcessed;
    if (total === 0) {
      this.metrics.cacheHitRate = isHit ? 100 : 0;
    } else {
      const hits = this.metrics.cacheHitRate * (total - 1) + (isHit ? 100 : 0);
      this.metrics.cacheHitRate = hits / total;
    }
  }

  private updateAvgProcessingTime(time: number): void {
    const total = this.metrics.totalProcessed;
    if (total === 0) {
      this.metrics.avgProcessingTime = time;
    } else {
      this.metrics.avgProcessingTime =
        (this.metrics.avgProcessingTime * (total - 1) + time) / total;
    }
  }

  private updateSuccessRate(isSuccess: boolean): void {
    const total = this.metrics.totalProcessed;
    if (total === 0) {
      this.metrics.successRate = isSuccess ? 100 : 0;
    } else {
      const successes =
        this.metrics.successRate * (total - 1) + (isSuccess ? 100 : 0);
      this.metrics.successRate = successes / total;
    }
  }

  // Public methods
  async getMetrics(): Promise<QueueMetrics> {
    await this.collectMetrics();
    return { ...this.metrics };
  }

  async getQueueStats(): Promise<any> {
    try {
      const pipeline = this.redis.pipeline();

      // Get domain stats
      const domains = await this.redis.keys("scraper:domain:*");
      const domainStats = new Map();

      for (const domainKey of domains) {
        const domain = domainKey.replace("scraper:domain:", "");
        const count = await this.redis.llen(domainKey);
        domainStats.set(domain, count);
      }

      // Get error distribution
      const failedJobs = await this.redis.zrange(
        "scraper:queue:dead_letter",
        0,
        -1
      );
      const errorTypes = new Map();

      for (const jobId of failedJobs.slice(0, 100)) {
        // Sample last 100
        const jobData = await this.redis.hget("scraper:jobs", jobId);
        if (jobData) {
          const job: ScrapeJob = JSON.parse(jobData);
          const errorType = job.error?.split(":")[0] || "Unknown";
          errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
        }
      }

      return {
        domains: Object.fromEntries(domainStats),
        errorTypes: Object.fromEntries(errorTypes),
        processingJobs: Array.from(this.processing),
        rateLimitConfig: {
          defaultRpm: this.rateLimitConfig.defaultRpm,
          burstLimit: this.rateLimitConfig.burstLimit,
          windowMs: this.rateLimitConfig.windowMs,
        },
      };
    } catch (error) {
      console.error("Failed to get queue stats:", error);
      return {};
    }
  }

  // Configuration
  setConcurrencyLimit(limit: number): void {
    this.concurrencyLimit = Math.max(1, Math.min(limit, 20));
    console.log(`🔧 Concurrency limit set to: ${this.concurrencyLimit}`);
  }

  setRateLimit(domain: string, rpm: number): void {
    this.rateLimitConfig.perDomainLimits.set(domain, rpm);
    console.log(`🚦 Rate limit set for ${domain}: ${rpm} requests/minute`);
  }

  // Cleanup
  async cleanup(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    this.removeAllListeners();
    console.log("🧹 Scraper Queue Service cleaned up");
  }

  // Local processing fallback (when Redis is unavailable)
  private startLocalProcessing(): void {
    console.log("⚠️ Using local processing mode (Redis unavailable)");
    // Implement local in-memory queue processing as fallback
  }
}

export const scraperQueueService = new ScraperQueueService();
export default scraperQueueService;
