import { scraperQueueService, QueueMetrics } from './scraper-queue.service';
import { cacheReliabilityService } from './cache-reliability.service';
import { initializeRedis } from '../config/redis';
import { loggingService } from './logging.service';
import { EventEmitter } from 'events';

export interface ScrapingAlert {
  id: string;
  type: 'error_rate' | 'queue_size' | 'cache_performance' | 'cost_alert' | 'domain_blocked';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  resolved?: boolean;
  resolvedAt?: string;
}

export interface PerformanceSnapshot {
  timestamp: string;
  queue: QueueMetrics;
  cache: {
    hitRate: number;
    responseTime: number;
    healthStatus: string;
    errorCount: number;
  };
  llm: {
    processedCount: number;
    avgQualityScore: number;
    tokenUsage: {
      input: number;
      output: number;
      cost: number;
    };
    errorRate: number;
  };
  domains: {
    total: number;
    active: number;
    rateLimited: number;
    topDomains: Array<{
      domain: string;
      jobsCount: number;
      successRate: number;
      avgProcessingTime: number;
    }>;
  };
  alerts: ScrapingAlert[];
}

export interface MonitoringConfig {
  alertThresholds: {
    errorRate: number; // percentage
    queueSize: number;
    cacheHitRate: number; // percentage
    avgProcessingTime: number; // milliseconds
    hourlyCost: number; // USD
  };
  retention: {
    snapshots: number; // hours to keep
    alerts: number; // days to keep
  };
  notifications: {
    email: boolean;
    webhook: string;
    websocket: boolean;
  };
}

export class ScraperMonitorService extends EventEmitter {
  private redis: any = null;
  private config: MonitoringConfig = {
    alertThresholds: {
      errorRate: 10, // 10%
      queueSize: 1000,
      cacheHitRate: 50, // 50%
      avgProcessingTime: 10000, // 10 seconds
      hourlyCost: 100 // $100
    },
    retention: {
      snapshots: 168, // 7 days
      alerts: 30 // 30 days
    },
    notifications: {
      email: false,
      webhook: '',
      websocket: true
    }
  };

