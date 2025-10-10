import { RegisterData, LoginData, AuthResponse, User } from '@/types/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.NEXT_PUBLIC_API_PORT || '8084'}`;

class AuthError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AuthError';
  }
}

class AuthService {
  private accessToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/api/v2/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    const result = await response.json();

    if (!response.ok) {
      throw new AuthError(result.error || 'Registration failed', response.status);
    }

    this.setToken(result.accessToken);
    return result;
  }

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    const result = await response.json();

    if (!response.ok) {
      throw new AuthError(result.error || 'Login failed', response.status);
    }

    this.setToken(result.accessToken);
    return result;
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/v2/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.removeToken();
    }
  }

  async getCurrentUser(): Promise<User | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/api/v2/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.removeToken();
        }
        return null;
      }

      const result = await response.json();
      return result.user;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  async refreshToken(): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE}/api/v2/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        this.removeToken();
        return null;
      }

      const result = await response.json();
      this.setToken(result.accessToken);
      return result.accessToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.removeToken();
      return null;
    }
  }

  private setToken(token: string): void {
    this.accessToken = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', token);
    }
  }

  private removeToken(): void {
    this.accessToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}

export const authService = new AuthService();
export { AuthError };