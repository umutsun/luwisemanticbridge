import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Forward the request to backend
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
    const response = await fetch(`${backendUrl}/api/v2/api-validation/status`, {
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
    console.error('API validation status proxy error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get API validation status'
      },
      { status: 500 }
    );
  }
}