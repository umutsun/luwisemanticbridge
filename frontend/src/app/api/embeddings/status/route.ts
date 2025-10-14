import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const ASB_API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

    // Call the backend's status endpoint
    const response = await fetch(`${ASB_API_URL}/api/v2/embeddings/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Backend error: ${error}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Embeddings status API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch embeddings status' },
      { status: 500 }
    );
  }
}