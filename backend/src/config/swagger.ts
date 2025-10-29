import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alice Semantic Bridge API',
      version: '2.0.0',
      description: 'AI-powered semantic search and knowledge management system API',
      contact: {
        name: 'Luwi Team',
        email: 'support@luwi.dev'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3002/api/v2',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            username: {
              type: 'string'
            },
            role: {
              type: 'string',
              enum: ['admin', 'user', 'premium']
            },
            is_active: {
              type: 'boolean'
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'User password'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            user: {
              $ref: '#/components/schemas/User'
            },
            accessToken: {
              type: 'string',
              description: 'JWT access token'
            }
          }
        },
        Document: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            title: {
              type: 'string'
            },
            content: {
              type: 'string'
            },
            type: {
              type: 'string'
            },
            size: {
              type: 'integer'
            },
            hasEmbeddings: {
              type: 'boolean'
            },
            metadata: {
              type: 'object'
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        ChatMessage: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            sessionId: {
              type: 'string'
            },
            message: {
              type: 'string'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            type: {
              type: 'string',
              enum: ['user', 'bot']
            },
            sources: {
              type: 'array',
              items: {
                type: 'object'
              }
            }
          }
        },
        ChatRequest: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              description: 'User message'
            },
            conversationId: {
              type: 'string',
              description: 'Conversation ID (optional)'
            },
            temperature: {
              type: 'number',
              minimum: 0,
              maximum: 2,
              default: 0.7
            },
            model: {
              type: 'string',
              description: 'LLM model to use'
            },
            ragWeight: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.5
            },
            language: {
              type: 'string',
              default: 'tr'
            }
          }
        },
        SettingsObject: {
          type: 'object',
          description: 'Settings object with nested properties'
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string'
            },
            message: {
              type: 'string'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy']
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            responseTime: {
              type: 'number'
            },
            services: {
              type: 'object',
              properties: {
                postgres: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['connected', 'disconnected']
                    },
                    responseTime: {
                      type: 'number'
                    }
                  }
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['connected', 'disconnected']
                    },
                    responseTime: {
                      type: 'number'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/*.ts', // TypeScript source files for development
    './src/routes/**/*.ts',
    './dist/routes/*.js', // Compiled JavaScript files for production
    './dist/routes/**/*.js',
    // Also support direct paths
    `${__dirname}/../routes/*.ts`,
    `${__dirname}/../routes/**/*.ts`,
    `${__dirname}/../../dist/routes/*.js`,
    `${__dirname}/../../dist/routes/**/*.js`
  ]
};

export const specs = swaggerJsdoc(options);

export const swaggerUiOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 20px 0 }
    .swagger-ui .scheme-container { margin: 20px 0 }
    .swagger-ui .opblock.opblock-post { border-color: #49cc90 }
    .swagger-ui .opblock.opblock-get { border-color: #61affe }
    .swagger-ui .opblock.opblock-put { border-color: #fca130 }
    .swagger-ui .opblock.opblock-delete { border-color: #f93e3e }
  `,
  customSiteTitle: 'Alice Semantic Bridge API Documentation'
};

export const setupSwagger = (app: Application) => {
  // Swagger page
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(specs, swaggerUiOptions));

  // JSON format
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};