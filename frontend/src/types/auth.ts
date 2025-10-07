export interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  role: 'user' | 'admin' | 'moderator';
  status?: string;
  is_active?: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  subscription?: {
    id: string;
    plan_name: string;
    status: string;
    queries_used: number;
    queries_limit: number;
    created_at: string;
    expires_at?: string;
  };
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}