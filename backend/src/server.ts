import dotenv from "dotenv";
import path from "path";

// Load environment file from the root directory
const envPath = path.resolve(__dirname, "../../.env.lsemb");
dotenv.config({ path: envPath });

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { WebSocketServer as StandardWebSocketServer } from "ws";
import Redis from "ioredis";
import { SERVER, API } from "./config";
import { initializeRedis } from "./config/redis";
import {
  initializeConfigs,
  getAppConfig,
  lsembPool,
  initializeLsembDatabase,
  syncAPIKeysToDatabase,
} from "./config/database.config";

// Chat WebSocket connection manager
const chatConnections = new Map<string, any>();

// Import routes
import searchRoutes from "./routes/search.routes";
import chatRoutes from "./routes/chat.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import scraperRoutes from "./routes/scraper.routes";
import crawlerRoutes, { initializeScriptLogBridge } from "./routes/crawler.routes";
import sourceRoutes from "./routes/source.routes";
import chatbotSettingsRoutes from "./routes/chatbot-settings.routes";
import historyRoutes from "./routes/history.routes";
import documentsRoutes from "./routes/documents.routes";
import migrationRoutes from "./routes/migration.routes";
import embeddingsV2Routes from "./routes/embeddings-v2.routes";
import embeddingProgressRoutes from "./routes/embedding-progress.routes";
import settingsRoutes from "./routes/settings.routes";
import migrationCheckRoutes from "./routes/migration-check.routes";
import activityRoutes from "./routes/activity.routes";
import ragAnythingRoutes from "./routes/raganything.routes";
import ragRoutes from "./routes/rag.routes";
import authRoutes from "./routes/auth.routes";
import usersRoutes from "./routes/users.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import templateRoutes from "./routes/template.routes";
import embeddingHistoryRoutes from "./routes/embedding-history.routes";
import embeddingCleanupRoutes from "./routes/embedding-cleanup.routes";
import aiSettingsRoutes from "./routes/ai-settings.routes";
import appSettingsRoutes from "./routes/app-settings.routes";
import healthRoutes from "./routes/health.routes";
import adminRoutes from "./routes/admin.routes";
import llmStatusRoutes from "./routes/llm-status.routes";
import logsRoutes, { initializeLogWebSocket } from "./routes/logs.routes";
import translateRoutes from "./routes/translate.routes";
import translationEmbeddingsRoutes from "./routes/translation-embeddings.routes";
import {
  preventNoSQLInjection,
  rateLimits,
  payloadSizeLimits,
  handleSecurityError,
  securityHeaders,
} from "./middleware/security.middleware";
import { responseMiddleware } from "./middleware/response.middleware";
import { errorHandler, notFoundHandler, asyncHandler } from "./middleware/error.middleware";
import { generalRateLimit, createEmbeddingRateLimit, createUploadRateLimit, createAuthRateLimit } from "./middleware/rate-limit.middleware";
import systemLogsRoutes from "./routes/system.logs.routes";
import frontendLogsRoutes from "./routes/frontend.logs.routes";
import embeddingsTablesRoutes from "./routes/embeddings-tables.routes";
import databaseRoutes from "./routes/database.routes";
import redisRoutes from "./routes/redis.routes";
import apiTestsRoutes from "./routes/api-tests.routes";
import setupRoutes from "./routes/setup.routes";
import deploymentRoutes from "./routes/deployment.routes";
import apiValidationRoutes from "./routes/api-validation.routes";
import messageEmbeddingsRoutes from "./routes/message-embeddings.routes";
import messageAnalyticsRoutes from "./routes/message-analytics.routes";
import documentProcessingRoutes from "./routes/document-processing.routes";
import ocrRoutes from "./routes/ocr.routes";
import integrationsRoutes from "./routes/integrations.routes";
import whisperRoutes from "./routes/whisper.routes";
import pdfBatchRoutes from "./routes/pdf-batch.routes";
import batchFoldersRoutes from "./routes/batch-folders.routes";
import transformConfigRoutes from "./routes/transform-config.routes";
import servicesRoutes from "./routes/services.routes";
import aiServicesRoutes from "./routes/ai-services.routes";
import { initPDFProgressWS } from './services/pdf/pdf-progress-ws.service';
// import debugRoutes from './routes/debug.routes'; // Commented out - file doesn't exist
import { AuthService } from "./services/auth.service";
import { SettingsService } from "./services/settings.service";
import { MessageCleanupService } from "./services/message-cleanup.service";
import { setupSwagger } from "./config/swagger";
// GraphQL enabled
import { createGraphQLServer } from "./graphql/server";

// Initialize Express app
const app: Application = express();

// Setup Swagger documentation
setupSwagger(app);
const httpServer = createServer(app);

// Parse CORS origins from environment variable - use CORS_ORIGINS from .env.lsemb
const corsOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.CORS_ORIGIN ||
  `http://localhost:${SERVER.DEFAULT_PORTS.FRONTEND},http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3008`
)
  .split(",")
  .map((origin) => origin.trim());

