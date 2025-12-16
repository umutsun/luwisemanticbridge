import { API_BASE_URL } from '@/config/api.config';

export interface ApiConfig {
  getApiUrl: (path: string) => string;
}

export const apiConfig: ApiConfig = {
  getApiUrl: (path: string) => {
    // Remove leading slash if present
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;

    // If the path already includes the API base URL, return as is
    if (normalizedPath.startsWith('http')) {
      return normalizedPath;
    }

    // Otherwise, construct the full URL
    return `${API_BASE_URL}/${normalizedPath}`;
  }
};

// Helper function for authenticated requests
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
};

export { apiConfig as default };