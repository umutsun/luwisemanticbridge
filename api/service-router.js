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

/**
 * @route GET /api/v2/services/lightrag/status
 * @group Services - External service management
 * @summary Get the status of the LightRAG service
 * @description Checks the health of the LightRAG (RAG-anything) service by pinging its health endpoint.
 * @returns {object} 200 - An object indicating the status ('running' or 'stopped').
 */
router.get("/lightrag/status", (req, res) => {
  const options = {
    hostname: "localhost",
    port: 8002,
    path: "/health", // Assuming a /health endpoint
    method: "GET",
    timeout: 2000,
  };

  const request = http.request(options, (response) => {
    if (response.statusCode === 200) {
      res.json({ status: "running" });
    } else {
      res.json({
        status: "stopped",
        error: `Received status code ${response.statusCode}`,
      });
    }
  });

  request.on("error", (e) => {
    res.json({ status: "stopped", error: e.message });
  });

  request.on("timeout", () => {
    request.destroy();
    res.json({ status: "stopped", error: "Request timed out" });
  });

  request.end();
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