// Initialize Socket.io if WebSocket is enabled
console.log(` WebSocket: ${SERVER.WEBSOCKET.ENABLED ? 'Enabled' : 'Disabled'} | Port: ${SERVER.WEBSOCKET.PORT}`);

export const io = SERVER.WEBSOCKET.ENABLED
  ? new SocketServer(httpServer, {
      cors: {
        origin: corsOrigins,
        credentials: true,
        methods: ["GET", "POST"],
      },
      path: SERVER.WEBSOCKET.PATH,
      transports: ["websocket", "polling"],
    })
  : null;

// Initialize Standard WebSocket Server for notifications if enabled
const wss = SERVER.WEBSOCKET.ENABLED
  ? new StandardWebSocketServer({
      noServer: true,
      path: SERVER.WEBSOCKET.NOTIFICATIONS_PATH,
    })
  : null;

// Initialize WebSocket Server for chat streaming
const chatWss = SERVER.WEBSOCKET.ENABLED
  ? new StandardWebSocketServer({
      noServer: true,
      path: "/ws/chat",
    })
  : null;

// Initialize WebSocket Server for logs
const logWss = SERVER.WEBSOCKET.ENABLED
  ? new StandardWebSocketServer({
      noServer: true,
      path: "/ws/logs",
    })
  : null;

// Initialize log WebSocket service
if (SERVER.WEBSOCKET.ENABLED && logWss) {
  initializeLogWebSocket(logWss);
}

// Handle WebSocket upgrade for standard WebSocket connections if enabled
if (SERVER.WEBSOCKET.ENABLED && (wss || logWss || chatWss)) {
  httpServer.on("upgrade", (request, socket, head) => {
    const host = request.headers.host || "localhost";
    const pathname = new URL(request.url!, "http://" + host).pathname;

    if (pathname === SERVER.WEBSOCKET.NOTIFICATIONS_PATH && wss) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else if (pathname === "/ws/logs" && logWss) {
      logWss.handleUpgrade(request, socket, head, (ws) => {
        logWss.emit("connection", ws, request);
      });
    } else if (pathname === "/ws/chat" && chatWss) {
      chatWss.handleUpgrade(request, socket, head, (ws) => {
        const url = new URL(
          request.url!,
          "http://" + (request.headers.host || "localhost")
        );
        const userId =
          url.searchParams.get("userId") || url.searchParams.get("client-id");
        if (userId) {
          chatConnections.set(userId, ws);

          ws.on("message", (data) => {
            // Handle incoming chat WebSocket messages
            try {
              const message = JSON.parse(data.toString('utf8'));
              if (message.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
              } else if (message.type === "connect") {
                // Store client ID for connection
                const clientId = message.clientId;
                if (clientId && clientId !== userId) {
                  chatConnections.delete(userId);
                  chatConnections.set(clientId, ws);
                }
              }
            } catch (error) {
              // Ignore invalid JSON
            }
          });

          ws.on("close", () => {
            chatConnections.delete(userId);
          });

          ws.send(JSON.stringify({ type: "connected" }));
        }
      });
    } else {
      socket.destroy();
    }
  });
}

// Use the ASEMB pool from database.config - it will be initialized properly

// Initialize Redis - ALWAYS use port 6379 for this project
export const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: 6379, // ALWAYS use port 6379 for this project, ignore system env
  db: parseInt(process.env.REDIS_DB || "2"),
  password: process.env.REDIS_PASSWORD || undefined,
});

// Make Redis available to routes via app.locals
app.locals.redis = redis;

// Initialize Console Log Service
import { initializeConsoleLogService } from "./services/console-log.service";
let consoleLogService: any = null;

// Apply security headers (more restrictive for production)
app.use(securityHeaders);

// CORS middleware - place AFTER helmet
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Skip CORS debug for cleaner logs
  // console.log(`CORS Debug - Request received: ${req.method} ${req.url}, Origin: ${origin}`);

  // Parse CORS origins from environment variable
  const corsOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.CORS_ORIGIN ||
    `http://localhost:${SERVER.DEFAULT_PORTS.FRONTEND},http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3008`
  )
    .split(",")
    .map((o) => o.trim());

  // Check if origin is in allowed list
  const isOriginAllowed = origin && corsOrigins.includes(origin);

  // Set CORS headers based on origin validation
  if (isOriginAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    // For requests without origin or disallowed origins, use a safe default
    res.setHeader(
      "Access-Control-Allow-Origin",
      corsOrigins[0] || "http://localhost:3000"
    );
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Origin, Accept, X-API-Key, Cache-Control, Pragma"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    // console.log('CORS Debug - Handling OPTIONS preflight request');
    res.status(200).end();
    return;
  }

  next();
});
app.use(require("cookie-parser")());
app.use(compression());
app.use(
  morgan("dev", {
    skip: (req, res) => {
      // Skip logging for progress endpoint to reduce console noise
      return (
        req.path.includes("/embeddings/progress") ||
        req.path.includes("/embeddings/progress/stream")
      );
    },
  })
);
app.use(express.json({ limit: payloadSizeLimits.json }));
app.use(express.urlencoded({ extended: true, limit: payloadSizeLimits.json }));

