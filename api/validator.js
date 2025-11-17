const Joi = require("joi");

/**
 * A middleware factory that creates a validation middleware for a given Joi schema.
 * It validates req.body, req.query, and req.params.
 * @param {Joi.Schema} schema - The Joi schema to validate against.
 * @returns {Function} Express middleware function.
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(
    { body: req.body, query: req.query, params: req.params },
    { abortEarly: false, stripUnknown: true } // Return all errors, remove unknown properties
  );

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message)
      .join(", ");
    return res
      .status(400)
      .json({ error: "Validation failed", details: errorMessage });
  }

  // Attach validated and sanitized values to the request object
  Object.assign(req, value);

  return next();
};

module.exports = validate;
