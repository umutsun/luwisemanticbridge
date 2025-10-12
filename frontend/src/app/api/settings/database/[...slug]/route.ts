import { NextRequest } from 'next/server';

const BASE_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

async function handler(req: NextRequest) {
  const slugPath = req.nextUrl.pathname.replace('/api/settings/database', '');
  const requestUrl = `${BASE_URL}/api/v2/settings/database${slugPath}`;

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

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

  } catch (error) {
    console.error(`[DATABASE PROXY ERROR]`, error);
    return new Response(JSON.stringify({ error: 'Proxy failed to connect to backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
