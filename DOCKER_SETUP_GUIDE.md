# ASEM Projesi Docker Kurulum ve Kullanım Kılavuzu

## Genel Bakış
ASEM (Alice Semantic Bridge) projesi hem yerel geliştirme hem de sunucu üretim ortamı için Docker üzerinde çalıştırılabilir.

## Ön Gereksinimler
- Docker Desktop (Windows/Mac) veya Docker Engine (Linux)
- Docker Compose
- Git
- Node.js (yerel geliştirme için)

## Environment Dosyaları

### Yerel Geliştirme (`.env.asemb`)
```bash
# Yerel geliştirme için environment ayarları
COMPOSE_PROJECT_NAME=asemb
NODE_ENV=development
POSTGRES_USER=asemb_user
POSTGRES_PASSWORD=asemb_password_2025
POSTGRES_DB=asemb
REDIS_DB=2
```

### Sunucu Üretim (`.env.asemb`)
```bash
# Sunucu üretim için environment ayarları
COMPOSE_PROJECT_NAME=asemb
NODE_ENV=production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Semsiye!22
POSTGRES_DB=asemb
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
cp .env.asemb.example .env.asemb

# Sunucu için (mevcut)
# .env.asemb dosyası zaten sunucuda mevcut
```

### 3. Environment Dosyalarını Düzenleme
```bash
# .env.asemb dosyasını düzenle
nano .env.asemb

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
docker-compose -f docker-compose.dev.yml --env-file .env.asemb down

# Servisleri build et ve başlat
docker-compose -f docker-compose.dev.yml --env-file .env.asemb up --build -d

# Logları görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs -f
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
docker-compose -f docker-compose.prod.yml --env-file .env.asemb down

# Sistemi temizle
docker system prune -f

# Servisleri build et ve başlat
docker-compose -f docker-compose.prod.yml --env-file .env.asemb up --build -d

# Logları görüntüle
docker-compose -f docker-compose.prod.yml --env-file .env.asemb logs -f
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
- **Frontend**: https://asemb.luwi.dev
- **API**: https://asemb.luwi.dev/api
- **n8n**: https://n8n.luwi.dev
- **Monitoring**: http://localhost:3030 (Grafana)

## Kullanışlı Komutlar

### Genel Bakış
```bash
# Tüm servislerin durumunu görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.asemb ps

# Belirli bir servisin loglarını görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs -f [service-name]

# Tüm servisleri durdur
docker-compose -f docker-compose.dev.yml --env-file .env.asemb down

# Belirli bir servisi yeniden başlat
docker-compose -f docker-compose.dev.yml --env-file .env.asemb restart [service-name]

# Servis güncelleme
docker-compose -f docker-compose.dev.yml --env-file .env.asemb pull
docker-compose -f docker-compose.dev.yml --env-file .env.asemb up --build -d
```

### Veritabanı İşlemleri
```bash
# PostgreSQL'e bağlan
docker exec -it asemb-postgres psql -U postgres -d asemb

# Redis'e bağlan
docker exec -it asemb-redis redis-cli

# Veritabanı yedeği al
docker exec asemb-postgres pg_dump -U postgres asemb > backup.sql

# Yedeği geri yükle
docker exec -i asemb-postgres psql -U postgres asemb < backup.sql
```

### Log Yönetimi
```bash
# Tüm logları görüntüle
docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs -f

# Son 100 satır log
docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs --tail=100

# Belirli bir servisin loglarını temizle
docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs -f [service-name] > service.log
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
docker-compose -f docker-compose.dev.yml --env-file .env.asemb config
```

#### 4. Container Sağlık Kontrolü
```bash
# Container'ların durumunu kontrol et
docker ps -a

# Sağlık kontrollerini görüntüle
docker inspect --format='{{.State.Health.Status}}' asemb-postgres
docker inspect --format='{{.State.Health.Status}}' asemb-redis
```

### Log Analizi
```bash
# Hata loglarını filtrele
docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs | grep -i error

# Uyarı loglarını filtrele
docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs | grep -i warn
```

## Güvenlik

### Production Ortamı İçin
- `.env.asemb` dosyasını asla commit etmeyin
- Güçlü şifreler kullanın
- SSL/TLS sertifikaları kullanın
- Firewall kurallarını yapılandırın
- Düzenli yedekleme yapın

### Environment Değişkenleri
```bash
# Hassas değişkenleri kontrol et
grep -r "PASSWORD\|KEY\|SECRET" .env.asemb

# Environment dosyasının izinlerini kontrol et
ls -la .env.asemb
```

## Bakım

### Düzenli Bakım İşlemleri
```bash
# Docker imajlarını temizle
docker image prune -f

# Kullanılmayan verileri temizle
docker system prune -f

# Logları temizle
docker-compose -f docker-compose.prod.yml --env-file .env.asemb logs --tail=0 > /dev/null
```

### Yedekleme
```bash
# Veritabanı yedeği
docker exec asemb-postgres pg_dump -U postgres asemb > backup-$(date +%Y%m%d).sql

# Redis yedeği
docker exec asemb-redis redis-cli SAVE
docker cp asemb-redis:/data/dump.rdb redis-backup-$(date +%Y%m%d).rdb
```

## Destek

Sorunlarla karşılaşırsanız:
1. Logları kontrol edin
2. Bu kılavuzu referans alın
3. GitHub issues bölümüne bildirin