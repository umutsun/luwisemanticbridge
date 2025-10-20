import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const { provider } = params;
    const body = await request.json();
    const { apiKey, model } = body;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key is required' },
        { status: 400 }
      );
    }

    // Forward the request to backend
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
    const response = await fetch(`${backendUrl}/api/v2/api-validation/test/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey, model }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API validation proxy error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'API validation failed',
        provider: params.provider
      },
      { status: 500 }
    );
  }
}