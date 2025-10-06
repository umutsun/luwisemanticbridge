import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { User, CreateUserDto, LoginDto, AuthResponse, UserSession, JwtPayload } from '../types/user.types';

export class AuthService {
  private pool: Pool;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private saltRounds = 12;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production';
  }

  async register(userData: CreateUserDto): Promise<AuthResponse> {
    const { username, email, password, first_name, last_name } = userData;

    // Check if user already exists
    const existingUser = await this.pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('User with this email or username already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Create user (handle both old and new schema)
    const result = await this.pool.query(
      `INSERT INTO users (username, email, password_hash, password, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, first_name, last_name, role, is_active, email_verified, created_at, updated_at`,
      [username, email, passwordHash, passwordHash, first_name, last_name]
    );

    const user = result.rows[0];

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // Save session
    await this.saveSession(user.id, accessToken, refreshToken);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active,
        email_verified: user.email_verified,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      accessToken,
      refreshToken
    };
  }

  async login(loginData: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginData;

    // Find user (handle both old and new schema)
    const result = await this.pool.query(
      `SELECT id, username, email, COALESCE(password_hash, password) as password_hash, first_name, last_name, role, is_active, email_verified, created_at, updated_at
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // Save session
    await this.saveSession(user.id, accessToken, refreshToken);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active,
        email_verified: user.email_verified,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      accessToken,
      refreshToken
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as JwtPayload;

      // Check if refresh token exists in database
      const sessionResult = await this.pool.query(
        'SELECT user_id FROM user_sessions WHERE refresh_token = $1 AND expires_at > NOW()',
        [refreshToken]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Invalid refresh token');
      }

      // Get user
      const userResult = await this.pool.query(
        'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found or inactive');
      }

      const user = userResult.rows[0];

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Update session
      await this.pool.query(
        'UPDATE user_sessions SET token = $1, session_token = $1, refresh_token = $2 WHERE refresh_token = $3',
        [tokens.accessToken, tokens.refreshToken, refreshToken]
      );

      return tokens;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(accessToken: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM user_sessions WHERE token = $1',
      [accessToken]
    );
  }

  async getUserById(userId: number): Promise<Omit<User, 'password_hash'> | null> {
    const result = await this.pool.query(
      `SELECT id, username, email, first_name, last_name, role, is_active, email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  private async generateTokens(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, this.jwtRefreshSecret, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }

  private async saveSession(userId: number, accessToken: string, refreshToken: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await this.pool.query(
      `INSERT INTO user_sessions (user_id, token, session_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, accessToken, accessToken, refreshToken, expiresAt]
    );
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;

      // Check if session exists
      const sessionResult = await this.pool.query(
        'SELECT id FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()',
        [token]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found or expired');
      }

      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}