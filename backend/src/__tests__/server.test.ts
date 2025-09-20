import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../server'; // Sunucu dosyasından app'i import et
import { Server } from 'http';

let server: Server;
let request: supertest.SuperTest<supertest.Test>;

describe('Server API Endpoints', () => {
  beforeAll(() => {
    // Testler başlamadan önce sunucuyu başlat
    // Gerçek sunucunun kullandığı porttan farklı bir portta çalıştırabiliriz
    // Veya çalışan sunucuyu direkt kullanabiliriz. Şimdilik app'i direkt kullanalım.
    // server = app.listen(8084); // Rastgele bir portta test sunucusu başlat
    request = supertest(app);
  });

  // afterAll((done) => {
  //   // Testler bittikten sonra sunucuyu kapat
  //   server.close(done);
  // });

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
