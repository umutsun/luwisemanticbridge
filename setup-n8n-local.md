# n8n Local Setup Guide

## Adım 1: n8n'i Docker ile Başlat

```bash
cd c:\xampp\htdocs\lsemb
docker-compose -f docker-compose.n8n.yml up -d
```

## Adım 2: n8n'e Giriş Yap

1. Tarayıcıda aç: http://localhost:5678
2. İlk açılışta hesap oluştur:
   - Email: admin@lsemb.dev
   - Password: lsemb2025 (veya istediğin şifre)
   - First Name: LSEMB
   - Last Name: Admin

## Adım 3: Credentials Ekle

### PostgreSQL Credentials
1. Settings → Credentials → Add Credential
2. "Postgres" seç
3. Yapılandır:
   - Name: `LSEMB PostgreSQL`
   - Host: `host.docker.internal`
   - Database: `lsemb`
   - User: `postgres`
   - Password: `Semsiye!22`
   - Port: `5432`
   - SSL: `disable`
4. Test Connection → Save

### Redis Credentials
1. Settings → Credentials → Add Credential
2. "Redis" seç
3. Yapılandır:
   - Name: `LSEMB Redis`
   - Host: `host.docker.internal`
   - Port: `6379`
   - Database: `2` (REDIS_DB from .env.lsemb)
   - Password: (boş bırak eğer yoksa)
4. Test Connection → Save

### OpenAI Credentials
1. Settings → Credentials → Add Credential
2. "OpenAI" seç
3. Yapılandır:
   - Name: `LSEMB OpenAI`
   - API Key: `sk-...` (OpenAI API key'in)
4. Save

## Adım 4: API Key Oluştur (n8n → LSEMB entegrasyonu için)

1. n8n Settings → API
2. "Create new API key" tıkla
3. Name: `LSEMB Backend`
4. Key'i kopyala ve LSEMB Settings → Services → n8n → API Key'e yapıştır

## Adım 5: LSEMB Community Node Kur

### Option A: Manual Install (Development)
```bash
cd c:\xampp\htdocs\lsemb\n8n-community-node
npm install
npm run build

# Docker container'a linkle
docker exec -it lsemb-n8n mkdir -p /home/node/.n8n/custom
docker cp dist lsemb-n8n:/home/node/.n8n/custom/n8n-nodes-lsemb/

# n8n'i restart et
docker restart lsemb-n8n
```

### Option B: npm Link (Faster for Development)
```bash
cd c:\xampp\htdocs\lsemb\n8n-community-node
npm run build
npm link

# Container içinde
docker exec -it lsemb-n8n bash
cd /usr/local/lib/node_modules
npm link n8n-nodes-lsemb
exit

# Restart
docker restart lsemb-n8n
```

## Adım 6: Example Workflow Import

1. n8n → Workflows → Import from File
2. Dosya seç: `c:\xampp\htdocs\lsemb\workflows\metadata-extraction-pipeline.json`
3. Import
4. Credentials güncelle:
   - PostgreSQL: `LSEMB PostgreSQL` seç
   - Redis: `LSEMB Redis` seç
   - OpenAI: `LSEMB OpenAI` seç

## Adım 7: İlk Test

### Test 1: Crawled Item Analysis
1. Workflow'u aç
2. Manual execution tıkla
3. Logs'u izle
4. PostgreSQL'de kontrol et:
```sql
SELECT * FROM sources ORDER BY created_at DESC LIMIT 10;
SELECT * FROM documents ORDER BY created_at DESC LIMIT 10;
```

### Test 2: Single Document Analysis
1. Yeni workflow oluştur
2. Manual Trigger node ekle
3. LSEMB Workflow node ekle:
   - Workflow: `Analyze Document`
   - Document ID: (bir document UUID'si)
   - Template: `legal`
   - API Base URL: `http://host.docker.internal:8083`
4. Execute

## Troubleshooting

### Node görünmüyor
```bash
# Logs kontrol et
docker logs lsemb-n8n -f

# Cache temizle
docker exec -it lsemb-n8n rm -rf /home/node/.n8n/cache
docker restart lsemb-n8n
```

### PostgreSQL bağlanamıyor
```bash
# Test et
docker exec -it lsemb-n8n ping host.docker.internal

# Eğer çalışmazsa, Docker network ayarlarını kontrol et
```

### API 401 Unauthorized
- n8n API key'i doğru mu kontrol et
- LSEMB Settings'de API key'i kaydet
- Backend'i restart et: `npm run dev`

## Production Deployment (n8n.luwi.dev)

Production için ayrı guide: [N8N_LUWI_SETUP.md](docs/N8N_LUWI_SETUP.md)
