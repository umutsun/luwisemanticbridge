const express = require("express");
const cors = require("cors");
const http = require("http");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// --- Routers ---
const chatRouter = require("./chat-router");
const settingsRouter = require("./settings-router");
const healthRouter = require("./health-router");
const configRouter = require("./config-router");
const serviceRouter = require("./service-router");
const modelsRouter = require("./models-router");
const chatbotRouter = require("./chatbot-router");

const errorHandler = require("./middleware/errorHandler");
const { getRedisClient } = require("./redis-client");

// Load environment variables from .env/.env.asemb
const envCandidates = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../.env.lsemb"),
  path.resolve(__dirname, ".env"),
];

// Try to load environment variables from the first available file
const loadedEnv = envCandidates.find((candidate) => {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    return true;
  }
  return false;
});

if (!loadedEnv) {
  console.warn("No .env or .env.lsemb file found, using process.env defaults");
}

const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const corsOptions = {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:8083",
        "http://localhost:8084",
      ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
};

app.use(cors(corsOptions));

// Explicitly handle pre-flight requests
app.options("*", cors(corsOptions));

// --- API Routes ---

// Basic health check endpoints
app.get(["/health", "/api/health", "/api/v1/health"], (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Legacy config routes
app.use("/api/config", configRouter);

// V2 routes
app.use("/api/v2", chatRouter);
app.use("/api/v2/config", configRouter);
app.use("/api/v2/health", healthRouter);
app.use("/api/v2/settings", settingsRouter);
app.use("/api/v2/services", serviceRouter);
app.use("/api/v2/models", modelsRouter);
app.use("/api/v2/chatbot", chatbotRouter);

// --- Global Error Handler ---
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || process.env.API_PORT || 8083;
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Luwi Semantic BridgeAPI running on port ${PORT}`);
});

// Socket.IO Server for notifications - attach to existing Express server
const socketIo = require("socket.io");

// Check if WebSocket is enabled
if (process.env.ENABLE_WEBSOCKET === "true") {
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:3001"];

  const io = socketIo(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: process.env.WEBSOCKET_PATH || "/socket.io",
  });

  // Make io accessible to our router
  app.set("socketio", io);

  io.on("connection", (socket) => {
    console.log("Socket.IO client connected");

    // Send initial connection message
    socket.emit("notification", {
      type: "connection",
      message: "Connected to Luwi Semantic Bridgenotifications",
      timestamp: new Date().toISOString(),
    });

    socket.on("message", (data) => {
      console.log("Received message:", data);
    });

    socket.on("disconnect", () => {
      console.log("Socket.IO client disconnected");
    });

    // Send periodic health updates
    const healthInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("notification", {
          type: "health_update",
          data: {
            status: "healthy",
            timestamp: new Date().toISOString(),
            database: "connected",
            redis:
              getRedisClient().status === "ready"
                ? "connected"
                : "disconnected",
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        clearInterval(healthInterval);
      }
    }, 30000); // Every 30 seconds
  });

  console.log("Socket.IO server attached to Express server");
} else {
  console.log("WebSocket disabled");
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  httpServer.close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  httpServer.close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});
