/**
 * Python Microservices Health Proxy API Route
 *
 * Proxies to Python FastAPI /health/services endpoint
 * Used by Services settings page to display microservice status
 */

import { NextRequest, NextResponse } from 'next/server';

// Server-side: Use localhost since Python service runs on same server
// Production ports: GeoLex=8001, Bookie=8002, Vergilex=8003
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ||
                           process.env.NEXT_PUBLIC_PYTHON_URL ||
                           'http://localhost:8003';

export async function GET(request: NextRequest) {
  try {
    // Try direct Python service health/services endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${PYTHON_SERVICE_URL}/health/services`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Try alternative /health endpoint
      const healthResponse = await fetch(`${PYTHON_SERVICE_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        // Return basic service info if detailed services endpoint not available
        return NextResponse.json({
          microservices: [
            {
              name: 'Python Services',
              status: healthData.status === 'healthy' ? 'running' : 'error',
              description: 'FastAPI AI/ML microservices',
            }
          ],
          system: null,
          timestamp: new Date().toISOString(),
        });
      }

      throw new Error(`Python service returned status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Python health services proxy error:', error.message);

    // Return empty response for UI to show "erisilemez" message
    return NextResponse.json({
      microservices: [],
      system: null,
      error: error.message || 'Python service unreachable',
      timestamp: new Date().toISOString(),
    });
  }
}
