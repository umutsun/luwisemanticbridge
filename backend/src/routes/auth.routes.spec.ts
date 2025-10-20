import request from 'supertest';
import express from 'express';
import authRouter from './auth.routes'; // Test edilecek router
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Bağımlılıkları mock'lama
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    release: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

// Mock Redis for rate limiting
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
  }));
});

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth Routes', () => {
  let pool: jest.Mocked<Pool>;

  beforeEach(() => {
    // Her test öncesi mock'ları temizle
    jest.clearAllMocks();
    pool = new (Pool as any)();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      // Mock veritabanı cevapları
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Kullanıcı yok
        .mockResolvedValueOnce({ rows: [{ id: 1, email: 'test@example.com', name: 'Test User', role: 'user' }] }) // Yeni kullanıcı oluşturuldu
        .mockResolvedValueOnce({ rows: [] }) // Profil oluşturuldu
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Ücretsiz plan bulundu
        .mockResolvedValueOnce({ rows: [] }); // Abonelik oluşturuldu

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedpassword');
      (jwt.sign as jest.Mock).mockReturnValue('testtoken');

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('accessToken', 'testtoken');
      expect(res.body.user).toEqual({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      });
      expect(pool.query).toHaveBeenCalledTimes(7); // Sorgu sayısını kontrol et
    });

    it('should return 400 if user already exists', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Kullanıcı var

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'User already exists with this email');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login a user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'user',
        status: 'active',
      };
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockUser] }) // Kullanıcı bulundu
        .mockResolvedValueOnce({ rows: [] }) // Son giriş güncellendi
        .mockResolvedValueOnce({ rows: [] }) // Oturum kaydedildi
        .mockResolvedValueOnce({ rows: [] }) // Aktivite loglandı
        .mockResolvedValueOnce({ rows: [{ company_name: 'Test Inc.' }] }) // Profil bulundu
        .mockResolvedValueOnce({ rows: [{ plan_name: 'Free' }] }); // Abonelik bulundu

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('testtoken');

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('accessToken', 'testtoken');
      expect(res.body.user.name).toEqual('Test User');
    });

    it('should return 401 for invalid credentials', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // Kullanıcı bulunamadı

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should return 401 for wrong password', async () => {
      const mockUser = { id: 1, email: 'test@example.com', password: 'hashedpassword', status: 'active' };
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Şifre eşleşmedi

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should return 403 if user is not active', async () => {
      const mockUser = { id: 1, email: 'test@example.com', password: 'hashedpassword', status: 'inactive' };
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('error', 'Account is inactive');
    });

    it('should return 500 on login db error', async () => {
      (pool.query as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'Login failed');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer testtoken');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Logout successful');
      expect(pool.query).toHaveBeenCalledWith('DELETE FROM user_sessions WHERE token = $1', ['testtoken']);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it.skip('should refresh token successfully', async () => {
      const decodedToken = { userId: 1, email: 'test@example.com', role: 'user' };
      // Hangi secret'in kullanıldığını kontrol etmiyoruz, sadece doğru payload'ı döndürüyoruz.
      // Gerçek uygulamada, jwt.verify'nin doğru secret ile çağrıldığını test etmek daha iyi olabilir.
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Session found
      
      (jwt.sign as jest.Mock).mockImplementation((payload, secret, options) => {
        if (options && options.expiresIn === '1h') return 'newaccesstoken';
        return 'newrefreshtoken';
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'oldrefreshtoken' });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('accessToken', 'newaccesstoken');
      expect(res.body).toHaveProperty('refreshToken', 'newrefreshtoken');
    });

    it('should return 401 for invalid refresh token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('Invalid'); });
      
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalidtoken' });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should verify token successfully', async () => {
      const decodedToken = { userId: 1 };
      const mockUser = { id: 1, email: 'test@example.com', name: 'Test User', role: 'user' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Session found
        .mockResolvedValueOnce({ rows: [mockUser] }); // User found

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer validtoken');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('valid', true);
      expect(res.body.user).toEqual(mockUser);
    });

    it('should return 401 for invalid token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('Invalid'); });

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalidtoken');

      expect(res.statusCode).toEqual(401);
    });
  });
});
