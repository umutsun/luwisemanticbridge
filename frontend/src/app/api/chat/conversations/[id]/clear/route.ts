import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { API, SERVER } from '@/config';

// LSEM Backend URL from environment or default
const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || `http://${SERVER.HOSTS.LOCALHOST}:${SERVER.DEFAULT_PORTS.BACKEND}`;

// Helper to get auth token
function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return request.cookies.get('token')?.value || null;
}

// POST /api/chat/conversations/[id]/clear - Clear conversation messages
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const conversationId = params.id;
    const backendUrl = `${ASB_API_URL}/api/v2/chat/conversations/${conversationId}/clear`;
    console.log('[API Route] Clearing conversation:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(API.TIMEOUTS.DEFAULT),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API Route] Clear conversation API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear conversation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}