import { API_BASE_URL } from '@/config/api.config';

const TOKEN_STORAGE_KEY = 'token';

const dispatchTokenEvent = (token: string | null) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tokenChanged', { detail: { token } }));
  }
};

export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  // First try localStorage
  let token = localStorage.getItem(TOKEN_STORAGE_KEY);

  // If not in localStorage, try cookie
  if (!token) {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'auth-token' || name === 'asb_token') {
        token = value;
        // Store in localStorage for consistency
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        break;
      }
    }
  }

  return token;
};

export const setStoredToken = (token: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  const current = localStorage.getItem(TOKEN_STORAGE_KEY);

  if (token) {
    if (current === token) {
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    if (!current) {
      return;
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  dispatchTokenEvent(token);
};

export const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      setStoredToken(null);
      return null;
    }

    const data = await response.json();
    if (data?.accessToken) {
      setStoredToken(data.accessToken);
      return data.accessToken;
    }

    setStoredToken(null);
    return null;
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    setStoredToken(null);
    return null;
  }
};

export interface FetchWithAuthOptions extends RequestInit {
  retry?: boolean;
}

export const fetchWithAuth = async (
  input: RequestInfo | URL,
  init: FetchWithAuthOptions = {}
): Promise<Response> => {
  const { retry = true, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders || {});
  const hasAuthHeader = headers.has('Authorization');
  const token = getStoredToken();

  if (token && !hasAuthHeader) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...rest,
    headers,
  });

  if (response.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders = new Headers(initHeaders || {});
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return fetchWithAuth(input, {
        ...rest,
        headers: retryHeaders,
        retry: false,
      });
    }
  }

  return response;
};

/**
 * Safe JSON parse helper to prevent "Unexpected token '<'" errors
 * when response is HTML instead of JSON
 */
export const safeJsonParse = async (response: Response): Promise<any> => {
  // Check if response is ok
  if (!response.ok) {
    console.warn(`[safeJsonParse] Response not ok: ${response.status} ${response.statusText}`);
    return null;
  }

  // Check content-type
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    console.warn(`[safeJsonParse] Response is not JSON (content-type: ${contentType})`);
    // Try to get text for debugging
    const text = await response.text();
    console.warn(`[safeJsonParse] Response text: ${text.substring(0, 200)}...`);
    return null;
  }

  // Parse JSON safely
  try {
    return await response.json();
  } catch (error) {
    console.error('[safeJsonParse] JSON parse error:', error);
    return null;
  }
};

