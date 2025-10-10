import { log } from './logger-bridge';

export function generateTestLogs() {
  // Generate various test logs
  log.info('Sistem başlatılıyor...', { service: 'system', version: '1.0.0' });
  log.debug('Veritabanı bağlantısı kuruluyor', { host: 'localhost', port: 5432 });
  log.info('Kullanıcı girişi başarılı', { userId: '12345', ip: '192.168.1.1' });
  log.warn('Yüksek bellek kullanımı tespit edildi', { memory: '85%', threshold: '80%' });
  log.error('API isteği başarısız', new Error('Connection timeout'), { endpoint: '/api/data', retries: 3 });
  log.info('Embedding işlemi tamamlandı', { documents: 150, duration: '2.5s' });
  log.debug('Cache kontrol ediliyor', { key: 'user:12345', hit: true });
  log.warn('Rate limit yaklaşılıyor', { requests: 950, limit: 1000 });
  log.info('WebSocket bağlantısı kuruldu', { clientId: 'abc-123', type: 'log-stream' });
  log.error('Veri işleme hatası', new Error('Invalid data format'), { recordId: 'rec-456' });
}