import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

// Redis configuration
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0')
    });

export async function GET(request: NextRequest) {
  try {
    // Get all job IDs
    const jobIds = await redis.lrange('translation_jobs', 0, -1);
    
    const stats = {
      totalJobs: jobIds.length,
      pendingJobs: 0,
      processingJobs: 0,
      completedJobs: 0,
      errorJobs: 0,
      cancelledJobs: 0,
      totalCost: 0,
      totalRows: 0,
      providerUsage: {} as Record<string, { jobs: number; cost: number; rows: number }>
    };
    
    for (const jobId of jobIds) {
      const jobData = await redis.get(`translation_job:${jobId}`);
      if (jobData) {
        const job = JSON.parse(jobData);
        
        // Update status counters
        const statusKey = job.status + 'Jobs' as keyof typeof stats;
        if (statusKey in stats) {
          stats[statusKey]++;
        }
        
        // Update provider usage
        if (!stats.providerUsage[job.provider]) {
          stats.providerUsage[job.provider] = {
            jobs: 0,
            cost: 0,
            rows: 0
          };
        }
        
        stats.providerUsage[job.provider].jobs++;
        stats.providerUsage[job.provider].cost += job.cost || 0;
        stats.providerUsage[job.provider].rows += job.totalRows || 0;
        
        // Update totals
        stats.totalCost += job.cost || 0;
        stats.totalRows += job.totalRows || 0;
      }
    }
    
    return NextResponse.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}