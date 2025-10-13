# Luwi Semantic Bridge (LSEMB) Docker Kurulum Rehberi

Bu dokümantasyon Luwi Semantic Bridge(LSEMB) projesini hem yerel Windows hem de sunucu ortamında Docker ile nasıl çalıştıracağınızı açıklar.

## Özellikler

- **Windows ve Linux uyumlu** Docker konfigürasyonu
- **Redis** ile agent'lar arası shared memory
- **Harici PostgreSQL** desteği (91.99.229.96)
- **Hot reload** desteği (development mode)
- **Health check** ile servis durumu kontrolü
- **PM2 alternatifi** (Docker çalışmıyorsa)

## Hızlı Başlangıç (Windows)

### 1. Gereksinimler
- Docker Desktop for Windows (yüklü ve çalışıyor)
- Node.js 18+ (PM2 için alternatif)
- Git

### 2. Kurulum Adımları

#### Docker ile Kurulum (Önerilen)
```bash
# 1. Repoyu klonla
git clone <repository-url>
cd alice-semantic-bridge

# 2. Environment dosyasını kopyala ve düzenle
copy .env.lsemb.example .env.lsemb
# .env.lsemb dosyasını düzenle (API keys, database settings)

# 3. Başlatma script'ini çalıştır
start-docker.bat
```

#### PM2 ile Kurulum (Alternatif)
```bash
# Docker çalışmıyorsa
start-pm2.bat
```

### 3. Servislere Erişim

| Servis | Port | URL | Açıklama |
|--------|------|-----|----------|
| Frontend | 3000 | http://localhost:3000 | Chat arayüzü |
| Dashboard | 3001 | http://localhost:3001 | Admin panel |
| API | 8083 | http://localhost:8083 | Backend API |
| Redis | 6379 | localhost:6379 | Cache |
| Redis Insight | 8001 | http://localhost:8001 | Redis UI |

## Docker Komutları

### Servisleri Başlat
```bash
docker-compose -f docker-compose.lsemb.yml up -d
```

### Logları İzle
```bash
docker-compose -f docker-compose.lsemb.yml logs -f
```

### Servisleri Durdur
```bash
docker-compose -f docker-compose.lsemb.yml down
```

### Rebuild (kod değişikliklerinden sonra)
```bash
docker-compose -f docker-compose.lsemb.yml up -d --build
```

### Volume'ları Temizle
```bash
docker-compose -f docker-compose.lsemb.yml down -v
```

## Development Mode

Development modunda çalıştırmak için:

1. `.env.docker` dosyasında:
```
NODE_ENV=development
```

2. Docker Compose'u başlatın:
```bash
docker-compose -f docker-compose.lsemb.yml up
```

Bu modda:
- Hot reload aktif olacak
- Source code değişiklikleri otomatik yansıyacak
- Debug logları görünecek

## Production Deployment

Production için öneriler:

1. **SSL/TLS**: Nginx config'e SSL ekleyin
2. **Firewall**: Sadece gerekli portları açın
3. **Backup**: PostgreSQL için düzenli backup
4. **Monitoring**: Container metriklerini izleyin
5. **Secrets**: API key'leri Docker secrets ile yönetin

## Troubleshooting

### Container başlamıyor
```bash
# Logları kontrol edin
docker-compose -f docker-compose.lsemb.yml logs alice-bridge

# Container'a bağlanın
docker exec -it lsemb-app sh
```

### Database bağlantı hatası
```bash
# PostgreSQL logları
docker logs lsemb-postgres

# Bağlantıyı test edin
docker exec -it lsemb-postgres psql -U postgres -d lsemb
```

### Port çakışması
```bash
# Kullanılan portları kontrol edin
netstat -an | findstr :3000
netstat -an | findstr :8083
netstat -an | findstr :5433

# .env.docker'da portları değiştirin
FRONTEND_PORT=3001
BACKEND_PORT=8084
```

## Sunucuya Deploy

1. **Kodu sunucuya kopyalayın**
```bash
git clone <repo-url>
cd alice-semantic-bridge
```

2. **Environment ayarları**
```bash
cp .env.example .env.docker
# API key'leri ve production ayarlarını ekleyin
nano .env.docker
```

3. **Docker Compose ile başlatın**
```bash
docker-compose -f docker-compose.lsemb.yml --env-file .env.docker up -d
```

4. **Nginx reverse proxy** (opsiyonel)
```bash
# Production profile'ı aktif edin
docker-compose -f docker-compose.lsemb.yml --profile production up -d
```

## Mimari

```
┌─────────────────────────────────────────┐
│           Nginx (Port 80/443)           │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│        Alice Bridge Container           │
│  ┌─────────────┐    ┌────────────────┐ │
│  │  Frontend   │    │   Backend API  │ │
│  │  Port 3000  │    │   Port 8083    │ │
│  └─────────────┘    └────────────────┘ │
└────────┬──────────────────┬─────────────┘
         │                  │
    ┌────┴─────┐      ┌────┴─────┐
    │ PostgreSQL│      │  Redis   │
    │ Port 5433 │      │ Port 6379│
    └───────────┘      └──────────┘
```

## Agent Dosyaları

Agent'lar arası paylaşılan dosyalar volume olarak mount edilir:
- `.claude/`
- `.gemini/`
- `.codex/`

Bu klasörler Redis üzerinden Project Key ile senkronize edilir:
- **Claude**: `lsemb-claude-project`
- **Gemini**: `lsemb-gemini-project`
- **Codex**: `lsemb-codex-project`
