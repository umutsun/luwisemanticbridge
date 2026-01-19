import { NextRequest } from 'next/server';

const BASE_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || '';

async function handler(req: NextRequest) {
  const slugPath = req.nextUrl.pathname.replace('/api/embeddings', '');
  const requestUrl = `${BASE_URL}/api/v2/embeddings${slugPath}`;

  if (slugPath === '/progress/stream') {
    try {
      const response = await fetch(requestUrl);

      // Create a new TransformStream to process the SSE stream
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('No response body');
      }

      // Process the stream and forward data
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward the chunk directly
            await writer.write(value);
          }
        } catch (error) {
          console.error('Stream processing error:', error);
        } finally {
          writer.close();
        }
      };

      processStream();

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
        },
      });
    } catch (error) {
      console.error(`[EMBEDDINGS SSE PROXY ERROR]`, error);
      return new Response(JSON.stringify({ error: 'Proxy SSE failed to connect to backend' }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  try {
    const response = await fetch(requestUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.body,
      // @ts-ignore
      duplex: 'half',
    });

    // Create a new headers object to modify CORS headers
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

  } catch (error) {
    console.error(`[EMBEDDINGS PROXY ERROR]`, error);
    return new Response(JSON.stringify({ error: 'Proxy failed to connect to backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
