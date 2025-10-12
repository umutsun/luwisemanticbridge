import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const ASB_API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

  try {
    const response = await fetch(`${ASB_API_URL}/api/v2/embeddings/progress/stream`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }

    // Create a readable stream to forward SSE events
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let lastDataTime = Date.now();

        if (!reader) {
          controller.close();
          return;
        }

        // Set up timeout to detect stalled connections
        const timeoutInterval = setInterval(() => {
          const now = Date.now();
          if (now - lastDataTime > 15000) { // 15 seconds without data
            console.error('SSE connection timeout detected');
            controller.error(new Error('SSE connection timeout'));
            clearInterval(timeoutInterval);
          }
        }, 5000);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            lastDataTime = Date.now();

            // Check if this is actual data or keepalive
            if (chunk.trim() && !chunk.startsWith(':')) {
              controller.enqueue(new TextEncoder().encode(chunk));
            }
          }
        } catch (error) {
          console.error('SSE stream error:', error);
          controller.error(error);
        } finally {
          clearInterval(timeoutInterval);
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('SSE proxy error:', error);
    // Return error as SSE event instead of HTTP error
    return new Response(`data: ${JSON.stringify({ error: 'Failed to connect to SSE stream', fallback: true })}\n\n`, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    });
  }
}