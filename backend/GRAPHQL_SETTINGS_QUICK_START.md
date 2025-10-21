# GraphQL Settings - Quick Start Guide 🚀

## 📌 Özet

Settings table'ı GraphQL API aracılığıyla tamamen yönetilir. Şu anda **eklenecek hiçbir şey yok** - tümü hazır!

---

## 🎯 Temel Kullanım

### 1. GraphQL Playground'u Aç

```
http://localhost:8083/graphql
```

### 2. GraphQL Settings Sorgusu

```graphql
query GetGraphQLSettings {
  graphqlSettings {
    enabled
    endpoint
    playgroundEnabled
    maxQueryDepth
    maxQueryComplexity
    enableSubscriptions
    enableCaching
    cacheTTL
    enableRateLimiting
    rateLimit {
      maxRequests
      windowMs
    }
  }
}
```

### 3. API Settings Sorgusu

```graphql
query GetAPISettings {
  apiSettings {
    port
    environment
    corsEnabled
    corsOrigins
    jwtEnabled
  }
}
```

---

## 🛠️ Ayarları Değiştirme (Admin)

### GraphQL Ayarlarını Güncelle

```graphql
mutation UpdateGraphQLConfig {
  updateGraphQLSettings(input: {
    maxQueryDepth: 15
    maxQueryComplexity: 2000
    enableCaching: true
    cacheTTL: 7200
  }) {
    maxQueryDepth
    maxQueryComplexity
    enableCaching
    cacheTTL
  }
}
```

### Tek Setting Güncelle

```graphql
mutation UpdateSingleSetting {
  updateSetting(input: {
    key: "graphql.debugMode"
    value: true
    category: "graphql"
    description: "Enable GraphQL debug mode"
  }) {
    key
    value
    updatedAt
  }
}
```

### Birden Fazla Setting Güncelle

```graphql
mutation UpdateMultipleSettings {
  updateSettings(input: [
    {
      key: "graphql.enabled"
      value: true
      category: "graphql"
    },
    {
      key: "graphql.playgroundEnabled"
      value: true
      category: "graphql"
    },
    {
      key: "graphql.debugMode"
      value: false
      category: "graphql"
    }
  ]) {
    key
    value
    updatedAt
  }
}
```

---

## 📖 Settings Kategorileri

### Mevcut Kategoriler

```graphql
query GetCategories {
  settingsCategories
}
```

**Yanıt**:
```json
[
  "api_keys",
  "database",
  "llm",
  "embeddings",
  "rag",
  "graphql",
  "application"
]
```

### Kategoriye Göre Settings Getir

```graphql
query GetGraphQLSettings {
  settings(category: "graphql") {
    items {
      key
      value
      description
    }
    category
    total
  }
}
```

---

## 🔑 Önemli GraphQL Settings

### maxQueryDepth
```graphql
query {
  setting(key: "graphql.maxQueryDepth") {
    value  # Default: 10
  }
}
```
**Açıklama**: GraphQL query'lerinin maksimum derinliği
- Değer: 10-20 (önerilir)
- Amaç: Recursion ataklarını önle

### maxQueryComplexity
```graphql
query {
  setting(key: "graphql.maxQueryComplexity") {
    value  # Default: 1000
  }
}
```
**Açıklama**: Query'nin maksimum complexity score'u
- Değer: 500-2000 (önerilir)
- Amaç: Resource-intensive queries'i sınırla

### enableCaching
```graphql
query {
  setting(key: "graphql.enableCaching") {
    value  # Default: true
  }
}
```
**Açıklama**: GraphQL response caching'i enable et
- Değer: true/false
- TTL: `graphql.cacheTTL` ile kontrol

### cacheTTL
```graphql
query {
  setting(key: "graphql.cacheTTL") {
    value  # Default: 3600 (1 saat)
  }
}
```
**Açıklama**: Cache Time-To-Live (saniye cinsinden)
- Değer: 300-7200 (önerilir)
- Birim: saniye

### enableRateLimiting
```graphql
query {
  setting(key: "graphql.enableRateLimiting") {
    value  # Default: true
  }
}
```
**Açıklama**: Rate limiting'i enable et
- Değer: true/false
- Kurallar: `graphql.rateLimit.*`

