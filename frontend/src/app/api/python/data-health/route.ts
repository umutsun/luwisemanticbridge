/**
 * Data Health API Proxy Route
 *
 * Proxies requests to Python FastAPI data-health endpoints
 * Handles: report, tables, fix-metadata, delete-orphans, delete-duplicates
 */

import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ||
                           process.env.NEXT_PUBLIC_PYTHON_URL ||
                           'http://localhost:8003';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'report';
    const table = searchParams.get('table');

    let url = `${PYTHON_SERVICE_URL}/api/python/data-health/${endpoint}`;
    if (table) {
      url = `${PYTHON_SERVICE_URL}/api/python/data-health/table/${table}/stats`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Python service returned status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Data health proxy error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Python service unreachable' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'quick-fix';
    const table = searchParams.get('table');
    const dryRun = searchParams.get('dry_run') === 'true';

    let url: string;
    let body: any = {};

    switch (action) {
      case 'quick-fix':
        url = `${PYTHON_SERVICE_URL}/api/python/data-health/quick-fix/${table}?dry_run=${dryRun}`;
        break;
      case 'fix-metadata':
        url = `${PYTHON_SERVICE_URL}/api/python/data-health/fix-metadata`;
        body = await request.json();
        break;
      case 'delete-orphans':
        url = `${PYTHON_SERVICE_URL}/api/python/data-health/delete-orphans`;
        body = await request.json();
        break;
      case 'delete-duplicates':
        url = `${PYTHON_SERVICE_URL}/api/python/data-health/delete-duplicates`;
        body = await request.json();
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout for operations

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: action === 'quick-fix' ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Python service error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Data health action error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Operation failed' },
      { status: 500 }
    );
  }
}