  private snapshots: PerformanceSnapshot[] = [];
  private activeAlerts = new Map<string, ScrapingAlert>();
  private metricsHistory = new Map<string, number[]>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeService();
  }

  private async initializeService() {
    try {
      this.redis = await initializeRedis();
      if (this.redis && this.redis.status === 'ready') {
        console.log('✅ Scraper Monitor Service initialized with Redis');
        await this.loadHistoricalData();
        this.startMonitoring();
        this.startCleanup();
      } else {
        console.warn('⚠️ Redis not available, monitor service in local mode');
        this.startLocalMonitoring();
      }
    } catch (error) {
      console.error('❌ Failed to initialize Scraper Monitor Service:', error);
      this.startLocalMonitoring();
    }
  }

  private async loadHistoricalData(): Promise<void> {
    try {
      // Load recent snapshots
      const snapshotKeys = await this.redis.keys('monitor:snapshot:*');
      const recentKeys = snapshotKeys.slice(-100); // Last 100 snapshots

      for (const key of recentKeys) {
        const data = await this.redis.get(key);
        if (data) {
          this.snapshots.push(JSON.parse(data));
        }
      }

      // Sort by timestamp
      this.snapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Load active alerts
      const alertKeys = await this.redis.keys('monitor:alert:*');
      for (const key of alertKeys) {
        const alertData = await this.redis.hgetall(key);
        if (alertData && !alertData.resolved) {
          const alert: ScrapingAlert = {
            id: key.split(':')[2],
            type: alertData.type,
            severity: alertData.severity,
            message: alertData.message,
            value: parseFloat(alertData.value),
            threshold: parseFloat(alertData.threshold),
            timestamp: alertData.timestamp
          };
          this.activeAlerts.set(alert.id, alert);
        }
      }

      console.log(`📊 Loaded ${this.snapshots.length} snapshots and ${this.activeAlerts.size} active alerts`);
    } catch (error) {
      console.error('Failed to load historical data:', error);
    }
  }

  private startMonitoring(): void {
    console.log('🔍 Starting performance monitoring...');

    this.monitoringInterval = setInterval(async () => {
      await this.collectSnapshot();
      await this.checkAlerts();
    }, 60000); // Every minute
  }

  private startLocalMonitoring(): void {
    console.log('⚠️ Using local monitoring mode');
    this.monitoringInterval = setInterval(async () => {
      await this.collectSnapshot();
      await this.checkAlerts();
    }, 60000);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOldData();
    }, 3600000); // Every hour
  }

  private async collectSnapshot(): Promise<void> {
    const timestamp = new Date().toISOString();

    try {
      // Get queue metrics
      const queue = await scraperQueueService.getMetrics();

      // Get cache metrics
      const cacheStats = await cacheReliabilityService.getCacheMetrics();
      const cacheHealth = await cacheReliabilityService.performHealthCheck();

      // Get LLM metrics from database
      const llmStats = await this.getLLMMetrics();

      // Get domain statistics
      const queueStats = await scraperQueueService.getQueueStats();
      const domains = this.processDomainStats(queueStats);

      // Create snapshot
      const snapshot: PerformanceSnapshot = {
        timestamp,
        queue,
        cache: {
          hitRate: cacheStats.hitRate || 0,
          responseTime: cacheHealth.responseTime,
          healthStatus: cacheHealth.status,
          errorCount: cacheStats.failedOperations || 0
        },
        llm: llmStats,
        domains,
        alerts: Array.from(this.activeAlerts.values())
      };

      // Store snapshot
      this.snapshots.push(snapshot);

      // Keep only recent snapshots
      if (this.snapshots.length > this.config.retention.snapshots) {
        this.snapshots.shift();
      }

      // Save to Redis
      if (this.redis) {
        const key = `monitor:snapshot:${timestamp}`;
        await this.redis.setex(key, this.config.retention.snapshots * 3600, JSON.stringify(snapshot));

        // Update real-time metrics
        await this.updateRealTimeMetrics(snapshot);
      }

      // Emit update
      this.emit('snapshot', snapshot);

      console.log(`📊 Snapshot collected: ${timestamp}`);

    } catch (error) {
      console.error('Failed to collect snapshot:', error);
    }
  }

  private async getLLMMetrics(): Promise<any> {
    try {
      if (!this.redis) return this.getDefaultLLMMetrics();

      // Get from Redis cache
      const cached = await this.redis.get('monitor:llm:metrics');
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate from database (simplified)
      const metrics = this.getDefaultLLMMetrics();

      // Cache for 5 minutes
      await this.redis.setex('monitor:llm:metrics', 300, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      console.error('Failed to get LLM metrics:', error);
      return this.getDefaultLLMMetrics();
    }
  }

  private getDefaultLLMMetrics() {
    return {
      processedCount: 0,
      avgQualityScore: 0,
      tokenUsage: {
        input: 0,
        output: 0,
        cost: 0
      },
      errorRate: 0
    };
  }

  private processDomainStats(queueStats: any): any {
    const domains = {
      total: Object.keys(queueStats.domains || {}).length,
      active: 0,
      rateLimited: 0,
      topDomains: []
    };

    // Process domain statistics
    if (queueStats.domains) {
      for (const [domain, count] of Object.entries(queueStats.domains)) {
        if (count > 0) domains.active++;
      }
    }

    // Get top domains (simplified)
    domains.topDomains = Object.entries(queueStats.domains || {})
      .slice(0, 10)
      .map(([domain, count]) => ({
        domain,
        jobsCount: count as number,
        successRate: 95, // Mock data
        avgProcessingTime: 3000 // Mock data
      }));

    return domains;
  }

  private async checkAlerts(): Promise<void> {
    if (this.snapshots.length === 0) return;

    const latest = this.snapshots[this.snapshots.length - 1];
    const alerts: ScrapingAlert[] = [];

    // Check error rate
    const errorRate = 100 - latest.queue.successRate;
    if (errorRate > this.config.alertThresholds.errorRate) {
      alerts.push(this.createAlert(
        'error_rate',
        errorRate > 20 ? 'critical' : errorRate > 15 ? 'high' : 'medium',
        `Error rate is ${errorRate.toFixed(1)}%`,
        errorRate,
        this.config.alertThresholds.errorRate
      ));
    }

    // Check queue size
    if (latest.queue.pending > this.config.alertThresholds.queueSize) {
      alerts.push(this.createAlert(
        'queue_size',
        latest.queue.pending > 2000 ? 'critical' : 'high',
        `Queue size is ${latest.queue.pending} jobs`,
        latest.queue.pending,
        this.config.alertThresholds.queueSize
      ));
    }

    // Check cache hit rate
    if (latest.cache.hitRate < this.config.alertThresholds.cacheHitRate) {
      alerts.push(this.createAlert(
        'cache_performance',
        latest.cache.hitRate < 30 ? 'critical' : 'high',
        `Cache hit rate is ${latest.cache.hitRate.toFixed(1)}%`,
        latest.cache.hitRate,
        this.config.alertThresholds.cacheHitRate
      ));
    }

    // Check processing time
    if (latest.queue.avgProcessingTime > this.config.alertThresholds.avgProcessingTime) {
      alerts.push(this.createAlert(
        'processing_time',
        latest.queue.avgProcessingTime > 20000 ? 'critical' : 'high',
        `Average processing time is ${latest.queue.avgProcessingTime.toFixed(0)}ms`,
        latest.queue.avgProcessingTime,
        this.config.alertThresholds.avgProcessingTime
      ));
    }

    // Process alerts
    for (const alert of alerts) {
      const existingAlert = this.activeAlerts.get(alert.id);

      if (!existingAlert) {
        // New alert
        this.activeAlerts.set(alert.id, alert);
        await this.saveAlert(alert);
        this.emit('alert', alert);
        console.warn(`🚨 New alert: ${alert.message}`);
      } else if (existingAlert.value !== alert.value) {
        // Update existing alert
        existingAlert.value = alert.value;
        existingAlert.severity = alert.severity;
        await this.saveAlert(existingAlert);
      }
    }

    // Check for resolved alerts
    for (const [alertId, alert] of this.activeAlerts) {
      if (!alerts.find(a => a.id === alertId)) {
        // Alert resolved
        alert.resolved = true;
        alert.resolvedAt = new Date().toISOString();
        await this.saveAlert(alert);
        this.activeAlerts.delete(alertId);
        this.emit('alertResolved', alert);
        console.log(`✅ Alert resolved: ${alert.message}`);
      }
    }
  }

  private createAlert(
    type: ScrapingAlert['type'],
    severity: ScrapingAlert['severity'],
    message: string,
    value: number,
    threshold: number
  ): ScrapingAlert {
    return {
      id: `${type}_${Date.now()}`,
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: new Date().toISOString()
    };
  }

  private async saveAlert(alert: ScrapingAlert): Promise<void> {
    if (!this.redis) return;

    const key = `monitor:alert:${alert.id}`;
    await this.redis.hset(key, {
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      value: alert.value.toString(),
      threshold: alert.threshold.toString(),
      timestamp: alert.timestamp,
      resolved: alert.resolved ? 'true' : 'false',
      resolvedAt: alert.resolvedAt || ''
    });

    // Set expiration
    const ttl = alert.resolved
      ? this.config.retention.alerts * 86400 // Resolved alerts kept longer
      : 7 * 86400; // Active alerts kept for 7 days

    await this.redis.expire(key, ttl);
  }

  private async updateRealTimeMetrics(snapshot: PerformanceSnapshot): Promise<void> {
    if (!this.redis) return;

    const metrics = {
      errorRate: 100 - snapshot.queue.successRate,
      queueSize: snapshot.queue.pending,
      cacheHitRate: snapshot.cache.hitRate,
      avgProcessingTime: snapshot.queue.avgProcessingTime,
      timestamp: snapshot.timestamp
    };

    // Store latest metrics
    await this.redis.set('monitor:realtime', JSON.stringify(metrics));

    // Update history for charts
    for (const [key, value] of Object.entries(metrics)) {
      if (key !== 'timestamp') {
        const historyKey = `monitor:history:${key}`;
        await this.redis.lpush(historyKey, JSON.stringify({ value, timestamp: metrics.timestamp }));
        await this.redis.ltrim(historyKey, 0, 1439); // Keep last 24 hours (minute resolution)
      }
    }
  }

  private async cleanupOldData(): Promise<void> {
    if (!this.redis) return;

    try {
      // Clean old snapshots
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - this.config.retention.snapshots);

      const oldSnapshots = await this.redis.keys('monitor:snapshot:*');
      for (const key of oldSnapshots) {
        const timestamp = key.split(':')[2];
        if (new Date(timestamp) < cutoffTime) {
          await this.redis.del(key);
        }
      }

      // Clean resolved alerts older than retention period
      const alertCutoff = new Date();
      alertCutoff.setDate(alertCutoff.getDate() - this.config.retention.alerts);

      const alertKeys = await this.redis.keys('monitor:alert:*');
      for (const key of alertKeys) {
        const resolved = await this.redis.hget(key, 'resolved');
        const resolvedAt = await this.redis.hget(key, 'resolvedAt');

        if (resolved === 'true' && resolvedAt && new Date(resolvedAt) < alertCutoff) {
          await this.redis.del(key);
        }
      }

      console.log('🧹 Old monitoring data cleaned up');
    } catch (error) {
      console.error('Failed to cleanup old data:', error);
    }
  }

  // Public API methods
  async getRealTimeMetrics(): Promise<any> {
    if (this.redis) {
      const metrics = await this.redis.get('monitor:realtime');
      return metrics ? JSON.parse(metrics) : null;
    }

    // Return latest snapshot if no Redis
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  async getHistoricalMetrics(hours: number = 24): Promise<any[]> {
    if (this.redis) {
      const metrics = [];
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);

      const snapshotKeys = await this.redis.keys('monitor:snapshot:*');
      const recentKeys = snapshotKeys.filter(key => {
        const timestamp = key.split(':')[2];
        return new Date(timestamp) >= cutoffTime;
      }).sort();

      for (const key of recentKeys) {
        const data = await this.redis.get(key);
        if (data) {
          metrics.push(JSON.parse(data));
        }
      }

      return metrics;
    }

    // Return in-memory snapshots
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hours);

    return this.snapshots.filter(s => new Date(s.timestamp) >= cutoffTime);
  }

  async getMetricsHistory(metric: string, hours: number = 24): Promise<Array<{ timestamp: string; value: number }>> {
    if (this.redis) {
      const historyKey = `monitor:history:${metric}`;
      const data = await this.redis.lrange(historyKey, 0, -1);

      return data.map(item => JSON.parse(item))
        .filter(item => {
          const itemTime = new Date(item.timestamp);
          const cutoffTime = new Date();
          cutoffTime.setHours(cutoffTime.getHours() - hours);
          return itemTime >= cutoffTime;
        });
    }

    // Fallback to snapshots
    return this.snapshots
      .filter(s => {
        const sTime = new Date(s.timestamp);
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - hours);
        return sTime >= cutoffTime;
      })
      .map(s => ({
        timestamp: s.timestamp,
        value: this.extractMetricFromSnapshot(s, metric)
      }))
      .filter(item => item.value !== null);
  }

  private extractMetricFromSnapshot(snapshot: PerformanceSnapshot, metric: string): number | null {
    switch (metric) {
      case 'errorRate': return 100 - snapshot.queue.successRate;
      case 'queueSize': return snapshot.queue.pending;
      case 'cacheHitRate': return snapshot.cache.hitRate;
      case 'avgProcessingTime': return snapshot.queue.avgProcessingTime;
      case 'llmProcessed': return snapshot.llm.processedCount;
      case 'llmQualityScore': return snapshot.llm.avgQualityScore;
      default: return null;
    }
  }

  async getActiveAlerts(): Promise<ScrapingAlert[]> {
    return Array.from(this.activeAlerts.values());
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();

    await this.saveAlert(alert);
    this.activeAlerts.delete(alertId);
    this.emit('alertAcknowledged', alert);

    return true;
  }

  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Monitoring configuration updated');
  }

  async generateReport(hours: number = 24): Promise<any> {
    const snapshots = await this.getHistoricalMetrics(hours);
    const alerts = await this.getActiveAlerts();

    if (snapshots.length === 0) {
      return { error: 'No data available for the specified period' };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    return {
      period: {
        start: first.timestamp,
        end: last.timestamp,
        hours
      },
      summary: {
        totalJobs: last.queue.totalProcessed - first.queue.totalProcessed,
        successRate: last.queue.successRate,
        avgProcessingTime: last.queue.avgProcessingTime,
        cacheHitRate: last.cache.hitRate,
        llmProcessed: last.llm.processedCount
      },
      trends: {
        errorRate: this.calculateTrend(snapshots, s => 100 - s.queue.successRate),
        queueSize: this.calculateTrend(snapshots, s => s.queue.pending),
        cacheHitRate: this.calculateTrend(snapshots, s => s.cache.hitRate)
      },
      alerts: {
        active: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        high: alerts.filter(a => a.severity === 'high').length,
        total: alerts.length
      },
      topDomains: last.domains.topDomains,
      config: this.config
    };
  }

  private calculateTrend(snapshots: PerformanceSnapshot[], extractor: (s: PerformanceSnapshot) => number): {
    direction: 'up' | 'down' | 'stable';
    change: number;
  } {
    if (snapshots.length < 2) return { direction: 'stable', change: 0 };

    const first = extractor(snapshots[0]);
    const last = extractor(snapshots[snapshots.length - 1]);
    const change = last - first;

    const threshold = Math.abs(first) * 0.05; // 5% threshold

    if (Math.abs(change) < threshold) {
      return { direction: 'stable', change: 0 };
    }

    return {
      direction: change > 0 ? 'up' : 'down',
      change: (change / first) * 100
    };
  }

  async cleanup(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.removeAllListeners();
    console.log('🧹 Scraper Monitor Service cleaned up');
  }
}

export const scraperMonitorService = new ScraperMonitorService();
export default scraperMonitorService;