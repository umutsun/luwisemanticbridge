import { NextRequest, NextResponse } from 'next/server';

// Simple stub route to prevent build errors
// The actual scraper functionality should be moved to a separate service

export async function POST(request: NextRequest) {
  return NextResponse.json({
    error: 'Scraper service is disabled. Please use the dedicated scraper service.',
    success: false
  }, { status: 503 });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    error: 'Scraper service is disabled. Please use the dedicated scraper service.',
    success: false
  }, { status: 503 });
}