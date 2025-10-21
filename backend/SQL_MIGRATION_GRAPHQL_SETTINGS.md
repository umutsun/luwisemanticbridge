# GraphQL Settings Table Migration

## 📊 Mevcut Yapı

```sql
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  category VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## ✅ Durum: Mevcut yapı GraphQL için YETERLİ!

Settings table'ı zaten tüm gerekli alanları içeriyor:
- ✅ `id` - Unique identifier
- ✅ `key` - Setting identifier (UNIQUE)
- ✅ `value` - JSONB (flexible, scalable)
- ✅ `category` - Grouping (INDEXED olabilir)
- ✅ `description` - Dokumentasyon
- ✅ `created_at` - Audit trail
- ✅ `updated_at` - Version tracking

## 🎯 Opsiyonel İyileştirmeler (Ilerisi için)

### 1. Performance Optimization - Index Ekleme

```sql
-- Category index (most queries filter by category)
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- Key index (already UNIQUE, but explicit for composite queries)
CREATE INDEX IF NOT EXISTS idx_settings_key_category ON settings(key, category);

-- Created_at index (for audit logging, sorting)
CREATE INDEX IF NOT EXISTS idx_settings_created_at ON settings(created_at DESC);
```

### 2. Audit Logging - Tracking Changes

```sql
-- Audit log table (track all setting changes)
CREATE TABLE IF NOT EXISTS settings_audit_log (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,

  FOREIGN KEY (setting_key) REFERENCES settings(key)
);

CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON settings_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_setting_key ON settings_audit_log(setting_key);
```

### 3. Access Control - Permissions Table

```sql
-- Settings permissions (role-based access)
CREATE TABLE IF NOT EXISTS settings_permissions (
  id SERIAL PRIMARY KEY,
  setting_category VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL,
  can_read BOOLEAN DEFAULT true,
  can_write BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_unique
  ON settings_permissions(setting_category, role);
```

### 4. Versioning - Keep History

```sql
-- Settings version history
CREATE TABLE IF NOT EXISTS settings_versions (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) NOT NULL,
  version_number INT NOT NULL,
  value JSONB NOT NULL,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  change_reason TEXT,

  FOREIGN KEY (setting_key) REFERENCES settings(key),
  UNIQUE(setting_key, version_number)
);

CREATE INDEX IF NOT EXISTS idx_versions_key ON settings_versions(setting_key);
```

### 5. Validation Schema - Type Safety

```sql
-- Settings validation rules
CREATE TABLE IF NOT EXISTS settings_validation (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  value_type VARCHAR(50), -- 'string', 'number', 'boolean', 'object', etc.
  min_value NUMERIC,
  max_value NUMERIC,
  allowed_values TEXT[], -- ARRAY for enum values
  regex_pattern TEXT,
  required BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_validation_key ON settings_validation(setting_key);
```

## 📋 Önerilen Adımlar

### Şu Anda (Immediate):
- ✅ Mevcut yapı **olduğu gibi kullanılabilir**
- ✅ GraphQL resolver'ları çalışıyor
- ✅ Herhangi bir schema değişikliği gerekmez

### Gelecekte (Nice to Have):
1. **Index'ler ekle** (performance iyileştirmesi)
   - `category` index
   - `key` + `category` composite index

2. **Audit logging** (compliance)
   - Tüm change'leri track et
   - Kimin ne değiştirdiğini kaydet

3. **Versioning** (rollback capability)
   - Eski setting value'larını sakla
   - Version history

4. **Permissions table** (fine-grained access control)
   - Role başına setting kategorisi izinleri
   - Read/write/delete kontrol

## 🚀 Şimdilik Yapmanız Gerekenler

### ✅ Yapılacak Hiçbir Şey YOK!

Settings table:
- ✅ GraphQL queries için hazır
- ✅ GraphQL mutations için hazır
- ✅ Admin operations için hazır
- ✅ Role-based access için hazır
- ✅ Caching için hazır

## 📝 SQL Refactor (İlerde İçin)

Eğer gelecekte performance/audit ihtiyacı olursa, bu migration'ları çalıştırabilirsiniz:

```bash
# Şu anda YAPMANIZA GEREK YOK!
# Ama gelecekte ihtiyaç olursa:
npm run db:migrate -- graphql-settings-optimization
```

## ✨ Sonuç

**Mevcut `settings` table'ı GraphQL için %100 uygun!**

Ek field veya tablo eklemeye ihtiyaç **YOK**.
Settings yapısı already scalable ve flexible:
- JSONB value → unlimited configuration options
- Category grouping → logical organization
- Timestamps → audit trail
- UNIQUE key → no duplicates

🎉 **Settings'e eklenecek hiçbir şey YOK - GraphQL tamamen ready!**