// Apply response formatting middleware first (skip for GraphQL)
app.use((req, res, next) => {
  if (req.path.startsWith('/graphql')) {
    return next(); // Skip responseMiddleware for GraphQL
  }
  responseMiddleware(req, res, next);
});

// Apply NoSQL injection prevention middleware (skip for GraphQL)
app.use((req, res, next) => {
  if (req.path.startsWith('/graphql')) {
    return next(); // Skip preventNoSQLInjection for GraphQL
  }
  preventNoSQLInjection(req, res, next);
});

// Apply enhanced general rate limiting - TEMPORARILY DISABLED FOR DEBUGGING
// app.use(generalRateLimit.middleware);

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// Serve static files from docs directory (for crawled PDFs and documents)
const docsPath = process.env.DOCUMENTS_PATH || process.env.UPLOAD_DIR || './docs';
app.use("/documents/view", express.static(docsPath));

// Enhanced health check endpoint
app.get(API.ENDPOINTS.V2.HEALTH, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Check PostgreSQL with timing and details
    let postgresStatus = "disconnected";
    let postgresResponseTime = 0;
    let postgresDetails: any = {};
    try {
      const dbStart = Date.now();
      const dbResult = await lsembPool.query("SELECT current_database() as db, version() as version");
      postgresResponseTime = Date.now() - dbStart;
      postgresStatus = "connected";
      postgresDetails = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: dbResult.rows[0]?.db || process.env.DB_NAME || 'unknown',
        version: dbResult.rows[0]?.version?.split(' ')[1] || 'unknown'
      };
    } catch (dbError: any) {
      postgresStatus = "disconnected";
      postgresDetails = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'unknown',
        error: dbError.message
      };
    }

    // Check Redis with timing and details
    let redisStatus = "disconnected";
    let redisResponseTime = 0;
    let redisDetails: any = {};
    try {
      const redisStart = Date.now();
      await redis.ping();
      const dbSize = await redis.dbsize();
      const info = await redis.info('server');
      const redisVersion = info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown';
      redisResponseTime = Date.now() - redisStart;
      redisStatus = "connected";
      redisDetails = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: process.env.REDIS_DB || 0,
        keys: dbSize,
        version: redisVersion
      };
    } catch (redisError: any) {
      redisStatus = "disconnected";
      redisDetails = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: process.env.REDIS_DB || 0,
        error: redisError.message
      };
    }

    // Get performance metrics
    const memoryUsage = process.memoryUsage();
    const totalResponseTime = Date.now() - startTime;

    // Determine overall status
    const overallStatus = postgresStatus === "connected" && redisStatus === "connected"
      ? "healthy"
      : postgresStatus === "connected" || redisStatus === "connected"
      ? "degraded"
      : "unhealthy";

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime: totalResponseTime,
      services: {
        postgres: {
          status: postgresStatus,
          responseTime: postgresResponseTime,
          ...postgresDetails
        },
        redis: {
          status: redisStatus,
          responseTime: redisResponseTime,
          ...redisDetails
        },
      },
      performance: {
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024)
        },
        uptime: Math.round(process.uptime()),
        databasePool: {
          total: lsembPool.totalCount,
          idle: lsembPool.idleCount,
          waiting: lsembPool.waitingCount
        }
      },
      agent: "claude",
      version: "2.0.0",
      recommendations: overallStatus === "healthy"
        ? ["System is operating normally"]
        : postgresStatus === "disconnected"
        ? ["Check database connection and credentials"]
        : redisStatus === "disconnected"
        ? ["Check Redis service and connection"]
        : ["Multiple services need attention"]
    });
  } catch (error: any) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
app.use(searchRoutes);
app.use(chatRoutes);
app.use("/api/v2/dashboard", dashboardRoutes);
app.use("/api/v2/scraper", scraperRoutes);
app.use("/api/v2/crawler", crawlerRoutes);
app.use("/api/v2/source", sourceRoutes);
app.use("/api/v2/chatbot", chatbotSettingsRoutes);
app.use("/api/v2/translate", translateRoutes);
app.use("/api/v2/translation-embeddings", translationEmbeddingsRoutes);
app.use(historyRoutes);
app.use("/api/v2/documents", documentsRoutes);
app.use("/api/v2/pdf", pdfBatchRoutes);
app.use("/api/v2/batch-folders", batchFoldersRoutes);
app.use("/api/v2/transform-config", transformConfigRoutes);
app.use("/documents", documentsRoutes);
app.use(API.ENDPOINTS.V2.MIGRATION, migrationRoutes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingsV2Routes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingProgressRoutes);
// settingsRoutes and appSettingsRoutes moved down to fix conflicts
app.use("/api/v2/migration-check", migrationCheckRoutes);
app.use(API.ENDPOINTS.V2.ACTIVITY, activityRoutes);
app.use("/api/v2/raganything", ragAnythingRoutes);
app.use(API.ENDPOINTS.V2.RAG, ragRoutes);
app.use(API.ENDPOINTS.V2.AUTH, authRoutes);
app.use(API.ENDPOINTS.V2.USERS, usersRoutes);
// Basic health endpoints
app.use("/health", healthRoutes);
app.use("/api/health", healthRoutes);

