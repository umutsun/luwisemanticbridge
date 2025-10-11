import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { API, SERVER, LLM } from '@/config';

// Read configuration from file
async function getConfig() {
  try {
    const fs = await import('fs/promises');
    const configPath = path.join(process.cwd(), 'config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    return null;
  }
}

// ASB Backend URL
const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || `http://${SERVER.HOSTS.LOCALHOST}:${SERVER.DEFAULT_PORTS.BACKEND}`;

export async function POST(request: NextRequest) {
  try {
    const config = await getConfig();
    const body = await request.json();
    const { message, conversationId, stream, clientId } = body;

    console.log('[API Stream] Received streaming request:', { message, conversationId, stream, clientId });

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!stream || !clientId) {
      return NextResponse.json(
        { error: 'Stream and clientId are required' },
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
      stream: true,
      clientId: clientId,
      // Add config settings
      ...(config && {
        temperature: config.llmSettings?.temperature || LLM.DEFAULT_SETTINGS.TEMPERATURE,
        model: config.llmSettings?.activeChatModel || LLM.MODELS.DEFAULT,
        ragWeight: config.llmSettings?.ragWeight || LLM.DEFAULT_SETTINGS.RAG_WEIGHT,
        llmKnowledgeWeight: config.llmSettings?.llmKnowledgeWeight || LLM.DEFAULT_SETTINGS.LLM_KNOWLEDGE_WEIGHT,
        useLocalDb: config.dataSource?.useLocalDb !== false,
        language: config.llmSettings?.language || 'tr',
        responseStyle: config.llmSettings?.responseStyle || 'professional',
        topP: config.llmSettings?.topP || LLM.DEFAULT_SETTINGS.TOP_P,
        maxTokens: config.llmSettings?.maxTokens || LLM.DEFAULT_SETTINGS.MAX_TOKENS,
        presencePenalty: config.llmSettings?.presencePenalty || LLM.DEFAULT_SETTINGS.PRESENCE_PENALTY,
        frequencyPenalty: config.llmSettings?.frequencyPenalty || LLM.DEFAULT_SETTINGS.FREQUENCY_PENALTY
      })
    };

    console.log('[API Stream] Sending streaming request to backend:', `${ASB_API_URL}/api/v2/chat`);

    // Call ASB backend v2 chat API with streaming flag
    const response = await fetch(`${ASB_API_URL}/api/v2/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(API.TIMEOUTS.CHAT),
    });

    const responseText = await response.text();
    console.log('[API Stream] Backend response status:', response.status);

    if (!response.ok) {
      console.error('[API Stream] Backend error:', responseText);
      throw new Error(`ASB API responded with status: ${response.status} - ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[API Stream] Failed to parse response:', parseError);
      throw new Error('Invalid response from backend');
    }

    console.log('[API Stream] Streaming initiated:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Stream] Chat streaming error:', error);

    return NextResponse.json(
      {
        error: 'Failed to process streaming chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}