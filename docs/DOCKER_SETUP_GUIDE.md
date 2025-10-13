# ASEM Projesi Docker Kurulum ve Kullanım Kılavuzu

## Genel Bakış
ASEM (Alice Semantic Bridge) projesi hem yerel geliştirme hem de sunucu üretim ortamı için Docker üzerinde çalıştırılabilir.

## Ön Gereksinimler
- Docker Desktop (Windows/Mac) veya Docker Engine (Linux)
- Docker Compose
- Git
- Node.js (yerel geliştirme için)

## Environment Dosyaları

### Yerel Geliştirme (`.env.lsemb`)
```bash
# Yerel geliştirme için environment ayarları
COMPOSE_PROJECT_NAME=lsemb
NODE_ENV=development
POSTGRES_USER=lsemb_user
POSTGRES_PASSWORD=lsemb_password_2025
POSTGRES_DB=lsemb
REDIS_DB=2
```

### Sunucu Üretim (`.env.lsemb`)
```bash
# Sunucu üretim için environment ayarları
COMPOSE_PROJECT_NAME=lsemb
NODE_ENV=production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Semsiye!22
POSTGRES_DB=lsemb
REDIS_DB=2
```

## Kurulum Adımları

### 1. Projeyi Klonlama
```bash
git clone <repository-url>
cd alice-semantic-bridge
```

### 2. Environment Dosyalarını Oluşturma
```bash
# Yerel geliştirme için
cp .env.lsemb.example .env.lsemb

# Sunucu için (mevcut)
# .env.lsemb dosyası zaten sunucuda mevcut
```

### 3. Environment Dosyalarını Düzenleme
```bash
# .env.lsemb dosyasını düzenle
nano .env.lsemb

# Gerekli değişkenleri güncelle:
# - API anahtarları
# - Veritabanı şifreleri
# - Diğer özel ayarlar
```

## Başlatma Komutları

### Yerel Geliştirme

#### Windows (Batch Dosyası)
```cmd
# Yerel geliştirme ortamını başlat
start-docker-local.bat
```

#### Linux/Mac (Shell Script)
```bash
# Yerel geliştirme ortamını başlat
./start-docker-local.sh
```

#### Manuel Komutlar
```bash
# Mevcut container'ları durdur
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb down

# Servisleri build et ve başlat
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb up --build -d

# Logları görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb logs -f
```

### Sunucu Üretim

#### Windows (Batch Dosyası)
```cmd
# Sunucu üretim ortamını başlat
start-docker-server.bat
```

#### Linux/Mac (Shell Script)
```bash
# Sunucu üretim ortamını başlat
./start-docker-server.sh
```

#### Manuel Komutlar
```bash
# Mevcut container'ları durdur
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb down

# Sistemi temizle
docker system prune -f

# Servisleri build et ve başlat
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb up --build -d

# Logları görüntüle
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb logs -f
```

## Servis URL'leri

### Yerel Geliştirme
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8083
- **API Dokümantasyon**: http://localhost:8083/api/v1/docs
- **Veritabanı**: localhost:5432
- **Redis**: localhost:6379
- **Adminer**: http://localhost:8080
- **Redis Commander**: http://localhost:8081
- **n8n**: http://localhost:5678

### Sunucu Üretim
- **Frontend**: https://lsemb.luwi.dev
- **API**: https://lsemb.luwi.dev/api
- **n8n**: https://n8n.luwi.dev
- **Monitoring**: http://localhost:3030 (Grafana)

## Kullanışlı Komutlar

### Genel Bakış
```bash
# Tüm servislerin durumunu görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb ps

# Belirli bir servisin loglarını görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb logs -f [service-name]

# Tüm servisleri durdur
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb down

# Belirli bir servisi yeniden başlat
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb restart [service-name]

# Servis güncelleme
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb pull
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb up --build -d
```

### Veritabanı İşlemleri
```bash
# PostgreSQL'e bağlan
docker exec -it lsemb-postgres psql -U postgres -d lsemb

# Redis'e bağlan
docker exec -it lsemb-redis redis-cli

# Veritabanı yedeği al
docker exec lsemb-postgres pg_dump -U postgres lsemb > backup.sql

# Yedeği geri yükle
docker exec -i lsemb-postgres psql -U postgres lsemb < backup.sql
```

### Log Yönetimi
```bash
# Tüm logları görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb logs -f

# Son 100 satır log
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb logs --tail=100

# Belirli bir servisin loglarını temizle
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb logs -f [service-name] > service.log
```

## Sorun Giderme

### Yaygın Sorunlar

#### 1. Port Çakışması
```bash
# Kullanılan portları kontrol et
netstat -ano | findstr :5432
netstat -ano | findstr :6379
netstat -ano | findstr :8083
```

#### 2. Docker Daemon Çalışmıyor
```bash
# Docker'ı başlat
# Windows: Docker Desktop'ı aç
# Linux: sudo systemctl start docker
# Mac: Docker Desktop'ı aç
```

#### 3. Environment Değişkenleri
```bash
# Environment değişkenlerini kontrol et
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb config
```

#### 4. Container Sağlık Kontrolü
```bash
# Container'ların durumunu kontrol et
docker ps -a

# Sağlık kontrollerini görüntüle
docker inspect --format='{{.State.Health.Status}}' lsemb-postgres
docker inspect --format='{{.State.Health.Status}}' lsemb-redis
```

### Log Analizi
```bash
# Hata loglarını filtrele
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb logs | grep -i error

# Uyarı loglarını filtrele
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb logs | grep -i warn
```

## Güvenlik

### Production Ortamı İçin
- `.env.lsemb` dosyasını asla commit etmeyin
- Güçlü şifreler kullanın
- SSL/TLS sertifikaları kullanın
- Firewall kurallarını yapılandırın
- Düzenli yedekleme yapın

### Environment Değişkenleri
```bash
# Hassas değişkenleri kontrol et
grep -r "PASSWORD\|KEY\|SECRET" .env.lsemb

# Environment dosyasının izinlerini kontrol et
ls -la .env.lsemb
```

## Bakım

### Düzenli Bakım İşlemleri
```bash
# Docker imajlarını temizle
docker image prune -f

# Kullanılmayan verileri temizle
docker system prune -f

# Logları temizle
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb logs --tail=0 > /dev/null
```

### Yedekleme
```bash
# Veritabanı yedeği
docker exec lsemb-postgres pg_dump -U postgres lsemb > backup-$(date +%Y%m%d).sql

# Redis yedeği
docker exec lsemb-redis redis-cli SAVE
docker cp lsemb-redis:/data/dump.rdb redis-backup-$(date +%Y%m%d).rdb
```

## Destek

Sorunlarla karşılaşırsanız:
1. Logları kontrol edin
2. Bu kılavuzu referans alın
3. GitHub issues bölümüne bildirin