const express = require("express");
const http = require("http");
const { exec } = require("child_process");

const router = express.Router();

// --- Helper for shell commands ---
const runCommand = (command) =>
  new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command Error [${command}]: ${stderr}`);
        return reject(new Error(stderr || error.message));
      }
      resolve(stdout);
    });
  });


const servicesList = [
    {
      name: "graphql",
      displayName: "GraphQL Server",
      description: "Query API with type safety",
      status: "stopped",
      port: 4000,
      url: "http://localhost:4000/graphql",
      version: "Apollo Server 4.0",
      icon: "GitBranch"
    },
    {
      name: "python",
      displayName: "Python Services",
      description: "AI & ML microservices",
      status: "stopped",
      port: parseInt(process.env.PYTHON_SERVICE_PORT || "8002"),
      url: process.env.PYTHON_SERVICE_URL || "http://localhost:8002",
      version: "FastAPI 0.104.1",
      icon: "Code"
    },
    {
      name: "crawl4ai",
      displayName: "Crawl4AI",
      description: "AI-powered web scraping",
      status: "stopped",
      port: 8001,
      url: "http://localhost:8001/api/python/crawl",
      icon: "Globe"
    },
    {
      name: "whisper",
      displayName: "Whisper STT",
      description: "Speech-to-text (OpenAI API)",
      status: "stopped",
      port: 8001,
      url: "http://localhost:8001/api/python/whisper",
      version: "API + Self-hosted",
      icon: "Mic"
    },
    {
      name: "pgai",
      displayName: "pgai Worker",
      description: "Automatic embeddings",
      status: "stopped",
      icon: "Brain"
    },
    {
      name: "pgvectorscale",
      displayName: "pgvectorscale",
      description: "Performance optimizer (Not installed)",
      status: "stopped",
      icon: "Zap"
    },
    {
      name: "nodejs",
      displayName: "Node.js Backend",
      description: "Main API gateway",
      status: "running",
      port: parseInt(process.env.PORT || "8083"),
      url: `http://localhost:${process.env.PORT || "8083"}`,
      version: "Express 4.18",
      icon: "Server"
    },
    {
      name: "database",
      displayName: "PostgreSQL",
      description: "Vector database",
      status: "running",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      host: process.env.POSTGRES_HOST || "localhost",
      database: process.env.POSTGRES_DB || "lsemb",
      version: "15.13 + pgvector",
      icon: "Database"
    },
    {
      name: "redis",
      displayName: "Redis Cache",
      description: "Cache server",
      status: "running",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      host: process.env.REDIS_HOST || "localhost",
      version: "7.0+",
      icon: "Server"
    },
    {
      name: "n8n",
      displayName: "n8n Workflow",
      description: "Automation & workflow orchestration",
      status: "stopped",
      port: 5678,
      url: "http://localhost:5678",
      version: "n8n 1.0+",
      icon: "Zap"
    }
  ];

/**
 * @route GET /api/v2/integrations/services
 * @group Services - External service management
 * @summary Get the list of all available services
 * @description Returns a list of all services, including their status and metadata.
 * @returns {Array<object>} 200 - An array of service objects.
 */
router.get("/integrations/services", (req, res) => {
  // TODO: Replace this with a dynamic list from a database or configuration file
  res.json(servicesList);
});

/**
 * @route GET /api/v2/services/system/info
 * @group Services - System information
 * @summary Get system information (Database and Redis)
 * @description Returns configuration information for PostgreSQL and Redis from environment variables.
 * @returns {object} 200 - System information including database and Redis details.
 */
router.get("/system/info", (req, res) => {
  res.json({
    database: {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      database: process.env.POSTGRES_DB || "lsemb",
      user: process.env.POSTGRES_USER || "postgres",
      version: "15.13 + pgvector"
    },
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      database: parseInt(process.env.REDIS_DB || "0"),
      version: "7.0+"
    },
    backend: {
      port: parseInt(process.env.PORT || "8083"),
      nodeEnv: process.env.NODE_ENV || "development"
    },
    frontend: {
      port: parseInt(process.env.FRONTEND_PORT || "3002")
    }
  });
});

/**
 * @route GET /api/v2/services/pm2/status
 * @group Services - External service management
 * @summary Get the status of PM2 managed processes
 * @description Executes `npx pm2 jlist` to get a JSON list of all processes managed by PM2 and returns a summary.
 * @returns {object} 200 - An object with the count of online and total processes.
 */
router.get("/pm2/status", async (req, res) => {
  try {
    const stdout = await runCommand("npx pm2 jlist");
    const processes = JSON.parse(stdout);
    const online = processes.filter(
      (p) => p.pm2_env.status === "online"
    ).length;
    res.json({
      status: "running",
      online_processes: online,
      total_processes: processes.length,
    });
  } catch (e) {
    res.json({ status: "stopped", online_processes: 0, total_processes: 0 });
  }
});

/**
 * @route GET /api/v2/services/pm2/logs
 * @group Services - External service management
 * @summary Get the latest PM2 logs
 * @description Retrieves the last 100 lines of logs from all PM2-managed processes.
 * @returns {string} 200 - A plain text response containing the logs.
 */
router.get("/pm2/logs", async (req, res) => {
  try {
    const stdout = await runCommand("npx pm2 logs --lines 100 --nostream");
    res.setHeader("Content-Type", "text/plain");
    res.send(stdout);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/**
 * @route POST /api/v2/services/pm2/:action
 * @group Services - External service management
 * @summary Execute a PM2 action (restart or stop)
 * @description Allows for remote management of all PM2 processes.
 * @param {string} action.param.required - The action to perform. Can be 'restart' or 'stop'.
 * @returns {object} 200 - A success message and the output from the command.
 * @returns {Error} 400 - If the action is invalid.
 */
router.post("/pm2/:action", async (req, res) => {
  const { action } = req.params;
  const command =
    action === "restart"
      ? "restart all"
      : action === "stop"
      ? "stop all"
      : null;
  if (!command) return res.status(400).json({ error: "Invalid action." });
  try {
    const output = await runCommand(`npx pm2 ${command}`);
    res.json({ success: true, message: `PM2 '${command}' executed.`, output });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
