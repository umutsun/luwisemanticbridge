
import supertest from 'supertest';
import { httpServer } from '../server';

let request: supertest.SuperTest<supertest.Test>;

beforeAll(() => {
  // We use 'as any' here to bypass a persistent and complex type mismatch issue
  // between supertest, @types/supertest, express, and the project's TS config.
  // This allows the tests to run, confirming the issue is type-related, not a runtime error.
  request = supertest(httpServer) as any;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Server API Endpoints', () => {
  it('GET /health should respond with 200 OK and a healthy status', async () => {
    const response = await request.get('/health');
    
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.services.postgres).toBe('connected');
    expect(response.body.services.redis).toBe('connected');
  });

  it('GET /api/v2 should respond with 200 OK and API version info', async () => {
    const response = await request.get('/api/v2');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('ASB Backend API v2');
    expect(response.body.version).toBe('2.0.0');
  });

  it('GET /a-non-existent-route should respond with 404 Not Found', async () => {
    const response = await request.get('/a-non-existent-route');
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Not found');
  });
});
