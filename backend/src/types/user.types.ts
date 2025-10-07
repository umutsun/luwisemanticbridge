export interface User {
  id: string; // UUID
  username: string;
  email: string;
  password: string;
  name: string;
  role: 'user' | 'admin' | 'premium';
  status: 'active' | 'inactive' | 'suspended';
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  subscription_type?: string;
  subscription_end_date?: Date;
}

export interface CreateUserDto {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
}

export interface UserSession {
  id: string; // UUID
  user_id: string; // UUID
  token: string;
  refresh_token?: string;
  expires_at: Date;
  created_at: Date;
  ip_address?: string;
  user_agent?: string;
}

export interface JwtPayload {
  userId: string; // UUID
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}