import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes that don't require authentication
const publicRoutes = ['/login', '/register', '/forgot-password', '/initialize', '/api/auth', '/favicon.ico', '/_next'];

// Admin only routes
const adminRoutes = ['/admin', '/api/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth-token')?.value || request.cookies.get('asb_token')?.value;

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  // Special handling for root route - check if user has valid session
  if (pathname === '/') {
    if (!token) {
      const url = new URL('/login', request.url);
      return NextResponse.redirect(url);
    }
    // If logged in, let them access the chatbot at "/"
    // (page.tsx handles the UI for authenticated users)
  }
  // For other protected routes
  else if (!token && !isPublicRoute) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // If token exists, verify it
  if (token) {
    try {
      // Decode JWT token (without verification for now)
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );

      // Check token expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('auth-token');
        response.cookies.delete('asb_token');
        return response;
      }

      // Check admin routes - allow admin and manager roles
      const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route));
      if (isAdminRoute && !['admin', 'manager'].includes(payload.role || 'user')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }

      // Add user info to headers for API routes
      if (pathname.startsWith('/api')) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-user-id', payload.id || '');
        requestHeaders.set('x-user-role', payload.role || 'user');
        
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      }
    } catch (error) {
      // Invalid token - only redirect if not a public route
      if (!isPublicRoute) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('auth-token');
        response.cookies.delete('asb_token');
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};