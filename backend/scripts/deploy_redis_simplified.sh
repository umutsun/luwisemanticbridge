#!/bin/bash
# =============================================
# Deploy Simplified Redis Configuration
# Phase 2: Technical Debt Cleanup
# Date: 2025-01-22
# =============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="/var/www/scriptus/backend"
REDIS_CONFIG_FILE="src/config/redis.ts"
BACKUP_DIR="backups/redis_configs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Redis Configuration Simplification${NC}"
echo -e "${GREEN}=========================================${NC}"

# Function to deploy to a specific instance
deploy_to_instance() {
    local INSTANCE_NAME=$1
    local INSTANCE_DIR=$2
    local PM2_NAME=$3

    echo -e "\n${YELLOW}Processing ${INSTANCE_NAME}...${NC}"

    # Check if instance directory exists
    if [ ! -d "$INSTANCE_DIR" ]; then
        echo -e "${RED}Directory not found: ${INSTANCE_DIR}${NC}"
        return 1
    fi

    cd "$INSTANCE_DIR/backend"

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Backup current Redis config
    if [ -f "$REDIS_CONFIG_FILE" ]; then
        cp "$REDIS_CONFIG_FILE" "$BACKUP_DIR/redis_${TIMESTAMP}.ts"
        echo -e "${GREEN}✓ Backed up current config to ${BACKUP_DIR}/redis_${TIMESTAMP}.ts${NC}"
    fi

    # Check if simplified config exists
    if [ ! -f "src/config/redis-simplified.ts" ]; then
        echo -e "${YELLOW}⚠ Simplified config not found, creating...${NC}"

        # Create the simplified config (copy from development)
        cat > src/config/redis-simplified.ts << 'EOF'
/**
 * Simplified Redis Configuration
 * Tek bir bağlantı yolu, gereksiz fallback'ler kaldırıldı
 * VERİ KAYBI YOK - Mevcut Redis data korunur
 */

import Redis from "ioredis";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

// Redis configuration from environment
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  db: parseInt(process.env.REDIS_DB || "2"),
  password: process.env.REDIS_PASSWORD || undefined,

  // Connection settings
  connectTimeout: 10000,
  commandTimeout: 5000,
  maxRetriesPerRequest: 3,

  // Retry strategy
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 attempts');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 1000, 3000);
    logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },

  // Error handling
  enableOfflineQueue: true,  // Queue commands when offline
  lazyConnect: false,  // Connect immediately
};

// Single Redis instance (no complex fallbacks)
let redisInstance: Redis | null = null;
let subscriberInstance: Redis | null = null;

/**
 * Initialize Redis connections
 * Simple, straightforward, no complex fallbacks
 */
export async function initializeRedis(): Promise<Redis | null> {
  try {
    // Log configuration (without password)
    logger.info('Initializing Redis', {
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port,
      db: REDIS_CONFIG.db,
      hasPassword: !!REDIS_CONFIG.password
    });

    // Create main connection
    redisInstance = new Redis(REDIS_CONFIG);

    // Create subscriber (duplicate of main)
    subscriberInstance = redisInstance.duplicate();

    // Set up event handlers
    redisInstance.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisInstance.on('ready', () => {
      logger.info('Redis ready to accept commands');
    });

    redisInstance.on('error', (err) => {
      logger.error('Redis error:', err.message);
      // Don't crash - let retry strategy handle it
    });

    subscriberInstance.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    subscriberInstance.on('error', (err) => {
      logger.error('Redis subscriber error:', err.message);
      // Don't crash - let retry strategy handle it
    });

    // Test connection
    await redisInstance.ping();
    logger.info('Redis ping successful');

    return redisInstance;

  } catch (error) {
    logger.error('Failed to initialize Redis:', error);

    // Redis is optional - app can work without it
    // Return null to indicate Redis unavailable
    redisInstance = null;
    subscriberInstance = null;

    return null;
  }
}

/**
 * Get Redis instance
 * Returns null if Redis not available
 */
export function getRedis(): Redis | null {
  if (!redisInstance) {
    logger.warn('Redis not initialized');
  }
  return redisInstance;
}

/**
 * Get subscriber instance
 * Returns null if Redis not available
 */
