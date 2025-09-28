// All API calls are relative, relying on the Next.js proxy in next.config.js
const API_BASE = ''; 

export const api = {
  async get(endpoint: string) {
    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${endpoint}: ${response.statusText}`);
    }
    return response.json();
  },

  async post(endpoint: string, body: unknown) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Failed to post to ${endpoint}: ${response.statusText}`);
    }
    return response.json();
  },
};
