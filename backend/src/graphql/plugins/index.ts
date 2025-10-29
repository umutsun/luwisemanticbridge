/**
 * GraphQL Plugins
 * Yoga-compatible plugins for rate limiting, logging, auth, etc.
 */

import { Plugin } from 'graphql-yoga';

/**
 * Rate Limiting Plugin
 * Simple in-memory rate limiter per IP
 */
export const rateLimitPlugin = (options: {
  max: number;
  window: string;
}): Plugin => {
  const requests = new Map<string, number[]>();
  const windowMs = parseTimeWindow(options.window);

  return {
    onRequest({ request, fetchAPI, endResponse }) {
      const ip = getClientIP(request);
      const now = Date.now();

      // Clean old requests
      const userRequests = requests.get(ip) || [];
      const recentRequests = userRequests.filter((time) => now - time < windowMs);

      if (recentRequests.length >= options.max) {
        return endResponse(
          new fetchAPI.Response('Too many requests', {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(Math.ceil(windowMs / 1000)),
            },
          })
        );
      }

      recentRequests.push(now);
      requests.set(ip, recentRequests);
    },
  };
};

/**
 * Logging Plugin
 * Logs all GraphQL operations
 */
export const loggingPlugin = (): Plugin => {
  return {
    onRequest({ request }) {
      const operationName = request.headers.get('x-operation-name') || 'unknown';
      console.log(`[GraphQL] Request: ${request.method} ${request.url} - Operation: ${operationName}`);
    },
    onResponse({ response }) {
      console.log(`[GraphQL] Response: ${response.status}`);
    },
    onParse() {
      return {
        onParseDone({ result }) {
          if (result && 'kind' in result) {
            console.log(`[GraphQL] Parse: Query parsed successfully`);
          }
        },
      };
    },
  };
};

/**
 * Complexity Plugin
 * Limits query complexity to prevent expensive queries
 */
export const complexityPlugin = (options: { maxComplexity: number }): Plugin => {
  return {
    onValidate({ params, addValidationRule }) {
      // Simple complexity check - count fields
      return {
        onValidateEnd() {
          const doc = params.documentAST;
          if (doc && doc.definitions) {
            let fieldCount = 0;

            // Simple field counter (not production-grade)
            const countFields = (node: any) => {
              if (node.selectionSet) {
                fieldCount += node.selectionSet.selections.length;
                node.selectionSet.selections.forEach((selection: any) => {
                  countFields(selection);
                });
              }
            };

            doc.definitions.forEach((def: any) => {
              if (def.kind === 'OperationDefinition') {
                countFields(def);
              }
            });

            if (fieldCount > options.maxComplexity) {
              throw new Error(
                `Query complexity ${fieldCount} exceeds maximum allowed complexity ${options.maxComplexity}`
              );
            }
          }
        },
      };
    },
  };
};

/**
 * Auth Plugin
 * Validates JWT token and attaches user to context
 */
export const authPlugin = (): Plugin => {
  return {
    onContextBuilding({ context }) {
      // Auth is already handled in context creation
      // This plugin just logs auth status
      if (context.user) {
        console.log(`[GraphQL] Authenticated user: ${context.user.email}`);
      }
    },
  };
};

/**
 * DataLoader Plugin
 * DataLoaders are created in context, this plugin just ensures they exist
 */
export const dataloaderPlugin = (): Plugin => {
  return {
    onContextBuilding({ context }) {
      if (!context.dataloaders) {
        console.warn('[GraphQL] Warning: DataLoaders not found in context');
      }
    },
  };
};

// Helper functions
function parseTimeWindow(window: string): number {
  const match = window.match(/^(\d+)([smhd])$/);
  if (!match) return 60000; // Default 1 minute

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60000;
  }
}

function getClientIP(request: Request): string {
  // Try to get real IP from headers
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a default
  return 'unknown';
}