app.use("/api/v2/subscription", subscriptionRoutes);
app.use("/api/v2/templates", templateRoutes);
app.use("/api/v2/embedding-history", embeddingHistoryRoutes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingCleanupRoutes);
app.use("/api/v2/ai", aiSettingsRoutes);
// TODO: Fix route conflict - only use one settings route
// app.use('/api/v2/settings', appSettingsRoutes);
app.use(API.ENDPOINTS.V2.SETTINGS, settingsRoutes);
app.use("/api/v2/config", settingsRoutes);
app.use("/api/v2/health", healthRoutes);
app.use("/api/v2/llm", llmStatusRoutes);
app.use("/api/v2/admin", adminRoutes);
app.use("/api/v2/logs", logsRoutes);
app.use("/api/v2/embeddings-tables", embeddingsTablesRoutes);
app.use("/api/v2/database", databaseRoutes);
app.use("/api/v2/redis", redisRoutes);
app.use("/api/v2/api-tests", apiTestsRoutes);
app.use("/api/v2/setup", setupRoutes);
app.use("/api/v2/deployment", deploymentRoutes);
app.use("/api/v2/api-validation", apiValidationRoutes);
app.use(messageEmbeddingsRoutes);
app.use(messageAnalyticsRoutes);
// app.use('/api/v2/debug', debugRoutes); // Commented out - debugRoutes doesn't exist
app.use("/api/v2/system", systemLogsRoutes);
app.use("/api/v2/frontend", frontendLogsRoutes);
app.use("/api/v2/document-processing", documentProcessingRoutes);
app.use("/api/v2/ocr", ocrRoutes);
app.use("/api/v2/integrations", integrationsRoutes);
app.use("/api/v2/services", servicesRoutes);
app.use("/api/v2/ai-services", aiServicesRoutes);
app.use("/api/whisper", whisperRoutes);

// GraphQL server
try {
  createGraphQLServer(app);
  console.log(" GraphQL server initialized at /api/graphql");
} catch (gqlError: any) {
  console.error(" GraphQL server failed:", gqlError.message);
}

// Base route
app.get("/api/v2", (req: Request, res: Response) => {
  res.json({
    message: "ASB Backend API v2",
    version: "2.0.0",
    endpoints: {
      health: API.ENDPOINTS.V2.HEALTH,
      chat: API.ENDPOINTS.V2.CHAT,
      search: {
        semantic: API.ENDPOINTS.V2.SEARCH + "/semantic",
        hybrid: API.ENDPOINTS.V2.SEARCH + "/hybrid",
        stats: API.ENDPOINTS.V2.SEARCH + "/stats",
      },
      scraper: API.ENDPOINTS.V2.SCRAPER,
      embeddings: API.ENDPOINTS.V2.EMBEDDINGS,
      dashboard: {
        overview: API.ENDPOINTS.V2.DASHBOARD,
      },
    },
  });
});

// WebSocket handling - only if enabled
if (SERVER.WEBSOCKET.ENABLED && io) {
  console.log(` WebSocket enabled on path: ${SERVER.WEBSOCKET.PATH}`);
  io.on("connection", (socket) => {
    console.log("WebSocket client connected");

    // Handle notifications namespace
    if (socket.handshake.query.namespace === "notifications") {
      socket.join("notifications");
      console.log("Client joined notifications room");
    }

    // Join user room
    socket.on("join", (userId: string) => {
      socket.join(`user:${userId}`);
    });

    // Handle typing indicators
    socket.on("chat:typing", (data: any) => {
      socket.broadcast
        .to(`conversation:${data.conversationId}`)
        .emit("chat:typing", data);
    });

    // Handle chat messages
    socket.on("chat:message", async (data: any) => {
      // Broadcast to conversation participants
      io.to(`conversation:${data.conversationId}`).emit("chat:message", data);

      // Update Redis for real-time sync
      await redis.publish("asb:chat:messages", JSON.stringify(data));
    });

    // Dashboard real-time updates
    socket.on("dashboard:subscribe", () => {
      socket.join("dashboard:updates");
    });

    // Test notification endpoint
    socket.on("notification:test", () => {
      socket.emit("notification", {
        type: "test",
        id: Date.now().toString(),
        severity: "info",
        title: "Test Notification",
        message: "WebSocket connection is working",
        timestamp: new Date().toISOString(),
        source: "System",
      });
    });

    socket.on("disconnect", () => {
      console.log("WebSocket client disconnected");
    });
  });
} else {
  console.log(" WebSocket disabled by configuration");
}

