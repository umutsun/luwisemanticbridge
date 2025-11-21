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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    const jobData = await redis.get(`translation_job:${jobId}`);
    
    if (!jobData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Job not found'
        },
        { status: 404 }
      );
    }
    
    const job = JSON.parse(jobData);
    
    return NextResponse.json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await request.json();
    const { action } = body;
    
    const jobData = await redis.get(`translation_job:${jobId}`);
    
    if (!jobData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Job not found'
        },
        { status: 404 }
      );
    }
    
    const job = JSON.parse(jobData);
    
    if (action === 'cancel' && job.status !== 'completed') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      
      await redis.setex(`translation_job:${jobId}`, 3600, JSON.stringify(job));
      
      return NextResponse.json({
        success: true,
        message: 'Job cancelled successfully'
      });
    }
    
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action'
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}