import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import {
  User,
  CreateUserDto,
  LoginDto,
  AuthResponse,
  UserSession,
  JwtPayload,
} from "../types/user.types";
// Temporarily disabled to prevent hanging on authentication
// import { redis } from "../config/redis";

export class AuthService {
  private pool: Pool;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private saltRounds = 12;

  constructor() {
    // Use explicit connection config to avoid SSL issues
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'lsemb',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: false, // Disable SSL for local/development
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // 10 seconds for remote DB
    });
    this.jwtSecret =
      process.env.JWT_SECRET || "your-secret-key-change-in-production";
    this.jwtRefreshSecret =
      process.env.JWT_REFRESH_SECRET ||
      "your-refresh-secret-change-in-production";
  }

  async register(userData: CreateUserDto): Promise<AuthResponse> {
    const { username, email, password, first_name, last_name } = userData;

    // Check if user already exists
    const existingUser = await this.pool.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      throw new Error("User with this email or username already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Create user (handle both old and new schema)
    // Use name column from SQL schema instead of first_name, last_name
    const fullName = `${first_name || ""} ${last_name || ""}`.trim();
    const result = await this.pool.query(
      `INSERT INTO users (username, email, password, name, role, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, name, role, status, email_verified, created_at, updated_at`,
      [
        username,
        email,
        passwordHash,
        fullName || username,
        "user",
        "active",
        false,
      ]
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
        name: user.name,
        role: user.role,
        status: user.status,
        email_verified: user.email_verified,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(loginData: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginData;

    // Find user
    const result = await this.pool.query(
      `SELECT id, username, email, password as password_hash, name, role, status, email_verified, created_at, updated_at
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error("Invalid credentials");
    }

    const user = result.rows[0];

    if (user.status !== "active") {
      throw new Error("Account is deactivated");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
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
        name: user.name,
        role: user.role,
        status: user.status,
        email_verified: user.email_verified,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(
        refreshToken,
        this.jwtRefreshSecret
      ) as JwtPayload;

      // Check if refresh token exists in database
      const sessionResult = await this.pool.query(
        "SELECT user_id FROM user_sessions WHERE refresh_token = $1 AND expires_at > NOW()",
        [refreshToken]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error("Invalid refresh token");
      }

      // Get user
      const userResult = await this.pool.query(
        "SELECT id, email, role FROM users WHERE id = $1 AND status = $2",
        [decoded.userId, "active"]
      );

      if (userResult.rows.length === 0) {
        throw new Error("User not found or inactive");
      }

      const user = userResult.rows[0];

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Update session
      await this.pool.query(
        "UPDATE user_sessions SET token = $1, refresh_token = $2 WHERE refresh_token = $3",
        [tokens.accessToken, tokens.refreshToken, refreshToken]
      );

      return tokens;
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  async logout(accessToken: string): Promise<void> {
    await this.pool.query("DELETE FROM user_sessions WHERE token = $1", [
      accessToken,
    ]);
  }

  async getUserById(userId: string): Promise<Omit<User, "password"> | null> {
    const result = await this.pool.query(
      `SELECT id, username, email, name, role, status, email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  private async generateTokens(
    user: any
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    // Her zaman development token sürelerini kullan (çalışması garanti olsun)
    const accessExpiry = "7d"; // 7 gün
    const refreshExpiry = "90d"; // 90 gün

    console.log(
      "[AuthService] Using development token expirations - Access:",
      accessExpiry,
      "Refresh:",
      refreshExpiry
    );

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: accessExpiry,
    });
    const refreshToken = jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: refreshExpiry,
    });

    return { accessToken, refreshToken };
  }

  private async saveSession(
    userId: string,
    accessToken: string,
    refreshToken: string
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    // Save to PostgreSQL
    await this.pool.query(
      `INSERT INTO user_sessions (user_id, token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         token = EXCLUDED.token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, accessToken, refreshToken, expiresAt]
    );

    // Redis temporarily disabled to prevent authentication hanging
    // TODO: Re-enable Redis once authentication issues are resolved
    /*
    try {
      const sessionData = {
        userId,
        accessToken,
        refreshToken,
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
      };

      const redisTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis operation timeout')), 2000)
      );

      await Promise.race([
        redis.setex(
          `session:${userId}`,
          30 * 24 * 60 * 60,
          JSON.stringify(sessionData)
        ),
        redisTimeout
      ]);

      await Promise.race([
        redis.setex(`token:${accessToken}`, 30 * 24 * 60 * 60, userId),
        redisTimeout
      ]);

      console.log(`[AuthService] Session saved to Redis for user ${userId}`);
    } catch (error) {
      console.error("[AuthService] Failed to save session to Redis:", error);
    }
    */
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;

      // Redis temporarily disabled - use PostgreSQL only
      // TODO: Re-enable Redis once authentication issues are resolved
      /*
      try {
        const redisTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis operation timeout')), 2000)
        );

        const userId = await Promise.race([
          redis.get(`token:${token}`),
          redisTimeout
        ]) as string | null;

        if (userId && userId === decoded.userId.toString()) {
          return decoded;
        }
      } catch (redisError) {
        console.error("[AuthService] Redis verification failed:", redisError);
      }
      */

      // Use PostgreSQL for session validation - check by user_id instead of exact token match
      // This allows multiple valid tokens per user (e.g., multiple devices/tabs)
      const sessionResult = await this.pool.query(
        "SELECT id FROM user_sessions WHERE user_id = $1 AND expires_at > NOW()",
        [decoded.userId]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error("Session not found or expired");
      }

      // Redis update disabled
      /*
      try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const redisTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis operation timeout')), 2000)
        );

        await Promise.race([
          redis.setex(
            `token:${token}`,
            30 * 24 * 60 * 60,
            decoded.userId.toString()
          ),
          redisTimeout
        ]);
        console.log(
          `[AuthService] Token refreshed in Redis for user ${decoded.userId}`
        );
      } catch (redisError) {
        console.error("[AuthService] Failed to update Redis:", redisError);
      }
      */

      return decoded;
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  async createDefaultAdmin(): Promise<void> {
    // Use environment variable for admin email, default to admin@asb.com
    const email = process.env.ADMIN_EMAIL || "admin@asb.com";
    const password = process.env.ADMIN_PASSWORD || "admin123";

    // Check if admin user already exists
    const existingAdmin = await this.pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      console.log("✅ Admin user already exists:", email);
      return;
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    await this.pool.query(
      `INSERT INTO users (username, email, password, name, role, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["admin", email, passwordHash, "Administrator", "admin", "active", true]
    );

    console.log("✅ Default admin user created successfully");
    console.log("📧 Email:", email);
    console.log("🔑 Password:", password);
  }
}
