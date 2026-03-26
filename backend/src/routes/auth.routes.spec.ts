import request from 'supertest';
import express from 'express';
import authRouter from './auth.routes';
import { AuthService } from '../services/auth.service';
import { pool } from '../config/database';

// Mock AuthService
jest.mock('../services/auth.service');

// Mock database pool
jest.mock('../config/database', () => ({
  pool: {
    query: jest.fn()
  }
}));

// Mock rate limiting middleware
jest.mock('../middleware/rate-limit.middleware', () => ({
  createAuthRateLimit: {
    middleware: (req: any, res: any, next: any) => next()
  },
  createUploadRateLimit: {
    middleware: (req: any, res: any, next: any) => next()
  }
}));

// Mock auth middleware
jest.mock('../middleware/auth.middleware', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { userId: '1', email: 'test@example.com', role: 'user' };
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth Routes', () => {
  let mockedAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get the mocked instance - in auth.routes, it's created as 'const authService = new AuthService();'
    // Because of jest.mock, the constructor is already mocked.
    mockedAuthService = (AuthService as any).mock.instances[0] || new AuthService();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        status: 'active',
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockResponse = {
        user: mockUser,
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      // Mock the service method
      (mockedAuthService.register as jest.Mock).mockResolvedValue(mockResponse);

      // Mock database queries
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // User not found
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // Profile created
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Free plan found

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('accessToken', 'test-access-token');
      expect(res.body.user.username).toEqual('testuser');
      expect(mockedAuthService.register).toHaveBeenCalled();
    });

    it('should return 400 if validation fails', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com'
          // Missing username and password
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 if service throws error', async () => {
      (mockedAuthService.register as jest.Mock).mockRejectedValue(new Error('User already exists'));

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'User already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login a user successfully', async () => {
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        status: 'active'
      };

      const mockResponse = {
        user: mockUser,
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      (mockedAuthService.login as jest.Mock).mockResolvedValue(mockResponse);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('accessToken', 'test-access-token');
      expect(res.body.user.name).toEqual('Test User');
    });

    it('should return 401 for invalid credentials', async () => {
      (mockedAuthService.login as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      (mockedAuthService.logout as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer testtoken');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Logged out successfully');
      expect(mockedAuthService.logout).toHaveBeenCalledWith('testtoken');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const mockResponse = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      };

      (mockedAuthService.refreshToken as jest.Mock).mockResolvedValue(mockResponse);

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'old-refresh-token' });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('accessToken', 'new-access-token');
    });

    it('should return 401 if refresh fails', async () => {
      (mockedAuthService.refreshToken as jest.Mock).mockRejectedValue(new Error('Invalid refresh token'));

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should verify token successfully', async () => {
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test User', role: 'user' };
      (mockedAuthService.getUserById as jest.Mock).mockResolvedValue(mockUser);

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer validtoken');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('valid', true);
      expect(res.body.user).toEqual(mockUser);
    });

    it('should return 401 if user not found', async () => {
      (mockedAuthService.getUserById as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer validtoken');

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('valid', false);
    });
  });
});
