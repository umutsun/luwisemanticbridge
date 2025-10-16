import Redis from "ioredis";
import dotenv from "dotenv";
import { SettingsService } from "../services/settings.service";

dotenv.config();

// Create Redis connection with environment configuration only
async function createRedisConnection() {
  // FORCE PORT 6379 - Override system environment variable that might be using 6380
  // Always use port 6379 for this project regardless of system environment variables
  const config: any = {
    host: process.env.REDIS_HOST || "localhost",
    port: 6379, // ALWAYS use port 6379 for this project
    db: parseInt(process.env.REDIS_DB || "2"),
    // Enable authentication with password from environment
    password: process.env.REDIS_PASSWORD || undefined,
    // Add retry strategy for more robust connection
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Add connection timeout
    connectTimeout: 10000,
    commandTimeout: 5000,
    // Handle errors gracefully
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    // Disable reconnect to prevent error loops
    enableOfflineQueue: false,
  };

  // Debug log for Redis configuration
  console.log("🔍 Redis Configuration:", {
    host: config.host,
    port: config.port,
    db: config.db,
    hasPassword: !!config.password,
  });

  return new Redis(config);
}

// Initialize Redis connections
let redisInstance: Redis;
let subscriberInstance: Redis;
let isInitializing = false;
let initPromise: Promise<Redis> | null = null;

// Async initialization function
export async function initializeRedis() {
  // Check if already initialized
  if (redisInstance && redisInstance.status === "ready") {
    return redisInstance;
  }

  // If initialization is in progress, wait for it
  if (isInitializing && initPromise) {
    return initPromise;
  }

  // Start initialization
  isInitializing = true;

  // Create initialization promise
  initPromise = (async () => {
    try {
      // Try with password first, then without password if NOAUTH error
      console.log("🔄 Attempting Redis connection with password...");
      const redisConn = await createRedisConnection();
      const subscriberConn = redisConn.duplicate();

      redisInstance = redisConn;
      subscriberInstance = subscriberConn;

      // Error handlers - prevent unhandled errors
      redisInstance.on("error", (err: any) => {
        console.error("Redis connection error:", err.message);
        // If NOAUTH error, try without password
        if (
          err.message.includes("NOAUTH") ||
          err.message.includes("ECONNREFUSED")
        ) {
          console.log(
            "🔄 NOAUTH/ECONNREFUSED error detected, trying without password..."
          );
          fallbackToNoAuth();
        }
      });

      subscriberInstance.on("error", (err: any) => {
        console.error("Redis subscriber connection error:", err.message);
        if (
          err.message.includes("NOAUTH") ||
          err.message.includes("ECONNREFUSED")
        ) {
          fallbackToNoAuth();
        }
      });

      // Add warning handler for better debugging
      redisInstance.on("warning", (warn: any) => {
        console.warn("Redis warning:", warn);
      });

      subscriberInstance.on("warning", (warn: any) => {
        console.warn("Redis subscriber warning:", warn);
      });

      redisInstance.on("connect", () => {
        console.log("✅ Redis connected successfully.");
      });

      subscriberInstance.on("connect", () => {
        console.log("✅ Redis subscriber connected successfully.");
      });

      // Try to establish connection
      await redisInstance.connect();
      await subscriberInstance.connect();

      return redisInstance;
    } catch (error) {
      console.error("❌ Failed to initialize Redis connections:", error);
      // Check if it's a NOAUTH or connection error and try without password
      if (
        error instanceof Error &&
        (error.message.includes("NOAUTH") ||
          error.message.includes("ECONNREFUSED"))
      ) {
        console.log(
          "🔄 NOAUTH/ECONNREFUSED error in initial connection, trying without password..."
        );
        return fallbackToNoAuth();
      }
      // Create dummy Redis objects that gracefully fail
      redisInstance = createFallbackRedis();
      subscriberInstance = createFallbackRedis();
      return redisInstance;
    } finally {
      isInitializing = false;
      initPromise = null;
    }
  })();

  return initPromise;
}

// Fallback function to try without password
function fallbackToNoAuth() {
  console.log("🔄 Creating Redis connection without password...");
  try {
    const noAuthConfig = {
      host: process.env.REDIS_HOST || "localhost",
      port: 6379, // ALWAYS use port 6379 for this project
      db: parseInt(process.env.REDIS_DB || "2"),
      // No password for fallback
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 10000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    };

    console.log("🔍 Redis No-Auth Configuration:", {
      host: noAuthConfig.host,
      port: noAuthConfig.port,
      db: noAuthConfig.db,
      hasPassword: false,
    });

    redisInstance = new Redis(noAuthConfig);
    subscriberInstance = redisInstance.duplicate();

    redisInstance.on("error", (err: any) => {
      console.error("Redis no-auth connection error:", err.message);
    });

    subscriberInstance.on("error", (err: any) => {
      console.error("Redis subscriber no-auth connection error:", err.message);
    });

    redisInstance.on("connect", () => {
      console.log("✅ Redis no-auth connection successful.");
    });

    subscriberInstance.on("connect", () => {
      console.log("✅ Redis subscriber no-auth connection successful.");
    });

    // Try to connect
    redisInstance.connect().catch((err: any) => {
      console.error("Redis no-auth connect failed:", err.message);
    });
    subscriberInstance.connect().catch((err: any) => {
      console.error("Redis subscriber no-auth connect failed:", err.message);
    });

    return redisInstance;
  } catch (error) {
    console.error("❌ No-auth fallback also failed:", error);
    redisInstance = createFallbackRedis();
    subscriberInstance = createFallbackRedis();
    return redisInstance;
  }
}

// Create fallback Redis client that doesn't crash the application
function createFallbackRedis(): Redis {
  const dummyRedis = new Redis({
    host: "localhost",
    port: 6379, // Use default Redis port
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: 5000,
  });

  dummyRedis.on("error", (err: any) => {
    // Silently handle errors to prevent crashes
  });

  return dummyRedis;
}

// Synchronous export for backward compatibility
// Note: These will be null until initializeRedis() is called
export { redisInstance as redis, subscriberInstance as subscriber };

// Export redisClient as alias for backward compatibility
export const redisClient = () => redisInstance;
