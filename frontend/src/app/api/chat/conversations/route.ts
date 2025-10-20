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

  // Fallback to cookie or other methods if needed
  return request.cookies.get('token')?.value || null;
}

// GET /api/chat/conversations - List all conversations
export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const backendUrl = `${ASB_API_URL}/api/v2/chat/conversations`;
    console.log('[API Route] Fetching conversations from:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(API.TIMEOUTS.DEFAULT),
    });

    if (!response.ok) {
      console.error('[API Route] Backend error:', response.status, response.statusText);
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[API Route] Conversations retrieved:', data.conversations?.length || 0);

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Conversations API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch conversations',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/chat/conversations/[id] - Update conversation
export async function PUT(request: NextRequest) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { conversationId, title } = body;

    if (!conversationId || !title) {
      return NextResponse.json(
        { error: 'conversationId and title are required' },
        { status: 400 }
      );
    }

    const backendUrl = `${ASB_API_URL}/api/v2/chat/conversations/${conversationId}`;
    console.log('[API Route] Updating conversation:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
      signal: AbortSignal.timeout(API.TIMEOUTS.DEFAULT),
    });

    if (!response.ok) {
      console.error('[API Route] Backend error:', response.status, response.statusText);
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API Route] Update conversation API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update conversation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/chat/conversations/[id] - Delete conversation
export async function DELETE(request: NextRequest) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const conversationId = url.pathname.split('/').pop();

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    const backendUrl = `${ASB_API_URL}/api/v2/chat/conversations/${conversationId}`;
    console.log('[API Route] Deleting conversation:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(API.TIMEOUTS.DEFAULT),
    });

    if (!response.ok) {
      console.error('[API Route] Backend error:', response.status, response.statusText);
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API Route] Delete conversation API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete conversation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}