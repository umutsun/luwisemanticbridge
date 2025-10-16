const Joi = require("joi");

// A list of valid setting categories.
const validCategories = Joi.string()
  .valid(
    "ai",
    "database",
    "embedding",
    "redis",
    "security",
    "app",
    "llmSettings",
    "n8n",
    "scraper",
    "logging"
  )
  .required();

// Schema for GET /api/v2/settings/category/:category
const getSettingsByCategorySchema = Joi.object({
  params: Joi.object({
    category: validCategories,
  }).required(),
});

// Schema for POST /api/v2/settings/category/:category
const saveSettingsByCategorySchema = Joi.object({
  params: Joi.object({
    category: validCategories,
  }).required(),
  body: Joi.object().min(1).required().messages({
    "object.min": "Request body cannot be empty.",
  }),
});

// Schema for POST /api/v2/settings/database/test
const testDbConnectionSchema = Joi.object({
  body: Joi.object({
    host: Joi.string().hostname().required(),
    port: Joi.number().port().required(),
    database: Joi.string().required(),
    user: Joi.string().required(),
    password: Joi.string().allow("").required(), // Password can be an empty string
    ssl: Joi.boolean().optional(),
  }).required(),
});

module.exports = {
  getSettingsByCategorySchema,
  saveSettingsByCategorySchema,
  testDbConnectionSchema,
};
