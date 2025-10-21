/**
 * GraphQL Context
 * Her GraphQL request için context oluşturur
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { createDataLoaders, DataLoaders } from '../dataloaders';
import { AuthService } from '../../services/auth.service';
import { SemanticSearchService } from '../../services/semanticSearch.service';
import { ChatService } from '../../services/chat.service';
import { DocumentService } from '../../services/document.service';
import { ScraperService } from '../../services/scraper.service';
import { EmbeddingService } from '../../services/embedding.service';
import prisma from '../../config/database';
import { getRedisClient } from '../../config/redis';

/**
 * GraphQL Context tipi
 */
export interface GraphQLContext {
  // Request/Response
  req: Request;
  res: Response;

  // Database
  prisma: PrismaClient;
  redis: Redis;

  // Services
  services: {
    auth: AuthService;
    search: SemanticSearchService;
    chat: ChatService;
    document: DocumentService;
    scraper: ScraperService;
    embedding: EmbeddingService;
  };

  // DataLoaders (N+1 prevention)
  dataloaders: DataLoaders;

  // User info (authentication'dan sonra eklenir)
  user?: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };

  // Request metadata
  requestId: string;
  startTime: number;
}

/**
 * Service instance'ları (singleton)
 */
let serviceInstances: GraphQLContext['services'] | null = null;

/**
 * Service'leri initialize et
 */
function initializeServices(): GraphQLContext['services'] {
  if (!serviceInstances) {
    serviceInstances = {
      auth: new AuthService(),
      search: new SemanticSearchService(),
      chat: new ChatService(),
      document: new DocumentService(),
      scraper: new ScraperService(),
      embedding: new EmbeddingService(),
    };
  }
  return serviceInstances;
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
  const redis = await getRedisClient();

  // Services'i initialize et
  const services = initializeServices();

  // DataLoader'ları oluştur (her request için yeni instance)
  const dataloaders = createDataLoaders(prisma);

  // Base context
  const context: GraphQLContext = {
    req,
    res,
    prisma,
    redis,
    services,
    dataloaders,
    requestId,
    startTime: Date.now(),
  };

  // Authentication - JWT token'dan user bilgisini çıkar
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const user = await services.auth.verifyToken(token);
      if (user) {
        context.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          permissions: user.permissions || [],
        };
      }
    }
  } catch (error) {
    // Token geçersizse sessizce devam et
    // Protected resolver'lar kendi kontrollerini yapacak
    console.debug('Token verification failed:', error);
  }

  return context;
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

export default createContext;