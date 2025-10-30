# PostgreSQL Extension Kurulum Rehberi

Bu rehber, pgai ve pgvectorscale extension'larının PostgreSQL sunucunuza nasıl kurulacağını açıklar.

## 🎯 Gereksinimler

- PostgreSQL 12 veya üzeri
- Sunucu erişimi (SSH veya root)
- pgvector extension'ı (✅ Kurulu)

## 📋 Kurulum Seçenekleri

### Seçenek 1: Linux Sunucuya Doğrudan Kurulum (Önerilen)

Sunucunuza SSH ile bağlanın:

```bash
ssh root@91.99.229.96
```

Ardından kurulum scriptini çalıştırın:

```bash
# Script'i sunucuya kopyalayın veya içeriğini oluşturun
nano /tmp/install-extensions.sh

# Yukarıdaki server-install-extensions.sh içeriğini yapıştırın

# Çalıştırma izni verin
chmod +x /tmp/install-extensions.sh

# Root olarak çalıştırın
sudo /tmp/install-extensions.sh
```

### Seçenek 2: Manuel Kurulum

#### Ubuntu/Debian Sistemleri

```bash
# pgvector zaten kurulu, pgai ve pgvectorscale kuralım

# TimescaleDB repository ekle
sudo apt-get update
sudo apt-get install -y postgresql-common
sudo sh /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y

# pgai kur
sudo apt-get update
sudo apt-get install -y postgresql-16-pgai  # PostgreSQL versiyonunuza göre değiştirin

# pgvectorscale kur
sudo apt-get install -y postgresql-16-pgvectorscale
```

#### Database'de Extension'ları Aktifleştir

```bash
# PostgreSQL'e bağlan
psql -U postgres -d lsemb

-- Extension'ları oluştur
CREATE EXTENSION IF NOT EXISTS ai CASCADE;
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;

-- Kontrol et
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('ai', 'vectorscale', 'vector')
ORDER BY extname;
```

### Seçenek 3: Docker ile Kurulum

Eğer PostgreSQL'i Docker'da çalıştırıyorsanız, pgai ve pgvectorscale içeren bir image kullanabilirsiniz:

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: timescale/timescaledb-ha:pg16
    environment:
      POSTGRES_PASSWORD: 12Kemal1221
      POSTGRES_DB: lsemb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql

volumes:
  postgres_data:
```

init.sql:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS ai CASCADE;
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
```

## 🔧 Extension'ları Database'de Etkinleştirme

Kurulumdan sonra, Node.js üzerinden extension'ları aktifleştirin:

```bash
cd backend
node scripts/install-pgai.js
node scripts/install-pgvectorscale.js
```

Veya doğrudan SQL ile:

```sql
-- pgai extension'ını kur
CREATE EXTENSION IF NOT EXISTS ai CASCADE;

-- pgvectorscale extension'ını kur
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;

-- Kurulumu doğrula
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('ai', 'vectorscale', 'vector')
ORDER BY extname;
```

## 📊 Kurulumu Doğrulama

```bash
cd backend
node scripts/check-extensions.js
```

Beklenen çıktı:

```
PostgreSQL Extensions Status:
==============================
✅ ai v0.4.0 - INSTALLED
✅ vector v0.8.0 - INSTALLED
✅ vectorscale v0.3.0 - INSTALLED
```

## 🚀 Sonraki Adımlar

Extension'lar kurulduktan sonra:

### 1. pgai Worker'ı Başlat

```bash
cd backend/python-services
source venv/bin/activate  # veya Windows'ta: venv\Scripts\activate
python -m services.pgai_worker
```

### 2. Auto-Embedding Yapılandırması

Tablolarınız için otomatik embedding yapılandırın:

```sql
-- message_embeddings tablosu için
SELECT ai.create_vectorizer(
    'message_embeddings'::regclass,
    destination => 'message_vectors',
    embedding => ai.embedding_openai('text-embedding-3-small', 768),
    chunking => ai.chunking_recursive_character_text_splitter('content')
);
```

### 3. DiskANN Index Oluştur

```sql
-- HNSW yerine DiskANN index kullan (28x daha hızlı)
CREATE INDEX ON message_vectors
USING diskann (embedding vector_cosine_ops)
WITH (
    num_neighbors = 50,
    search_list_size = 100,
    max_alpha = 1.2
);
```

## ❓ Sorun Giderme

### "extension not available" hatası

Extension'lar PostgreSQL sunucusuna kurulmamış. Yukarıdaki kurulum adımlarını sunucuda çalıştırın.

### "permission denied" hatası

Extension kurulumu için superuser yetkisi gerekir:

```sql
-- Mevcut kullanıcıya superuser yetkisi ver
ALTER USER postgres WITH SUPERUSER;
```

### Extension versiyonları güncel değil

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get upgrade postgresql-16-pgai postgresql-16-pgvectorscale

# Extension'ları güncelle
psql -U postgres -d lsemb -c "ALTER EXTENSION ai UPDATE;"
psql -U postgres -d lsemb -c "ALTER EXTENSION vectorscale UPDATE;"
```

## 📚 Kaynaklar

- [pgai Documentation](https://github.com/timescale/pgai)
- [pgvectorscale Documentation](https://github.com/timescale/pgvectorscale)
- [TimescaleDB Installation](https://docs.timescale.com/self-hosted/latest/install/)

## 🎯 Performans Beklentileri

Extension kurulumu sonrası:

| Özellik | Öncesi | Sonrası | İyileşme |
|---------|--------|---------|----------|
| Embedding oluşturma | Manuel | Otomatik | ∞ |
| Embedding hızı | ~100 rows/min | 1000+ rows/min | 10x |
| Query hızı | Baseline | DiskANN ile | 28x |
| Index boyutu | HNSW | DiskANN | 50% daha küçük |

---

💡 **Not**: Bu extension'lar TimescaleDB ekibi tarafından geliştirilmiştir ve PostgreSQL 12+ ile uyumludur.
