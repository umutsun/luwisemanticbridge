import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      // If no body, use empty object
      body = {};
    }
    const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

    const response = await fetch(`${ASB_API_URL}/api/v2/embeddings/clear`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Backend error: ${error}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Embeddings clear API error:', error);
    return NextResponse.json(
      { error: 'Failed to clear embeddings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      // If no body, use empty object
      body = {};
    }
    const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

    const response = await fetch(`${ASB_API_URL}/api/v2/embeddings/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Backend error: ${error}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Embeddings clear API error:', error);
    return NextResponse.json(
      { error: 'Failed to clear embeddings' },
      { status: 500 }
    );
  }
}
