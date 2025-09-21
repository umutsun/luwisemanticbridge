# n8n.luwi.dev'e ASB Node Kurulum Talimatları

## 1. Dosyaları Sunucuya Yükle
```bash
# asemb-node.zip dosyasını sunucuya yükle
scp asemb-node.zip user@n8n.luwi.dev:/tmp/
```

## 2. SSH ile Sunucuya Bağlan
```bash
ssh user@n8n.luwi.dev
```

## 3. n8n Custom Nodes Klasörüne Kur
```bash
# n8n custom nodes klasörüne git
cd ~/.n8n/nodes

# Yeni klasör oluştur
mkdir n8n-nodes-alice-semantic-bridge

# Zip'i extract et
unzip /tmp/asemb-node.zip -d n8n-nodes-alice-semantic-bridge/

# Gerekli bağımlılıkları yükle
cd n8n-nodes-alice-semantic-bridge
npm install --production
```

## 4. n8n'i Restart Et
```bash
# PM2 kullanıyorsanız
pm2 restart n8n

# veya systemd kullanıyorsanız
sudo systemctl restart n8n

# veya Docker kullanıyorsanız
docker restart n8n
```

## 5. Credentials Ekle (n8n UI'dan)

### PostgreSQL Credential:
- Name: PostgreSQL ASEMB
- Host: 91.99.229.96
- Port: 5432
- Database: postgres
- User: postgres
- Password: [config'den]

### Redis Credential:
- Name: Redis ASEMB
- Host: 127.0.0.1
- Port: 6379
- Database: 2

### OpenAI Credential:
- Name: OpenAI
- API Key: [your-api-key]

## 6. Workflow'u Aktif Et
- n8n.luwi.dev'e giriş yap
- Workflow ID: oPBjMeb6Y6IvH2Im
- Credentials'ları bağla
- Activate et

## Test
```bash
curl -X POST https://n8n.luwi.dev/webhook/asb-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "query": "semantic search test"}'
```