const express = require("express");
const fs = require("fs");
const path = require("path");
const { getLsembPool } = require("./db-pool");
const { getRedisClient } = require("./redis-client");

const router = express.Router();
const lsembPool = getLsembPool();

// Note: These configs are for display and may not reflect the active pool/client config
// if it was initialized with connection strings from environment variables.
const {
  dbConfig: defaultDbConfig,
  redisConfig: defaultRedisConfig,
} = require("./config-loader");

/**
 * @route GET /api/config
 * @group Config - Legacy configuration operations
 * @summary (Legacy) Get application configuration from config.json
 * @description Retrieves the raw configuration from the `config.json` file. This is a legacy endpoint and may not reflect the full runtime configuration.
 * @returns {object} 200 - The application configuration object.
 * @returns {Error} 500 - Failed to read configuration file.
 */
router.get("/", (req, res) => {
  try {
    const configFile = path.resolve(__dirname, "../../config/config.json");
    const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to read configuration." });
  }
});

/**
 * @route POST /api/config
 * @group Config - Legacy configuration operations
 * @summary (Legacy) Writes to config.json
 * @description Saves the provided JSON body to the `config.json` file. Note: This does not hot-reload the application config; a restart is needed.
 * @param {object} request.body.required - The configuration object to save.
 * @returns {object} 200 - Success message.
 * @returns {Error} 500 - Failed to save configuration.
 */
router.post("/", async (req, res) => {
  try {
    const configFile = path.resolve(__dirname, "../../config/config.json");
    fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2), "utf-8");
    // Note: This does not hot-reload the application config. A restart is needed.
    res.json({ success: true, message: "Configuration saved successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to save configuration." });
  }
});

/**
 * @route GET /api/v2/config
 * @group Config - V2 configuration operations
 * @summary Get the consolidated V2 application configuration
 * @description Gathers configuration settings from the database and environment variables to provide a comprehensive, read-only view of the current runtime configuration. Sensitive values like passwords are redacted.
 * @returns {object} 200 - A comprehensive configuration object for the application.
 * @returns {Error} 500 - Failed to retrieve v2 configuration.
 */
