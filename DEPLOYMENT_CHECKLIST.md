# Alice Semantic Bridge - Sunucu Kurulum Checklist

## ÖNCE KURULUM

### 1. Sunucu Gereksinimleri
- [ ] Node.js 18+ yüklü mü?
- [ ] Python 3.8+ yüklü mü?
- [ ] PostgreSQL 14+ yüklü mü?
- [ ] Redis yüklü mü?
- [ ] PM2 yüklü mü? (`npm install -g pm2`)

### 2. Environment Setup
- [ ] Proje dosyaları sunucuya kopyalandı mı?
- [ ] `.env` dosyası oluşturuldu mu?
- [ ] Database bağlantı bilgileri doğru ayarlandı mı?
- [ ] API anahtarları (OpenAI, Claude, Gemini) ayarlandı mı?

## KURULUM ADIMLARI

### 3. Database Setup
- [ ] PostgreSQL veritabanı oluşturuldu mu?
- [ ] pgvector extension yüklendi mü?
- [ ] Database migration çalıştırıldı mı?
- [ ] Tablolar doğru oluşturuldu mu?

### 4. Backend Kurulumu
```bash
cd backend
npm install
npm run build
```
- [ ] Dependencies yüklendi mi?
- [ ] Build başarılı oldu mu?
- [ ] PM2 config oluşturuldu mu?

### 5. Frontend Kurulumu
```bash
cd frontend
npm install
npm run build
npm run start  # Production modda
```
- [ ] Dependencies yüklendi mi?
- [ ] Build başarılı oldu mu?
- [ ] Static files doğru oluşturuldu mu?

## SERVİS YÖNETİMİ

### 6. PM2 Configuration
- [ ] `ecosystem.config.js` dosyası oluşturuldu mu?
- [ ] Backend service PM2'ye eklendi mi?
- [ ] Frontend service PM2'ye eklendi mi?
- [ ] Servisler autostart ayarlandı mı?

### 7. Reverse Proxy (Nginx)
- [ ] Nginx config dosyası oluşturuldu mu?
- [ ] SSL sertifikası yüklendi mü?
- [ ] Proxy ayarları doğru yapılandırıldı mı?
- [ ] Firewall portları açıldı mı?

## TEST VE DOĞRULAMA

### 8. Health Checks
- [ ] Backend health endpoint çalışıyor mu? (`/health`)
- [ ] Frontend açılıyor mu?
- [ ] Database bağlantısı başarılı mı?
- [ ] Redis bağlantısı başarılı mı?

### 9. Functionality Tests
- [ ] Doküman yükleme çalışıyor mu?
- [ ] Embedding oluşturuluyor mu?
- [ ] Chat özelliği çalışıyor mu?
- [ ] Arama sonuçları geliyor mu?

## MONİTORİNG

### 10. Logging
- [ ] Loglama path'leri ayarlandı mı?
- [ ] Log rotation yapılandırıldı mı?
- [ ] Error logları kontrol ediliyor mu?

### 11. Backup ve Güvenlik
- [ ] Database backup planı var mı?
- [ ] Environment variables güvenli mi?
- [ ] API key'ler güvenli bir şekilde saklanıyor mu?

## CANLIYA ALMA

### 12. Go-Live Checklist
- [ ] Domain yönlendirmesi yapıldı mı?
- [ ] DNS güncellendi mi?
- [ ] SSL sertifikası aktif mi?
- [ ] Servisler monitoring'e eklendi mi?

## ACİL DURUM PLANI

### 13. Rollback Planı
- [ ] Önceki versiyon backup'ı var mı?
- [ ] Database backup schedule var mı?
- [ ] Servis restart script'leri hazır mı?

### 14. İletişim Bilgileri
- [ ] Sunucu erişim bilgileri kaydedildi mi?
- [ ] Emergency contact list hazır mı?
- [ ] Dokümantasyon güncellendi mi?