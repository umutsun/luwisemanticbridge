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

// Translation providers configuration
const translationProviders = {
  google: {
    name: 'Google Translate',
    apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
    costPerChar: 0.00002,
    endpoint: 'https://translation.googleapis.com/language/translate/v2'
  },
  deepl: {
    name: 'DeepL',
    apiKey: process.env.DEEPL_API_KEY,
    costPerChar: 0.000006,
    endpoint: 'https://api-free.deepl.com/v2/translate'
  },
  openai: {
    name: 'OpenAI',
    apiKey: process.env.OPENAI_API_KEY,
    costPerToken: 0.000002,
    model: 'gpt-3.5-turbo',
    endpoint: 'https://api.openai.com/v1/chat/completions'
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      table, 
      targetTable, 
      provider, 
      sourceLang, 
      targetLang, 
      columns 
    } = body;
    
    // Validation
    if (!table || !targetTable || !provider || !sourceLang || !targetLang || !columns) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: table, targetTable, provider, sourceLang, targetLang, columns'
        },
        { status: 400 }
      );
    }
    
    if (!translationProviders[provider as keyof typeof translationProviders]) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown translation provider: ${provider}`
        },
        { status: 400 }
      );
    }
    
    const providerConfig = translationProviders[provider as keyof typeof translationProviders];
    
    if (!providerConfig.apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: `API key not configured for provider: ${provider}`
        },
        { status: 400 }
      );
    }
    
    // Generate job ID
    const jobId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store job in Redis
    const jobData = {
      id: jobId,
      table,
      targetTable,
      provider,
      sourceLang,
      targetLang,
      columns,
      status: 'pending',
      progress: 0,
      totalRows: 0,
      processedRows: 0,
      errors: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };
    
    try {
      // Store job data with 1 hour expiration
      await redis.setex(`translation_job:${jobId}`, 3600, JSON.stringify(jobData));
      
      // Add to job queue
      await redis.lpush('translation_jobs', jobId);
      
      return NextResponse.json({
        success: true,
        jobId,
        message: 'Translation job started successfully',
        provider: providerConfig.name
      });
    } catch (error) {
      console.error('Error starting translation job:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in translate-table endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}