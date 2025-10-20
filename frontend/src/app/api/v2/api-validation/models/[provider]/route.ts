import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const { provider } = params;

    // Forward the request to backend
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
    const response = await fetch(`${backendUrl}/api/v2/api-validation/models/${provider}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API validation models proxy error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get models',
        provider: params.provider
      },
      { status: 500 }
    );
  }
}