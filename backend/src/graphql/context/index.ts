/**
 * GraphQL Context
 * Her GraphQL request için context oluşturur
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { createDataLoaders, DataLoaders } from '../dataloaders';
import { lsembPool } from '../../config/database.config';
import { initializeRedis } from '../../config/redis';

/**
 * GraphQL Context tipi
 */
export interface GraphQLContext {
  // Request/Response
  req: Request;
  res: Response;

  // Database
  pool: Pool;
  redis: Redis;
  prisma?: any; // Optional Prisma client (not currently used)

  // DataLoaders (N+1 prevention)
  dataloaders: DataLoaders;

  // Services
  services?: {
    embedding?: {
      checkHealth: () => Promise<boolean>;
    };
  };

  // User info (authentication'dan sonra eklenir)
  user?: {
    id: string;
    email: string;
    role: string;
    permissions?: string[];
  };

  // Request metadata
  requestId: string;
  startTime: number;
}

/**
 * Context oluşturucu fonksiyon
 */
export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<GraphQLContext> {
  // Request ID oluştur (tracing için)
  const requestId = `gql-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Redis client'ı al
  const redis = await initializeRedis();

  // DataLoader'ları oluştur (her request için yeni instance)
  const dataloaders = createDataLoaders(lsembPool);

  // Base context
  const context: GraphQLContext = {
    req,
    res,
    pool: lsembPool,  // lsembPool kullan
    redis,
    dataloaders,
    requestId,
    startTime: Date.now(),
  };

  // Authentication - JWT token'dan user bilgisini çıkar
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      // Basit JWT parse (production'da jwt.verify kullan)
      const user = await verifyJWTToken(token);
      if (user) {
        context.user = {
          id: user.id || user.userId,
          email: user.email,
          role: user.role || 'user',
          permissions: user.permissions || [],
        };
      }
    }
  } catch (error) {
    // Token geçersizse sessizce devam et
    // Protected resolver'lar kendi kontrollerini yapacak
    console.debug('[GraphQL] Token verification failed:', error);
  }

  return context;
}

/**
 * JWT Token doğrulama
 */
async function verifyJWTToken(token: string): Promise<any | null> {
  try {
    // JWT doğrulaması için jsonwebtoken kullan
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.debug('[GraphQL] JWT verification error:', error);
    return null;
  }
}

/**
 * Context type guard
 */
export function isAuthenticated(context: GraphQLContext): boolean {
  return !!context.user;
}

/**
 * Permission checker
 */
export function hasPermission(
  context: GraphQLContext,
  permission: string
): boolean {
  if (!context.user) return false;
  return context.user.permissions.includes(permission);
}

/**
 * Role checker
 */
export function hasRole(context: GraphQLContext, role: string): boolean {
  if (!context.user) return false;
  return context.user.role === role;
}

/**
 * Admin checker
 */
export function isAdmin(context: GraphQLContext): boolean {
  return hasRole(context, 'admin');
}

/**
 * Require authentication guard
 */
export function requireAuth(context: GraphQLContext): void {
  if (!isAuthenticated(context)) {
    throw new Error('Bu işlem için giriş yapmalısınız');
  }
}

/**
 * Require admin guard
 */
export function requireAdmin(context: GraphQLContext): void {
  requireAuth(context);
  if (!isAdmin(context)) {
    throw new Error('Bu işlem için admin yetkisi gereklidir');
  }
}

export default createContext;