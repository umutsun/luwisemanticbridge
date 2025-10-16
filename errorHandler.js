/**
 * Global error handling middleware for Express.
 * This should be the last middleware added to the app stack.
 * It catches any errors that occur in the route handlers.
 */
const errorHandler = (err, req, res, next) => {
  // Log the full error for debugging purposes on the server
  console.error(err);

  const statusCode = err.statusCode || 500;
  const message =
    err.message || "An unexpected internal server error occurred.";

  const response = {
    success: false,
    error: {
      message,
      statusCode,
    },
  };

  // In development environments, include the stack trace for easier debugging
  if (process.env.NODE_ENV !== "production") {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
