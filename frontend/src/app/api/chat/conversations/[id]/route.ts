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

// GET /api/chat/conversations/[id] - Get specific conversation
export async function GET(
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
    const backendUrl = `${ASB_API_URL}/api/v2/chat/conversations/${conversationId}`;
    console.log('[API Route] Fetching conversation:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(API.TIMEOUTS.DEFAULT),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Get conversation API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch conversation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/chat/conversations/[id] - Update conversation title
export async function PUT(
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
    const body = await request.json();
    const { title } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
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
export async function DELETE(
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