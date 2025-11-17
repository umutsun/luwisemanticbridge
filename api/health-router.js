const express = require("express");
const { getLsembPool } = require("./db-pool");
const { getRedisClient } = require("./redis-client");

const router = express.Router();
const pool = getLsembPool();

/**
 * @route GET /api/v2/health/
 * @desc Basic health check for the v2 API.
 */
router.get("/", (req, res) => {
  res.status(200).json({
    status: "healthy",
    message: "Luwi Semantic Bridge API v2 is running.",
    timestamp: new Date().toISOString(),
  });
});

/**
 * @route GET /api/v2/health/system
 * @desc Provides a summary of the system's component health.
 */
router.get("/system", async (req, res) => {
  const redisClient = getRedisClient();
  const dbClient = await pool.connect();

  try {
    const checks = await Promise.allSettled([
      // Database Check
      dbClient.query("SELECT 1").then(() => ({
        name: "database",
        status: "healthy",
      })),
      // Redis Check
      redisClient.ping().then((reply) => {
        if (reply === "PONG") {
          return { name: "redis", status: "healthy" };
        }
        throw new Error("Did not receive PONG from Redis.");
      }),
    ]);

    const report = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {},
    };

    checks.forEach((result) => {
      if (result.status === "fulfilled") {
        report.services[result.value.name] = { status: result.value.status };
      } else {
        report.status = "degraded";
        // A more robust implementation could distinguish between service names
        const serviceName = result.reason.message
          .toLowerCase()
          .includes("redis")
          ? "redis"
          : "database";
        report.services[serviceName] = {
          status: "unhealthy",
          error: result.reason.message,
        };
      }
    });

    res.status(report.status === "healthy" ? 200 : 503).json(report);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "An unexpected error occurred during health check.",
      error: error.message,
    });
  } finally {
    dbClient.release();
  }
});

/**
 * @route GET /api/v2/health/database
 * @desc Detailed health check for the PostgreSQL database.
 */
router.get("/database", async (req, res) => {
  const client = await pool.connect();
  const startTime = Date.now();
  try {
    const result = await client.query(
      "SELECT version(), pg_postmaster_start_time() as start_time"
    );
    const responseTime = Date.now() - startTime;
    res.json({
      status: "healthy",
      version: result.rows[0].version,
      uptime_seconds: Math.floor(
        (new Date() - result.rows[0].start_time) / 1000
      ),
      responseTime: `${responseTime}ms`,
    });
  } catch (error) {
    res.status(503).json({ status: "unavailable", error: error.message });
  } finally {
    client.release();
  }
});

/**
 * @route GET /api/v2/health/redis
 * @desc Detailed health check for the Redis server.
 */
router.get("/redis", async (req, res) => {
  const redisClient = getRedisClient();
  try {
    const reply = await redisClient.ping();
    res.json({ status: reply === "PONG" ? "healthy" : "unhealthy" });
  } catch (error) {
    res.status(503).json({ status: "unavailable", error: error.message });
  }
});

module.exports = router;