router.get("/v2", async (req, res) => {
  try {
    let dbSettings = {};
    try {
      const result = await lsembPool.query("SELECT key, value FROM settings");
      result.rows.forEach((row) => {
        dbSettings[row.key] = row.value;
      });
    } catch (dbError) {
      console.error("[Config] Failed to load settings from database:", dbError);
    }

    res.json({
      app: {
        name: "Luwi Semantic Bridge",
        description:
          dbSettings["app.description"] ||
          "AI-Powered Knowledge Management System",
        logoUrl: dbSettings["app.logoUrl"] || "",
        locale: dbSettings["app.locale"] || "tr",
      },
      database: {
        host: defaultDbConfig.host,
        port: defaultDbConfig.port,
        name: defaultDbConfig.database,
        user: defaultDbConfig.user,
        password: "********",
        ssl: defaultDbConfig.ssl ? true : false,
        maxConnections: 20,
      },
      redis: {
        host: defaultRedisConfig.host,
        port: defaultRedisConfig.port,
        password: defaultRedisConfig.password ? "********" : "",
        db: defaultRedisConfig.db || 0,
      },
      openai: {
        apiKey: dbSettings["openai.apiKey"] || process.env.OPENAI_API_KEY || "",
        model:
          dbSettings["openai.model"] ||
          process.env.OPENAI_MODEL ||
          "gpt-4o-mini",
        embeddingModel:
          dbSettings["openai.embeddingModel"] ||
          process.env.OPENAI_EMBEDDING_MODEL ||
          "text-embedding-3-small",
        maxTokens: parseInt(dbSettings["openai.maxTokens"] || "4096"),
        temperature: parseFloat(dbSettings["openai.temperature"] || "0.7"),
      },
      google: {
        apiKey: dbSettings["google.apiKey"] || process.env.GEMINI_API_KEY || "",
        model: dbSettings["google.model"] || "gemini-pro",
        maxTokens: parseInt(dbSettings["google.maxTokens"] || "4096"),
        temperature: parseFloat(dbSettings["google.temperature"] || "0.7"),
      },
      claude: {
        apiKey: dbSettings["claude.apiKey"] || process.env.CLAUDE_API_KEY || "",
        model: dbSettings["claude.model"] || "claude-3-sonnet-20240229",
        maxTokens: parseInt(dbSettings["claude.maxTokens"] || "4096"),
        temperature: parseFloat(dbSettings["claude.temperature"] || "0.7"),
      },
      anthropic: {
        apiKey: dbSettings["claude.apiKey"] || process.env.CLAUDE_API_KEY || "",
        model: dbSettings["claude.model"] || "claude-3-sonnet-20240229",
        maxTokens: parseInt(dbSettings["claude.maxTokens"] || "4096"),
        temperature: parseFloat(dbSettings["claude.temperature"] || "0.7"),
      },
      deepseek: {
        apiKey:
          dbSettings["deepseek.apiKey"] || process.env.DEEPSEEK_API_KEY || "",
        model: dbSettings["deepseek.model"] || "deepseek-chat",
        maxTokens: parseInt(dbSettings["deepseek.maxTokens"] || "4096"),
        temperature: parseFloat(dbSettings["deepseek.temperature"] || "0.7"),
      },
      huggingface: {
        apiKey:
          dbSettings["huggingface.apiKey"] ||
          process.env.HUGGINGFACE_API_KEY ||
          "",
        model:
          dbSettings["huggingface.model"] ||
          "sentence-transformers/all-MiniLM-L6-v2",
        maxTokens: 4096,
        temperature: 0.7,
      },
      ollama: {
        apiKey: "",
        model: dbSettings["ollama.model"] || "llama2",
        baseUrl: dbSettings["ollama.baseUrl"] || "http://localhost:11434",
        maxTokens: 4096,
        temperature: 0.7,
      },
      embeddings: {
        chunkSize: parseInt(dbSettings["embeddings.chunkSize"] || "1000"),
        chunkOverlap: parseInt(dbSettings["embeddings.chunkOverlap"] || "200"),
        maxBatchSize: parseInt(dbSettings["embeddings.maxBatchSize"] || "100"),
        provider: dbSettings["embeddings.provider"] || "openai",
        model: dbSettings["embeddings.model"] || "text-embedding-3-small",
        dimensions: parseInt(dbSettings["embeddings.dimensions"] || "1536"),
      },
      llmSettings: {
        activeChatModel:
          dbSettings["llmSettings.activeChatModel"] || "gpt-4o-mini",
        activeEmbeddingModel:
          dbSettings["llmSettings.activeEmbeddingModel"] ||
          "text-embedding-3-small",
        maxTokens: parseInt(dbSettings["llmSettings.maxTokens"] || "4096"),
        temperature: parseFloat(dbSettings["llmSettings.temperature"] || "0.7"),
        enableStreaming: dbSettings["llmSettings.enableStreaming"] === "true",
        enableSystemPrompt:
          dbSettings["llmSettings.enableSystemPrompt"] !== "false",
      },
      security: {
        enableAuth: dbSettings["security.enableAuth"] === "true",
        enableRateLimit: dbSettings["security.enableRateLimit"] !== "false",
        maxRequestsPerMinute: parseInt(
          dbSettings["security.maxRequestsPerMinute"] || "60"
        ),
        enableCORS: dbSettings["security.enableCORS"] !== "false",
        allowedOrigins:
          dbSettings["security.allowedOrigins"] || "http://localhost:3000",
        jwtSecret:
          dbSettings["security.jwtSecret"] ||
          process.env.JWT_SECRET ||
          "default-secret-key",
        sessionTimeout: parseInt(
          dbSettings["security.sessionTimeout"] || "3600"
        ),
      },
      n8n: {
        url: dbSettings["n8n.url"] || "http://localhost:5678",
        username: dbSettings["n8n.username"] || "admin",
        password: dbSettings["n8n.password"] || "admin123",
        enabled: dbSettings["n8n.enabled"] === "true",
      },
      scraper: {
        enabled: dbSettings["scraper.enabled"] !== "false",
        timeout: parseInt(dbSettings["scraper.timeout"] || "30000"),
        maxRetries: parseInt(dbSettings["scraper.maxRetries"] || "3"),
        userAgent:
          dbSettings["scraper.userAgent"] ||
          "Mozilla/5.0 (compatible; AliceBot/1.0)",
        followRedirects: dbSettings["scraper.followRedirects"] !== "false",
        respectRobotsTxt: dbSettings["scraper.respectRobotsTxt"] !== "false",
        maxDepth: parseInt(dbSettings["scraper.maxDepth"] || "3"),
        maxPages: parseInt(dbSettings["scraper.maxPages"] || "100"),
      },
      logging: {
        level: dbSettings["logging.level"] || "info",
        enableConsole: dbSettings["logging.enableConsole"] !== "false",
        enableFile: dbSettings["logging.enableFile"] === "true",
        logFile: dbSettings["logging.logFile"] || "logs/asemb.log",
        maxSize: parseInt(dbSettings["logging.maxSize"] || "10485760"),
        maxFiles: parseInt(dbSettings["logging.maxFiles"] || "5"),
        enableApiLogging: dbSettings["logging.enableApiLogging"] === "true",
        enableDatabaseLogging:
          dbSettings["logging.enableDatabaseLogging"] === "true",
      },
      websocket: {
        url: `ws://localhost:${process.env.PORT || 8083}`,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
      },
    });
  } catch (error) {
    console.error("Failed to get v2 config:", error);
    res.status(500).json({
      error: "Failed to retrieve v2 configuration",
      details: error.message,
    });
  }
});

module.exports = router;
