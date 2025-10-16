const express = require("express");
const { Client } = require("pg");
const { getLsembPool } = require("./db-pool"); // Assuming you'll create this helper

const { getRedisClient } = require("./redis-client");
const validate = require("./middleware/validator");
const {
  getSettingsByCategorySchema,
  saveSettingsByCategorySchema,
  testDbConnectionSchema,
} = require("./validation/settings-schemas");
const router = express.Router();
const pool = getLsembPool();
const redis = getRedisClient();

const SETTINGS_CACHE_TTL = process.env.SETTINGS_CACHE_TTL || 3600; // 1 hour in seconds

/**
 * Fetches all settings from the database, organized by category.
 * @returns {Promise<object>} A promise that resolves to an object with settings.
 */
async function getAllSettings() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT key, value, category FROM settings"
    );
    const settings = {};
    result.rows.forEach((row) => {
      if (!settings[row.category]) {
        settings[row.category] = {};
      }
      // If the key contains a dot, create a nested object structure
      const keyParts = row.key.split(".");
      let current = settings[row.category];
      for (let i = 0; i < keyParts.length - 1; i++) {
        const part = keyParts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
      current[keyParts[keyParts.length - 1]] = row.value;
    });
    return settings;
  } finally {
    client.release();
  }
}

/**
 * Fetches settings for a specific category.
 * @param {string} category The category to fetch.
 * @returns {Promise<object>} A promise that resolves to the settings object for the category.
 */
async function getSettingsByCategory(category) {
  const cacheKey = `settings:category:${category}`;

  try {
    // 1. Check cache first
    const cachedSettings = await redis.get(cacheKey);
    if (cachedSettings) {
      console.log(`[Cache] HIT for category: ${category}`);
      return JSON.parse(cachedSettings);
    }

    console.log(`[Cache] MISS for category: ${category}. Fetching from DB.`);
    // 2. If not in cache, fetch from database
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT value FROM settings WHERE key = $1",
        [`${category}_settings`]
      );

      if (result.rows.length > 0) {
        const settings = result.rows[0].value;
        // 3. Store the result in cache with an expiration time (TTL)
        await redis.set(
          cacheKey,
          JSON.stringify(settings),
          "EX",
          SETTINGS_CACHE_TTL
        );
        return settings;
      }
      return null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error fetching settings for category ${category}:`, error);
    throw error; // Re-throw the error to be handled by the route
  }
}

/**
 * Saves settings for a specific category.
 * @param {string} category The category to save.
 * @param {object} settingsData The settings data to save.
 * @returns {Promise<void>}
 */
async function saveSettingsByCategory(category, settingsData) {
  const cacheKey = `settings:category:${category}`;
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO settings (key, value, category, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key)
      DO UPDATE SET
          value = $2,
          updated_at = CURRENT_TIMESTAMP
    `,
      [`${category}_settings`, settingsData, category, `${category} settings`]
    );
  } finally {
    // Invalidate the cache after updating the database
    console.log(`[Cache] INVALIDATING for category: ${category}`);
    await redis.del(cacheKey);
    client.release();
  }
}

// --- Routes ---

/**
 * @route GET /api/v2/settings
 * @group Settings - Application settings management
 * @summary Get all settings organized by category
 * @description Fetches all settings from the database and returns them in a structured object, nested by category and key.
 * @returns {object} 200 - An object containing all application settings.
 * @returns {Error} 500 - If there was an error retrieving settings.
 */
router.get("/", async (req, res) => {
  try {
    const settings = await getAllSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Failed to get all settings:", error);
    res.status(500).json({ error: "Failed to retrieve settings." });
  }
});

/**
 * @route GET /api/v2/settings/category/{category}
 * @group Settings - Application settings management
 * @summary Get settings for a specific category
 * @description Retrieves the settings object for a single, specified category. This endpoint is cached.
 * @param {string} category.param.required - The category of settings to retrieve.
 * @returns {object} 200 - The settings object for the requested category.
 * @returns {Error} 404 - If settings for the category are not found.
 * @returns {Error} 500 - If there was a server error.
 */
router.get(
  "/category/:category",
  validate(getSettingsByCategorySchema),
  async (req, res) => {
    // Use validated and sanitized params
    const { category } = req.params;
    try {
      const settings = await getSettingsByCategory(category);
      if (settings) {
        res.json(settings);
      } else {
        res
          .status(404)
          .json({ error: `Settings for category '${category}' not found.` });
      }
    } catch (error) {
      console.error(`Failed to get ${category} settings:`, error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @route POST /api/v2/settings/category/{category}
 * @group Settings - Application settings management
 * @summary Save settings for a specific category
 * @description Inserts or updates the settings for a given category. The entire settings object for that category is replaced. This action invalidates the cache for the category.
 * @param {string} category.param.required - The category of settings to save.
 * @param {object} request.body.required - The settings JSON object to save.
 * @returns {object} 200 - A success message.
 * @returns {Error} 400 - If validation fails.
 * @returns {Error} 500 - If there was a server error.
 */
router.post(
  "/category/:category",
  validate(saveSettingsByCategorySchema),
  async (req, res) => {
    // Use validated and sanitized params and body
    const { category } = req.params;
    const settingsData = req.body;
    try {
      await saveSettingsByCategory(category, settingsData);
      res.json({
        success: true,
        message: `${category} settings saved successfully.`,
      });
    } catch (error) {
      console.error(`Failed to save ${category} settings:`, error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @route POST /api/v2/settings/database/test
 * @group Settings - Application settings management
 * @summary Test a database connection with provided credentials
 * @description Attempts to connect to a PostgreSQL database using the connection details in the request body.
 * @param {object} request.body.required - The database connection details.
 * @param {string} request.body.host.required - Database host.
 * @param {number} request.body.port.required - Database port.
 * @param {string} request.body.database.required - Database name.
 * @param {string} request.body.user.required - Database user.
 * @param {string} request.body.password.required - Database password.
 * @param {boolean} [request.body.ssl] - Whether to use SSL.
 * @returns {object} 200 - Success message with database version.
 * @returns {Error} 500 - If the connection fails.
 */
router.post(
  "/database/test",
  validate(testDbConnectionSchema),
  async (req, res) => {
    // Use validated and sanitized body
    const { host, port, database, user, password, ssl } = req.body;
    const connectionConfig = {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
      connectionTimeoutMillis: 5000,
    };

    if (ssl) {
      connectionConfig.ssl = { rejectUnauthorized: false };
    }

    const client = new Client(connectionConfig);

    try {
      await client.connect();
      const result = await client.query("SELECT version()");
      await client.end();
      res.json({
        success: true,
        version: result.rows[0].version,
        database,
      });
    } catch (error) {
      console.error("[DB Test Hatası] Detaylar:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
  }
);

module.exports = router;
