import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Read configuration from file
async function getConfig() {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    // Return default if config file doesn't exist
    return null;
  }
}

// ASB Backend URL from environment or default
const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

export async function POST(request: NextRequest) {
  try {
    const config = await getConfig();
    const body = await request.json();
    const { message, conversationId } = body;

    console.log('[API Route] Received request:', { message, conversationId });

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Generate UUID-formatted conversationId if not provided
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    const finalConversationId = conversationId || generateUUID();
    const requestBody = {
      message: message,
      conversationId: finalConversationId,
      userId: 'demo-user',
      // Add config settings if available (but not systemPrompt - let backend use database)
      ...(config && {
        temperature: config.llmSettings?.temperature || 0.1,
        model: config.llmSettings?.activeChatModel || 'anthropic/claude-3-sonnet',
        ragWeight: config.llmSettings?.ragWeight || 100,
        llmKnowledgeWeight: config.llmSettings?.llmKnowledgeWeight || 0,
        useLocalDb: config.dataSource?.useLocalDb !== false,
        language: config.llmSettings?.language || 'tr',
        responseStyle: config.llmSettings?.responseStyle || 'professional',
        topP: config.llmSettings?.topP || 0.1,
        maxTokens: config.llmSettings?.maxTokens || 2048,
        presencePenalty: config.llmSettings?.presencePenalty || 0,
        frequencyPenalty: config.llmSettings?.frequencyPenalty || 0
      })
    };

    console.log('[API Route] Sending to backend:', `${ASB_API_URL}/api/v2/chat`);
    console.log('[API Route] Request body:', requestBody);

    // Call ASB backend v2 chat API
    const response = await fetch(`${ASB_API_URL}/api/v2/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    const responseText = await response.text();
    console.log('[API Route] Backend response status:', response.status);
    console.log('[API Route] Backend response:', responseText);

    if (!response.ok) {
      console.error('[API Route] Backend error:', responseText);
      
      // If backend returns 404 or no data found, return appropriate message
      if (response.status === 404 || responseText.includes('not found')) {
        return NextResponse.json({
          message: {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: 'Bu konuda veritabanımda bilgi bulunmuyor. Lütfen önce ilgili dokümanları sisteme yükleyin veya web scraper ile içerik ekleyin.',
            timestamp: new Date(),
          },
          sources: [],
          conversationId: finalConversationId,
        });
      }
      
      throw new Error(`ASB API responded with status: ${response.status} - ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[API Route] Failed to parse response:', parseError);
      throw new Error('Invalid response from backend');
    }

    // Format response for frontend
    const formattedResponse = {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.response || data.message || data.content || 'No response received',
        timestamp: new Date(),
      },
      sources: data.sources?.map((source: any, idx: number) => ({
        id: source.id || `source-${Date.now()}-${idx}`,
        title: source.title || source.document || 'Unknown Source',
        url: source.url,
        content: source.text || source.excerpt || source.content,
        excerpt: source.text || source.excerpt || source.content?.substring(0, 200),
        relevanceScore: source.relevance || source.score || source.similarity || 0,
        score: source.relevance || source.score || source.similarity || 0,
        relevance: source.relevance || source.score || source.similarity || 0,
        sourceTable: source.sourceTable || source.source_table,
        category: source.category,
        citation: source.citation || source.title || source.document,
        metadata: source.metadata || {},
        priority: source.priority || source.index || idx + 1,
        hasContent: source.hasContent,
        contentLength: source.contentLength,
      })) || [],
      relatedTopics: data.relatedTopics?.map((topic: any, idx: number) => ({
        id: topic.id || `topic-${Date.now()}-${idx}`,
        title: topic.title || 'İlgili Konu',
        excerpt: topic.excerpt || topic.content || '',
        relevanceScore: topic.relevanceScore || topic.score || 0,
        score: topic.relevanceScore || topic.score || 0,
        relevance: topic.relevanceScore || topic.score || 0,
        sourceTable: topic.sourceTable,
        category: topic.category || 'Genel',
        citation: topic.title,
        metadata: topic.metadata || {},
        priority: topic.priority || idx + 1,
        hasContent: topic.hasContent,
        contentLength: topic.contentLength,
        sourceId: topic.sourceId,
        databaseInfo: topic.databaseInfo,
      })) || [],
      conversationId: data.conversationId || finalConversationId,
    };

    console.log('[API Route] Sending formatted response:', formattedResponse);
    return NextResponse.json(formattedResponse);
  } catch (error) {
    console.error('[API Route] Chat API error:', error);
    console.error('[API Route] Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    return NextResponse.json(
      { 
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  try {
    console.log('[API Route] Health check - Backend URL:', ASB_API_URL);
    
    // Check if backend is reachable
    const backendHealthResponse = await fetch(`${ASB_API_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }).catch((error) => {
      console.error('[API Route] Health check failed:', error);
      return null;
    });

    const backendHealthy = backendHealthResponse?.ok || false;
    const backendStatus = backendHealthy ? 'connected' : 'disconnected';

    if (backendHealthResponse && backendHealthResponse.ok) {
      const healthData = await backendHealthResponse.text();
      console.log('[API Route] Backend health response:', healthData);
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      backend: {
        url: ASB_API_URL,
        status: backendStatus,
        healthy: backendHealthy
      }
    });
  } catch (error) {
    console.error('[API Route] Health endpoint error:', error);
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      backend: {
        url: ASB_API_URL,
        status: 'error',
        healthy: false
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}