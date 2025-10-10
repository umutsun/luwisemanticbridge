# 🚀 ASEMB n8n.luwi.dev Deployment Guide

## 📋 Deployment Öncesi Checklist

### 1. Lokal Build & Test
```bash
# Projeyi build et
cd C:\xampp\htdocs\alice-semantic-bridge
npm run build

# Build'i kontrol et
ls -la dist/nodes/
# AliceSemanticBridge.node.js olmalı
```

### 2. Sunucu Gereksinimleri
n8n.luwi.dev sunucusunda bulunması gerekenler:
- [ ] PostgreSQL with pgvector extension
- [ ] Redis 6.2+
- [ ] OpenAI API key (n8n credentials'da)

## 🔧 Deployment Yöntemleri

### Yöntem 1: NPM Package (Önerilen)

#### A. NPM'e Publish Et
```bash
# Version'u güncelle
npm version patch

# NPM'e publish et
npm publish

# Ya da scoped package olarak
npm publish --access public
```

#### B. n8n.luwi.dev'de Install Et
```bash
# SSH ile sunucuya bağlan
ssh user@n8n.luwi.dev

# n8n container'ına gir (eğer Docker kullanılıyorsa)
docker exec -it n8n-container bash

# Custom nodes klasörüne git
cd /home/node/.n8n/nodes

# NPM'den install et
npm install n8n-nodes-alice-semantic-bridge

# n8n'i restart et
pm2 restart n8n
# veya
docker restart n8n-container
```

### Yöntem 2: Manual Upload

#### A. Dist Klasörünü Hazırla
```bash
# Build et
npm run build

# Deployment package oluştur
mkdir asemb-deploy
cp -r dist asemb-deploy/
cp package.json asemb-deploy/
cp -r credentials asemb-deploy/  # Eğer varsa

# Zip'le
tar -czf asemb-node.tar.gz asemb-deploy/
```

#### B. Sunucuya Upload Et
```bash
# SCP ile upload
scp asemb-node.tar.gz user@n8n.luwi.dev:/tmp/

# SSH ile bağlan
ssh user@n8n.luwi.dev

# Extract et
cd /home/node/.n8n/nodes
tar -xzf /tmp/asemb-node.tar.gz
cd asemb-deploy
npm install --production

# n8n'i restart et
```

### Yöntem 3: Git Repository

#### A. GitHub'a Push Et
```bash
# GitHub repo'ya push et
git add .
git commit -m "Production ready ASEMB node"
git push origin main
```

#### B. Sunucuda Clone Et
```bash
ssh user@n8n.luwi.dev
cd /home/node/.n8n/nodes

# Clone et
git clone https://github.com/yourusername/alice-semantic-bridge.git

# Install ve build
cd alice-semantic-bridge
npm install
npm run build

# n8n restart
```

## 🔐 Environment Configuration

### n8n.luwi.dev'de .env Dosyası
```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=asemb
POSTGRES_USER=asemb_user
POSTGRES_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# OpenAI (n8n credentials'da da olabilir)
OPENAI_API_KEY=sk-...
```

## 🗄️ Database Setup

### PostgreSQL'de ASEMB Database'i Kur
```bash
# SSH ile sunucuya bağlan
ssh user@n8n.luwi.dev

# PostgreSQL'e bağlan
sudo -u postgres psql

# Database oluştur
CREATE DATABASE asemb;
CREATE USER asemb_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE asemb TO asemb_user;

# pgvector extension'ı aktifle
\c asemb
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

# Migration'ları çalıştır
\i /path/to/migrations/001_initial.sql
\i /path/to/migrations/002_indexes.sql
```

## 📊 n8n UI'da Kullanım

### 1. n8n.luwi.dev'e Login Ol
- Browser'da: https://n8n.luwi.dev
- Credentials ile giriş yap

### 2. ASEMB Node'larını Kontrol Et
- Sol menüden "Nodes" sekmesine git
- Arama kutusuna "Alice" yaz
- Şu node'lar görünmeli:
  - Luwi Semantic Bridge
  - PgHybrid Query
  - Text Chunk
  - Web Scrape Enhanced

### 3. Credentials Oluştur
Settings > Credentials > Add Credential:

#### OpenAI API
```json
{
  "apiKey": "sk-...",
  "organizationId": "org-..." // optional
}
```

#### PostgreSQL
```json
{
  "host": "localhost",
  "database": "asemb",
  "user": "asemb_user",
  "password": "your_password",
  "port": 5432
}
```

## 🧪 Test Workflow'u

### Import Et ve Test Et:
```json
{
  "name": "ASEMB Test Workflow",
  "nodes": [
    {
      "parameters": {
        "url": "https://example.com",
        "selector": "body"
      },
      "name": "Web Scrape",
      "type": "n8n-nodes-alice-semantic-bridge.webScrapeEnhanced",
      "position": [250, 300]
    },
    {
      "parameters": {
        "chunkSize": 512,
        "overlap": 64
      },
      "name": "Text Chunk",
      "type": "n8n-nodes-alice-semantic-bridge.textChunk",
      "position": [450, 300]
    },
    {
      "parameters": {
        "operation": "upsert",
        "sourceId": "test-source"
      },
      "name": "Luwi Semantic Bridge,
      "type": "n8n-nodes-alice-semantic-bridge.aliceSemanticBridge",
      "position": [650, 300]
    }
  ],
  "connections": {
    "Web Scrape": {
      "main": [
        [
          {
            "node": "Text Chunk",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Text Chunk": {
      "main": [
        [
          {
            "node": "Luwi Semantic Bridge,
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## 🔍 Monitoring & Logs

### n8n Logs'ları Kontrol Et
```bash
# Docker logs
docker logs n8n-container -f

# PM2 logs
pm2 logs n8n

# System logs
journalctl -u n8n -f
```

### PostgreSQL Performance
```sql
-- Check ASEMB tables
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE '%embed%' OR tablename LIKE '%chunk%';

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public';
```

## 🚨 Troubleshooting

### Node Görünmüyorsa:
1. n8n'i restart et
2. Browser cache'i temizle
3. Logs'ları kontrol et

### Database Bağlantı Hatası:
1. PostgreSQL servisini kontrol et
2. Firewall/port ayarlarını kontrol et
3. Credentials'ı doğrula

### Performance Sorunları:
1. PostgreSQL indexes'leri kontrol et
2. Redis cache'i kontrol et
3. n8n worker sayısını artır

## 📈 Production Optimizations

### n8n Config (config.json):
```json
{
  "executions": {
    "process": "main",
    "mode": "regular",
    "saveDataOnError": "all",
    "saveDataOnSuccess": "none"
  },
  "queue": {
    "bull": {
      "redis": {
        "host": "localhost",
        "port": 6379
      }
    }
  }
}
```

### PostgreSQL Tuning:
```sql
-- postgresql.conf
shared_buffers = 2GB
work_mem = 256MB
maintenance_work_mem = 512MB
effective_cache_size = 6GB
```

## ✅ Final Checklist

- [ ] Node build edildi ve test edildi
- [ ] n8n.luwi.dev'e deploy edildi
- [ ] PostgreSQL database kuruldu
- [ ] Redis bağlantısı yapılandırıldı
- [ ] n8n'de credentials oluşturuldu
- [ ] Test workflow'u başarıyla çalıştı
- [ ] Performance metrics kontrol edildi

---

**Support Contact:**
- Email: support@luwi.dev
- Documentation: https://n8n.luwi.dev/docs
