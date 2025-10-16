
import supertest from 'supertest';
import { httpServer } from '../server';

// API base configuration
const API_VERSION = '/api/v2';

// Test endpoints definition
const endpoints = [
  // Health check
  { method: 'get', path: '/health', expected: 200 },
  { method: 'get', path: '/api/health', expected: 200 },

  // Settings endpoints
  { method: 'get', path: `${API_VERSION}/settings/`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/settings/health`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/settings/category/llm`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/settings/category/embeddings`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/settings/category/database`, expected: 200 },

  // Database endpoints
  { method: 'get', path: `${API_VERSION}/database/health`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/database/tables`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/database/stats`, expected: 200 },

  // Redis endpoints
  { method: 'get', path: `${API_VERSION}/redis/health`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/redis/info`, expected: 200 },

  // Document endpoints (Auth required - 401)
  { method: 'get', path: `${API_VERSION}/documents/`, expected: 401 },
  { method: 'get', path: `${API_VERSION}/documents/stats`, expected: 401 },

  // Chat endpoints
  { method: 'get', path: `${API_VERSION}/chat/health`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/chat/stats`, expected: 401 },

  // Scraper endpoints
  { method: 'get', path: `${API_VERSION}/scraper/health`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/scraper/status`, expected: 401 },

  // Embeddings endpoints
  { method: 'get', path: `${API_VERSION}/embeddings/health`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/embeddings/stats`, expected: 200 },

  // Translation endpoints
  { method: 'get', path: `${API_VERSION}/translate/health`, expected: 200 },
  { method: 'get', path: `${API_VERSION}/translate/languages`, expected: 200 },
];

describe('Comprehensive API Endpoint Health Check', () => {
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(() => {
    // As seen in server.test.ts, using 'as any' to bypass type mismatch issues.
    request = supertest(httpServer) as any;
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  // Dynamically create a test for each endpoint
  endpoints.forEach(endpoint => {
    it(`${endpoint.method.toUpperCase()} ${endpoint.path} should respond with ${endpoint.expected}`, async () => {
      // The 'request' object from supertest has methods for each HTTP verb (get, post, etc.)
      // We can dynamically call the correct method based on the endpoint definition.
      const response = await (request as any)[endpoint.method](endpoint.path);
      
      expect(response.status).toBe(endpoint.expected);
    });
  });
});
