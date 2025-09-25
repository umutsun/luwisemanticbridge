// This route is no longer needed as Next.js rewrites handle the forwarding directly
// The request will be rewritten to http://localhost:8083/api/dashboard automatically
export async function GET() {
  // Return empty response - this route should not be called due to rewrites
  return new Response('This route has been deprecated. Use Next.js rewrite instead.', {
    status: 410,
    headers: { 'Content-Type': 'text/plain' }
  });
}