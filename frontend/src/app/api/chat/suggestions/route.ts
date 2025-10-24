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

// GET /api/chat/suggestions - Get chat suggestions
export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const context = url.searchParams.get('context');

    const backendUrl = `${ASB_API_URL}/api/v2/chat/suggestions${context ? `?context=${encodeURIComponent(context)}` : ''}`;
    console.log('[API Route] Fetching chat suggestions:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(API.TIMEOUTS.DEFAULT),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Chat suggestions API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch chat suggestions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}