// Standard WebSocket connection handling - only if enabled
if (SERVER.WEBSOCKET.ENABLED && wss) {
  console.log(
    ` Standard WebSocket enabled on path: ${SERVER.WEBSOCKET.NOTIFICATIONS_PATH}`
  );

  // Store Redis subscriber instances per WebSocket connection
  const redisSubscribers = new Map<any, Redis>();

  wss.on("connection", (ws, request) => {
    console.log("Standard WebSocket client connected to /ws/notifications");

    // Store the IP address for logging/security
    const clientIp = request.socket.remoteAddress;

    // Send initial connection confirmation
    ws.send(
      JSON.stringify({
        type: "connection",
        message: "WebSocket connection established",
        timestamp: new Date().toISOString(),
      })
    );

    // Handle incoming messages
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle different message types
        switch (message.type) {
          case "test":
            // Send test notification
            ws.send(
              JSON.stringify({
                type: "notification",
                id: Date.now().toString(),
                severity: "info",
                title: "Test Notification",
                message: "Standard WebSocket connection is working",
                timestamp: new Date().toISOString(),
                source: "System",
              })
            );
            break;

          case "ping":
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: new Date().toISOString(),
              })
            );
            break;

          case "subscribe_crawler_progress":
            // Subscribe to crawler export progress updates
            const jobId = message.jobId;
            if (!jobId) {
              ws.send(JSON.stringify({
                type: "error",
                message: "Job ID is required for subscription"
              }));
              break;
            }

            console.log(` Subscribing to crawler progress: ${jobId}`);

            // Create a new Redis subscriber for this connection if not exists
            let redisSubscriber = redisSubscribers.get(ws);
            if (!redisSubscriber) {
              redisSubscriber = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: 6379,
                db: 0, // Crawl4AI uses DB 0
                password: process.env.REDIS_PASSWORD || undefined,
              });
              redisSubscribers.set(ws, redisSubscriber);

              // Set up message handler
              redisSubscriber.on('message', (channel, message) => {
                try {
                  const progress = JSON.parse(message);
                  if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'crawler_export_progress',
                      data: progress
                    }));
                  }
                } catch (parseError) {
                  console.error('Error parsing Redis message:', parseError);
                }
              });
            }

            // Subscribe to the specific job's progress channel
            await redisSubscriber.subscribe(`crawler_export_progress:${jobId}`);

            // Confirm subscription
            ws.send(JSON.stringify({
              type: 'subscribed',
              jobId,
              message: 'Successfully subscribed to crawler export progress'
            }));
            break;

          case "unsubscribe_crawler_progress":
            // Unsubscribe from crawler progress
            const unsubJobId = message.jobId;
            const subscriber = redisSubscribers.get(ws);
            if (subscriber && unsubJobId) {
              await subscriber.unsubscribe(`crawler_export_progress:${unsubJobId}`);
              console.log(` Unsubscribed from crawler progress: ${unsubJobId}`);
            }
            break;

          default:
            console.log("Received unknown message type:", message.type);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    // Handle connection close
    ws.on("close", async (code, reason) => {
      console.log(
        `Standard WebSocket client disconnected: ${code} - ${reason}`
      );

      // Clean up Redis subscriber
      const subscriber = redisSubscribers.get(ws);
      if (subscriber) {
        await subscriber.quit();
        redisSubscribers.delete(ws);
        console.log(' Cleaned up Redis subscriber for closed connection');
      }
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error("Standard WebSocket error:", error);
    });

    // Set up a ping interval to keep the connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "ping",
            timestamp: new Date().toISOString(),
          })
        );
      }
    }, 30000); // Every 30 seconds

    // Clean up ping interval when connection closes
    ws.on("close", () => {
      clearInterval(pingInterval);
    });
  });
}

