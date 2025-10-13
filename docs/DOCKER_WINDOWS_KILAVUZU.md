# Docker Windows Kurulum ve Çalıştırma Kılavuzu

## Hızlı Başlangıç

### 1. Gerekli Kurulumlar
- Docker Desktop for Windows (WSL2 backend ile)
- PostgreSQL (Windows'te lokal veya external)
- Node.js 18+ (test için)

### 2. Çalıştırma Script'i

```bash
# Otomatik başlatma
./start-docker.bat

# Manuel komutlar
docker-compose -f docker-compose.windows.yml up -d
```

### 3. Servisler

- **Frontend**: http://localhost:3000
- **Dashboard**: http://localhost:3001
- **API**: http://localhost:8083
- **Redis**: localhost:6379
- **RAG-anything**: http://localhost:8002

## Windows Özel Çözümler

### 1. Host Networking
`host.docker.internal` kullanarak host makinedeki servislere erişim:
- PostgreSQL: `host.docker.internal:5432`
- Redis: Container içinde (6379)

### 2. Volume Mounting
Windows path'leri için `consistency: cached`:
```yaml
volumes:
  - type: bind
    source: ./backend
    target: /app
    consistency: cached
```

### 3. File Watching
Hot-reload için:
```yaml
environment:
  CHOKIDAR_USEPOLLING: "true"
  WATCHPACK_POLLING: "true"
```

## Port Yapılandırması

| Servis | Port | Açıklama |
|--------|------|----------|
| Frontend | 3000 | Next.js chat interface |
| Dashboard | 3001 | Admin panel |
| API | 8083 | Backend API |
| WebSocket | 8084 | Real-time communication |
| Redis | 6379 | Cache |
| Redis Insight | 8001 | Redis GUI |
| RAG-anything | 8002 | Python RAG service |

## Sorun Giderme

### 1. Port Çakışması
```bash
# Port kullanan process'i bul
netstat -ano | findstr :3000
# Task Manager'dan kapat
```

### 2. Docker Desktop
- WSL2 backend aktif olmalı
- "Use WSL 2 based engine" işaretli
- 4GB+ RAM ayrılmış olmalı

### 3. Network Sorunları
```bash
# Docker network'lerini sıfırla
docker network prune
docker-compose down
docker-compose up -d
```

### 4. Build Sorunları
```bash
# Cache'li build
docker-compose build --no-cache
# Node_modules temizle
docker-compose exec api rm -rf node_modules
docker-compose exec api npm install
```

## Log İzleme

```bash
# Tüm loglar
docker-compose -f docker-compose.windows.yml logs -f

# Servis logları
docker-compose -f docker-compose.windows.yml logs -f api
docker-compose -f docker-compose.windows.yml logs -f frontend
docker-compose -f docker-compose.windows.yml logs -f redis
```

## Durum Kontrolü

```bash
# Servis durumları
docker-compose -f docker-compose.windows.yml ps

# Health check
docker-compose -f docker-compose.windows.yml exec redis redis-cli ping
curl http://localhost:8083/health
```

## Durdurma

```bash
# Tüm servisleri durdur
docker-compose -f docker-compose.windows.yml down

# Volumes ile birlikte temizle
docker-compose -f docker-compose.windows.yml down -v
```

## Notlar

- PostgreSQL harici olarak çalışıyor (`lsemb.luwi.dev`)
- Redis Docker container içinde
- WSL2 performans için kritik
- Windows Firewall portları engellemesin