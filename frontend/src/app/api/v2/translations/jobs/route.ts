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
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    
    // Get all job IDs from queue
    const jobIds = await redis.lrange('translation_jobs', 0, -1);
    
    const jobs = [];
    for (const jobId of jobIds) {
      const jobData = await redis.get(`translation_job:${jobId}`);
      if (jobData) {
        const job = JSON.parse(jobData);
        
        // Apply status filter if provided
        if (!status || job.status === status) {
          jobs.push(job);
        }
      }
    }
    
    // Sort by creation date (newest first) and apply limit
    const sortedJobs = jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
    
    return NextResponse.json({
      success: true,
      jobs: sortedJobs,
      total: jobs.length
    });
  } catch (error) {
    console.error('Error getting jobs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}