### introspectionEnabled
```graphql
query {
  setting(key: "graphql.introspectionEnabled") {
    value  # Production: false, Dev: true
  }
}
```
**Açıklama**: GraphQL introspection'u enable et
- Production: false (güvenlik)
- Development: true (debug)

### debugMode
```graphql
query {
  setting(key: "graphql.debugMode") {
    value  # Default: false
  }
}
```
**Açıklama**: GraphQL debug logging'i enable et
- Değer: true/false
- Amaç: Development sırasında debugging

---

## 🔐 Yetkilendirme

### Read Permission (Query)
```graphql
query {
  graphqlSettings {
    # Gerekli: admin role
  }
}
```

### Write Permission (Mutation)
```graphql
mutation {
  updateGraphQLSettings(input: {
    # Gerekli: admin role ONLY
  }) {
    maxQueryDepth
  }
}
```

### Hata: Yetki Yok
```json
{
  "errors": [
    {
      "message": "Bu ayarlara erişim yetkiniz yok",
      "extensions": {
        "code": "FORBIDDEN"
      }
    }
  ]
}
```

---

## 💾 Redis Caching

### Cache Strategy

```
Setting değeri okunduğunda:
1. Redis cache'e bak (1ms)
2. Cache miss? Database'den oku (50-100ms)
3. Redis'e kaydet (TTL: 1 saat)
```

### Cache Invalidation

Setting güncellendiğinde:
```
1. Database'e güncelle
2. Redis cache temizle
3. Yeni değer bir sonraki read'de cache'lenecek
```

---

## 📊 Settings Management Best Practices

### ✅ DO (Yap)
- ✅ Admin tarafından settings güncellensin
- ✅ Sensitive settings'e admin-only access ver
- ✅ Settings'i version control'e kaydet
- ✅ Audit logging kullan (ileride)

### ❌ DON'T (Yapma)
- ❌ Direct database query yapmayın
- ❌ API key'leri hardcode etmeyin
- ❌ Production settings'i test etmeyin
- ❌ Cache'i manual invalidate etmeyin

---

## 🚀 Workflow Örneği

### Senaryo: GraphQL Query Limit Değiştirme

**1. Mevcut Settings'i Kontrol Et**
```graphql
query {
  graphqlSettings {
    maxQueryComplexity
  }
}
```

**2. Yeni Limit Set Et**
```graphql
mutation {
  updateGraphQLSettings(input: {
    maxQueryComplexity: 2000
  }) {
    maxQueryComplexity
  }
}
```

**3. Değişikliği Doğrula**
```graphql
query {
  graphqlSettings {
    maxQueryComplexity
  }
}
```

**Sonuç**:
```json
{
  "data": {
    "graphqlSettings": {
      "maxQueryComplexity": 2000
    }
  }
}
```

---

## 🐛 Troubleshooting

### Problem: "Ayar bulunamadı"
```
Çözüm: Doğru key'i kullan
Örnek: graphql.maxQueryDepth (graphQL.maxQueryDepth DEĞIL)
```

### Problem: "Bu işlem için yetkiniz yok"
```
Çözüm: Admin role gereklidir
JWT token'ınızda admin role olduğundan emin olun
```

### Problem: Değişiklik uygulanmıyor
```
Çözüm: Cache invalidation kontrol et
GraphQL Server'ı restart et (force refresh)
```

---

## 📚 İlgili Dokümantasyon

- `GRAPHQL_INTEGRATION.md` - Faz 1 özeti
- `GRAPHQL_SETTINGS_INTEGRATION.md` - Detaylı schema
- `SQL_MIGRATION_GRAPHQL_SETTINGS.md` - Database yapısı

---

## 🎯 Sonraki Adımlar

1. **Admin UI Dashboard** (Frontend)
   - Settings management interface oluştur
   - GraphQL mutations'ı form'a bağla

2. **Audit Logging** (Backend)
   - Settings changes'i logla
   - Change history ekle

3. **Notifications** (WebSocket)
   - Settings değişiminde notify et
   - Multiple client sync

---

## ✨ Notlar

- Settings otomatik olarak cache'lenir (1 saat)
- Tüm changes encrypted olarak kaydedilir
- Admin-only operations protected
- Zero downtime settings update

---

**🎉 Settings GraphQL API tamamen ready!**

Herhangi bir soru varsa `GRAPHQL_SETTINGS_INTEGRATION.md` dokümentasyonunu kontrol et.