// Helper function to broadcast notifications to all connected standard WebSocket clients
export function broadcastNotification(notification: {
  severity: string;
  id: string;
  title: string;
  message: string;
  timestamp: string;
  source: string;
}) {
  // Only broadcast if WebSocket is enabled and wss is available
  if (!SERVER.WEBSOCKET.ENABLED || !wss) {
    return;
  }

  const message = JSON.stringify({
    type: "notification",
    ...notification,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

// Also forward Socket.IO notifications to standard WebSocket clients
if (SERVER.WEBSOCKET.ENABLED && io) {
  io.on("connection", (socket) => {
    socket.on("notification", (notification) => {
      broadcastNotification(notification);
    });
  });

  // Initialize script log bridge for real-time Python script logs
  initializeScriptLogBridge();

  // Initialize PDF Progress WebSocket Service
  if (io) {
    const pdfProgressWS = initPDFProgressWS(io);
    (global as any).pdfProgressWSService = pdfProgressWS;
    console.log(' PDF Progress WebSocket Service initialized');
  }
}

// Enhanced error handling middleware
app.use(errorHandler);

// 404 handler
app.use(notFoundHandler);


// Import embeddings progress loader
import { loadProgressFromRedis } from "./routes/embeddings.routes";
import { loadProgressFromRedis as loadV2ProgressFromRedis } from "./routes/embeddings-v2.routes";

// Start server with database dependency
const PORT = SERVER.PORT;

async function startServer() {
  console.log(`\n LUWI Backend v2.0.0 | Port: ${PORT} | ${process.env.NODE_ENV || "development"}`);

  // Database connection variables
  let dbConnectionAttempts = 0;
  const maxDbRetries = 5;
  const dbRetryDelay = 5000; // 5 seconds

  // Retry database connection with backoff
  while (dbConnectionAttempts < maxDbRetries) {
    try {
      await lsembPool.query("SELECT 1");
      console.log(` PostgreSQL: ${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`);
      break; // Success, exit retry loop
    } catch (dbError: any) {
      dbConnectionAttempts++;
      console.error(
        ` Attempt ${dbConnectionAttempts}/${maxDbRetries} failed`
      );

      if (dbConnectionAttempts >= maxDbRetries) {
        console.error("\n DATABASE CONNECTION FAILED");
        console.error("   Server will continue in LIMITED MODE");

        // Set server status to indicate database connection failure
        (global as any).serverStatus = {
          database: "disconnected",
          loading: true,
          error: dbError.message,
        };
        break;
      }

      console.log(`⏳ Retrying in ${dbRetryDelay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, dbRetryDelay));
    }
  }

  // Only proceed with full initialization if database is connected
  if ((global as any).serverStatus?.database !== "disconnected") {
    try {
      // Initialize LSEMB database tables
      console.log("\n️ [2/4] DATABASE SETUP");
      console.log("------------------------");
      console.log(" Initializing tables...");
      await initializeLsembDatabase();
      console.log(" Tables: Ready");

      // Load payload limits from settings
      console.log(" Loading upload limits from settings...");
      const { updatePayloadLimitsFromSettings, getUploadLimitBytes } = await import('./middleware/security.middleware');
      await updatePayloadLimitsFromSettings(lsembPool);
      const uploadLimitMB = (getUploadLimitBytes() / (1024 * 1024)).toFixed(0);
      console.log(` Upload limits: Configured (Max file size: ${uploadLimitMB}MB)`);

      // Create default admin user if not exists
      const authService = new AuthService();
      await authService.createDefaultAdmin();
      console.log(" Admin user: Checked");

      // Load all configurations from ASEMB database
      console.log("\n️ [3/4] CONFIGURATION");
      console.log("---------------------");
      console.log(" Loading settings from database...");
      await initializeConfigs();
      console.log(" Settings: Loaded");

      // Sync API keys from environment variables to database
      await syncAPIKeysToDatabase();
      console.log(" API keys: Synced");

      // Initialize LLMManager with settings from database
      try {
        const { LLMManager } = await import('./services/llm-manager.service');
        const llmManager = LLMManager.getInstance();
        await llmManager.initialize();
        console.log(" LLM Manager: Initialized with database settings");
      } catch (error: any) {
        console.error(" LLM Manager initialization failed:", error.message);
      }

      // Update server status to indicate successful database connection
      (global as any).serverStatus = {
        database: "connected",
        loading: false,
        settings: "loaded",
      };
    } catch (configError: any) {
      console.error("️ Configuration loading failed:", configError.message);
      (global as any).serverStatus = {
        database: "connected",
        loading: false,
        settings: "failed",
        error: configError.message,
      };
    }
  }

  // Initialize Redis
  console.log("\n REDIS CONNECTION");
  console.log("---------------------");
  try {
    console.log(" Connecting to Redis...");
    await initializeRedis();
    console.log(" Redis: Connected");

    // Initialize Console Log Service after Redis is connected
    consoleLogService = initializeConsoleLogService(redis);

    // Check Redis database info
    if (redis) {
      try {
        const redisInfo = await redis.info("keyspace");
        const dbKeys = redisInfo.match(/db\d+:keys=(\d+)/);
        if (dbKeys) {
          console.log(` DB Keys: ${dbKeys[1]} items`);
        }
      } catch (redisInfoError) {
        console.warn("️ Could not get Redis info");
      }
    }

    // Update server status with Redis connection
    if ((global as any).serverStatus) {
      (global as any).serverStatus.redis = "connected";
    }
  } catch (redisError: any) {
    console.error(" Redis connection failed");
    if ((global as any).serverStatus) {
      (global as any).serverStatus.redis = "disconnected";
      (global as any).serverStatus.redisError = redisError.message;
    }
  }

  // Initialize AI Services
  console.log("\n [4/4] AI SERVICES");
  console.log("-------------------");
  const settingsService = SettingsService.getInstance();
  const aiServices = [
    {
      name: "OpenAI",
      key: "OPENAI_API_KEY",
      model: "GPT-4/3.5",
      settingKey: "openai.apiKey",
    },
    {
      name: "Claude",
      key: "CLAUDE_API_KEY",
      model: "Claude 3.5",
      settingKey: "anthropic.apiKey",
    },
    {
      name: "Gemini",
      key: "GEMINI_API_KEY",
      model: "Gemini 1.5",
      settingKey: "google.apiKey",
    },
    {
      name: "DeepSeek",
      key: "DEEPSEEK_API_KEY",
      model: "DeepSeek",
      settingKey: "deepseek.apiKey",
    },
  ];

  for (const service of aiServices) {
    let isConfigured = false;
    let source = "not configured";

    try {
      // Try to get API key from database first
      const allSettings = await settingsService.getAllSettings();
      let parsedSettings = allSettings;

      if (typeof allSettings === "string") {
        try {
          parsedSettings = JSON.parse(allSettings);
        } catch (parseError) {
          parsedSettings = {};
        }
      }

      const dbApiKey = parsedSettings[service.settingKey];

      if (dbApiKey && dbApiKey.trim() !== "") {
        isConfigured = true;
        source = "database";
      } else if (process.env[service.key]) {
        isConfigured = true;
        source = "env";
      }
    } catch (error) {
      if (process.env[service.key]) {
        isConfigured = true;
        source = "env";
      }
    }

    if (isConfigured) {
      console.log(
        ` ${service.name}: Available (${service.model}) [${source}]`
      );
    } else {
      console.log(` ${service.name}: Not configured`);
    }
  }

  // Check Embedding settings
  console.log("\n EMBEDDINGS");
  console.log("-------------");
  if (process.env.USE_LOCAL_EMBEDDINGS === "true") {
    console.log(" Provider: Local");
  } else {
    console.log(" Provider: OpenAI (default)");
  }


  // Load migration progress from Redis (only if Redis is available)
  if (redis) {
    try {
      console.log("\n Migration Status:");
      await loadProgressFromRedis();
    } catch (migrationError: any) {
      console.log(
        "️ Migration progress check failed:",
        migrationError.message
      );
    }
  }

  // Also check v2 embedding progress
  const v2ProgressLoaded = await loadV2ProgressFromRedis();
  if (v2ProgressLoaded) {
    console.log(" Found active v2 embedding process");

    // If process was paused, auto-resume it after backend restart
    const embeddingStatus = await redis.get("embedding:status");
    if (embeddingStatus === "paused") {
      console.log(" Auto-resuming paused embedding process...");
      try {
        // Internal auto-resume - don't log this as user operation
        await fetch(`http://localhost:${PORT}/api/v2/embeddings/auto-resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (autoResumeError) {
        if (autoResumeError instanceof Error) {
          console.log(
            "️ Auto-resume failed, user can resume manually:",
            autoResumeError.message
          );
        } else {
          console.log(
            "️ Auto-resume failed with an unknown error, user can resume manually."
          );
        }
      }
    }
  }

  // Check embedding progress
  try {
    const embeddingProgress = await redis.get("embedding:progress");
    if (embeddingProgress) {
      const progress = JSON.parse(embeddingProgress);
      console.log(` Migration Status: ${progress.status || "unknown"}`);
      if (progress.currentTable) {
        console.log(`   Active Table: ${progress.currentTable}`);
        console.log(
          `   Progress: ${progress.current || 0}/${progress.total || 0} records`
        );
      }
    }
  } catch (error) {
    // Silently ignore
  }

  // Clean up stale embedding progress records (only if database is connected)
  if ((global as any).serverStatus?.database === "connected") {
    try {
      await lsembPool.query(`
          UPDATE embedding_progress
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE status IN ('processing', 'paused')
          AND started_at < NOW() - INTERVAL '1 hour'
        `);
    } catch (cleanupError) {
      // Silently ignore
    }

    // Check for existing embedding process on startup (only if database is connected)
    try {
      const existingProcess = await lsembPool.query(`
          SELECT * FROM embedding_progress
          WHERE status IN ('processing', 'paused')
          ORDER BY started_at DESC
          LIMIT 1
        `);

      if (existingProcess.rows.length > 0) {
        const process = existingProcess.rows[0];

        // If process was 'processing', mark it as 'paused' for safety
        if (process.status === "processing") {
          // Found orphaned processing process, marking as paused
          await lsembPool.query(
            `
              UPDATE embedding_progress
              SET status = 'paused'
              WHERE id = $1
            `,
            [process.id]
          );

          // Also update Redis
          await redis.set("embedding:status", "paused");
          const progressData = {
            status: "paused",
            current: process.processed_chunks || 0,
            total: process.total_chunks || 0,
            percentage:
              process.total_chunks > 0
                ? Math.round(
                    (process.processed_chunks / process.total_chunks) * 100
                  )
                : 0,
            currentTable: process.document_type,
            error: process.error_message,
            startTime: new Date(process.started_at).getTime(),
            newlyEmbedded: process.processed_chunks || 0,
            errorCount: process.error_message ? 1 : 0,
            processedTables: process.document_type
              ? [process.document_type]
              : [],
          };
          await redis.set(
            "embedding:progress",
            JSON.stringify(progressData),
            "EX",
            7 * 24 * 60 * 60
          );
          // Process marked as paused, user can resume manually
        }
      }
    } catch (checkError) {
      // Silently ignore
    }
  }
}

// Start HTTP server (this should always happen regardless of database status)
const startHttpServer = () => {
  console.log("\n SERVER STARTUP");
  console.log("==================");
  console.log(` WebSocket: Ready`);
  console.log(` API: http://localhost:${PORT}`);
  console.log(` Health: GET /health`);

  // Initialize message cleanup service
  try {
    const cleanupService = MessageCleanupService.getInstance();
    console.log(" Message cleanup service initialized");
  } catch (error) {
    console.log("️ Failed to initialize message cleanup service:", error);
  }
  console.log(` Docs: GET /api/v2`);

  // Publish startup event
  if (redis) {
    redis
      .publish(
        "asb:backend:status",
        JSON.stringify({
          event: "startup",
          timestamp: new Date(),
          port: PORT,
          status:
            (global as any).serverStatus?.database === "connected"
              ? "ready"
              : "limited",
        })
      )
      .catch((err) => console.log("Could not publish startup event:", err));
  }

  // Start the HTTP server
  if (!httpServer.listening) {
    httpServer.listen(PORT, () => {
      const duration = Date.now() - Date.now();
      console.log(`\n Server listening on port ${PORT}`);

      // Display final status
      const serverStatus = (global as any).serverStatus;
      if (serverStatus?.database === "connected") {
        console.log(" Status: FULLY OPERATIONAL");
      } else if (serverStatus?.loading) {
        console.log(" Status: LIMITED MODE (DB Connection Failed)");
      } else {
        console.log(" Status: LIMITED MODE");
      }
      console.log("==============================\n");
    });
  }
};

//  Emergency Chat Routes - DISABLED (using chatbot-settings.routes.ts instead)
const setupChatRoutes = () => {
  console.log(" Emergency routes disabled - using regular routes");
};

/* EMERGENCY ROUTES DISABLED - using chatbot-settings.routes.ts instead
const setupChatRoutesOLD = () => {
  // 1. Settings - DISABLED
  app.get("/api/v2/chatbot/settings", async (req, res) => {
    try {
      console.log(" /api/v2/chatbot/settings called");
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );

      // Get chatbot settings from database
      const settingsResult = await lsembPool.query(`
        SELECT value FROM settings WHERE key = 'chatbot'
      `);

      let chatbotSettings: any = {};
      if (settingsResult.rows.length > 0) {
        chatbotSettings = settingsResult.rows[0].value || {};
      }

      res.json({
        title: (chatbotSettings as any).title || "ASB Hukuki Asistan",
        subtitle: (chatbotSettings as any).subtitle || "Yapay Zeka Asistanınız",
        logoUrl: (chatbotSettings as any).logoUrl || "",
        welcomeMessage:
          (chatbotSettings as any).welcomeMessage ||
          "Merhaba! Ben AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.",
        placeholder:
          (chatbotSettings as any).placeholder || "Sorunuzu yazın...",
        primaryColor: (chatbotSettings as any).primaryColor || "#3B82F6",
        activeModel: (chatbotSettings as any).activeModel || "Claude 3",
      });
    } catch (error) {
      console.error("Error fetching chatbot settings:", error);
      res.json({
        title: "ASB Hukuki Asistan",
        subtitle: "Yapay Zeka Asistanınız",
        logoUrl: "",
        welcomeMessage:
          "Merhaba! Ben AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.",
        placeholder: "Sorunuzu yazın...",
        primaryColor: "#3B82F6",
        activeModel: "Claude 3",
      });
    }
  });

  // 2. Chat
  app.post("/api/v2/chat", (req, res) => {
    console.log(" /api/v2/chat called", req.body);
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.json({
      id: Date.now().toString(),
      sessionId: "default",
      message:
        "Backend çalışıyor! Emergency route devrede. / Merhaba! Backend çalışıyor ve emergency route devrede.",
      timestamp: new Date().toISOString(),
      type: "bot",
      sources: [],
      relatedTopics: [],
      conversationId: "emergency-" + Date.now(),
    });
  });

  // 3. Suggestions
  app.get("/api/v2/chat/suggestions", (req, res) => {
    console.log(" /api/v2/chat/suggestions called");
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.json({
      suggestions: [
        "İhracatta KDV istisnası nasıl uygulanır?",
        "E-fatura zorunluluğu kimleri kapsar?",
        "Damga vergisi oranları nedir?",
        "What is the capital of France?"
      ]
    });
  });

  console.log(" Emergency routes disabled - using regular chatbot routes");
};
*/

// Setup emergency routes first - will be called after function declaration
setupChatRoutes();

//  Start server immediately without waiting for all services
const emergencyServerStarted = false;

// Try to start full services (but don't block)
startServer()
  .then(() => {
    // After trying to start full services, ensure HTTP server is ready
    if (!emergencyServerStarted) {
      startHttpServer();
    }
  })
  .catch((err) => {
    console.error(
      "️ Full startup failed, but emergency routes are working:",
      err
    );
    // Even if full startup fails, start HTTP server in limited mode
    if (!emergencyServerStarted) {
      startHttpServer();
    }
  });

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");

  httpServer.close(() => {
    // HTTP server closed
  });

  await lsembPool.end();
  await redis.quit();

  process.exit(0);
});

// Apply security error handler
app.use(handleSecurityError);

// Global error handler (fallback)
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Fallback error handler:", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Use the enhanced error handler if available, otherwise basic response
  if (res.error) {
    res.error(
      process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      500,
      { stack: error.stack }
    );
  } else {
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
      timestamp: new Date().toISOString(),
    });
  }
});

export function getSocketIO() {
  return io;
}

export {
  app,
  io,
  httpServer,
  lsembPool as pgPool,
  redis,
  chatWss,
  chatConnections,
};
// Trigger restart

