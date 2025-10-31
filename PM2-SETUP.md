# PM2 Kurulum ve Başlangıç Rehberi

## 1. PM2 Kurulumu

### Global Kurulum (Önerilen)
```bash
npm install -g pm2
```

### Kurulumu Kontrol Et
```bash
pm2 --version
```

## 2. Servisleri Başlatma

### Otomatik Başlatma (Önerilen)
```bash
.\start-pm2.bat
```

### Manuel Başlatma
```bash
pm2 start ecosystem.config.js
```

### Sadece Belirli Servisler
```bash
# Sadece backend
pm2 start ecosystem.config.js --only lsemb-backend

# Sadece frontend
pm2 start ecosystem.config.js --only lsemb-frontend

# Sadece Python servisler
pm2 start ecosystem.config.js --only lsemb-python
```

## 3. Durum Kontrolü

```bash
pm2 list
```

**Beklenen Çıktı:**
```
┌─────┬──────────────────┬─────────┬─────────┬──────────┬────────┬──────┐
│ id  │ name             │ mode    │ status  │ cpu      │ memory │ ...  │
├─────┼──────────────────┼─────────┼─────────┼──────────┼────────┼──────┤
│ 0   │ lsemb-backend    │ fork    │ online  │ 0%       │ 150MB  │ ...  │
│ 1   │ lsemb-frontend   │ fork    │ online  │ 0%       │ 200MB  │ ...  │
│ 2   │ lsemb-python     │ fork    │ online  │ 0%       │ 300MB  │ ...  │
└─────┴──────────────────┴─────────┴─────────┴──────────┴────────┴──────┘
```

## 4. Logları Görüntüleme

```bash
# Tüm loglar
pm2 logs

# Sadece bir servis
pm2 logs lsemb-backend

# Son 50 satır
pm2 logs --lines 50
```

## 5. Servisleri Durdurma

```bash
# Otomatik
.\stop-pm2.bat

# Manuel - hepsini durdur
pm2 stop all

# Manuel - sadece bir servis
pm2 stop lsemb-backend
```

## 6. Servisleri Yeniden Başlatma

```bash
pm2 restart all

# Sadece bir servis
pm2 restart lsemb-backend
```

## 7. Ön Gereksinimler Kontrolü

### Backend (Node.js)
```bash
cd backend
npm install
npm run build

# Kontrol
dir dist\server.js
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run build

# Kontrol
dir .next
```

### Python Services
```bash
cd backend\python-services

# Virtual environment oluştur (ilk kez)
python -m venv venv

# Aktive et
.\venv\Scripts\activate

# Paketleri kur
pip install -r requirements.txt

# Test
python main.py
```

## 8. Sorun Giderme

### PM2 Komutu Bulunamıyor
```bash
# Global kurulum
npm install -g pm2

# Ya da PATH'e ekle
where pm2
```

### Servis Başlamıyor

**1. Backend:**
```bash
cd backend
npm run build
pm2 logs lsemb-backend
```

**2. Frontend:**
```bash
cd frontend
npm run build
pm2 logs lsemb-frontend
```

**3. Python:**
```bash
cd backend\python-services
.\venv\Scripts\activate
python main.py
# Hata varsa düzelt
pm2 logs lsemb-python
```

### Port Zaten Kullanılıyor

**Port kontrolü:**
```bash
# Windows
netstat -ano | findstr :8083
netstat -ano | findstr :3002
netstat -ano | findstr :8001

# Process'i öldür
taskkill /PID <PID> /F
```

### Python Virtual Environment Yok

```bash
cd backend\python-services
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

## 9. Yararlı PM2 Komutları

```bash
pm2 list                # Process listesi
pm2 monit               # Canlı monitoring
pm2 logs                # Log izleme
pm2 flush               # Logları temizle
pm2 describe <name>     # Detaylı bilgi
pm2 save                # Mevcut durumu kaydet
pm2 resurrect           # Kaydedilen durumu geri yükle
pm2 delete all          # Tüm process'leri sil
```

## 10. Servis URL'leri

Start edildiğinde erişim:

- **Backend API**: http://localhost:8083
- **Frontend**: http://localhost:3002
- **Python Services**: http://localhost:8001
- **GraphQL Playground**: http://localhost:8083/graphql

## 11. Otomatik Başlatma (Windows Startup)

```bash
# PM2 startup script oluştur
pm2 startup

# Mevcut process'leri kaydet
pm2 save
```

## 12. Performans İzleme

```bash
# Web tabanlı monitoring (port 9615)
pm2 web

# Terminal tabanlı monitoring
pm2 monit
```

## 13. Güncelleme Sonrası

```bash
# 1. Servisleri durdur
pm2 stop all

# 2. Git pull
git pull origin main

# 3. Bağımlılıkları güncelle
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
cd ../backend/python-services && pip install -r requirements.txt

# 4. Servisleri başlat
pm2 restart all
```

## Daha Fazla Bilgi

Detaylı kullanım için `PM2-GUIDE.md` dosyasına bakın.