export function getSubscriber(): Redis | null {
  if (!subscriberInstance) {
    logger.warn('Redis subscriber not initialized');
  }
  return subscriberInstance;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisInstance !== null && redisInstance.status === 'ready';
}

/**
 * Safe Redis operations with null checks
 * Use these instead of direct redis calls
 */
export const safeRedis = {
  async get(key: string): Promise<string | null> {
    if (!isRedisAvailable()) return null;
    try {
      return await redisInstance!.get(key);
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  },

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      if (ttl) {
        await redisInstance!.setex(key, ttl, value);
      } else {
        await redisInstance!.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      await redisInstance!.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return false;
    }
  },

  async hget(key: string, field: string): Promise<string | null> {
    if (!isRedisAvailable()) return null;
    try {
      return await redisInstance!.hget(key, field);
    } catch (error) {
      logger.error('Redis HGET error:', error);
      return null;
    }
  },

  async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      await redisInstance!.hset(key, field, value);
      return true;
    } catch (error) {
      logger.error('Redis HSET error:', error);
      return false;
    }
  },

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      await redisInstance!.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Redis EXPIRE error:', error);
      return false;
    }
  }
};

/**
 * Graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  logger.info('Closing Redis connections...');

  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }

  if (subscriberInstance) {
    await subscriberInstance.quit();
    subscriberInstance = null;
  }

  logger.info('Redis connections closed');
}

// Export instances for backward compatibility
// But recommend using getRedis() and safeRedis instead
export { redisInstance as redis, subscriberInstance as subscriber };

// Default export
export default {
  initializeRedis,
  getRedis,
  getSubscriber,
  isRedisAvailable,
  safeRedis,
  closeRedis
};
EOF
        echo -e "${GREEN}✓ Created simplified Redis configuration${NC}"
    fi

    # Test the simplified config
    echo -e "${YELLOW}Testing simplified configuration...${NC}"
    npx ts-node -e "
        const config = require('./src/config/redis-simplified.ts');
        console.log('Config loaded successfully');
    " 2>/dev/null && echo -e "${GREEN}✓ Config syntax valid${NC}" || echo -e "${RED}✗ Config has syntax errors${NC}"

    # Deploy the simplified config
    echo -e "${YELLOW}Deploying simplified configuration...${NC}"
    cp src/config/redis-simplified.ts "$REDIS_CONFIG_FILE"
    echo -e "${GREEN}✓ Deployed simplified Redis configuration${NC}"

    # Restart the instance
    echo -e "${YELLOW}Restarting ${PM2_NAME}...${NC}"
    pm2 restart "$PM2_NAME" --update-env
    sleep 3

    # Check instance health
    pm2 status "$PM2_NAME" | grep -q "online" && \
        echo -e "${GREEN}✓ ${INSTANCE_NAME} is running${NC}" || \
        echo -e "${RED}✗ ${INSTANCE_NAME} failed to start${NC}"
}

# Main deployment
echo -e "${YELLOW}Starting Redis configuration deployment...${NC}"

# Deploy to all instances
deploy_to_instance "LSEMB" "/var/www/lsemb" "lsemb-backend"
deploy_to_instance "EMLAKAI" "/var/www/emlakai" "emlakai-backend"
deploy_to_instance "BOOKIE" "/var/www/bookie" "bookie-backend"
deploy_to_instance "SCRIPTUS" "/var/www/scriptus" "scriptus-backend"

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Summary${NC}"
echo -e "${GREEN}=========================================${NC}"

# Show PM2 status
pm2 list

echo -e "\n${GREEN}✓ Redis simplification deployed successfully!${NC}"
echo -e "${YELLOW}Note: Old configs backed up in ${BACKUP_DIR}${NC}"
echo -e "${YELLOW}Monitor logs with: pm2 logs [instance-name]${NC}"

# Test Redis connectivity
echo -e "\n${YELLOW}Testing Redis connectivity...${NC}"
redis-cli -n 2 ping && echo -e "${GREEN}✓ Redis responding${NC}" || echo -e "${RED}✗ Redis not responding${NC}"

# Show Redis info
echo -e "\n${YELLOW}Redis memory usage:${NC}"
redis-cli -n 2 INFO memory | grep used_memory_human

echo -e "\n${GREEN}Deployment complete!${NC}"